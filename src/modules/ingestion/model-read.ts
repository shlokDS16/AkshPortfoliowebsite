import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { WORKBOOK_NOT_READ, WORKBOOK_SKIPPED, workbookStoppedText } from "./model-copy";
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

/**
 * Whether a version still reading has a live read (Plan 2.7 Task 3): with none it is stuck, and its page never shows a spinner. Try again
 * is offered only when the newest read stopped for attention (a new pass can be queued); a document Aksh closed has nothing to retry.
 */
export type WorkbookRead = { stuck: false } | { stuck: true; retryable: boolean; message: string };
type ReadStep = { kind: string; pass: number; status: string; last_error: string | null };

export function workbookReadState(steps: ReadStep[], documentStatus: string = "active"): WorkbookRead {
  if (documentStatus === "skipped" || documentStatus === "done") return { stuck: true, retryable: false, message: WORKBOOK_SKIPPED };
  const newest = steps.filter((s) => s.kind === "xlsx_read").sort((a, b) => b.pass - a.pass)[0];
  if (newest && (newest.status === "queued" || newest.status === "running")) return { stuck: false };
  const stopped = newest?.status === "needs_attention";
  return { stuck: true, retryable: stopped, message: stopped ? workbookStoppedText(newest.last_error) : WORKBOOK_NOT_READ };
}

/** The read state of a workbook document's live job (a cancelled job has no live read). */
export async function readWorkbookStep(db: Db, documentId: string): Promise<WorkbookRead> {
  const [jobs, doc] = await Promise.all([
    db.from("jobs").select("job_steps(kind, pass, status, last_error)").eq("document_id", documentId).is("cancelled_at", null),
    db.from("documents").select("status").eq("id", documentId).maybeSingle(),
  ]);
  if (jobs.error) throw dbError("inbox.workbookStep", jobs.error);
  if (doc.error) throw dbError("inbox.workbookStep", doc.error);
  return workbookReadState(jobs.data.flatMap((j) => j.job_steps), doc.data?.status);
}
