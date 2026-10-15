import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { ModelSummary } from "./trays";

// The inbox card's read of a workbook's version: its id and status (the card's "Open model" link) and the counts the read found (machine
// columns only). Admin session, RLS applies. A workbook with no counts yet (still being read, or refused) has no summary: its card's
// sentence follows its job step.

/** The model page of a workbook (Plan 2.7 Task 3): /desk/models/<versionId>. */
export type ModelLink = { versionId: string; status: "reading" | "ready" | "confirmed" | "refused" };
export type ModelRead = { link: ModelLink; summary: ModelSummary | null };

const STATUSES = new Set<ModelLink["status"]>(["reading", "ready", "confirmed", "refused"]);

export async function readModels(db: Db, documentIds: string[]): Promise<Map<string, ModelRead>> {
  const out = new Map<string, ModelRead>();
  if (documentIds.length === 0) return out;
  const { data, error } = await db.from("valuation_versions").select("id, document_id, status, sheet_count, cell_count, formula_count").in("document_id", documentIds);
  if (error) throw dbError("inbox.models", error);
  for (const r of data) {
    if (!STATUSES.has(r.status as ModelLink["status"])) continue;
    const status = r.status as ModelLink["status"];
    const { sheet_count: sheets, cell_count: cells, formula_count: formulas } = r;
    const read = status === "ready" || status === "confirmed";
    out.set(r.document_id, {
      link: { versionId: r.id, status },
      summary: read && sheets !== null && cells !== null && formulas !== null ? { status, sheets, cells, formulas } : null,
    });
  }
  return out;
}
