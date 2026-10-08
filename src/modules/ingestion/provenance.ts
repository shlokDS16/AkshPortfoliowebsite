import { z } from "zod";
import { DbError, dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { CASEFILE_LIMITS, type CaseFile } from "@/modules/casefile/client";
import { factDiffers } from "./fact-differs";
import { machineFactSchema, type MachineFact } from "./proposed-fact";

// Where each saved fact came from, written AFTER the revision (ADR-004 s4.7): provenance is evidence about a save,
// never a condition of it. Runs on the admin's cookie session; the machine never writes here (RLS and grants).

export { factDiffers } from "./fact-differs";

const MAX_PAIRS = 80; // CASEFILE_LIMITS.facts

const stagingField = z.strictObject({
  /** Every staged proposal the editor merged in. */
  staged: z.array(z.guid()).max(MAX_PAIRS),
  /** The ones still in the draft, each with the fact it became. */
  provenance: z.array(z.strictObject({ factId: z.string().regex(/^F\d{1,3}$/), proposalId: z.guid() })).max(MAX_PAIRS),
  /** The staged test readings the editor applied to a test, each with the test it went to (filed by readings-filing.ts, never as a fact). */
  stagedReadings: z.array(z.strictObject({ testId: z.string().regex(/^T\d{1,3}$/), proposalId: z.guid() })).max(CASEFILE_LIMITS.tests).default([]),
});
export type Staging = z.infer<typeof stagingField>;

/** The editor's hidden `provenance` field. Anything malformed is ignored, so the save itself never depends on it. */
export function parseStaging(raw: FormDataEntryValue | null): Staging {
  const none: Staging = { staged: [], provenance: [], stagedReadings: [] };
  if (typeof raw !== "string" || raw.length > 20_000) return none;
  try {
    const parsed = stagingField.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : none;
  } catch {
    return none;
  }
}

type Input = { itemId: string; revisionId: string; structured: CaseFile; provenance: Staging["provenance"]; staged?: string[] };

/**
 * Records the proposals that became facts of this revision: a `fact_provenance` row each (with `edited` worked out here
 * from the saved fact, never taken from the browser), and the proposal marked filed under the revision. A staged figure
 * Aksh deleted is sent back to the review list (item_id cleared, still accepted or edited). A pair that does not check
 * out (another item's proposal, not accepted, no such fact) is ignored; only a database failure throws.
 */
export async function recordFiledFacts(db: Db, input: Input): Promise<{ filed: number }> {
  const { itemId, revisionId, structured } = input;
  const staged = input.staged ?? [];
  const ids = [...new Set([...input.provenance.map((p) => p.proposalId), ...staged])];
  if (ids.length === 0) return { filed: 0 };

  const loaded = await db.from("proposals").select("id, item_id, document_id, status, machine_value").in("id", ids);
  if (loaded.error) throw dbError("provenance.proposals", loaded.error);
  const proposals = new Map(loaded.data.map((p) => [p.id, p]));
  const facts = new Map(structured.facts.map((f) => [f.id, f]));

  const rows: { revision_id: string; fact_id: string; proposal_id: string; edited: boolean }[] = [];
  const usedFacts = new Set<string>();
  const usedProposals = new Set<string>();
  for (const { factId, proposalId } of input.provenance) {
    const proposal = proposals.get(proposalId);
    const fact = facts.get(factId);
    const machine = machineFactSchema.safeParse(proposal?.machine_value);
    if (!proposal || !fact || !machine.success) continue;
    if (proposal.item_id !== itemId || (proposal.status !== "accepted" && proposal.status !== "edited")) continue;
    if (usedFacts.has(factId) || usedProposals.has(proposalId)) continue;
    usedFacts.add(factId);
    usedProposals.add(proposalId);
    const quote = structured.sources.find((s) => s.id === fact.sourceId)?.quote[fact.id] ?? null;
    rows.push({ revision_id: revisionId, fact_id: factId, proposal_id: proposalId, edited: factDiffers(fact, quote, machine.data) || proposal.status === "edited" });
  }

  if (rows.length > 0) {
    const inserted = await db.from("fact_provenance").insert(rows);
    if (inserted.error) throw dbError("provenance.insert", inserted.error);
    const filed = await db
      .from("proposals")
      .update({ status: "filed", revision_id: revisionId })
      .in("id", rows.map((r) => r.proposal_id))
      .eq("item_id", itemId)
      .in("status", ["accepted", "edited"])
      .select("id");
    if (filed.error) throw dbError("provenance.file", filed.error);
    // A second tab unstaging in between would leave a provenance row for a proposal that did not file: say so (the save
    // then shows the "record could not be written" notice; the revision itself is unaffected).
    if (filed.data.length !== rows.length) throw new DbError("provenance.file", "count-mismatch", null);
  }

  // A staged figure that did not become a fact leaves the editor: back to the review list, or dropped when its document is closed.
  const back = staged.filter((id) => !usedProposals.has(id));
  if (back.length > 0) await sendBack(db, itemId, back, proposals);
  return { filed: rows.length };
}

async function sendBack(db: Db, itemId: string, ids: string[], loaded: Map<string, { document_id: string }>): Promise<void> {
  const documents = await db.from("documents").select("id, status").in("id", [...new Set(ids.flatMap((id) => loaded.get(id)?.document_id ?? []))]);
  if (documents.error) throw dbError("provenance.documents", documents.error);
  const closed = new Set(documents.data.filter((d) => d.status === "done" || d.status === "skipped").map((d) => d.id));
  const isClosed = (id: string) => closed.has(loaded.get(id)?.document_id ?? "");

  const open = ids.filter((id) => !isClosed(id));
  if (open.length > 0) {
    const cleared = await db.from("proposals").update({ item_id: null }).in("id", open).eq("item_id", itemId).in("status", ["accepted", "edited"]).is("revision_id", null);
    if (cleared.error) throw dbError("provenance.unstage", cleared.error);
  }
  // Aksh's own drop: the review screen of a done or skipped document refuses, so these could never be seen or filed again.
  const dropped = ids.filter(isClosed);
  if (dropped.length > 0) {
    const drop = await db
      .from("proposals")
      .update({ status: "rejected", accepted_value: null, item_id: null, decided_at: new Date().toISOString() })
      .in("id", dropped)
      .eq("item_id", itemId)
      .in("status", ["accepted", "edited"])
      .is("revision_id", null);
    if (drop.error) throw dbError("provenance.drop", drop.error);
  }
}

export type FactProvenance = { proposalId: string; documentTitle: string; page: number; machine: MachineFact; edited: boolean; filedAt: string };

/** For each fact of the item that was filed from a document: where it was read and what the machine read. The newest filing of a fact wins. */
export async function provenanceForItem(db: Db, itemId: string): Promise<Record<string, FactProvenance>> {
  const filed = await db.from("proposals").select("id, document_id, machine_value").eq("item_id", itemId).eq("status", "filed");
  if (filed.error) throw dbError("provenance.filed", filed.error);
  if (filed.data.length === 0) return {};
  const [prov, docs] = await Promise.all([
    db.from("fact_provenance").select("fact_id, proposal_id, edited, created_at").in("proposal_id", filed.data.map((p) => p.id)).order("created_at").order("id"),
    db.from("documents").select("id, title").in("id", [...new Set(filed.data.map((p) => p.document_id))]),
  ]);
  if (prov.error) throw dbError("provenance.read", prov.error);
  if (docs.error) throw dbError("provenance.documents", docs.error);
  const proposals = new Map(filed.data.map((p) => [p.id, p]));
  const titles = new Map(docs.data.map((d) => [d.id, d.title]));
  const out: Record<string, FactProvenance> = {};
  for (const row of prov.data) {
    const proposal = proposals.get(row.proposal_id);
    const machine = machineFactSchema.safeParse(proposal?.machine_value);
    if (!proposal || !machine.success) continue;
    out[row.fact_id] = {
      proposalId: row.proposal_id,
      documentTitle: titles.get(proposal.document_id) ?? "the document",
      page: machine.data.page,
      machine: machine.data,
      edited: row.edited,
      filedAt: row.created_at,
    };
  }
  return out;
}
