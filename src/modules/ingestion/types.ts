// Browser-safe types for the ingestion job engine (ADR-004 s4.4). No runtime code here.
import type { StepDeps } from "./deps";

export type StepKind = "pdf_text" | "select_pages" | "extract_page";
export type StepStatus = "queued" | "running" | "done" | "skipped" | "needs_attention";
export type WaitReason = "groq_minute" | "groq_day" | "ai_off";

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

export type NewStep = { kind: StepKind; pageNo: number | null; args?: Record<string, unknown> };

export type StepOutcome =
  | { kind: "done"; result?: Record<string, unknown>; enqueue?: NewStep[] }
  | { kind: "defer"; notBefore: Date; reason: WaitReason }
  | { kind: "retry"; failure: "schema" | "provider"; error: string }
  | { kind: "attention"; error: string };

export type StepContext = { step: Step; documentId: string; deadline: number; deps: StepDeps };
export type StepHandler = (ctx: StepContext) => Promise<StepOutcome>;
