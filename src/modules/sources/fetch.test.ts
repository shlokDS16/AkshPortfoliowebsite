import { describe, expect, it, vi } from "vitest";
import { dns, enc, PUBLIC, reply } from "../documents/safe-fetch-fakes";
import type { Transport, TransportRequest } from "../documents/safe-fetch";
import { fetchPendingSources, isPending, readSourceNow, recheckSources, type FetchDeps, type FetchStore, type RecordFetch, type SourceRef } from "./fetch";

// No network: DNS is a table, the transport a function, the store and the clock fakes.

const HOSTS = dns({ "www.youtube.com": [PUBLIC], "i.ytimg.com": [PUBLIC], "blog.example": [PUBLIC] });
const JSON_H = { "content-type": "application/json" };
const oembed = (over: Record<string, unknown> = {}) => enc(JSON.stringify({ title: "A talk", author_name: "Chan", author_url: "https://www.youtube.com/@chan", ...over }));
const jpeg = (tag: number) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, tag]);
const ID = (n: number) => `video${String(n).padStart(6, "0")}`; // 11 characters

type Script = { oembed?: (id: string) => ReturnType<typeof reply>; thumb?: (id: string) => ReturnType<typeof reply>; page?: () => ReturnType<typeof reply>; tookMs?: number };

function world(script: Script = {}) {
  let now = Date.parse("2026-10-16T08:00:00Z");
  const requests: string[] = [];
  const transport: Transport = async ({ url }: TransportRequest) => {
    requests.push(`${url.hostname}${url.pathname}`);
    now += script.tookMs ?? 0;
    if (url.hostname === "www.youtube.com") {
      const id = new URL(url).searchParams.get("url")?.slice(-11) ?? "";
      return script.oembed ? script.oembed(id) : reply(200, JSON_H, [oembed({ title: `Title of ${id}` })]);
    }
    if (url.hostname === "i.ytimg.com") {
      const id = url.pathname.split("/")[2];
      return script.thumb ? script.thumb(id) : reply(200, { "content-type": "image/jpeg" }, [jpeg(Number(id.slice(-3)))]);
    }
    return script.page ? script.page() : reply(200, { "content-type": "text/html" }, [enc('<html><head><title>Page title</title><meta property="og:site_name" content="The Blog"></head></html>')]);
  };
  const recorded: RecordFetch[] = [];
  const objects = new Map<string, Uint8Array>();
  const removed: string[] = [];
  const order: string[] = [];
  const refs = new Map<string, SourceRef>();
  const replaced = new Map<string, string>();
  const store: FetchStore = {
    async pending(limit) {
      order.push("pending");
      return [...refs.values()].filter(isPending).slice(0, limit);
    },
    async stale(limit) {
      order.push("stale");
      return [...refs.values()].filter((r) => r.kind === "youtube" && !r.gone && r.fetchedAt !== null).slice(0, limit);
    },
    async byId(id) {
      return refs.get(id) ?? null;
    },
    async record(args) {
      order.push("record");
      recorded.push(args);
      return replaced.get(args.linkId) ?? null;
    },
    async putThumb(path, bytes) {
      order.push("put");
      objects.set(path, bytes);
    },
    async removeThumbs(paths) {
      order.push("remove");
      removed.push(...paths);
    },
    async purgeStale() {
      order.push("purge");
      return purged;
    },
  };
  let purged: string[] = [];
  const deps: FetchDeps = { store, link: { resolve: HOSTS.resolve, transport }, clock: () => now };
  const add = (id: string, over: Partial<SourceRef> = {}): SourceRef => {
    const ref: SourceRef = { id, kind: "youtube", youtubeId: id.padEnd(11, "x").slice(0, 11), url: `https://youtu.be/${id}`, fetchedAt: null, checkedAt: null, fetchAttempts: 0, fetchProblem: null, gone: false, ...over };
    refs.set(id, ref);
    return ref;
  };
  return { deps, add, recorded, objects, removed, order, requests, replaced, setPurged: (p: string[]) => (purged = p), advance: (ms: number) => (now += ms), now: () => now };
}

