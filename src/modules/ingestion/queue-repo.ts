import { isUniqueViolation, jobDbError } from "@/lib/supabase/errors";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import { LEASE_SECONDS } from "./caps";
import type { NewStep, Step, StepKind, StepStatus, WaitReason } from "./types";

export type FinishPatch = {
  status: StepStatus;
  notBefore?: Date;
  waitReason?: WaitReason | null;
  schemaFailures?: number;
  providerFailures?: number;
  lastError?: string | null;
  result?: Record<string, unknown> | null;
};

export interface QueueRepo {
  claim(owner: string): Promise<(Step & { documentId: string }) | null>;
  /** False when the lease was lost (another drain reclaimed the step): the result is then dropped. */
  finish(step: Step, owner: string, patch: FinishPatch): Promise<boolean>;
  /** Idempotent: insert ... on conflict (job_id, kind, page_no) do nothing. */
  enqueue(jobId: string, steps: NewStep[]): Promise<void>;
  /** Creates the document's job (or reuses its live one) and enqueues the first step. */
  createJob(documentId: string, first: NewStep): Promise<string>;
}

type StepRow = Database["public"]["Functions"]["claim_job_step"]["Returns"][number];
type StepUpdate = Database["public"]["Tables"]["job_steps"]["Update"];

// kind and status are text columns with check constraints (migration 0006), so the casts are safe.
function toStep(r: StepRow): Step {
  return {
    id: r.id,
    jobId: r.job_id,
    kind: r.kind as StepKind,
    pageNo: r.page_no,
    args: r.args && typeof r.args === "object" && !Array.isArray(r.args) ? (r.args as Record<string, unknown>) : {},
    status: r.status as StepStatus,
    schemaFailures: r.schema_failures,
    providerFailures: r.provider_failures,
    leaseExpiries: r.lease_expiries,
    notBefore: r.not_before,
    leaseOwner: r.lease_owner,
    lastError: r.last_error,
  };
}

function toUpdate(patch: FinishPatch): StepUpdate {
  const out: StepUpdate = { status: patch.status };
  if (patch.notBefore !== undefined) out.not_before = patch.notBefore.toISOString();
  if (patch.waitReason !== undefined) out.wait_reason = patch.waitReason;
  if (patch.schemaFailures !== undefined) out.schema_failures = patch.schemaFailures;
  if (patch.providerFailures !== undefined) out.provider_failures = patch.providerFailures;
  if (patch.lastError !== undefined) out.last_error = patch.lastError;
  if (patch.result !== undefined) out.result = patch.result as Json | null;
  // The lease ends with the attempt, so a late finish from a lost holder matches no row.
  out.locked_until = null;
  out.lease_owner = null;
  return out;
}

/**
 * The queue on whatever client the caller holds: the secret-key client for job code (claim_job_step is
 * service_role only), the admin's session for creating a job after an upload (RLS allows that insert).
 */
export function createQueueRepo(db: Db): QueueRepo {
  async function enqueue(jobId: string, steps: NewStep[]): Promise<void> {
    if (steps.length === 0) return;
    const rows = steps.map((s) => ({ job_id: jobId, kind: s.kind, page_no: s.pageNo, args: (s.args ?? {}) as NonNullable<Json> }));
    const { error } = await db.from("job_steps").upsert(rows, { onConflict: "job_id,kind,page_no", ignoreDuplicates: true });
    if (error) throw jobDbError("ingestion.enqueue", error);
  }

  return {
    async claim(owner) {
      const { data, error } = await db.rpc("claim_job_step", { p_owner: owner, p_lease_seconds: LEASE_SECONDS });
      if (error) throw jobDbError("ingestion.claim", error);
      const row = data?.[0];
      if (!row) return null;
      const job = await db.from("jobs").select("document_id").eq("id", row.job_id).single();
      if (job.error) throw jobDbError("ingestion.claimJob", job.error);
      return { ...toStep(row), documentId: job.data.document_id };
    },

    async finish(step, owner, patch) {
      const { data, error } = await db
        .from("job_steps")
        .update(toUpdate(patch))
        .eq("id", step.id)
        .eq("lease_owner", owner)
        .eq("status", "running")
        .select("id");
      if (error) throw jobDbError("ingestion.finish", error);
      return (data ?? []).length > 0;
    },

    enqueue,

    async createJob(documentId, first) {
      let jobId: string;
      const inserted = await db.from("jobs").insert({ kind: "ingest_pdf", document_id: documentId }).select("id").single();
      if (!inserted.error) jobId = inserted.data.id;
      else {
        // jobs_one_live_per_document: a second finish (double click, retry) reuses the live job.
        const failure = jobDbError("ingestion.createJob", inserted.error);
        if (!isUniqueViolation(failure)) throw failure;
        const live = await db.from("jobs").select("id").eq("document_id", documentId).is("cancelled_at", null).single();
        if (live.error) throw jobDbError("ingestion.liveJob", live.error);
        jobId = live.data.id;
      }
      await enqueue(jobId, [first]);
      return jobId;
    },
  };
}
