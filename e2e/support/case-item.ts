import type { Db } from "@/lib/supabase/types";
import { caseRecordFixture } from "@/test/fixtures/case-record";

// Test setup only (LOCAL stack, the admin's own rights): a private case study item whose newest revision carries the unit-test ledger
// record, so the item page's read-only record panel can be scanned. The record names an idea that does not exist in the local ledger,
// so "has the ledger changed" cannot be read and the panel says so; the real loop (a drafted case) is Task 5's.

export async function seedLedgerCaseItem(db: Db, tag: string): Promise<{ id: string; title: string }> {
  const title = `Ledger record panel check ${tag} ${Date.now().toString(36)}`;
  const item = await db.from("items").insert({ kind: "case_study", title }).select("id").single();
  if (item.error) throw item.error;
  const record = JSON.parse(JSON.stringify(caseRecordFixture()));
  const revision = await db
    .from("item_revisions")
    .insert({ item_id: item.data.id, body_md: "", structured: { ledger: record }, change_reason: "Drafted from the ledger", author: "aksh" })
    .select("id")
    .single();
  if (revision.error) throw revision.error;
  const set = await db.from("items").update({ current_revision_id: revision.data.id, data_as_of: record.figures_to }).eq("id", item.data.id);
  if (set.error) throw set.error;
  return { id: item.data.id, title };
}
