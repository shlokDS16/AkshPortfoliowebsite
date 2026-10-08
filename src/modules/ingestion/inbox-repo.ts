import { InvalidInputError } from "@/lib/errors";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { PageKind } from "@/modules/documents/client";
import { PAGE_STEP_KINDS } from "./page-steps";
import type { StepKind } from "./types";

/**
 * What the inbox buttons change besides the documents row (migration 0006's grants for `authenticated`): the page
 * ticks, and the job and steps of one document. Runs on the admin's cookie session; RLS and the column grants apply.
 */
export interface InboxRepo {
  /** The page's tick and what routes it (a scan goes to the scan reader first), or null when the document has no such page. */
  page(documentId: string, pageNo: number): Promise<{ selected: boolean; isScan: boolean; kind: PageKind | null } | null>;
  selectedPages(documentId: string): Promise<number[]>;
  /** The ticked pages with what routes each one. */
  selectedPageInfo(documentId: string): Promise<{ pageNo: number; isScan: boolean; kind: PageKind | null }[]>;
  /** Aksh's choice: `selected_by` becomes 'aksh', so the rule never undoes it. */
  setPageSelected(documentId: string, pageNo: number, selected: boolean): Promise<void>;
  /** The document's job that has not been cancelled. */
  liveJob(documentId: string): Promise<string | null>;
  /** Stops the document's live job (jobs.cancelled_at, which Aksh may set and never clear). */
  cancelJob(documentId: string): Promise<void>;
  /** Every page step of the job (extract_page, ocr_page), whatever its state. A page re-read in a later pass is listed once. */
  pageSteps(jobId: string): Promise<{ pageNo: number; kind: StepKind }[]>;
  /** A page ticked again after being unticked: its skipped step of that kind (its latest pass) runs. */
  reviveStep(jobId: string, pageNo: number, kind: StepKind): Promise<void>;
  /** A page unticked before it was read: its queued page steps are skipped. A running or finished one is left. */
  skipQueuedStep(jobId: string, pageNo: number): Promise<void>;
  /** Try again: every needs-attention step of the job runs again with its failure counts cleared. */
  retryAttention(jobId: string): Promise<void>;
  skipAttention(jobId: string): Promise<void>;
}

const now = () => new Date().toISOString();

export function createSupabaseInboxRepo(db: Db): InboxRepo {
  /** The page's step of this kind in its highest pass: the one a tick means (migration 0008, R2). */
  async function latestStep(jobId: string, pageNo: number, kind: StepKind, where: string): Promise<string | null> {
    const { data, error } = await db
      .from("job_steps")
      .select("id")
      .eq("job_id", jobId)
      .eq("kind", kind)
      .eq("page_no", pageNo)
      .order("pass", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw dbError(where, error);
    return data?.id ?? null;
  }

  return {
    async page(documentId, pageNo) {
      const { data, error } = await db.from("document_pages").select("selected, is_scan, kind").eq("document_id", documentId).eq("page_no", pageNo).maybeSingle();
      if (error) throw dbError("inbox.page", error);
      return data ? { selected: data.selected, isScan: data.is_scan ?? false, kind: data.kind as PageKind | null } : null;
    },
    async selectedPages(documentId) {
      const { data, error } = await db.from("document_pages").select("page_no").eq("document_id", documentId).eq("selected", true).order("page_no");
      if (error) throw dbError("inbox.selectedPages", error);
      return data.map((r) => r.page_no);
    },
    async selectedPageInfo(documentId) {
      const { data, error } = await db.from("document_pages").select("page_no, is_scan, kind").eq("document_id", documentId).eq("selected", true).order("page_no");
      if (error) throw dbError("inbox.selectedPageInfo", error);
      return data.map((r) => ({ pageNo: r.page_no, isScan: r.is_scan ?? false, kind: r.kind as PageKind | null }));
    },
    async setPageSelected(documentId, pageNo, selected) {
      const { data, error } = await db
        .from("document_pages")
        .update({ selected, selected_by: "aksh" })
        .eq("document_id", documentId)
        .eq("page_no", pageNo)
        .select("page_no");
      if (error) throw dbError("inbox.setPageSelected", error);
      if (data.length === 0) throw new InvalidInputError();
    },
    async liveJob(documentId) {
      const { data, error } = await db.from("jobs").select("id").eq("document_id", documentId).is("cancelled_at", null).maybeSingle();
      if (error) throw dbError("inbox.liveJob", error);
      return data?.id ?? null;
    },
    async cancelJob(documentId) {
      const { error } = await db.from("jobs").update({ cancelled_at: now() }).eq("document_id", documentId).is("cancelled_at", null);
      if (error) throw dbError("inbox.cancelJob", error);
    },
    async pageSteps(jobId) {
      const { data, error } = await db.from("job_steps").select("page_no, kind").eq("job_id", jobId).in("kind", [...PAGE_STEP_KINDS]);
      if (error) throw dbError("inbox.pageSteps", error);
      // A page re-read in a later pass has several rows: it is still one step to the caller.
      const seen = new Set<string>();
      return data.flatMap((r) => {
        const key = `${r.kind}:${r.page_no}`;
        if (r.page_no === null || seen.has(key)) return [];
        seen.add(key);
        return [{ pageNo: r.page_no, kind: r.kind as StepKind }];
      });
    },
    async reviveStep(jobId, pageNo, kind) {
      const id = await latestStep(jobId, pageNo, kind, "inbox.reviveStep");
      if (!id) return;
      const { error } = await db
        .from("job_steps")
        .update({ status: "queued", not_before: now(), wait_reason: null, last_error: null })
        .eq("id", id)
        .eq("status", "skipped");
      if (error) throw dbError("inbox.reviveStep", error);
    },
    async skipQueuedStep(jobId, pageNo) {
      const { error } = await db
        .from("job_steps")
        .update({ status: "skipped" })
        .eq("job_id", jobId)
        .eq("page_no", pageNo)
        .in("kind", [...PAGE_STEP_KINDS])
        .eq("status", "queued");
      if (error) throw dbError("inbox.skipQueuedStep", error);
    },
    async retryAttention(jobId) {
      const { error } = await db
        .from("job_steps")
        .update({ status: "queued", not_before: now(), wait_reason: null, last_error: null, schema_failures: 0, provider_failures: 0, lease_expiries: 0 })
        .eq("job_id", jobId)
        .eq("status", "needs_attention");
      if (error) throw dbError("inbox.retryAttention", error);
    },
    async skipAttention(jobId) {
      const { error } = await db.from("job_steps").update({ status: "skipped" }).eq("job_id", jobId).eq("status", "needs_attention");
      if (error) throw dbError("inbox.skipAttention", error);
    },
  };
}
