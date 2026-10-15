import { isRecord } from "@/lib/records";
import type { Chapter, Segment } from "./types";

// The revision's `structured` record for a video (spec s7.2, schema "video/1"): the YouTube id, the transcript by id and hash, and his
// chapters. Nothing of YouTube's own text (title, description) is ever written here: those stay in video_sources, labelled as YouTube's.
// `chapters` is always present, possibly empty: the database gate (12.4) refuses a record without the key.

export const VIDEO_SCHEMA = "video/1";

export type VideoStructured = {
  schema: typeof VIDEO_SCHEMA;
  youtubeId: string;
  transcriptId?: string;
  transcriptSha?: string;
  chapters: Chapter[];
};

/** The first revision of a `v:` capture: no transcript yet, no chapters yet. */
export function initialVideoStructured(youtubeId: string): VideoStructured {
  return { schema: VIDEO_SCHEMA, youtubeId, chapters: [] };
}

/** The chapters of a record, entry by entry, keeping only those that read; a record without a list has none. */
export function chaptersOf(value: unknown): Chapter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): Chapter[] => (isRecord(entry) && typeof entry.s === "number" && typeof entry.title === "string" ? [{ s: entry.s, title: entry.title }] : []));
}

/**
 * The record for the next revision: the previous record's transcript and chapters carried, one of them replaced. Only the schema's own
 * keys are written, so anything else in a previous record is dropped rather than carried.
 */
export function nextVideoStructured(
  previous: Record<string, unknown>,
  youtubeId: string,
  change: { transcript?: { id: string; sha: string }; chapters?: Chapter[] },
): VideoStructured {
  const transcriptId = change.transcript?.id ?? (typeof previous.transcriptId === "string" ? previous.transcriptId : undefined);
  const transcriptSha = change.transcript?.sha ?? (typeof previous.transcriptSha === "string" ? previous.transcriptSha : undefined);
  return {
    schema: VIDEO_SCHEMA,
    youtubeId,
    ...(transcriptId !== undefined && transcriptSha !== undefined ? { transcriptId, transcriptSha } : {}),
    chapters: change.chapters ?? chaptersOf(previous.chapters),
  };
}

/** The text a transcript's hash is taken over: the segment texts joined by a newline. */
export function transcriptText(segments: readonly Segment[]): string {
  return segments.map((s) => s.t).join("\n");
}
