import type { z } from "zod";

// The LLM port (ADR-004 s3): text, and one image for the vision model. The adapters are groq.ts and fixture-llm.ts.

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
  /**
   * One image the model reads with the prompt (vision, Plan 2b Task 3). Exactly one, never a list: the free tier counts
   * 2,048 tokens an image and the desk reads one photo per call (spec s9, ruling R14).
   */
  image?: { mime: "image/jpeg" | "image/png" | "image/webp"; base64: string };
  /** Abort the call after this long, so a step never outlives its function (ruling R3). */
  timeoutMs?: number;
};

export type LlmResult<T> =
  | { kind: "ok"; data: T; usage: LlmUsage; rate: RateHeaders }
  | { kind: "invalid"; raw: string; issues: string[]; usage: LlmUsage | null; rate: RateHeaders }
  | { kind: "rate_limited"; rate: RateHeaders }
  | { kind: "provider_error"; status: number | null; message: string; rate: RateHeaders }
  /** An unrecoverable 4xx (bad key, request too large, context length, refused request): retrying the same call cannot help. */
  | { kind: "rejected"; status: number; message: string; rate: RateHeaders };

export interface LlmPort {
  readonly name: "groq" | "fixture";
  complete<T>(req: LlmRequest<T>): Promise<LlmResult<T>>;
}
