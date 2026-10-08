import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { Basis, DocSourceType } from "@/modules/documents/client";
import { proposedFactSchema, type ProposedFact } from "./proposed-fact";
import { basisRepeats } from "./review-values";

// The figures Aksh has accepted and filed under an item that no revision holds yet (ADR-004 s4.7). The editor shows
// them as new rows; nothing is written here. Explicit columns, on the admin's cookie session (RLS applies).

export type StagedRow = {
  proposalId: string;
  status: "accepted" | "edited";
  value: ProposedFact;
  document: { id: string; title: string; sourceType: DocSourceType; filedOn: string; sourceUrl: string | null };
};

/** Accepted or edited figures staged under the item, in document then page order. A standalone repeat of a consolidated line is left out, as on the review screen. */
export async function listStagedForItem(db: Db, itemId: string): Promise<StagedRow[]> {
  const proposals = await db
    .from("proposals")
    .select("id, document_id, page_no, status, accepted_value")
    .eq("item_id", itemId)
    .in("status", ["accepted", "edited"])
    .is("revision_id", null)
    .order("document_id")
    .order("page_no")
    .order("created_at")
    .order("id");
  if (proposals.error) throw dbError("staging.proposals", proposals.error);
  if (proposals.data.length === 0) return [];
  const documentIds = [...new Set(proposals.data.map((p) => p.document_id))];
  const documents = await db.from("documents").select("id, title, source_type, filed_on, source_url, basis").in("id", documentIds);
  if (documents.error) throw dbError("staging.documents", documents.error);
  const docs = new Map(documents.data.map((d) => [d.id, d]));

  const rows = proposals.data.flatMap((p): { row: StagedRow; page: number }[] => {
    const doc = docs.get(p.document_id);
    const value = proposedFactSchema.safeParse(p.accepted_value);
    if (!doc || !value.success || (p.status !== "accepted" && p.status !== "edited")) return [];
    const document = { id: doc.id, title: doc.title, sourceType: doc.source_type as DocSourceType, filedOn: doc.filed_on ?? "", sourceUrl: doc.source_url };
    return [{ row: { proposalId: p.id, status: p.status, value: value.data, document }, page: p.page_no }];
  });
  const repeats = new Set<string>();
  for (const id of documentIds) {
    const mine = rows.filter((r) => r.row.document.id === id);
    const lines = mine.map((r) => ({ id: r.row.proposalId, label: r.row.value.label, period: r.row.value.period, page: r.page, basis: r.row.value.basis }));
    for (const hidden of basisRepeats(lines, (docs.get(id)?.basis ?? "consolidated") as Basis)) repeats.add(hidden);
  }
  return rows.filter((r) => !repeats.has(r.row.proposalId)).map((r) => r.row);
}
