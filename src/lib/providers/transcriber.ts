// The transcriber port (ADR-004 s3, Plan 2b Task 4). Types only; the adapters are groq-whisper.ts and fixture-transcriber.ts.
// A transcript is Aksh's own voice typed out: it is shown to him to edit and save, never filed as a fact.

export type TranscriberResult =
  /** `seconds` is the audio length the provider reports, or null when its answer carries none (the caller then keeps its own estimate). */
  | { kind: "ok"; text: string; seconds: number | null }
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  | { kind: "provider_error"; message: string };

export interface TranscriberPort {
  readonly name: "groq" | "fixture";
  /** `timeoutMs` shortens the call near a deadline. */
  transcribe(file: { bytes: Uint8Array; mime: string; name: string }, opts?: { timeoutMs?: number }): Promise<TranscriberResult>;
}
