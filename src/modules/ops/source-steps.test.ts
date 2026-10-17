import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { buildSourceFetchDeps, createSourceFetchStore, runSourceReadNow, SOURCE_FETCH_STEP, SOURCE_RECHECK_STEP, sourceSteps } from "./source-steps";

const env = vi.hoisted(() => ({ value: {} as Record<string, string | undefined> }));
const calls = vi.hoisted(() => ({ from: [] as string[], rpc: [] as string[], storage: [] as string[] }));
vi.mock("@/lib/env.server", () => ({ serverEnv: () => env.value }));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => {
      calls.from.push(table);
      return emptyChain();
    },
    rpc: async (name: string) => {
      calls.rpc.push(name);
      return { data: name === "purge_stale_source_data" ? [] : null, error: null };
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  }),
}));

function emptyChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "is", "eq", "lt", "or", "not", "order", "limit", "in"]) chain[op] = () => chain;
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return chain;
}

type Answer = { data: unknown; error: { message: string; code?: string } | null };
/** A chainable stand-in for the supabase-js client that records every call the store makes and answers canned data. */
function recordingDb(answers: { select?: Answer; rpc?: Answer; upload?: { error: { message: string } | null }; remove?: { error: { message: string } | null } } = {}) {
  const log: string[] = [];
  const row = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "eq", "is", "lt", "or", "not", "in", "order", "limit"]) {
      chain[name] = (...args: unknown[]) => {
        log.push(`${table}.${name}(${args.map((a) => (typeof a === "object" && a !== null ? JSON.stringify(a) : String(a))).join(",")})`);
        return chain;
      };
    }
    chain.maybeSingle = async () => ({ data: Array.isArray(answers.select?.data) ? (answers.select.data as unknown[])[0] ?? null : (answers.select?.data ?? null), error: answers.select?.error ?? null });
    chain.then = (resolve: (v: unknown) => unknown) => resolve(answers.select ?? { data: [], error: null });
    return chain;
  };
  const db = {
    from: row,
    rpc: async (name: string, args: unknown) => {
      log.push(`rpc ${name} ${JSON.stringify(args)}`);
      return answers.rpc ?? { data: null, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: unknown, options: unknown) => (log.push(`upload ${bucket} ${path} ${JSON.stringify(options)}`), answers.upload ?? { error: null }),
        remove: async (paths: string[]) => (log.push(`remove ${bucket} ${JSON.stringify(paths)}`), answers.remove ?? { error: null }),
      }),
    },
  } as unknown as Db;
  return { db, log };
}

const ROW = { id: "l1", kind: "youtube", youtube_id: "dQw4w9WgXcQ", url: "https://youtu.be/dQw4w9WgXcQ", fetched_at: null, checked_at: null, fetch_attempts: 1, fetch_problem: "timeout", gone: false };

describe("the source steps are in the right clocks", () => {
  it("name the two heartbeats", () => {
    expect(SOURCE_FETCH_STEP.job).toBe("sources:fetch");
    expect(SOURCE_RECHECK_STEP.job).toBe("sources:recheck");
    expect(sourceSteps().map((s) => s.job)).toEqual(["sources:fetch", "sources:recheck"]);
  });

  it("run on the store and say counts only; with no sources they read the table and make no outside call", async () => {
    env.value = { LLM_ADAPTER: "fixture" };
    calls.from.length = 0;
    calls.rpc.length = 0;
    expect(await SOURCE_FETCH_STEP.run()).toBe("nothing to read");
    expect(await SOURCE_RECHECK_STEP.run()).toBe("nothing to check");
    expect(calls.from).toEqual(["source_links", "source_links"]);
    expect(calls.rpc).toEqual(["purge_stale_source_data"]);
  });
});

