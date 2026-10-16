import { readCapped } from "./read-capped";
import type { VideoMeta, VideoMetaPort, VideoMetaResult } from "./video-meta";

// The YouTube adapter (Phase 5b, spec s7.4, decisions D73/D75). It READS facts about Aksh's own videos with a plain API key.
// The desk never writes to YouTube: this file has no method but GET, no OAuth and no upload; `distribution.graph.test.ts` keeps it so.
//
// Read 2026-10-16 before coding, recorded in the Task 7 report:
//  - developers.google.com/youtube/v3/docs/videos/list: GET /youtube/v3/videos, `part` required, exactly one of chart/id/myRating,
//    `id` a comma-separated list; the page states a cost of 1 unit a call and a `videoNotFound` 404; it does not state a maximum
//    number of ids (the spec's 50 is kept) nor whether a deleted or private video is left out of `items` (a missing id is treated
//    as "not returned", which is what a key without OAuth sees for a private video).
//  - developers.google.com/youtube/terms/developer-policies (updated 2026-10-15), III.E.4: data fetched with a key only is
//    "Non-Authorized Data": it may be stored for no more than 30 calendar days, then deleted or refreshed, and must be kept
//    consistent with YouTube's current data. The daily `videos:check` step refreshes every source, so no row outlives that
//    unless the key is removed (see the report).
//
// Outbound rules: the host and path are fixed in code, ids are validated (eleven URL-safe characters) before they can reach an
// address, https only, `redirect: "error"`, `cache: "no-store"`, a timeout on every call, the body read through a byte counter.
// Every outcome is a typed result, never a throw. The key travels only in the query string YouTube requires; no outcome
// carries it, the address, or any part of YouTube's message: a failure is a fixed word or a reason token of at most 64 letters.

export const YOUTUBE_HOST = "www.googleapis.com";
const PATH = "/youtube/v3/videos";
const PART = "snippet,contentDetails,status";
// A partial response (a standard Google parameter): only what the desk stores, so thumbnails, tags and localisations are never read.
const FIELDS = "items(id,snippet(channelId,title,description,publishedAt),contentDetails/duration,status/privacyStatus)";
const KEY_SHAPE = /^[A-Za-z0-9_-]{20,128}$/;
const CHANNEL_SHAPE = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const REASON = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const BATCH = 50;
const DEFAULT_CALL_MS = 10_000;
const MAX_MS = 60_000;
/**
 * The most one answer may hold. The spec says 64 KB, which fits a handful of videos; a batch of 50 at the 5,000-byte description
 * limit, escaped as \uXXXX, is about 540 KB, so the cap is 1 MB whichever way Google writes the body (a deviation from s7.4; Q50).
 * A body past it is `unavailable`, never a partial read.
 */
const RESPONSE_CAP_BYTES = 1024 * 1024;

export type YoutubeOptions = {
  apiKey: string;
  /** Aksh's channel id (`^UC[A-Za-z0-9_-]{22}$`); a video from any other channel is not his. */
  channelId: string;
  fetch?: typeof fetch;
  /** The most any one HTTP call may take (default 10 s). */
  callTimeoutMs?: number;
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const UNAVAILABLE: VideoMetaResult = { kind: "unavailable" };

/** ISO 8601 `P[nD][T[nH][nM][nS]]` to whole seconds; null for zero (a live stream, "P0D") or anything unreadable. */
export function isoDurationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!m) return null;
  const total = Number(m[1] ?? 0) * 86_400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

/** One returned item as the port's shape, or null when a field the desk stores is missing or of the wrong type. */
function metaOf(entry: unknown): { id: string; meta: VideoMeta } | null {
  if (!isObject(entry) || typeof entry.id !== "string" || !isObject(entry.snippet)) return null;
  const { channelId, title, description, publishedAt } = entry.snippet;
  if (typeof channelId !== "string" || typeof title !== "string" || typeof description !== "string") return null;
  const privacy = isObject(entry.status) ? entry.status.privacyStatus : undefined;
  const published = typeof publishedAt === "string" && !Number.isNaN(Date.parse(publishedAt)) ? new Date(publishedAt).toISOString() : null;
  return {
    id: entry.id,
    meta: {
      channelId,
      title,
      description,
      durationSeconds: isObject(entry.contentDetails) ? isoDurationSeconds(entry.contentDetails.duration) : null,
      privacy: privacy === "public" || privacy === "unlisted" ? privacy : "private",
      publishedAt: published,
    },
  };
}

