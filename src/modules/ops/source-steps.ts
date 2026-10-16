import "server-only";
import { serverEnv } from "@/lib/env.server";
import { errorShape } from "@/lib/errors";
import { jobDbError } from "@/lib/supabase/errors";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Db } from "@/lib/supabase/types";
import { createLinkFetchDeps } from "@/modules/documents";
import { fetchPendingSources, MAX_READ_ATTEMPTS, PROBLEM_CODES, readSourceNow, recheckSources, type FetchDeps, type FetchStore, type ProblemCode, type ReadNowAnswer, type SourceRef } from "@/modules/sources";
import type { Step } from "./steps";

// Job code: the one place the source steps get the secret-key client (ADR-001 s3). The logic is in @/modules/sources (fetch.ts), tested with
// a fake store and the fixture transport. The secret-key client READS source_links and WRITES only through public.record_source_fetch and
// public.purge_stale_source_data (migration 0026) and the private bucket source-thumbs. Neither step is in HEALTH_RULES: an optional
// feature must not raise the alert email. Heartbeat details are counts and fixed words, never a title, a link or a database message.
//   sources:fetch   (the pump)  reads up to 5 links never read, in 40 s at most; 3 tries each.
//   sources:recheck (the daily) purges YouTube details older than 30 days first, then re-reads YouTube links not checked in 25 days (40, 60 s).

const BUCKET = "source-thumbs";
const COLUMNS = "id, kind, youtube_id, url, fetched_at, checked_at, fetch_attempts, fetch_problem, gone";
const RECHECK_AFTER_MS = 25 * 86_400_000;
const TRANSIENT_FILTER = "fetch_problem.is.null,fetch_problem.in.(timeout,unavailable)";

type Row = { id: string; kind: string; youtube_id: string | null; url: string; fetched_at: string | null; checked_at: string | null; fetch_attempts: number; fetch_problem: string | null; gone: boolean };
const toRef = (r: Row): SourceRef => ({
  id: r.id,
  kind: r.kind === "youtube" ? "youtube" : "web",
  youtubeId: r.youtube_id,
  url: r.url,
  fetchedAt: r.fetched_at,
  checkedAt: r.checked_at,
  fetchAttempts: r.fetch_attempts,
  fetchProblem: PROBLEM_CODES.find((code: ProblemCode) => code === r.fetch_problem) ?? null,
  gone: r.gone,
});

export function createSourceFetchStore(db: Db, now: () => number = Date.now): FetchStore {
  return {
    async pending(limit) {
      const { data, error } = await db
        .from("source_links")
        .select(COLUMNS)
        .is("fetched_at", null)
        .is("archived_at", null)
        .eq("gone", false)
        .lt("fetch_attempts", MAX_READ_ATTEMPTS)
        .or(TRANSIENT_FILTER)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw jobDbError("sources.pending", error);
      return (data ?? []).map(toRef);
    },
    async stale(limit) {
      const before = new Date(now() - RECHECK_AFTER_MS).toISOString();
      const { data, error } = await db
        .from("source_links")
        .select(COLUMNS)
        .eq("kind", "youtube")
        .eq("gone", false)
        .is("archived_at", null)
        .not("fetched_at", "is", null)
        .or(`checked_at.is.null,checked_at.lt.${before}`)
        .order("checked_at", { ascending: true, nullsFirst: true })
        .limit(limit);
      if (error) throw jobDbError("sources.stale", error);
      return (data ?? []).map(toRef);
    },
    async byId(id) {
      const { data, error } = await db.from("source_links").select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw jobDbError("sources.byId", error);
      return data ? toRef(data) : null;
    },
    async record(a) {
      // The function's null-able arguments are typed as plain strings in the generated types; PostgREST sends null as null.
      const args = {
        p_link_id: a.linkId, p_found: a.found, p_title: a.title, p_site_name: a.siteName, p_channel_url: a.channelUrl,
        p_thumb_path: a.thumbPath, p_thumb_sha256: a.thumbSha256, p_problem: a.problem, p_gone: a.gone,
      };
      const { data, error } = await db.rpc("record_source_fetch", args as unknown as Parameters<typeof db.rpc<"record_source_fetch">>[1]);
      if (error) throw jobDbError("sources.record", error);
      return typeof data === "string" && data !== "" ? data : null;
    },
    async putThumb(path, bytes) {
      // The same hash is the same bytes, so writing it over itself changes nothing (two videos can share a picture).
      const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: true });
      if (error) throw jobDbError("sources.putThumb", { message: error.message });
    },
    async removeThumbs(paths) {
      if (paths.length === 0) return;
      const { error } = await db.storage.from(BUCKET).remove([...paths]);
      if (error) throw jobDbError("sources.removeThumbs", { message: error.message });
    },
    async purgeStale() {
      const { data, error } = await db.rpc("purge_stale_source_data");
      if (error) throw jobDbError("sources.purge", error);
      return Array.isArray(data) ? data.filter((p): p is string => typeof p === "string") : [];
    },
  };
}

/** The deps of one run, built when the step runs (never at import): a malformed setting then lands in this step's own heartbeat. Real DNS and HTTPS unless the fixture is on (off Vercel only). */
export function buildSourceFetchDeps(): FetchDeps {
  return { store: createSourceFetchStore(createSupabaseServiceClient()), link: createLinkFetchDeps(serverEnv()), clock: Date.now };
}

export function sourceSteps(make: () => FetchDeps = buildSourceFetchDeps): Step[] {
  return [
    { job: "sources:fetch", run: async () => fetchPendingSources(make()) },
    { job: "sources:recheck", run: async () => recheckSources(make()) },
  ];
}
const [FETCH, RECHECK] = sourceSteps() as [Step, Step];
export const SOURCE_FETCH_STEP: Step = FETCH;
export const SOURCE_RECHECK_STEP: Step = RECHECK;

/** This process's own record of when it last tried each link (a failed try writes no date to the database, by design): the cooldown of "Read again". */
const attempts = new Map<string, number>();

/**
 * The read right after a save, started from an action through `after()`: never throws (a failure is logged by shape, never by link, and the
 * pump tries the link again), so a response that is already sent is never disturbed.
 */
export async function startSourceRead(id: string, make: () => FetchDeps = buildSourceFetchDeps): Promise<void> {
  try {
    await runSourceReadNow(id, make);
  } catch (error) {
    console.error("sources read failed", errorShape(error));
  }
}

/** "Read again" and the read right after a save: that one link now, on the same code as the step. Answers a fixed word; throws only when the store fails. */
export async function runSourceReadNow(id: string, make: () => FetchDeps = buildSourceFetchDeps): Promise<ReadNowAnswer> {
  return readSourceNow(make(), id, attempts);
}
