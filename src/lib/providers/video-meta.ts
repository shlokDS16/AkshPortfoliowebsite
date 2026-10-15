// The video-metadata port (Phase 5b, spec s7.4). Types only; the adapters are youtube.ts and fixture-video-meta.ts.
// It READS a video's public facts from YouTube. Nothing in this port writes, uploads or changes anything on YouTube (D73).

/** What YouTube says about one video. Machine data: the desk shows it labelled as YouTube's and never mixes it with his words. */
export type VideoMeta = {
  channelId: string;
  title: string;
  description: string;
  /** Whole seconds; null for a live stream or a premiere that has no length yet. */
  durationSeconds: number | null;
  /** `status.privacyStatus`. An unreadable value is reported as "private", which the gate refuses. */
  privacy: "public" | "unlisted" | "private";
  /** ISO 8601 UTC, `snippet.publishedAt`; null when YouTube sent none. */
  publishedAt: string | null;
};

/**
 * Never throws. `quota`: today's allowance is used up (defer to tomorrow). `refused`: YouTube turned the request down; `reason`
 * is its reason code only (a fixed token such as "keyInvalid"), never its message, the address or the key. `unavailable`: a
 * server error, a timeout or an unreadable answer (try again later).
 */
export type VideoMetaResult =
  | { kind: "ok"; videos: Map<string, VideoMeta | "missing"> }
  | { kind: "quota" }
  | { kind: "refused"; reason: string }
  | { kind: "unavailable" };

export interface VideoMetaPort {
  readonly name: "youtube" | "fixture";
  /** The channel the desk counts as Aksh's own (`YOUTUBE_CHANNEL_ID`); a video from another channel is never listed (rule 12.1). */
  readonly ownChannelId: string;
  /** Eleven-character ids. A video YouTube does not return (deleted or private) is `"missing"`. Batches of 50 per call. */
  fetch(ids: readonly string[]): Promise<VideoMetaResult>;
}
