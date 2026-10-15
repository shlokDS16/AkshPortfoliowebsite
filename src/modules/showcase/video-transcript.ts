import { createHash } from "node:crypto";
import type { VideoSegment } from "./types";

// The transcript is read apart from the snapshot (it is large, and only the video's own page needs it), so the page checks that the text it
// got is the one the CURRENT revision names: sha256 of the segment texts joined by a newline, the value migration 0022 computes and gate
// rule 12.2 compares. A transcript that does not match is never shown, whatever the cache holds.
export function transcriptMatches(segments: readonly VideoSegment[], expectedSha: unknown): boolean {
  if (typeof expectedSha !== "string" || !/^[0-9a-f]{64}$/.test(expectedSha)) return false;
  return createHash("sha256").update(segments.map((g) => g.t).join("\n"), "utf8").digest("hex") === expectedSha;
}
