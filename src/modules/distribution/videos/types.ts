// Plain shapes of the videos feature. Machine data (YouTube's answer, the caption file as parsed) and his words (the revision's
// title, objective, body, chapters) never share a field (Phase 5 global constraints).

/** One transcript segment as the database stores it: start in whole seconds, text exactly as the caption file said it. Nothing else. */
export type Segment = { s: number; t: string };
/** One chapter, his own: a start in whole seconds and the title copied from his YouTube description. */
export type Chapter = { s: number; title: string };

export const MAX_CAPTION_BYTES = 1_048_576;
export const MAX_CUES = 5000;
export const MAX_SEGMENTS = 5000;
export const MAX_SEGMENT_CHARS = 500;
export const MAX_CHAPTERS = 100;
export const MAX_CHAPTER_TITLE = 100;

export type VideoPrivacy = "public" | "unlisted" | "private" | "gone";

/** The machine's answer about one video, as the desk shows it ("From YouTube, fetched {time}"). */
export type VideoSourceRow = {
  id: string;
  itemId: string;
  youtubeId: string;
  channelId: string | null;
  ownChannel: boolean | null;
  ytTitle: string | null;
  ytDescription: string | null;
  durationSeconds: number | null;
  privacy: VideoPrivacy | null;
  ytPublishedAt: string | null;
  fetchedAt: string | null;
  fetchProblem: string | null;
  createdAt: string;
};

export type TranscriptRow = {
  id: string;
  videoSourceId: string;
  source: "captions_file";
  fileSha256: string | null;
  segments: Segment[];
  textSha256: string;
  words: number | null;
  createdAt: string;
};
