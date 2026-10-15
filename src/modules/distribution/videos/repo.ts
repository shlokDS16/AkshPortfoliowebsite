import { isUuid } from "@/lib/ids";
import { isRecord } from "@/lib/records";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { Segment, TranscriptRow, VideoPrivacy, VideoSourceRow } from "./types";

// Reads and writes through the ADMIN's cookie session: row-level security and the column grants of migration 0022 do the gating (the
// admin may insert a source's item and YouTube id only, and a transcript; every YouTube column is written by record_video_fetch from
// job code, never here). The service-role reads of the daily steps live in src/modules/ops/video-steps.ts.

export interface VideosRepo {
  findByItem(itemId: string): Promise<VideoSourceRow | null>;
  findByYoutubeId(youtubeId: string): Promise<VideoSourceRow | null>;
  /** Only the item and the YouTube id; the machine columns stay null until the first fetch. */
  insertSource(itemId: string, youtubeId: string): Promise<VideoSourceRow>;
  /** The database computes `text_sha256` and `words` itself and ignores these two values (migration 0022); the row read back has its own. */
  insertTranscript(input: { videoSourceId: string; fileSha256: string; segments: Segment[]; textSha256: string; words: number }): Promise<TranscriptRow>;
  latestTranscript(videoSourceId: string): Promise<TranscriptRow | null>;
  /** The transcript `transcriptId` only when it belongs to this item's own source; else null (never another video's text). */
  transcriptForItem(itemId: string, transcriptId: string): Promise<TranscriptRow | null>;
}

export type SourceRecord = {
  id: string; item_id: string; youtube_id: string; channel_id: string | null; own_channel: boolean | null; yt_title: string | null;
  yt_description: string | null; duration_seconds: number | null; privacy: string | null; yt_published_at: string | null; fetched_at: string | null;
  fetch_problem: string | null; created_at: string;
};
type TranscriptRecord = {
  id: string; video_source_id: string; source: string; file_sha256: string | null; segments: unknown; text_sha256: string; words: number | null; created_at: string;
};

const PRIVACIES: readonly string[] = ["public", "unlisted", "private", "gone"];
export const SOURCE_COLUMNS =
  "id, item_id, youtube_id, channel_id, own_channel, yt_title, yt_description, duration_seconds, privacy, yt_published_at, fetched_at, fetch_problem, created_at";
const TRANSCRIPT_COLUMNS = "id, video_source_id, source, file_sha256, segments, text_sha256, words, created_at";

/** Stored segments are exactly `{s, t}` (the database insists); anything else is dropped here so no stray field is ever shown or linted. */
export function segmentsOf(value: unknown): Segment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): Segment[] => {
    if (!isRecord(entry) || Object.keys(entry).length !== 2 || typeof entry.s !== "number" || typeof entry.t !== "string") return [];
    return [{ s: entry.s, t: entry.t }];
  });
}

export function sourceFromRecord(r: SourceRecord): VideoSourceRow {
  return {
    id: r.id, itemId: r.item_id, youtubeId: r.youtube_id, channelId: r.channel_id, ownChannel: r.own_channel, ytTitle: r.yt_title,
    ytDescription: r.yt_description, durationSeconds: r.duration_seconds,
    privacy: r.privacy !== null && PRIVACIES.includes(r.privacy) ? (r.privacy as VideoPrivacy) : null,
    ytPublishedAt: r.yt_published_at, fetchedAt: r.fetched_at, fetchProblem: r.fetch_problem, createdAt: r.created_at,
  };
}

function transcriptFromRecord(r: TranscriptRecord): TranscriptRow {
  return {
    id: r.id, videoSourceId: r.video_source_id, source: "captions_file", fileSha256: r.file_sha256, segments: segmentsOf(r.segments),
    textSha256: r.text_sha256, words: r.words, createdAt: r.created_at,
  };
}

export function createSupabaseVideosRepo(db: Db): VideosRepo {
  const sourceBy = async (op: string, column: "item_id" | "youtube_id", value: string): Promise<VideoSourceRow | null> => {
    const { data, error } = await db.from("video_sources").select(SOURCE_COLUMNS).eq(column, value).maybeSingle();
    if (error) throw dbError(op, error);
    return data ? sourceFromRecord(data as SourceRecord) : null;
  };
  return {
    findByItem: (itemId) => sourceBy("videos.findByItem", "item_id", itemId),
    findByYoutubeId: (youtubeId) => sourceBy("videos.findByYoutubeId", "youtube_id", youtubeId),
    async insertSource(itemId, youtubeId) {
      const { data, error } = await db.from("video_sources").insert({ item_id: itemId, youtube_id: youtubeId }).select(SOURCE_COLUMNS).maybeSingle();
      if (error || !data) throw dbError("videos.insertSource", error ?? { message: "no row came back" });
      return sourceFromRecord(data as SourceRecord);
    },
    async insertTranscript(input) {
      const { data, error } = await db
        .from("video_transcripts")
        .insert({
          video_source_id: input.videoSourceId,
          source: "captions_file",
          file_sha256: input.fileSha256,
          segments: input.segments,
          text_sha256: input.textSha256,
          words: input.words,
        })
        .select(TRANSCRIPT_COLUMNS)
        .maybeSingle();
      if (error || !data) throw dbError("videos.insertTranscript", error ?? { message: "no row came back" });
      return transcriptFromRecord(data as TranscriptRecord);
    },
    async latestTranscript(videoSourceId) {
      const { data, error } = await db
        .from("video_transcripts")
        .select(TRANSCRIPT_COLUMNS)
        .eq("video_source_id", videoSourceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw dbError("videos.latestTranscript", error);
      return data ? transcriptFromRecord(data as TranscriptRecord) : null;
    },
    async transcriptForItem(itemId, transcriptId) {
      if (!isUuid(transcriptId)) return null;
      const source = await sourceBy("videos.transcriptForItem", "item_id", itemId);
      if (!source) return null;
      const { data, error } = await db.from("video_transcripts").select(TRANSCRIPT_COLUMNS).eq("id", transcriptId).eq("video_source_id", source.id).maybeSingle();
      if (error) throw dbError("videos.transcriptForItem", error);
      return data ? transcriptFromRecord(data as TranscriptRecord) : null;
    },
  };
}
