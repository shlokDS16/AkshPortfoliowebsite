import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

// How many pages the classifier gave up on, for the inbox card (live smoke S3). classify_pages writes `unsortedPages` into its
// step result when a batch is let go (classify-pages.ts); the rules' choice stands, so nothing else shows it. Admin session
// (RLS: admin select on jobs and job_steps). Explicit columns; the result is read only for the one step kind.

/** The pages let go in one document. `uncounted` is pages from a step that finished before page numbers were recorded: they cannot be told apart, so they stay counted. */
export type UnsortedPages = { pageNos: number[]; uncounted: number };

/** Pages let go by finished classify_pages steps, per document. A document with none is absent. */
export async function readUnsortedPages(db: Db, documentIds: string[]): Promise<Map<string, UnsortedPages>> {
  const out = new Map<string, UnsortedPages>();
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
      if (result === null || typeof result !== "object" || Array.isArray(result)) continue;
      const n = result.unsortedPages;
      if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) continue;
      const nos = result.unsortedPageNos;
      const pageNos = Array.isArray(nos) ? nos.filter((p): p is number => typeof p === "number" && Number.isInteger(p) && p > 0) : [];
      const entry = out.get(job.document_id) ?? { pageNos: [], uncounted: 0 };
      if (pageNos.length === n) entry.pageNos.push(...pageNos);
      else entry.uncounted += n;
      out.set(job.document_id, entry);
    }
  }
  return out;
}

/** How many let-go pages are still waiting: not chosen (ticked) and not read. Zero removes the line from the card. */
export function unsortedStillOpen(entry: UnsortedPages | undefined, chosenOrRead: ReadonlySet<number>): number {
  if (!entry) return 0;
  return [...new Set(entry.pageNos)].filter((p) => !chosenOrRead.has(p)).length + entry.uncounted;
}
