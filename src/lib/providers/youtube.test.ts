import { describe, expect, it, vi } from "vitest";
import { createYoutubeVideoMeta, YOUTUBE_HOST } from "./youtube";

// Every test injects its own fetch. Nothing here reaches the network, and the key is a made-up string.
const KEY = "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKE12345";
const CHANNEL = "UC0123456789abcdefghijkl";
const id = (n: number) => `vid${String(n).padStart(8, "0")}`;
const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" }, ...init });
const item = (videoId: string, extra: Record<string, unknown> = {}) => ({
  id: videoId,
  snippet: { channelId: CHANNEL, title: `Title ${videoId}`, description: "A description.", publishedAt: "2026-09-01T10:00:00Z" },
  contentDetails: { duration: "PT1H2M3S" },
  status: { privacyStatus: "unlisted" },
  ...extra,
});
const apiError = (status: number, reason: string, message = `bad request, key=${KEY}`) =>
  json({ error: { code: status, message, errors: [{ domain: "youtube.quota", reason, message }] } }, { status });
const port = (fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createYoutubeVideoMeta>[0]> = {}) =>
  createYoutubeVideoMeta({ apiKey: KEY, channelId: CHANNEL, fetch: fetchImpl, ...extra });
const answering = (...makers: Array<() => Response | Promise<Response>>) => {
  let i = 0;
  return vi.fn<typeof fetch>(async () => makers[Math.min(i++, makers.length - 1)]());
};

describe("the YouTube adapter: the request", () => {
  it("makes one GET to the fixed videos.list address with the three parts, the ids and the key; no redirect, no cache, a timeout", async () => {
    const fetchMock = answering(() => json({ items: [item("aaaaaaaaaaa")] }));
    const out = await port(fetchMock).fetch(["aaaaaaaaaaa", "bbbbbbbbbbb"]);
    expect(out.kind).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.protocol).toBe("https:");
    expect(parsed.hostname).toBe(YOUTUBE_HOST);
    expect(YOUTUBE_HOST).toBe("www.googleapis.com");
    expect(parsed.pathname).toBe("/youtube/v3/videos");
    expect(parsed.searchParams.get("part")).toBe("snippet,contentDetails,status");
    expect(parsed.searchParams.get("id")).toBe("aaaaaaaaaaa,bbbbbbbbbbb");
    expect(parsed.searchParams.get("key")).toBe(KEY);
    expect([...parsed.searchParams.keys()].sort()).toEqual(["fields", "id", "key", "part"]);
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(init?.redirect).toBe("error");
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends 51 ids as two calls (50, then 1) and joins the answers", async () => {
    const ids = Array.from({ length: 51 }, (_, n) => id(n));
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      const asked = new URL(String(url)).searchParams.get("id")?.split(",") ?? [];
      return json({ items: asked.map((a) => item(a)) });
    });
    const out = await port(fetchMock).fetch(ids);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("id")?.split(",")).toHaveLength(50);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("id")?.split(",")).toHaveLength(1);
    expect(out.kind === "ok" && out.videos.size).toBe(51);
  });

  it("sends each id once, never sends a malformed id, and makes no call for an empty list", async () => {
    const fetchMock = answering(() => json({ items: [item("aaaaaaaaaaa")] }));
    const out = await port(fetchMock).fetch(["aaaaaaaaaaa", "aaaaaaaaaaa", "short", "has space!!", "x/../../etc"]);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("id")).toBe("aaaaaaaaaaa");
    expect(out.kind === "ok" && out.videos.get("short")).toBe("missing");
    const none = answering(() => json({ items: [] }));
    expect(await port(none).fetch([])).toEqual({ kind: "ok", videos: new Map() });
    expect(none).not.toHaveBeenCalled();
  });

  it("never uses any method but GET", async () => {
    const fetchMock = answering(() => json({ items: [] }));
    await port(fetchMock).fetch(["aaaaaaaaaaa"]);
    for (const [, init] of fetchMock.mock.calls) expect(init?.method ?? "GET").toBe("GET");
  });
});

