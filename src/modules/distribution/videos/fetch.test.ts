import { describe, expect, it, vi } from "vitest";
import type { VideoMeta, VideoMetaPort, VideoMetaResult } from "@/lib/providers/video-meta";
import { checkVideos, FETCHED_RECENTLY, fetchPendingVideos, fetchVideoNow, VIDEOS_OFF_TEXT, type FetchStore, type RecordFetch, type SourceRef } from "./fetch";

const OWN = "UC0123456789abcdefghijkl";
const KEY = "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKE12345";
const ytId = (n: number) => `vid${String(n).padStart(8, "0")}`;
const ref = (n: number, extra: Partial<SourceRef> = {}): SourceRef => ({ id: `src-${n}`, itemId: `item-${n}`, youtubeId: ytId(n), privacy: null, published: false, fetchedAt: null, ...extra });
const meta = (extra: Partial<VideoMeta> = {}): VideoMeta => ({
  channelId: OWN, title: "A title", description: "A description.", durationSeconds: 90, privacy: "unlisted", publishedAt: "2026-09-01T10:00:00.000Z", ...extra,
});

function fakeStore(sources: SourceRef[], failRecordFor: string[] = [], purged = 0) {
  const recorded: RecordFetch[] = [];
  const store: FetchStore = {
    pending: vi.fn(async (limit: number) => sources.slice(0, limit)),
    all: vi.fn(async () => sources),
    byItem: vi.fn(async (itemId: string) => sources.find((s) => s.itemId === itemId) ?? null),
    purgeStale: vi.fn(async () => purged),
    record: vi.fn(async (args: RecordFetch) => {
      if (failRecordFor.includes(args.sourceId)) throw new Error(`database said: secret row ${KEY}`);
      recorded.push(args);
    }),
  };
  return { store, recorded };
}
function fakePort(answer: (ids: readonly string[]) => VideoMetaResult | Promise<VideoMetaResult>) {
  const fetchMock = vi.fn(async (ids: readonly string[]) => answer(ids));
  const port: VideoMetaPort = { name: "fixture", ownChannelId: OWN, fetch: fetchMock };
  return { port, fetchMock };
}
const answerAll = (make: (id: string) => VideoMeta | "missing") => (ids: readonly string[]): VideoMetaResult => ({ kind: "ok", videos: new Map(ids.map((id) => [id, make(id)])) });
const deps = (port: VideoMetaPort | null, store: FetchStore, clock: () => number = () => 0) => ({ port, store, clock });

describe("videos are off while the YouTube settings are unset", () => {
  it("says so, in the words the desk uses, and touches neither YouTube nor the database", async () => {
    const { store } = fakeStore([ref(1)]);
    for (const run of [fetchPendingVideos, checkVideos]) {
      expect(await run(deps(null, store))).toBe("videos off");
    }
    expect(await fetchVideoNow(deps(null, store), "item-1")).toBe("videos off");
    expect(store.pending).not.toHaveBeenCalled();
    expect(store.all).not.toHaveBeenCalled();
    expect(store.byItem).not.toHaveBeenCalled();
    expect(store.record).not.toHaveBeenCalled();
    expect(VIDEOS_OFF_TEXT).toBe("Video listing is not set up yet (Shlok adds a YouTube key).");
  });
});

describe("the 30-day purge (Q51): YouTube data is not kept longer than 30 days, even with the key gone", () => {
  it("videos:check runs it FIRST, before the port is looked at, and says how many it cleared", async () => {
    const { store } = fakeStore([ref(1)], [], 2);
    expect(await checkVideos(deps(null, store))).toBe("videos off, purged 2");
    expect(store.purgeStale).toHaveBeenCalledTimes(1);
    expect(store.pending).not.toHaveBeenCalled();
    expect(store.all).not.toHaveBeenCalled();
    expect(store.record).not.toHaveBeenCalled();
  });

  it("says plain 'videos off' when nothing was old enough", async () => {
    const { store } = fakeStore([ref(1)], [], 0);
    expect(await checkVideos(deps(null, store))).toBe("videos off");
  });

  it("with a port, appends 'purged n' to the report only when n is above 0", async () => {
    const withPurge = fakeStore([ref(1)], [], 3);
    const { port } = fakePort(answerAll(() => meta()));
    expect(await checkVideos(deps(port, withPurge.store))).toBe("checked 1, purged 3");
    const none = fakeStore([ref(1)], [], 0);
    expect(await checkVideos(deps(port, none.store))).toBe("checked 1");
  });

  it("fetchPendingVideos and fetchVideoNow never purge", async () => {
    const { store } = fakeStore([ref(1)], [], 5);
    await fetchPendingVideos(deps(null, store));
    await fetchVideoNow(deps(null, store), "item-1");
    expect(store.purgeStale).not.toHaveBeenCalled();
  });
});

