import type { z } from "zod";

// The LLM port (ADR-004 s3; plan Task 9). Types only until Task 9 adds the Groq and fixture adapters (ruling R9).

export type LlmUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type RateHeaders = { remainingTokens: number | null; remainingRequests: number | null; retryAfterSeconds: number | null };

export type LlmRequest<T> = {
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
  maxCompletionTokens: number;
  reasoningEffort?: "low" | "medium" | "high";
  /** Abort the call after this long, so a step never outlives its function (ruling R3). */
  timeoutMs?: number;
};

export type LlmResult<T> =
  | { kind: "ok"; data: T; usage: LlmUsage; rate: RateHeaders }
  | { kind: "invalid"; raw: string; issues: string[]; usage: LlmUsage | null; rate: RateHeaders }
  | { kind: "rate_limited"; rate: RateHeaders }
  | { kind: "provider_error"; status: number | null; message: string; rate: RateHeaders };

export interface LlmPort {
  readonly name: "groq" | "fixture";
  complete<T>(req: LlmRequest<T>): Promise<LlmResult<T>>;
}