describe("the YouTube adapter: the answer", () => {
  it("reads the channel, title, description, length, privacy and publish time", async () => {
    const out = await port(answering(() => json({ items: [item("aaaaaaaaaaa")] }))).fetch(["aaaaaaaaaaa"]);
    expect(out).toEqual({
      kind: "ok",
      videos: new Map([["aaaaaaaaaaa", { channelId: CHANNEL, title: "Title aaaaaaaaaaa", description: "A description.", durationSeconds: 3723, privacy: "unlisted", publishedAt: "2026-09-01T10:00:00.000Z" }]]),
    });
  });

  it.each([
    ["PT45S", 45],
    ["PT5M", 300],
    ["PT1H", 3600],
    ["P1DT2H", 93600],
    ["P0D", null],
    ["PT0S", null],
    ["garbage", null],
  ])("reads the duration %s as %s", async (duration, expected) => {
    const out = await port(answering(() => json({ items: [item("aaaaaaaaaaa", { contentDetails: { duration } })] }))).fetch(["aaaaaaaaaaa"]);
    expect(out.kind === "ok" && (out.videos.get("aaaaaaaaaaa") as { durationSeconds: number | null }).durationSeconds).toBe(expected);
  });

  it("reports an unknown or absent privacy as private, so the gate refuses it", async () => {
    for (const status of [{ privacyStatus: "mystery" }, {}, undefined]) {
      const out = await port(answering(() => json({ items: [item("aaaaaaaaaaa", { status })] }))).fetch(["aaaaaaaaaaa"]);
      expect(out.kind === "ok" && (out.videos.get("aaaaaaaaaaa") as { privacy: string }).privacy).toBe("private");
    }
  });

  it("marks an id YouTube did not return as missing (deleted or private)", async () => {
    const out = await port(answering(() => json({ items: [item("aaaaaaaaaaa")] }))).fetch(["aaaaaaaaaaa", "bbbbbbbbbbb"]);
    expect(out.kind === "ok" && out.videos.get("bbbbbbbbbbb")).toBe("missing");
  });

  it("treats a videoNotFound 404 as every id missing", async () => {
    const out = await port(answering(() => apiError(404, "videoNotFound"))).fetch(["aaaaaaaaaaa"]);
    expect(out).toEqual({ kind: "ok", videos: new Map([["aaaaaaaaaaa", "missing"]]) });
  });

  it("ignores an item it did not ask for", async () => {
    const out = await port(answering(() => json({ items: [item("aaaaaaaaaaa"), item("zzzzzzzzzzz")] }))).fetch(["aaaaaaaaaaa"]);
    expect(out.kind === "ok" && [...out.videos.keys()]).toEqual(["aaaaaaaaaaa"]);
  });
});

