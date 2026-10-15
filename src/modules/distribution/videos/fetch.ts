import type { VideoMeta, VideoMetaPort } from "@/lib/providers/video-meta";
import type { VideoPrivacy } from "./types";

// The logic of the two video steps and of "Fetch again" (spec s7.8), with the port and the store injected. The job code in
// src/modules/ops/video-steps.ts builds the port from the env and the store on the secret-key client; this module holds neither.
// Every outcome is a heartbeat detail: counts and fixed words only, never YouTube's text, a database message or the key.

export const VIDEOS_OFF = "videos off";
/** The desk's words for "off" (spec s15); the step's own heartbeat says "videos off". Pending Shlok's approval. */
export const VIDEOS_OFF_TEXT = "Video listing is not set up yet (Shlok adds a YouTube key).";
export const QUOTA_DEFERRED = "deferred: YouTube's daily limit is used up";
const GONE_PROBLEM = "YouTube did not return this video.";
const BATCH = 50;
/** A step stops before a call it has no time for; the Hobby limit is 250 s for the whole run. */
const BUDGET_MS = 60_000;
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 5000;

export type SourceRef = {
  id: string;
  itemId: string;
  youtubeId: string;
  privacy: VideoPrivacy | null;
  /** Its item is published on the site (status published), so a Public video on YouTube is not a surprise. */
  published: boolean;
};

/** The arguments of public.record_video_fetch, in the camel case of this module. */
export type RecordFetch = {
  sourceId: string;
  found: boolean;
  channelId: string | null;
  ownChannel: boolean | null;
  title: string | null;
  description: string | null;
  duration: number | null;
  privacy: string | null;
  publishedAt: string | null;
  problem: string | null;
};

export interface FetchStore {
  /** Sources never fetched, oldest first, at most `limit`. */
  pending(limit: number): Promise<SourceRef[]>;
  all(): Promise<SourceRef[]>;
  byItem(itemId: string): Promise<SourceRef | null>;
  record(args: RecordFetch): Promise<void>;
}

export type FetchDeps = { port: VideoMetaPort | null; store: FetchStore; clock: () => number };

/** Shortens by whole characters (never half of a surrogate pair) to a column's limit. */
const fit = (text: string, max: number): string => (text.length <= max ? text : Array.from(text).slice(0, max).join(""));

function recordOf(source: SourceRef, answer: VideoMeta | "missing", ownChannelId: string): RecordFetch {
  if (answer === "missing") {
    return { sourceId: source.id, found: false, channelId: null, ownChannel: null, title: null, description: null, duration: null, privacy: null, publishedAt: null, problem: GONE_PROBLEM };
  }
  return {
    sourceId: source.id,
    found: true,
    channelId: answer.channelId,
    ownChannel: answer.channelId === ownChannelId,
    title: fit(answer.title, TITLE_MAX),
    description: fit(answer.description, DESCRIPTION_MAX),
    duration: answer.durationSeconds,
    privacy: answer.privacy,
    publishedAt: answer.publishedAt,
    problem: null,
  };
}

type Outcome = {
  checked: number;
  stored: number;
  gone: number;
  failed: number;
  publicNotListed: number;
  stop: null | { kind: "quota" } | { kind: "time" } | { kind: "refused"; reason: string } | { kind: "unavailable" };
};

/** Asks YouTube in calls of 50 and stores each answer. A quota, a refusal or an outage stops after the batches already stored. */
async function refresh(port: VideoMetaPort, store: FetchStore, clock: () => number, sources: readonly SourceRef[]): Promise<Outcome> {
  const out: Outcome = { checked: 0, stored: 0, gone: 0, failed: 0, publicNotListed: 0, stop: null };
  const started = clock();
  for (let at = 0; at < sources.length; at += BATCH) {
    if (clock() - started >= BUDGET_MS) {
      out.stop = { kind: "time" };
      break;
    }
    const batch = sources.slice(at, at + BATCH);
    const result = await port.fetch(batch.map((s) => s.youtubeId));
    if (result.kind !== "ok") {
      out.stop = result;
      break;
    }
    for (const source of batch) {
      const answer = result.videos.get(source.youtubeId) ?? "missing";
      try {
        await store.record(recordOf(source, answer, port.ownChannelId));
        out.stored += 1;
        if (answer === "missing") out.gone += 1;
        else if (answer.privacy === "public" && !source.published) out.publicNotListed += 1;
      } catch {
        out.failed += 1;
      }
    }
    out.checked += batch.length;
  }
  return out;
}

const plural = (parts: Array<string | null>) => parts.filter((p) => p !== null).join(", ");

/** The heartbeat detail for a finished or interrupted run; throws for the outcomes that are failures (refused, unavailable, unstorable). */
function report(label: "fetched" | "checked", total: number, out: Outcome, warnPublic: boolean): string {
  if (out.stop?.kind === "refused") throw new Error(`YouTube refused the request (${out.stop.reason})`);
  if (out.stop?.kind === "unavailable") throw new Error("YouTube could not be reached");
  if (out.failed > 0) throw new Error(`${label} ${out.stored}, ${out.failed} could not be stored`);
  const count = out.stop ? `${label} ${out.checked} of ${total}` : `${label} ${out.checked}`;
  return plural([
    count,
    out.stop?.kind === "quota" ? QUOTA_DEFERRED : out.stop?.kind === "time" ? "stopped early: out of time" : null,
    out.gone > 0 ? `gone ${out.gone}` : null,
    warnPublic && out.publicNotListed > 0 ? `public on YouTube but not listed ${out.publicNotListed}` : null,
  ]);
}

/** `videos:fetch` (the pump): sources never fetched, at most 50, one API call. */
export async function fetchPendingVideos(deps: FetchDeps): Promise<string> {
  if (!deps.port) return VIDEOS_OFF;
  const sources = await deps.store.pending(BATCH);
  if (sources.length === 0) return "nothing to fetch";
  const out = await refresh(deps.port, deps.store, deps.clock, sources);
  // A quota on the very first call is a deferral with nothing done: the detail does not say "of 1".
  if (out.stop?.kind === "quota" && out.checked === 0) return QUOTA_DEFERRED;
  return report("fetched", sources.length, out, false);
}

/** `videos:check` (daily): every source, in calls of 50; a source YouTube no longer returns is marked gone (never unpublished by the machine). */
export async function checkVideos(deps: FetchDeps): Promise<string> {
  if (!deps.port) return VIDEOS_OFF;
  const sources = await deps.store.all();
  if (sources.length === 0) return "nothing to check";
  const out = await refresh(deps.port, deps.store, deps.clock, sources);
  if (out.stop?.kind === "quota" && out.checked === 0) return QUOTA_DEFERRED;
  return report("checked", sources.length, out, true);
}

/** "Fetch again" for one item's source: fetched even if it was fetched before. */
export async function fetchVideoNow(deps: FetchDeps, itemId: string): Promise<string> {
  if (!deps.port) return VIDEOS_OFF;
  const source = await deps.store.byItem(itemId);
  if (!source) return "no such video";
  const out = await refresh(deps.port, deps.store, deps.clock, [source]);
  if (out.stop?.kind === "quota" && out.checked === 0) return QUOTA_DEFERRED;
  return report("fetched", 1, out, false);
}