describe("isPending: which links the pump reads", () => {
  const ref: SourceRef = { id: "a", kind: "web", youtubeId: null, url: "https://blog.example/p", fetchedAt: null, checkedAt: null, fetchAttempts: 0, fetchProblem: null, gone: false };
  it("is a link never read, with fewer than 3 tries, whose last problem may pass", () => {
    expect(isPending(ref)).toBe(true);
    expect(isPending({ ...ref, fetchAttempts: 2, fetchProblem: "timeout" })).toBe(true);
    expect(isPending({ ...ref, fetchAttempts: 1, fetchProblem: "unavailable" })).toBe(true);
    expect(isPending({ ...ref, fetchAttempts: 3, fetchProblem: "timeout" })).toBe(false);
    expect(isPending({ ...ref, fetchedAt: "2026-10-01T00:00:00Z" })).toBe(false);
    expect(isPending({ ...ref, gone: true })).toBe(false);
  });
  it("is not a link with an answer that will not change", () => {
    for (const fetchProblem of ["not_found", "not_embeddable", "not_page", "refused", "too_big_image", "purged"] as const) expect(isPending({ ...ref, fetchProblem }), fetchProblem).toBe(false);
  });
});

describe("sources:fetch (the pump)", () => {
  it("reads a YouTube link: the title and channel, the picture stored under its hash, one record", async () => {
    const w = world();
    w.add("aaaaaaa001");
    expect(await fetchPendingSources(w.deps)).toBe("read 1");
    expect(w.recorded).toHaveLength(1);
    const r = w.recorded[0];
    expect(r).toMatchObject({ found: true, gone: false, title: expect.stringContaining("Title of"), siteName: "Chan", channelUrl: "https://www.youtube.com/@chan", problem: null });
    expect(r.thumbPath).toBe(`yt/${r.thumbSha256}.jpg`);
    expect(w.objects.get(r.thumbPath as string)).toBeInstanceOf(Uint8Array);
    expect(w.order.indexOf("put")).toBeLessThan(w.order.indexOf("record"));
  });

  it("reads a page: title and site name, no picture, no channel", async () => {
    const w = world();
    w.add("page00001", { kind: "web", youtubeId: null, url: "https://blog.example/p" });
    await fetchPendingSources(w.deps);
    expect(w.recorded[0]).toEqual({ linkId: "page00001", found: true, gone: false, title: "Page title", siteName: "The Blog", channelUrl: null, thumbPath: null, thumbSha256: null, problem: null });
    expect(w.objects.size).toBe(0);
  });

  it("reads at most 5 a run", async () => {
    const w = world();
    for (let i = 0; i < 8; i += 1) w.add(`link${i}`, { youtubeId: ID(i) });
    expect(await fetchPendingSources(w.deps)).toBe("read 5");
    expect(w.recorded).toHaveLength(5);
  });

  it("stops starting new reads after 40 seconds, counted on the clock", async () => {
    const w = world({ tookMs: 10_000 }); // a link takes two requests: 20 s
    for (let i = 0; i < 5; i += 1) w.add(`link${i}`, { youtubeId: ID(i) });
    expect(await fetchPendingSources(w.deps)).toBe("read 2, stopped early: out of time");
    expect(w.recorded).toHaveLength(2);
  });

  it("says so when there is nothing to read", async () => {
    expect(await fetchPendingSources(world().deps)).toBe("nothing to read");
  });

  it("records a failure that may pass without changing what was read, and counts it in the detail", async () => {
    const w = world({ oembed: () => reply(500) });
    w.add("aaaaaaa001");
    expect(await fetchPendingSources(w.deps)).toBe("read 0, problem 1");
    expect(w.recorded[0]).toEqual({ linkId: "aaaaaaa001", found: false, gone: false, title: null, siteName: null, channelUrl: null, thumbPath: null, thumbSha256: null, problem: "unavailable" });
  });

  it("a video that does not exist on its first read is a recorded problem, not 'gone'", async () => {
    const w = world({ oembed: () => reply(404) });
    w.add("aaaaaaa001");
    await fetchPendingSources(w.deps);
    expect(w.recorded[0]).toMatchObject({ found: false, gone: false, problem: "not_found" });
  });

  it("a thumbnail over 200 KB keeps the title and drops the picture, with its problem", async () => {
    const w = world({ thumb: () => reply(200, { "content-type": "image/jpeg" }, [new Uint8Array(205_000)]) });
    w.add("aaaaaaa001");
    await fetchPendingSources(w.deps);
    expect(w.recorded[0]).toMatchObject({ found: true, title: expect.any(String), thumbPath: null, thumbSha256: null, problem: "too_big_image" });
    expect(w.objects.size).toBe(0);
  });

  it("a thumbnail that did not arrive is a failed try for the whole read, so it is tried again", async () => {
    const w = world({ thumb: () => reply(500) });
    w.add("aaaaaaa001");
    await fetchPendingSources(w.deps);
    expect(w.recorded[0]).toMatchObject({ found: false, problem: "unavailable" });
  });

  it("deletes the picture a read replaced", async () => {
    const w = world();
    w.add("aaaaaaa001");
    w.replaced.set("aaaaaaa001", "yt/old.jpg");
    await fetchPendingSources(w.deps);
    expect(w.removed).toEqual(["yt/old.jpg"]);
  });

  it("makes no request for a link tried 3 times, one with an answer that will not change, or one already read", async () => {
    const w = world();
    w.add("a1", { fetchAttempts: 3, fetchProblem: "timeout" });
    w.add("a2", { fetchProblem: "not_found" });
    w.add("a3", { fetchedAt: "2026-10-01T00:00:00Z" });
    expect(await fetchPendingSources(w.deps)).toBe("nothing to read");
    expect(w.requests).toHaveLength(0);
  });

  it("goes on after one link cannot be stored and fails the step at the end, counts only", async () => {
    const w = world();
    w.add("aaaaaaa001");
    w.add("aaaaaaa002");
    let n = 0;
    const real = w.deps.store.record;
    w.deps.store.record = async (a) => {
      if (n++ === 0) throw new Error("secret row text");
      return real(a);
    };
    await expect(fetchPendingSources(w.deps)).rejects.toThrow("read 1, 1 could not be stored");
    expect(w.recorded).toHaveLength(1);
  });
});