/** The first error's reason token when it is a plain word (e.g. "quotaExceeded"); never YouTube's message. */
function reasonOf(body: unknown): string | null {
  if (!isObject(body) || !isObject(body.error) || !Array.isArray(body.error.errors)) return null;
  const first = body.error.errors[0];
  return isObject(first) && typeof first.reason === "string" && REASON.test(first.reason) ? first.reason : null;
}

export function createYoutubeVideoMeta(options: YoutubeOptions): VideoMetaPort {
  if (!KEY_SHAPE.test(options.apiKey)) throw new Error("youtube: YOUTUBE_API_KEY is not shaped like a YouTube API key");
  if (!CHANNEL_SHAPE.test(options.channelId)) throw new Error("youtube: YOUTUBE_CHANNEL_ID is not shaped like a YouTube channel id");
  const doFetch = options.fetch ?? fetch;
  const callMs = Math.min(Math.max(options.callTimeoutMs ?? DEFAULT_CALL_MS, 1), MAX_MS);

  /** One call for up to 50 valid ids. Returns the ids' answers, or a non-ok result. */
  async function one(ids: readonly string[]): Promise<{ ok: Map<string, VideoMeta | "missing"> } | { fail: VideoMetaResult }> {
    const url = new URL(`https://${YOUTUBE_HOST}${PATH}`);
    url.searchParams.set("part", PART);
    url.searchParams.set("id", ids.join(","));
    url.searchParams.set("fields", FIELDS);
    url.searchParams.set("key", options.apiKey);
    let response: Response;
    try {
      response = await doFetch(url.toString(), { method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(callMs), headers: { accept: "application/json" } });
    } catch {
      return { fail: UNAVAILABLE };
    }
    let body: unknown;
    try {
      const bytes = await readCapped(response, RESPONSE_CAP_BYTES);
      if (bytes === "too_big") return { fail: UNAVAILABLE };
      body = bytes.byteLength > 0 ? JSON.parse(new TextDecoder().decode(bytes)) : null;
    } catch {
      return { fail: response.ok ? UNAVAILABLE : response.status >= 500 || response.status === 429 ? UNAVAILABLE : { kind: "refused", reason: `http_${response.status}` } };
    }
    if (!response.ok) {
      const reason = reasonOf(body);
      if (response.status === 403 && (reason === "quotaExceeded" || reason === "dailyLimitExceeded")) return { fail: { kind: "quota" } };
      if (response.status === 404 && reason === "videoNotFound") return { ok: new Map(ids.map((id) => [id, "missing" as const])) };
      if (response.status >= 500 || response.status === 429) return { fail: UNAVAILABLE };
      return { fail: { kind: "refused", reason: reason ?? `http_${response.status}` } };
    }
    if (!isObject(body) || !Array.isArray(body.items)) return { fail: UNAVAILABLE };
    const out = new Map<string, VideoMeta | "missing">(ids.map((id) => [id, "missing"]));
    for (const entry of body.items) {
      const read = metaOf(entry);
      if (!read) return { fail: UNAVAILABLE };
      if (out.has(read.id)) out.set(read.id, read.meta);
    }
    return { ok: out };
  }

  return {
    name: "youtube",
    ownChannelId: options.channelId,
    async fetch(ids) {
      const valid = [...new Set(ids)].filter((id) => VIDEO_ID.test(id));
      const videos = new Map<string, VideoMeta | "missing">(ids.filter((id) => !VIDEO_ID.test(id)).map((id) => [id, "missing"]));
      for (let at = 0; at < valid.length; at += BATCH) {
        const result = await one(valid.slice(at, at + BATCH));
        if ("fail" in result) return result.fail;
        for (const [id, meta] of result.ok) videos.set(id, meta);
      }
      return { kind: "ok", videos };
    },
  };
}
