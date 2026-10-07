import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { decisionFromRow, type DecisionRow } from "./decision";

export type BlockedItem = { itemId: string; title: string; decidedAt: string; failureCount: number };
type Row = DecisionRow & { item_id: string };
const COLUMNS = "id, item_id, revision_id, verdict, policy_version, decided_at, reasons";

/** Rows newest first. Blocked = the latest decision failed; the count is the gate panel's own (decisionFromRow). */
export function latestFailures(rows: Row[]): Omit<BlockedItem, "title">[] {
  const seen = new Set<string>();
  const out: Omit<BlockedItem, "title">[] = [];
  for (const row of rows) {
    if (seen.has(row.item_id)) continue;
    seen.add(row.item_id);
    const decision = decisionFromRow(row);
    if (decision.verdict === "fail") out.push({ itemId: row.item_id, decidedAt: decision.decidedAt, failureCount: decision.failures.length });
  }
  return out;
}

export async function listBlockedItems(db: Db): Promise<BlockedItem[]> {
  const decisions = await db.from("gate_decisions").select(COLUMNS).order("decided_at", { ascending: false }).limit(200);
  if (decisions.error) throw dbError("compliance.listBlocked", decisions.error);
  const blocked = latestFailures(decisions.data ?? []);
  if (blocked.length === 0) return [];
  const titles = await db.from("items").select("id, title").in("id", blocked.map((b) => b.itemId));
  if (titles.error) throw dbError("compliance.listBlockedTitles", titles.error);
  const byId = new Map((titles.data ?? []).map((t) => [t.id, t.title]));
  return blocked.map((b) => ({ ...b, title: byId.get(b.itemId) ?? "Untitled item" }));
}
