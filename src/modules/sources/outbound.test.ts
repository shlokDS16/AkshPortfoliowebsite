import { afterEach, describe, expect, it, vi } from "vitest";
import { dns, enc, PUBLIC, reply, server } from "../documents/safe-fetch-fakes";
import type { SafeFetchDeps, Transport } from "../documents/safe-fetch";
import { readPage, readThumbnail, readYoutube, THUMB_MAX_BYTES } from "./outbound";

// Nothing here reaches a network: DNS is a table and the transport a function (documents/safe-fetch-fakes.ts).

const ID = "dQw4w9WgXcQ";
const HOSTS = dns({ "www.youtube.com": [PUBLIC], "i.ytimg.com": [PUBLIC], "blog.example": [PUBLIC], "other.example": [PUBLIC], "www.other.example": [PUBLIC], "internal.example": [{ address: "10.0.0.5", family: 4 }] });
const JSON_H = { "content-type": "application/json; charset=utf-8" };
const HTML_H = { "content-type": "text/html; charset=utf-8" };
const deps = (transport: Transport): SafeFetchDeps => ({ resolve: HOSTS.resolve, transport });
const oembedBody = (over: Record<string, unknown> = {}) =>
  enc(JSON.stringify({ title: "A talk on moats", author_name: "Some Channel", author_url: "https://www.youtube.com/@somechannel", thumbnail_url: "https://evil.example/x.jpg", provider_name: "YouTube", ...over }));
const jpeg = (size = 100) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
};

afterEach(() => vi.useRealTimers());

describe("readYoutube", () => {
  it("builds the oEmbed address from the id alone and reads title, channel name and channel address", async () => {
    const s = server(reply(200, JSON_H, [oembedBody()]));
    const got = await readYoutube(ID, deps(s.transport));
    expect(got).toEqual({ result: "ok", title: "A talk on moats", channelName: "Some Channel", channelUrl: "https://www.youtube.com/@somechannel" });
    const url = s.calls[0].url;
    expect(`${url.protocol}//${url.host}${url.pathname}`).toBe("https://www.youtube.com/oembed");
    expect(url.searchParams.get("url")).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(url.searchParams.get("format")).toBe("json");
  });

  it("never follows oEmbed's thumbnail_url (it is not in the answer)", async () => {
    const got = await readYoutube(ID, deps(server(reply(200, JSON_H, [oembedBody()])).transport));
    expect(JSON.stringify(got)).not.toContain("evil.example");
  });

  it("drops an author_url that is not on www.youtube.com, or is over 300 characters, or is not https", async () => {
    for (const author_url of ["https://evil.example/@x", "https://www.youtube.com.evil.example/@x", `https://www.youtube.com/${"a".repeat(300)}`, "http://www.youtube.com/@x", "javascript:alert(1)", 5]) {
      const got = await readYoutube(ID, deps(server(reply(200, JSON_H, [oembedBody({ author_url })])).transport));
      expect(got, String(author_url)).toMatchObject({ result: "ok", channelUrl: null });
    }
  });

  it("tidies the title and the channel name (entities, control characters, length)", async () => {
    const body = oembedBody({ title: `Moats &amp; margins ${"x".repeat(400)}`, author_name: "Chan\u0000nel\n name" });
    const got = await readYoutube(ID, deps(server(reply(200, JSON_H, [body])).transport));
    expect(got).toMatchObject({ result: "ok", channelName: "Chan nel name" });
    if (got.result === "ok") {
      expect(Array.from(got.title).length).toBeLessThanOrEqual(300);
      expect(got.title.startsWith("Moats & margins")).toBe(true);
    }
  });

  it("keeps a missing author as null and refuses an answer with no title", async () => {
    expect(await readYoutube(ID, deps(server(reply(200, JSON_H, [oembedBody({ author_name: undefined, author_url: undefined })])).transport))).toMatchObject({ result: "ok", channelName: null, channelUrl: null });
    expect((await readYoutube(ID, deps(server(reply(200, JSON_H, [oembedBody({ title: "  " })])).transport))).result).toBe("unavailable");
    expect((await readYoutube(ID, deps(server(reply(200, JSON_H, [enc("[1,2]")])).transport))).result).toBe("unavailable");
    expect((await readYoutube(ID, deps(server(reply(200, JSON_H, [enc("not json")])).transport))).result).toBe("unavailable");
  });

  it("maps 404 to not_found, 401 and 403 to not_embeddable, and other failures to unavailable", async () => {
    expect(await readYoutube(ID, deps(server(reply(404)).transport))).toEqual({ result: "not_found" });
    expect(await readYoutube(ID, deps(server(reply(401)).transport))).toEqual({ result: "not_embeddable" });
    expect(await readYoutube(ID, deps(server(reply(403)).transport))).toEqual({ result: "not_embeddable" });
    expect(await readYoutube(ID, deps(server(reply(500)).transport))).toEqual({ result: "unavailable" });
    expect(await readYoutube(ID, deps(server(reply(400)).transport))).toEqual({ result: "unavailable" });
  });

  it("is unavailable when the answer is not JSON or is over 64 KB", async () => {
    expect((await readYoutube(ID, deps(server(reply(200, HTML_H, [oembedBody()])).transport))).result).toBe("unavailable");
    const big = enc(JSON.stringify({ title: "x", pad: "y".repeat(70_000) }));
    expect((await readYoutube(ID, deps(server(reply(200, JSON_H, [big])).transport))).result).toBe("unavailable");
  });

  it("times out after 10 seconds", async () => {
    vi.useFakeTimers();
    const hang: Transport = () => new Promise(() => undefined);
    const pending = readYoutube(ID, deps(hang));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ result: "timeout" });
  });

  it("refuses an id that is not eleven id characters, without a request", async () => {
    const s = server();
    for (const bad of ["short", "a".repeat(12), "dQw4w9WgXc!", "dQw4w9WgXcQ&x=1"]) expect(await readYoutube(bad, deps(s.transport))).toEqual({ result: "refused" });
    expect(s.calls).toHaveLength(0);
  });

  it("never throws and never echoes the address: a transport that throws is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const boom: Transport = async () => {
      throw new Error("connect ECONNREFUSED 10.1.2.3:443 https://www.youtube.com/oembed?token=secret");
    };
    const got = await readYoutube(ID, deps(boom));
    expect(got).toEqual({ result: "unavailable" });
    expect(JSON.stringify(got)).not.toMatch(/secret|youtube|10\.1/);
  });
});

