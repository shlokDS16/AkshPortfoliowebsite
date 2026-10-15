import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { ModelSummary } from "./trays";

// The inbox card's read of a workbook's version: its status and the counts the read found (machine columns only). Admin session, RLS applies.
// A workbook with no counts yet (still being read, or refused) has nothing to say here: its card follows its job step.

export async function readModels(db: Db, documentIds: string[]): Promise<Map<string, ModelSummary>> {
  const out = new Map<string, ModelSummary>();
  if (documentIds.length === 0) return out;
  const { data, error } = await db.from("valuation_versions").select("document_id, status, sheet_count, cell_count, formula_count").in("document_id", documentIds);
  if (error) throw dbError("inbox.models", error);
  for (const r of data) {
    if ((r.status !== "ready" && r.status !== "confirmed") || r.sheet_count === null || r.cell_count === null || r.formula_count === null) continue;
    out.set(r.document_id, { status: r.status, sheets: r.sheet_count, cells: r.cell_count, formulas: r.formula_count });
  }
  return out;
}
