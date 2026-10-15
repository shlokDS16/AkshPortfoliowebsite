import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import type { VideoMetaPort } from "@/lib/providers/video-meta";
import type { FetchDeps } from "@/modules/distribution";
import type { HeartbeatRepo } from "./heartbeat";
import { createVideoFetchStore, runVideoFetchNow, VIDEO_CHECK_STEP, VIDEO_FETCH_STEP, videoSteps } from "./video-steps";

const env = vi.hoisted(() => ({ value: {} as Record<string, string | undefined> }));
const touched = vi.hoisted(() => ({ from: 0, rpc: 0 }));
vi.mock("@/lib/env.server", () => ({ serverEnv: () => env.value }));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    from: () => {
      touched.from += 1;
      throw new Error("the database must not be touched while videos are off");
    },
    rpc: () => {
      touched.rpc += 1;
      throw new Error("the database must not be touched while videos are off");
    },
  }),
}));

type Answer = { data: unknown; error: { message: string; code?: string } | null };
/** A chainable stand-in for the select calls the store makes; records the filters it was asked for. */
function selectDb(answers: Record<string, Answer>, log: string[] = []): Db {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "eq", "is", "in", "order", "limit"]) {
      chain[name] = (...args: unknown[]) => {
        log.push(`${table}.${name}(${args.map((a) => (Array.isArray(a) ? `[${a.length}]` : typeof a === "object" && a !== null ? "obj" : String(a))).join(",")})`);
        return chain;
      };
    }
    chain.maybeSingle = async () => ({ ...answers[table], data: Array.isArray(answers[table]?.data) ? (answers[table]?.data as unknown[])[0] ?? null : answers[table]?.data });
    chain.then = (resolve: (v: unknown) => unknown) => resolve(answers[table]);
    return chain;
  };
  return { from } as unknown as Db;
}

describe("the video steps are in the right clocks, off until the YouTube settings are set", () => {
  it("name the two heartbeats", () => {
    expect(VIDEO_FETCH_STEP.job).toBe("videos:fetch");
    expect(VIDEO_CHECK_STEP.job).toBe("videos:check");
  });

  it("report 'videos off' and touch no database while the env is unset", async () => {
    env.value = {};
    touched.from = 0;
    touched.rpc = 0;
    expect(await VIDEO_FETCH_STEP.run()).toBe("videos off");
    expect(await VIDEO_CHECK_STEP.run()).toBe("videos off");
    expect(touched).toEqual({ from: 0, rpc: 0 });
  });

  it("report 'videos off' when only one of the two settings is set", async () => {
    env.value = { YOUTUBE_API_KEY: "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKE12345" };
    expect(await VIDEO_FETCH_STEP.run()).toBe("videos off");
  });

  it("build their dependencies when they run, not at import, so a bad setting fails only that step", async () => {
    env.value = { YOUTUBE_API_KEY: "short", YOUTUBE_CHANNEL_ID: "UC0123456789abcdefghijkl" };
    await expect(VIDEO_FETCH_STEP.run()).rejects.toThrow(/YOUTUBE_API_KEY/);
  });
});

describe("the store (the secret-key client, reading video_sources and writing only through record_video_fetch)", () => {
  it("lists sources never fetched, oldest first, with the limit", async () => {
    const log: string[] = [];
    const db = selectDb({ video_sources: { data: [{ id: "s1", item_id: "i1", youtube_id: "aaaaaaaaaaa", privacy: null }], error: null } }, log);
    const rows = await createVideoFetchStore(db).pending(50);
    expect(rows).toEqual([{ id: "s1", itemId: "i1", youtubeId: "aaaaaaaaaaa", privacy: null, published: false }]);
    expect(log).toEqual(expect.arrayContaining(["video_sources.is(fetched_at,null)", "video_sources.order(created_at,obj)", "video_sources.limit(50)"]));
  });

  it("marks a source published when its item is published", async () => {
    const db = selectDb({
      video_sources: { data: [{ id: "s1", item_id: "i1", youtube_id: "aaaaaaaaaaa", privacy: "unlisted" }, { id: "s2", item_id: "i2", youtube_id: "bbbbbbbbbbb", privacy: "gone" }], error: null },
      items: { data: [{ id: "i1", status: "published" }, { id: "i2", status: "draft" }], error: null },
    });
    const rows = await createVideoFetchStore(db).all();
    expect(rows.map((r) => [r.id, r.published, r.privacy])).toEqual([["s1", true, "unlisted"], ["s2", false, "gone"]]);
  });

  it("calls record_video_fetch with every argument, nulls included", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const db = { rpc } as unknown as Db;
    await createVideoFetchStore(db).record({
      sourceId: "s1", found: false, channelId: null, ownChannel: null, title: null, description: null, duration: null, privacy: null, publishedAt: null, problem: "YouTube did not return this video.",
    });
    expect(rpc).toHaveBeenCalledWith("record_video_fetch", {
      p_source_id: "s1", p_found: false, p_channel_id: null, p_own_channel: null, p_title: null, p_description: null, p_duration: null, p_privacy: null,
      p_published_at: null, p_problem: "YouTube did not return this video.",
    });
  });

  it("raises a database failure as its operation and code, never the message (the heartbeat is readable on the desk)", async () => {
    const db = { rpc: async () => ({ data: null, error: { message: 'new row for relation "video_sources" violates check constraint, Failing row contains (secret)', code: "23514" } }) } as unknown as Db;
    const error = await createVideoFetchStore(db).record({
      sourceId: "s1", found: true, channelId: "x", ownChannel: true, title: "t", description: "d", duration: 1, privacy: "unlisted", publishedAt: null, problem: null,
    }).catch((e: unknown) => e);
    expect(String((error as Error).message)).toBe("videos.record (23514)");
  });

  it("reads one source by item", async () => {
    const db = selectDb({ video_sources: { data: [{ id: "s1", item_id: "i1", youtube_id: "aaaaaaaaaaa", privacy: null }], error: null } });
    expect((await createVideoFetchStore(db).byItem("i1"))?.id).toBe("s1");
  });
});