describe("sources:recheck (daily)", () => {
  it("purges first, deletes the pictures it cleared, then checks, and says both", async () => {
    const w = world();
    w.setPurged(["yt/a.jpg", "yt/b.jpg"]);
    w.add("aaaaaaa001", { fetchedAt: "2026-09-01T00:00:00Z", checkedAt: "2026-09-01T00:00:00Z" });
    expect(await recheckSources(w.deps)).toBe("purged 2, checked 1");
    expect(w.order.slice(0, 3)).toEqual(["purge", "remove", "stale"]);
    expect(w.removed).toEqual(["yt/a.jpg", "yt/b.jpg"]);
  });

  it("purges even when there is nothing to check", async () => {
    const w = world();
    w.setPurged(["yt/a.jpg"]);
    expect(await recheckSources(w.deps)).toBe("purged 1, nothing to check");
  });

  it("checks at most 40, and stops after 60 seconds", async () => {
    const w = world();
    for (let i = 0; i < 50; i += 1) w.add(`link${i}`, { youtubeId: ID(i), fetchedAt: "2026-09-01T00:00:00Z" });
    expect(await recheckSources(w.deps)).toBe("checked 40");
    const slow = world({ tookMs: 15_000 }); // two requests: 30 s a link
    for (let i = 0; i < 5; i += 1) slow.add(`link${i}`, { youtubeId: ID(i), fetchedAt: "2026-09-01T00:00:00Z" });
    expect(await recheckSources(slow.deps)).toBe("checked 2, stopped early: out of time");
  });

  it("marks a video that YouTube no longer has as gone, clears its data, deletes its picture and counts it", async () => {
    const w = world({ oembed: () => reply(404) });
    w.add("aaaaaaa001", { fetchedAt: "2026-09-01T00:00:00Z" });
    w.replaced.set("aaaaaaa001", "yt/old.jpg");
    expect(await recheckSources(w.deps)).toBe("checked 1, gone 1");
    expect(w.recorded[0]).toEqual({ linkId: "aaaaaaa001", found: false, gone: true, title: null, siteName: null, channelUrl: null, thumbPath: null, thumbSha256: null, problem: "not_found" });
    expect(w.removed).toEqual(["yt/old.jpg"]);
  });

  it("a video that stops allowing embedding keeps what it had (it is purged at 30 days, never made gone)", async () => {
    const w = world({ oembed: () => reply(401) });
    w.add("aaaaaaa001", { fetchedAt: "2026-09-01T00:00:00Z" });
    await recheckSources(w.deps);
    expect(w.recorded[0]).toMatchObject({ found: false, gone: false, problem: "not_embeddable" });
  });
});

