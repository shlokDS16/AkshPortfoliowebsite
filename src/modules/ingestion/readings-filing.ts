import { DbError, dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { CaseFile } from "@/modules/casefile/client";

// Filing the test readings Aksh staged and saved (Plan 2b Task 8, ruling R4): their own step beside recordFiledFacts, which stays
// fact-only. A reading leaves no provenance row (it is a number in a test, not a fact with a source): the proposal is marked filed
// under the revision and that is all. Runs on the admin's cookie session; the machine never writes here.

type Input = { itemId: string; revisionId: string; structured: CaseFile; pairs: { testId: string; proposalId: string }[] };

/**
 * A staged reading whose test is in the saved file becomes filed under the revision. One whose test Aksh took out goes back to the
 * review list (item cleared, still accepted), or is dropped when its document is closed (his own drop, like a staged figure).
 * A pair that does not check out (another item's reading, not accepted, a different test, a repeat) is ignored; only a database
 * failure throws.
 */
export async function recordFiledReadings(db: Db, input: Input): Promise<{ filed: number; back: number }> {
  const { itemId, revisionId, structured } = input;
  if (input.pairs.length === 0) return { filed: 0, back: 0 };
  const loaded = await db.from("reading_proposals").select("id, item_id, document_id, status, test_id").in("id", [...new Set(input.pairs.map((p) => p.proposalId))]);
  if (loaded.error) throw dbError("readings.load", loaded.error);
  const rows = new Map(loaded.data.map((r) => [r.id, r]));
  const tests = new Set(structured.tests.map((t) => t.id));

  const used = new Set<string>();
  const filedIds: string[] = [];
  const backIds: string[] = [];
  for (const { testId, proposalId } of input.pairs) {
    const row = rows.get(proposalId);
    if (!row || used.has(proposalId) || row.item_id !== itemId || row.status !== "accepted" || row.test_id !== testId) continue;
    used.add(proposalId);
    (tests.has(testId) ? filedIds : backIds).push(proposalId);
  }

  if (filedIds.length > 0) {
    const filed = await db
      .from("reading_proposals")
      .update({ status: "filed", revision_id: revisionId })
      .in("id", filedIds)
      .eq("item_id", itemId)
      .eq("status", "accepted")
      .select("id");
    if (filed.error) throw dbError("readings.file", filed.error);
    // A second tab unstaging in between: say so, as the fact path does (the revision itself is unaffected).
    if (filed.data.length !== filedIds.length) throw new DbError("readings.file", "count-mismatch", null);
  }
  if (backIds.length > 0) await sendBack(db, itemId, backIds, rows);
  return { filed: filedIds.length, back: backIds.length };
}

async function sendBack(db: Db, itemId: string, ids: string[], rows: Map<string, { document_id: string }>): Promise<void> {
  const documents = await db.from("documents").select("id, status").in("id", [...new Set(ids.flatMap((id) => rows.get(id)?.document_id ?? []))]);
  if (documents.error) throw dbError("readings.documents", documents.error);
  const closed = new Set(documents.data.filter((d) => d.status === "done" || d.status === "skipped").map((d) => d.id));
  const isClosed = (id: string) => closed.has(rows.get(id)?.document_id ?? "");

  const open = ids.filter((id) => !isClosed(id));
  if (open.length > 0) {
    const cleared = await db.from("reading_proposals").update({ item_id: null }).in("id", open).eq("item_id", itemId).eq("status", "accepted").is("revision_id", null);
    if (cleared.error) throw dbError("readings.unstage", cleared.error);
  }
  const dropped = ids.filter(isClosed);
  if (dropped.length > 0) {
    const drop = await db
      .from("reading_proposals")
      .update({ status: "rejected", item_id: null, decided_at: new Date().toISOString() })
      .in("id", dropped)
      .eq("item_id", itemId)
      .eq("status", "accepted")
      .is("revision_id", null);
    if (drop.error) throw dbError("readings.drop", drop.error);
  }
}