describe("the store's reads (service client)", () => {
  it("pending: never read, not archived, not gone, under 3 tries, a problem that may pass, oldest first", async () => {
    const { db, log } = recordingDb({ select: { data: [ROW], error: null } });
    const got = await createSourceFetchStore(db).pending(5);
    expect(got).toEqual([{ id: "l1", kind: "youtube", youtubeId: "dQw4w9WgXcQ", url: "https://youtu.be/dQw4w9WgXcQ", fetchedAt: null, checkedAt: null, fetchAttempts: 1, fetchProblem: "timeout", gone: false }]);
    expect(log.join("\n")).toContain("source_links.is(fetched_at,null)");
    expect(log.join("\n")).toContain("source_links.is(archived_at,null)");
    expect(log.join("\n")).toContain("source_links.eq(gone,false)");
    expect(log.join("\n")).toContain("source_links.lt(fetch_attempts,3)");
    expect(log.join("\n")).toContain("source_links.or(fetch_problem.is.null,fetch_problem.in.(timeout,unavailable))");
    expect(log.join("\n")).toContain('source_links.order(created_at,{"ascending":true})');
    expect(log.join("\n")).toContain("source_links.limit(5)");
  });

  it("stale: YouTube, read before, not gone, not archived, not checked in 25 days, the longest unchecked first", async () => {
    const now = Date.parse("2026-10-16T00:00:00Z");
    const { db, log } = recordingDb({ select: { data: [], error: null } });
    await createSourceFetchStore(db, () => now).stale(40);
    const text = log.join("\n");
    expect(text).toContain("source_links.eq(kind,youtube)");
    expect(text).toContain("source_links.not(fetched_at,is,null)");
    expect(text).toContain("source_links.or(checked_at.is.null,checked_at.lt.2026-09-21T00:00:00.000Z)");
    expect(text).toContain('source_links.order(checked_at,{"ascending":true,"nullsFirst":true})');
    expect(text).toContain("source_links.limit(40)");
  });

  it("stale: the links that failed fewest times first, so a link that keeps failing cannot starve the healthy ones", async () => {
    const { db, log } = recordingDb({ select: { data: [], error: null } });
    await createSourceFetchStore(db, () => Date.parse("2026-10-16T00:00:00Z")).stale(40);
    const orders = log.filter((line) => line.startsWith("source_links.order("));
    expect(orders).toEqual(['source_links.order(fetch_attempts,{"ascending":true})', 'source_links.order(checked_at,{"ascending":true,"nullsFirst":true})']);
  });

  it("a database failure is named by operation and code, never by its message", async () => {
    const { db } = recordingDb({ select: { data: null, error: { message: "row with secret text", code: "XX000" } } });
    const error = (await createSourceFetchStore(db).pending(5).catch((e: unknown) => e)) as Error;
    expect(error.message).toBe("sources.pending (XX000)");
    expect(error.message).not.toContain("secret");
  });
});

describe("the store's writes (service client)", () => {
  it("record: only through record_source_fetch, with the nine arguments, answering the picture to delete", async () => {
    const { db, log } = recordingDb({ rpc: { data: "yt/old.jpg", error: null } });
    const replaced = await createSourceFetchStore(db).record({ linkId: "l1", found: true, gone: false, title: "T", siteName: "S", channelUrl: null, thumbPath: "yt/a.jpg", thumbSha256: "a", problem: null });
    expect(replaced).toBe("yt/old.jpg");
    expect(log).toEqual([
      'rpc record_source_fetch {"p_link_id":"l1","p_found":true,"p_title":"T","p_site_name":"S","p_channel_url":null,"p_thumb_path":"yt/a.jpg","p_thumb_sha256":"a","p_problem":null,"p_gone":false}',
    ]);
    expect(Object.keys(JSON.parse(log[0].split(" ").slice(2).join(" ")))).not.toEqual(expect.arrayContaining(["p_fetched_at", "p_checked_at"]));
  });

  it("record: no replaced picture is null", async () => {
    expect(await createSourceFetchStore(recordingDb({ rpc: { data: null, error: null } }).db).record({ linkId: "l1", found: false, gone: false, title: null, siteName: null, channelUrl: null, thumbPath: null, thumbSha256: null, problem: "timeout" })).toBeNull();
  });

  it("putThumb writes to the private bucket as a JPEG, over itself if it is there; removeThumbs deletes by path", async () => {
    const { db, log } = recordingDb();
    const store = createSourceFetchStore(db);
    await store.putThumb("yt/a.jpg", new Uint8Array([1]));
    await store.removeThumbs(["yt/a.jpg", "yt/b.jpg"]);
    await store.removeThumbs([]);
    expect(log).toEqual(['upload source-thumbs yt/a.jpg {"contentType":"image/jpeg","upsert":true}', 'remove source-thumbs ["yt/a.jpg","yt/b.jpg"]']);
  });

  it("a storage failure is named by operation only", async () => {
    const { db } = recordingDb({ upload: { error: { message: "bucket path /secret/a.jpg" } } });
    const error = (await createSourceFetchStore(db).putThumb("yt/a.jpg", new Uint8Array([1])).catch((e: unknown) => e)) as Error;
    expect(error.message).toBe("sources.putThumb (no code)");
  });

  it("purgeStale returns the paths the function answers", async () => {
    expect(await createSourceFetchStore(recordingDb({ rpc: { data: ["yt/a.jpg", "yt/b.jpg"], error: null } }).db).purgeStale()).toEqual(["yt/a.jpg", "yt/b.jpg"]);
    expect(await createSourceFetchStore(recordingDb({ rpc: { data: [], error: null } }).db).purgeStale()).toEqual([]);
  });
});

describe("the link-fetch dependencies", () => {
  it("are the real DNS and HTTPS unless the fixture is on, and the made-up sites under it (never on Vercel)", () => {
    env.value = {};
    expect(buildSourceFetchDeps().link).toEqual({});
    env.value = { LLM_ADAPTER: "fixture" };
    expect(buildSourceFetchDeps().link).toHaveProperty("transport");
    env.value = { LLM_ADAPTER: "fixture", VERCEL_ENV: "production" };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(buildSourceFetchDeps().link).toEqual({});
  });
});

describe("runSourceReadNow", () => {
  it("answers 'no such source' for a link the store does not know, without any outside call", async () => {
    env.value = { LLM_ADAPTER: "fixture" };
    expect(await runSourceReadNow("00000000-0000-4000-8000-000000000000")).toBe("no such source");
  });
});