describe("runVideoFetchNow (Fetch again): admin-only by its caller, one run at a time here, safe to repeat", () => {
  const heartbeat = () => {
    const beats: Array<{ job: string; ok: boolean; detail: string }> = [];
    const repo: HeartbeatRepo = { record: async (b) => void beats.push(b), latestRuns: async () => ({}) };
    return { repo, beats };
  };
  const portThatWaits = (release: Promise<void>): VideoMetaPort => ({
    name: "fixture",
    ownChannelId: "UC0123456789abcdefghijkl",
    fetch: async (ids) => {
      await release;
      return { kind: "ok", videos: new Map(ids.map((id) => [id, "missing" as const])) };
    },
  });
  const source = { id: "s1", itemId: "i1", youtubeId: "aaaaaaaaaaa", privacy: null, published: false };
  const depsWith = (port: VideoMetaPort | null): (() => FetchDeps) => () => ({
    port,
    store: { pending: async () => [], all: async () => [], byItem: async () => source, record: async () => undefined },
    clock: () => 0,
  });

  it("runs the fetch for that item and writes a videos:fetch heartbeat", async () => {
    const { repo, beats } = heartbeat();
    const results = await runVideoFetchNow("i1", repo, depsWith(portThatWaits(Promise.resolve())));
    expect(results).toEqual([expect.objectContaining({ job: "videos:fetch", ok: true, detail: "fetched 1, gone 1" })]);
    expect(beats).toEqual([{ job: "videos:fetch", ok: true, detail: "fetched 1, gone 1" }]);
  });

  it("answers 'already running' (null) to a second press while one runs, and runs again once it is done", async () => {
    const { repo, beats } = heartbeat();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = runVideoFetchNow("i1", repo, depsWith(portThatWaits(gate)));
    expect(await runVideoFetchNow("i1", repo, depsWith(portThatWaits(gate)))).toBeNull();
    release();
    expect(await first).not.toBeNull();
    expect(beats).toHaveLength(1);
    expect(await runVideoFetchNow("i1", repo, depsWith(portThatWaits(Promise.resolve())))).not.toBeNull();
    expect(beats).toHaveLength(2);
  });

  it("says 'videos off' without a port", async () => {
    const { repo } = heartbeat();
    expect(await runVideoFetchNow("i1", repo, depsWith(null))).toEqual([expect.objectContaining({ ok: true, detail: "videos off" })]);
  });

  it("frees the one-at-a-time hold even when the run fails", async () => {
    const { repo } = heartbeat();
    const failing: VideoMetaPort = { name: "fixture", ownChannelId: "UC0123456789abcdefghijkl", fetch: async () => ({ kind: "unavailable" }) };
    const out = await runVideoFetchNow("i1", repo, depsWith(failing));
    expect(out?.[0]).toMatchObject({ ok: false, detail: "YouTube could not be reached" });
    expect(await runVideoFetchNow("i1", repo, depsWith(failing))).not.toBeNull();
  });

  it("exposes the two steps for the clocks", () => {
    expect(videoSteps().map((s) => s.job)).toEqual(["videos:fetch", "videos:check"]);
  });
});