describe("Fetch again has a cooldown of a minute, kept in the database so every instance sees it (Q48)", () => {
  const NOW = Date.parse("2026-10-16T10:00:00.000Z");
  const ago = (ms: number) => new Date(NOW - ms).toISOString();

  it("answers 'fetched less than a minute ago' and asks YouTube nothing when the source was fetched 10 s ago", async () => {
    const { store } = fakeStore([ref(1, { fetchedAt: ago(10_000) })]);
    const { port, fetchMock } = fakePort(answerAll(() => meta()));
    expect(await fetchVideoNow(deps(port, store, () => NOW), "item-1")).toBe(FETCHED_RECENTLY);
    expect(FETCHED_RECENTLY).toBe("fetched less than a minute ago");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.record).not.toHaveBeenCalled();
  });

  it("makes the one call when it was fetched 120 s ago, or never", async () => {
    for (const fetchedAt of [ago(120_000), null]) {
      const { store } = fakeStore([ref(1, { fetchedAt })]);
      const { port, fetchMock } = fakePort(answerAll(() => meta()));
      expect(await fetchVideoNow(deps(port, store, () => NOW), "item-1")).toBe("fetched 1");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });
});

describe("videos:fetch (the pump): sources never fetched, at most 50, one API call", () => {
  it("records what YouTube said for each, with own-channel decided by the channel id", async () => {
    const { store, recorded } = fakeStore([ref(1), ref(2)]);
    const { port, fetchMock } = fakePort(answerAll((id) => (id === ytId(2) ? meta({ channelId: "UCotherotherotherother00", privacy: "public" }) : meta())));
    const out = await fetchPendingVideos(deps(port, store));
    expect(out).toBe("fetched 2");
    expect(store.pending).toHaveBeenCalledWith(50);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toEqual([ytId(1), ytId(2)]);
    expect(recorded).toEqual([
      { sourceId: "src-1", found: true, channelId: OWN, ownChannel: true, title: "A title", description: "A description.", duration: 90, privacy: "unlisted", publishedAt: "2026-09-01T10:00:00.000Z", problem: null },
      { sourceId: "src-2", found: true, channelId: "UCotherotherotherother00", ownChannel: false, title: "A title", description: "A description.", duration: 90, privacy: "public", publishedAt: "2026-09-01T10:00:00.000Z", problem: null },
    ]);
  });

  it("passes a live stream's missing length as null and cuts a title and description to the columns' limits", async () => {
    const { store, recorded } = fakeStore([ref(1)]);
    const { port } = fakePort(answerAll(() => meta({ durationSeconds: null, title: "t".repeat(150), description: "d".repeat(6000) })));
    await fetchPendingVideos(deps(port, store));
    expect(recorded[0].duration).toBeNull();
    expect(recorded[0].title).toHaveLength(100);
    expect(recorded[0].description).toHaveLength(5000);
  });

  it("does not cut a character in half when it shortens", async () => {
    const { store, recorded } = fakeStore([ref(1)]);
    const { port } = fakePort(answerAll(() => meta({ title: "\u{1F600}".repeat(120) })));
    await fetchPendingVideos(deps(port, store));
    expect(Array.from(recorded[0].title ?? "")).toHaveLength(100);
    expect(recorded[0].title).not.toMatch(/�/);
  });

  it("marks a video YouTube did not return as gone (found false, with a plain problem)", async () => {
    const { store, recorded } = fakeStore([ref(1)]);
    const { port } = fakePort(answerAll(() => "missing"));
    expect(await fetchPendingVideos(deps(port, store))).toBe("fetched 1, gone 1");
    expect(recorded).toEqual([
      { sourceId: "src-1", found: false, channelId: null, ownChannel: null, title: null, description: null, duration: null, privacy: null, publishedAt: null, problem: "YouTube did not return this video." },
    ]);
  });

  it("has nothing to do, and asks YouTube nothing, when every source was fetched", async () => {
    const { store } = fakeStore([]);
    const { port, fetchMock } = fakePort(answerAll(() => meta()));
    expect(await fetchPendingVideos(deps(port, store))).toBe("nothing to fetch");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("defers, not fails, when the day's quota is used up: nothing recorded, the text says it will try again", async () => {
    const { store, recorded } = fakeStore([ref(1)]);
    const { port } = fakePort(() => ({ kind: "quota" }));
    expect(await fetchPendingVideos(deps(port, store))).toBe("deferred: YouTube's daily limit is used up");
    expect(recorded).toEqual([]);
  });

  it("fails the step with the reason code only when YouTube refuses, and never the key", async () => {
    const { store } = fakeStore([ref(1)]);
    const { port } = fakePort(() => ({ kind: "refused", reason: "keyInvalid" }));
    const error = await fetchPendingVideos(deps(port, store)).catch((e: unknown) => e);
    expect((error as Error).message).toBe("YouTube refused the request (keyInvalid)");
  });

  it("fails the step when YouTube cannot be reached", async () => {
    const { store } = fakeStore([ref(1)]);
    const { port } = fakePort(() => ({ kind: "unavailable" }));
    await expect(fetchPendingVideos(deps(port, store))).rejects.toThrow("YouTube could not be reached");
  });

  it("goes on after a source that cannot be stored, then fails with counts and not the database's text", async () => {
    const { store, recorded } = fakeStore([ref(1), ref(2), ref(3)], ["src-2"]);
    const { port } = fakePort(answerAll(() => meta()));
    const error = await fetchPendingVideos(deps(port, store)).catch((e: unknown) => e);
    expect(recorded.map((r) => r.sourceId)).toEqual(["src-1", "src-3"]);
    expect((error as Error).message).toBe("fetched 2, 1 could not be stored");
    expect(JSON.stringify(error)).not.toContain(KEY);
    expect((error as Error).message).not.toContain("secret");
  });
});

describe("videos:check (daily): every source, in calls of 50", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => ref(i + 1));

  it("refreshes 120 sources in three calls and says how many are gone", async () => {
    const { store, recorded } = fakeStore(many(120));
    const { port, fetchMock } = fakePort(answerAll((id) => (id === ytId(7) ? "missing" : meta())));
    expect(await checkVideos(deps(port, store))).toBe("checked 120, gone 1");
    expect(fetchMock.mock.calls.map(([ids]) => ids.length)).toEqual([50, 50, 20]);
    expect(recorded).toHaveLength(120);
    expect(recorded.find((r) => r.sourceId === "src-7")?.found).toBe(false);
  });

  it("counts a video that is Public on YouTube and not listed here, without changing anything", async () => {
    const { store } = fakeStore([ref(1), ref(2, { published: true }), ref(3)]);
    const { port } = fakePort(answerAll((id) => meta({ privacy: id === ytId(3) ? "unlisted" : "public" })));
    expect(await checkVideos(deps(port, store))).toBe("checked 3, public on YouTube but not listed 1");
  });

  it("stops on quota after the batches it did, records those, and says where it stopped", async () => {
    const { store, recorded } = fakeStore(many(120));
    let call = 0;
    const { port } = fakePort((ids) => (++call === 2 ? { kind: "quota" } : answerAll(() => meta())(ids)));
    expect(await checkVideos(deps(port, store))).toBe("checked 50 of 120, deferred: YouTube's daily limit is used up");
    expect(recorded).toHaveLength(50);
  });

  it("fails on a refusal after recording the batches before it", async () => {
    const { store, recorded } = fakeStore(many(60));
    let call = 0;
    const { port } = fakePort((ids) => (++call === 2 ? { kind: "refused", reason: "forbidden" } : answerAll(() => meta())(ids)));
    await expect(checkVideos(deps(port, store))).rejects.toThrow("YouTube refused the request (forbidden)");
    expect(recorded).toHaveLength(50);
  });

  it("has nothing to check with no sources", async () => {
    const { store } = fakeStore([]);
    const { port, fetchMock } = fakePort(answerAll(() => meta()));
    expect(await checkVideos(deps(port, store))).toBe("nothing to check");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops before a batch when its time is used, and says so", async () => {
    const { store, recorded } = fakeStore(many(120));
    const ticks = [0, 0, 70_000, 70_000, 70_000];
    let i = 0;
    const { port } = fakePort(answerAll(() => meta()));
    const out = await checkVideos(deps(port, store, () => ticks[Math.min(i++, ticks.length - 1)]));
    expect(out).toBe("checked 50 of 120, stopped early: out of time");
    expect(recorded).toHaveLength(50);
  });
});

describe("fetchVideoNow (Fetch again): one source, fetched even if it was fetched before", () => {
  it("asks YouTube for that source alone and records it", async () => {
    const { store, recorded } = fakeStore([ref(1, { privacy: "unlisted" }), ref(2)]);
    const { port, fetchMock } = fakePort(answerAll(() => meta({ title: "Fresh" })));
    expect(await fetchVideoNow(deps(port, store), "item-2")).toBe("fetched 1");
    expect(fetchMock.mock.calls[0][0]).toEqual([ytId(2)]);
    expect(recorded.map((r) => [r.sourceId, r.title])).toEqual([["src-2", "Fresh"]]);
  });

  it("says plainly when the item has no video source", async () => {
    const { store } = fakeStore([ref(1)]);
    const { port, fetchMock } = fakePort(answerAll(() => meta()));
    expect(await fetchVideoNow(deps(port, store), "item-9")).toBe("no such video");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
