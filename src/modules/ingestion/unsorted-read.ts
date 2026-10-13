import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

// How many pages the classifier gave up on, for the inbox card (live smoke S3). classify_pages writes `unsortedPages` into its
// step result when a batch is let go (classify-pages.ts); the rules' choice stands, so nothing else shows it. Admin session
// (RLS: admin select on jobs and job_steps). Explicit columns; the result is read only for the one step kind.

/** Pages let go by finished classify_pages steps, per document. A document with none is absent. */
export async function readUnsortedPages(db: Db, documentIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (documentIds.length === 0) return out;
  const { data, error } = await db
    .from("jobs")
    .select("document_id, job_steps!inner(result)")
    .in("document_id", documentIds)
    .is("cancelled_at", null)
    .eq("job_steps.kind", "classify_pages")
    .eq("job_steps.status", "done");
  if (error) throw dbError("inbox.unsortedPages", error);
  for (const job of data) {
    for (const step of job.job_steps) {
      const result = step.result;
      const n = result !== null && typeof result === "object" && !Array.isArray(result) ? result.unsortedPages : undefined;
      if (typeof n === "number" && Number.isInteger(n) && n > 0) out.set(job.document_id, (out.get(job.document_id) ?? 0) + n);
    }
  }
  return out;
}