describe("the YouTube adapter: failures, each a typed result and none carrying the key", () => {
  const leak = (value: unknown) => expect(JSON.stringify(value)).not.toContain(KEY);

  it("answers quota for 403 quotaExceeded, and for a quota on the second batch of two", async () => {
    const one = await port(answering(() => apiError(403, "quotaExceeded"))).fetch(["aaaaaaaaaaa"]);
    expect(one).toEqual({ kind: "quota" });
    const ids = Array.from({ length: 51 }, (_, n) => id(n));
    const two = await port(answering(() => json({ items: [] }), () => apiError(403, "quotaExceeded"))).fetch(ids);
    expect(two).toEqual({ kind: "quota" });
  });

  it("answers refused with the reason code only for a 400 or another 403", async () => {
    const bad = await port(answering(() => apiError(400, "keyInvalid"))).fetch(["aaaaaaaaaaa"]);
    expect(bad).toEqual({ kind: "refused", reason: "keyInvalid" });
    leak(bad);
    const forbidden = await port(answering(() => apiError(403, "forbidden"))).fetch(["aaaaaaaaaaa"]);
    expect(forbidden).toEqual({ kind: "refused", reason: "forbidden" });
  });

  it("falls back to the status number when the reason is missing or is not a plain token", async () => {
    const odd = await port(answering(() => json({ error: { errors: [{ reason: `see ${KEY} here` }] } }, { status: 400 }))).fetch(["aaaaaaaaaaa"]);
    expect(odd).toEqual({ kind: "refused", reason: "http_400" });
    leak(odd);
    const empty = await port(answering(() => new Response("nope", { status: 401 }))).fetch(["aaaaaaaaaaa"]);
    expect(empty).toEqual({ kind: "refused", reason: "http_401" });
  });

  it("answers unavailable for 5xx and 429", async () => {
    for (const status of [500, 502, 503, 429]) {
      expect(await port(answering(() => new Response("err", { status }))).fetch(["aaaaaaaaaaa"])).toEqual({ kind: "unavailable" });
    }
  });

  it("answers unavailable for a timeout (the abort signal), and for a network error whose text holds the key", async () => {
    const hang = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    expect(await port(hang, { callTimeoutMs: 20 }).fetch(["aaaaaaaaaaa"])).toEqual({ kind: "unavailable" });
    const boom = vi.fn<typeof fetch>(async () => {
      throw new TypeError(`fetch failed for https://www.googleapis.com/youtube/v3/videos?key=${KEY}`);
    });
    const out = await port(boom).fetch(["aaaaaaaaaaa"]);
    expect(out).toEqual({ kind: "unavailable" });
    leak(out);
  });

  it("answers unavailable for an answer that is not JSON, has no items array, or has an item it cannot read", async () => {
    expect(await port(answering(() => new Response("<html>", { status: 200 }))).fetch(["aaaaaaaaaaa"])).toEqual({ kind: "unavailable" });
    expect(await port(answering(() => json({ nothing: true }))).fetch(["aaaaaaaaaaa"])).toEqual({ kind: "unavailable" });
    expect(await port(answering(() => json({ items: [{ id: "aaaaaaaaaaa", snippet: { title: "no channel" } }] }))).fetch(["aaaaaaaaaaa"])).toEqual({ kind: "unavailable" });
  });

  it("stops reading an answer past the byte cap", async () => {
    const huge = JSON.stringify({ items: [item("aaaaaaaaaaa", { pad: "x".repeat(1100 * 1024) })] });
    expect(await port(answering(() => new Response(huge, { status: 200 }))).fetch(["aaaaaaaaaaa"])).toEqual({ kind: "unavailable" });
  });

  it("reads a 600 KB answer of 50 videos (an escaped description is about twice its bytes), and refuses 1.1 MB above", async () => {
    const ids = Array.from({ length: 50 }, (_, n) => id(n));
    const items = ids.map((a) => item(a, { snippet: { channelId: CHANNEL, title: "t", description: "d".repeat(12_000), publishedAt: "2026-09-01T10:00:00Z" } }));
    const body = JSON.stringify({ items });
    expect(body.length).toBeGreaterThan(590 * 1024);
    expect((await port(answering(() => new Response(body, { status: 200 }))).fetch(ids)).kind).toBe("ok");
  });

  it("holds a 50-video answer of long descriptions inside the cap", async () => {
    const ids = Array.from({ length: 50 }, (_, n) => id(n));
    const items = ids.map((a) => item(a, { snippet: { channelId: CHANNEL, title: "t", description: "d".repeat(5000), publishedAt: "2026-09-01T10:00:00Z" } }));
    const out = await port(answering(() => json({ items }))).fetch(ids);
    expect(out.kind).toBe("ok");
  });

  it("refuses a key of the wrong shape when it is built, naming the setting and not the value", () => {
    expect(() => createYoutubeVideoMeta({ apiKey: "bad key\r\nX: 1", channelId: CHANNEL })).toThrow(/YOUTUBE_API_KEY/);
    expect(() => createYoutubeVideoMeta({ apiKey: KEY, channelId: "UCshort" })).toThrow(/YOUTUBE_CHANNEL_ID/);
    expect(port(answering(() => json({ items: [] }))).ownChannelId).toBe(CHANNEL);
    try {
      createYoutubeVideoMeta({ apiKey: "bad key\r\nX: 1", channelId: CHANNEL });
    } catch (error) {
      expect(String(error)).not.toContain("bad key");
    }
  });
});
