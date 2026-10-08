// Browser-safe types for the ingestion job engine (ADR-004 s4.4). No runtime code here.
import type { StepDeps } from "./deps";

export type StepKind = "pdf_text" | "select_pages" | "extract_page" | "ocr_page" | "vision_page";
/** jobs.kind (migration 0008): one per document kind. */
export type JobKind = "ingest_pdf" | "ingest_image" | "ingest_audio" | "ingest_url" | "ingest_text";
export type StepStatus = "queued" | "running" | "done" | "skipped" | "needs_attention";
export type WaitReason = "groq_minute" | "groq_day" | "ai_off" | "ocr_day" | "ocr_off" | "voice_hour" | "voice_day";


export type Step = {
  id: string;
  jobId: string;
  kind: StepKind;
  pageNo: number | null;
  args: Record<string, unknown>;
  status: StepStatus;
  schemaFailures: number;
  providerFailures: number;
  leaseExpiries: number;
  notBefore: string;
  leaseOwner: string | null;
  /** The previous attempt's error, so a schema retry can name the issues (ADR-004 s4.5, ruling R8). */
  lastError: string | null;
};

/** `pass` is 1 for a first run; a re-run of the same step (a re-read page) is a later pass, a new row (migration 0008, R2). */
export type NewStep = { kind: StepKind; pageNo: number | null; pass?: number; args?: Record<string, unknown> };

export type StepOutcome =
  | { kind: "done"; result?: Record<string, unknown>; enqueue?: NewStep[] }
  | { kind: "defer"; notBefore: Date; reason: WaitReason }
  | { kind: "retry"; failure: "schema" | "provider"; error: string }
  | { kind: "attention"; error: string };

export type StepContext = { step: Step; documentId: string; deadline: number; deps: StepDeps };
export type StepHandler = (ctx: StepContext) => Promise<StepOutcome>;
