import { createHash } from "node:crypto";
import type { Segment } from "./types";
import { transcriptText } from "./structured";

// Hashes of a transcript and of the caption file it came from. The text hash is exactly what the insert trigger of migration 0022
// computes (sha256 over the UTF-8 segment texts joined by a newline, no trailing newline); the database replaces whatever a client
// sends, and the lint (compliance) takes the same hash over the same text, so the three agree or the gate refuses (rule 12.2).

export function textSha256(segments: readonly Segment[]): string {
  return createHash("sha256").update(transcriptText(segments), "utf8").digest("hex");
}

/** sha256 hex of the caption file's bytes: the record of which file this transcript came from. */
export function fileSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Whitespace-separated words, summed per segment, as the trigger counts them. */
export function wordCount(segments: readonly Segment[]): number {
  return segments.reduce((sum, { t }) => sum + (t.trim() === "" ? 0 : t.trim().split(/\s+/).length), 0);
}