describe("readThumbnail", () => {
  it("builds mqdefault.jpg from the id alone and returns the bytes with their sha256", async () => {
    const s = server(reply(200, { "content-type": "image/jpeg" }, [jpeg(120)]));
    const got = await readThumbnail(ID, deps(s.transport));
    expect(got.result).toBe("ok");
    if (got.result === "ok") {
      expect(got.bytes.byteLength).toBe(120);
      expect(got.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(`${s.calls[0].url.host}${s.calls[0].url.pathname}`).toBe(`i.ytimg.com/vi/${ID}/mqdefault.jpg`);
    expect(s.calls[0].url.search).toBe("");
  });

  it("takes exactly 200 KB and refuses one byte more as too_big_image", async () => {
    expect(THUMB_MAX_BYTES).toBe(204_800);
    const exact = await readThumbnail(ID, deps(server(reply(200, { "content-type": "image/jpeg" }, [jpeg(THUMB_MAX_BYTES)])).transport));
    expect(exact.result).toBe("ok");
    const over = await readThumbnail(ID, deps(server(reply(200, { "content-type": "image/jpeg" }, [jpeg(THUMB_MAX_BYTES + 1)])).transport));
    expect(over).toEqual({ result: "too_big_image" });
    expect(await readThumbnail(ID, deps(server(reply(200, { "content-type": "image/jpeg", "content-length": "300000" }, [jpeg(10)])).transport))).toEqual({ result: "too_big_image" });
  });

  it("refuses bytes that are not a JPEG, whatever the content type says", async () => {
    expect(await readThumbnail(ID, deps(server(reply(200, { "content-type": "image/jpeg" }, [enc("<html>nope</html>")])).transport))).toEqual({ result: "unavailable" });
    expect(await readThumbnail(ID, deps(server(reply(200, { "content-type": "image/png" }, [jpeg()])).transport))).toEqual({ result: "unavailable" });
    expect(await readThumbnail(ID, deps(server(reply(200, { "content-type": "image/jpeg" }, [new Uint8Array(0)])).transport))).toEqual({ result: "unavailable" });
  });

  it("is unavailable on a 404 or 500 and times out after 10 seconds", async () => {
    expect(await readThumbnail(ID, deps(server(reply(404)).transport))).toEqual({ result: "unavailable" });
    expect(await readThumbnail(ID, deps(server(reply(500)).transport))).toEqual({ result: "unavailable" });
    vi.useFakeTimers();
    const pending = readThumbnail(ID, deps(() => new Promise(() => undefined)));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ result: "timeout" });
  });

  it("refuses a bad id without a request", async () => {
    const s = server();
    expect(await readThumbnail("../etc/passwd", deps(s.transport))).toEqual({ result: "refused" });
    expect(s.calls).toHaveLength(0);
  });
});