describe("readSourceNow ('Read again' and the read on save)", () => {
  it("reads that link even though it was read before, and says what it did", async () => {
    const w = world();
    w.add("aaaaaaa001", { fetchedAt: "2026-09-01T00:00:00Z", checkedAt: "2026-09-01T00:00:00Z" });
    expect(await readSourceNow(w.deps, "aaaaaaa001", new Map())).toBe("read");
    expect(w.recorded).toHaveLength(1);
  });

  it("answers 'no such source' for an unknown id", async () => {
    expect(await readSourceNow(world().deps, "zzz", new Map())).toBe("no such source");
  });

  it("does not read again within a minute of the last successful read (the database's checked_at), and does after", async () => {
    const w = world();
    const checkedAt = new Date(w.now() - 30_000).toISOString();
    w.add("aaaaaaa001", { fetchedAt: checkedAt, checkedAt });
    expect(await readSourceNow(w.deps, "aaaaaaa001", new Map())).toBe("recent");
    expect(w.requests).toHaveLength(0);
    w.advance(31_000);
    expect(await readSourceNow(w.deps, "aaaaaaa001", new Map())).toBe("read");
  });

  it("does not use fetched_at for the cooldown: a link first read long ago but never checked since is read at once", async () => {
    const w = world();
    w.add("aaaaaaa001", { fetchedAt: new Date(w.now() - 5_000).toISOString(), checkedAt: null });
    expect(await readSourceNow(w.deps, "aaaaaaa001", new Map())).toBe("read");
  });

  it("holds a failed try to the same minute, from this process's own record of its attempts", async () => {
    const w = world({ oembed: () => reply(500) });
    w.add("aaaaaaa001");
    const attempts = new Map<string, number>();
    expect(await readSourceNow(w.deps, "aaaaaaa001", attempts)).toBe("problem");
    expect(await readSourceNow(w.deps, "aaaaaaa001", attempts)).toBe("recent");
    w.advance(61_000);
    expect(await readSourceNow(w.deps, "aaaaaaa001", attempts)).toBe("problem");
  });

  it("a failed try changes neither date: the record carries no date at all", async () => {
    const w = world({ oembed: () => reply(500) });
    w.add("aaaaaaa001", { fetchedAt: "2026-09-01T00:00:00Z", checkedAt: "2026-09-01T00:00:00Z" });
    await readSourceNow(w.deps, "aaaaaaa001", new Map());
    expect(Object.keys(w.recorded[0])).not.toEqual(expect.arrayContaining(["fetchedAt", "checkedAt"]));
  });

  it("lets a store failure through for the caller to report by its shape", async () => {
    const w = world();
    w.add("aaaaaaa001");
    w.deps.store.record = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(readSourceNow(w.deps, "aaaaaaa001", new Map())).rejects.toThrow();
  });
});
