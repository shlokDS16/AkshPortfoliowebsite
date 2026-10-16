import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createVideoMetaPort } from "@/lib/providers";
import { jobDbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { checkVideos, fetchPendingVideos, fetchVideoNow, type FetchDeps, type FetchStore, type SourceRef } from "@/modules/distribution";
import type { HeartbeatRepo } from "./heartbeat";
import { createJobHeartbeatRepo } from "./job-deps";
import { runSteps, type Step, type StepResult } from "./steps";

// Job code: the one place the video steps get the secret-key client and the YouTube port (ADR-001 s3). The step logic is in
// @/modules/distribution (videos/fetch.ts), tested with a fake port and store. The secret-key client READS video_sources and
// WRITES only through public.record_video_fetch (migration 0022). Neither step is in HEALTH_RULES: an optional feature must not
// raise the alert email (spec s7.8). Both say "videos off" while the YouTube settings are unset.

const PRIVACIES: readonly string[] = ["public", "unlisted", "private", "gone"];
const COLUMNS = "id, item_id, youtube_id, privacy";
type Row = { id: string; item_id: string; youtube_id: string; privacy: string | null };
const refOf = (r: Row, published: boolean): SourceRef => ({
  id: r.id,
  itemId: r.item_id,
  youtubeId: r.youtube_id,
  privacy: r.privacy !== null && PRIVACIES.includes(r.privacy) ? (r.privacy as SourceRef["privacy"]) : null,
  published,
});

/** The ids of the items among `ids` that are published (items.status is a column the secret-key client may read; visibility is not). */
async function publishedAmong(db: Db, ids: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let at = 0; at < ids.length; at += 100) {
    const { data, error } = await db.from("items").select("id, status").in("id", ids.slice(at, at + 100));
    if (error) throw jobDbError("videos.itemsPublished", error);
    for (const row of data ?? []) if (row.status === "published") out.add(row.id);
  }
  return out;
}

export function createVideoFetchStore(db: Db): FetchStore {
  return {
    async pending(limit) {
      const { data, error } = await db.from("video_sources").select(COLUMNS).is("fetched_at", null).order("created_at", { ascending: true }).limit(limit);
      if (error) throw jobDbError("videos.pending", error);
      return (data ?? []).map((r) => refOf(r, false));
    },
    async all() {
      const { data, error } = await db.from("video_sources").select(COLUMNS).order("created_at", { ascending: true });
      if (error) throw jobDbError("videos.all", error);
      const rows = data ?? [];
      const published = await publishedAmong(db, rows.map((r) => r.item_id));
      return rows.map((r) => refOf(r, published.has(r.item_id)));
    },
    async byItem(itemId) {
      const { data, error } = await db.from("video_sources").select(COLUMNS).eq("item_id", itemId).maybeSingle();
      if (error) throw jobDbError("videos.byItem", error);
      return data ? refOf(data, false) : null;
    },
    async purgeStale() {
      const { data, error } = await db.rpc("purge_stale_video_data");
      if (error) throw jobDbError("videos.purge", error);
      return typeof data === "number" ? data : 0;
    },
    async record(a) {
      // The function's null-able arguments are typed as plain strings in the generated types; PostgREST sends null as null.
      const args = {
        p_source_id: a.sourceId, p_found: a.found, p_channel_id: a.channelId, p_own_channel: a.ownChannel, p_title: a.title, p_description: a.description,
        p_duration: a.duration, p_privacy: a.privacy, p_published_at: a.publishedAt, p_problem: a.problem,
      };
      const { error } = await db.rpc("record_video_fetch", args as unknown as Parameters<typeof db.rpc<"record_video_fetch">>[1]);
      if (error) throw jobDbError("videos.record", error);
    },
  };
}

/**
 * The deps of one run, built when the step runs (never at import): a malformed setting then lands in this step's own heartbeat. The
 * port is null while the YouTube settings are unset, and the step answers "videos off" before it reads the database.
 */
export function buildVideoFetchDeps(): FetchDeps {
  return { port: createVideoMetaPort(serverEnv()), store: createVideoFetchStore(createSupabaseServiceClient()), clock: Date.now };
}

/** `videos:fetch` (the pump): sources never fetched, one API call. `videos:check` (daily): every source, in calls of 50. */
export function videoSteps(make: () => FetchDeps = buildVideoFetchDeps): Step[] {
  return [
    { job: "videos:fetch", run: async () => fetchPendingVideos(make()) },
    { job: "videos:check", run: async () => checkVideos(make()) },
  ];
}
const [FETCH, CHECK] = videoSteps() as [Step, Step];
export const VIDEO_FETCH_STEP: Step = FETCH;
export const VIDEO_CHECK_STEP: Step = CHECK;

/** Whether video listing is on (both YouTube settings, or the fixture outside a deployment): the desk says "not set up yet" when it is not. A setting that cannot be read counts as off. */
export function videoListingOn(): boolean {
  try {
    return createVideoMetaPort(serverEnv()) !== null;
  } catch {
    return false;
  }
}

let running: Promise<StepResult[]> | null = null;

/**
 * "Fetch again" for one video (the desk's button): one fetch for that item's source, even if it was fetched before, with its own
 * `videos:fetch` heartbeat like the cron's. The jobs table is built around documents (`document_id` is required), so a video fetch
 * is not queued there; it runs now, in the press, on the same code as the cron. One run at a time in this process: a second press
 * while one runs gets `null` ("already running"). Another server instance would not see this guard; a fetch is safe to repeat (it
 * only refreshes the machine columns), so the worst case is one more harmless API call of the day's 10,000 units.
 */
export async function runVideoFetchNow(itemId: string, repo: HeartbeatRepo = createJobHeartbeatRepo(), make: () => FetchDeps = buildVideoFetchDeps): Promise<StepResult[] | null> {
  if (running) return null;
  running = runSteps([{ job: "videos:fetch", run: async () => fetchVideoNow(make(), itemId) }], (beat) => repo.record(beat));
  try {
    return await running;
  } finally {
    running = null;
  }
}