describe("readPage", () => {
  const page = `<html><head><title>Plain</title><meta property="og:title" content="The post"><meta property="og:site_name" content="The Blog"></head><body>text</body></html>`;

  it("reads the title and site name and requests the saved link as it is", async () => {
    const s = server(reply(200, HTML_H, [enc(page)]));
    expect(await readPage("https://blog.example/p/1?id=7", deps(s.transport))).toEqual({ result: "ok", title: "The post", siteName: "The Blog" });
    expect(s.calls[0].url.href).toBe("https://blog.example/p/1?id=7");
  });

  it("uses the host (without www.) of the address that answered when the page has no site name", async () => {
    const html = "<html><head><title>T</title></head></html>";
    const s = server(reply(302, { location: "https://www.other.example/final" }), reply(200, HTML_H, [enc(html)]));
    expect(await readPage("https://blog.example/p", deps(s.transport))).toEqual({ result: "ok", title: "T", siteName: "other.example" });
  });

  it("is ok with no title when the page has none", async () => {
    expect(await readPage("https://blog.example/p", deps(server(reply(200, HTML_H, [enc("<html><body>x</body></html>")])).transport))).toEqual({ result: "ok", title: null, siteName: "blog.example" });
  });

  it("reads only the first 512 KB: a title before the cap is found, one after it is not", async () => {
    const pad = "<p>padding</p>".repeat(60_000);
    const early = `<html><head><title>Early</title></head><body>${pad}</body></html>`;
    expect(Buffer.byteLength(early)).toBeGreaterThan(512 * 1024);
    expect(await readPage("https://blog.example/p", deps(server(reply(200, HTML_H, [enc(early)])).transport))).toMatchObject({ result: "ok", title: "Early" });
    const late = `<html><head>${"<meta name=\"a\" content=\"b\">".repeat(30_000)}<title>Late</title></head></html>`;
    expect(await readPage("https://blog.example/p", deps(server(reply(200, HTML_H, [enc(late)])).transport))).toMatchObject({ result: "ok", title: null });
  });

  it("accepts xhtml and refuses anything that is not a page as not_page", async () => {
    expect((await readPage("https://blog.example/p", deps(server(reply(200, { "content-type": "application/xhtml+xml" }, [enc(page)])).transport))).result).toBe("ok");
    for (const type of ["application/pdf", "image/png", "application/json", "text/plain", ""]) {
      expect(await readPage("https://blog.example/p", deps(server(reply(200, { "content-type": type }, [enc(page)])).transport)), type).toEqual({ result: "not_page" });
    }
  });

  it("refuses a link the guard refuses (private address, http, credentials) as refused", async () => {
    const s = server();
    expect(await readPage("https://internal.example/p", deps(s.transport))).toEqual({ result: "refused" });
    expect(await readPage("http://blog.example/p", deps(s.transport))).toEqual({ result: "refused" });
    expect(await readPage("https://u:p@blog.example/p", deps(s.transport))).toEqual({ result: "refused" });
    expect(s.calls).toHaveLength(0);
  });

  it("maps a failure to unavailable, a hang to timeout after 10 seconds, and too many redirects to unavailable", async () => {
    expect(await readPage("https://blog.example/p", deps(server(reply(500)).transport))).toEqual({ result: "unavailable" });
    expect(await readPage("https://blog.example/p", deps(server(reply(404)).transport))).toEqual({ result: "unavailable" });
    const loop = server(reply(302, { location: "https://blog.example/1" }), reply(302, { location: "https://blog.example/2" }), reply(302, { location: "https://blog.example/3" }));
    expect(await readPage("https://blog.example/p", deps(loop.transport))).toEqual({ result: "unavailable" });
    vi.useFakeTimers();
    const pending = readPage("https://blog.example/p", deps(() => new Promise(() => undefined)));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ result: "timeout" });
  });

  it("does not put the link, its query or any token in the result or in the log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const got = await readPage("https://blog.example/p?token=SECRET123", deps(server(reply(500)).transport));
    expect(JSON.stringify(got)).not.toMatch(/SECRET|token|blog/);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/SECRET|token=/);
  });
});
