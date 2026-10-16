import { describe, expect, it } from "vitest";
import { createLinkFetchDeps } from "./fixture-link";
import { fixtureJpeg } from "./fixture-sources";
import { safeFetch } from "./safe-fetch";

const FIXTURE = createLinkFetchDeps({ LLM_ADAPTER: "fixture" });
const oembed = (id: string) => `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
const json = async (link: string) => JSON.parse(new TextDecoder().decode((await safeFetch(link, FIXTURE)).bytes)) as Record<string, string>;

describe("the YouTube fixture, through the real guard", () => {
  it("answers oEmbed with a title, a channel, its address and a picture address the desk must not follow", async () => {
    const body = await json(oembed("fxClean0001"));
    expect(body).toMatchObject({ title: "Fixture video fxClean0001: how to read a balance sheet", author_name: "Fixture Channel", author_url: "https://www.youtube.com/@fixturechannel" });
    expect(body.thumbnail_url).toBe("https://i.ytimg.com/vi/fxClean0001/hqdefault.jpg");
  });

  it("gives the special ids their titles and statuses", async () => {
    expect((await json(oembed("fxBuyTitle1"))).title).toBe("Five stocks to buy now");
    expect((await json(oembed("fxPriceTtl1"))).title).toContain("Rs 450");
    expect((await safeFetch(oembed("fxMissing01"), { ...FIXTURE, passStatuses: [401, 404] })).status).toBe(404);
    expect((await safeFetch(oembed("fxNoEmbed01"), { ...FIXTURE, passStatuses: [401, 404] })).status).toBe(401);
  });

  it("serves a JPEG picture per id, each with its own bytes", async () => {
    const a = await safeFetch("https://i.ytimg.com/vi/fxClean0001/mqdefault.jpg", FIXTURE);
    const b = await safeFetch("https://i.ytimg.com/vi/fxClean0002/mqdefault.jpg", FIXTURE);
    expect(a.contentType).toBe("image/jpeg");
    expect([...a.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(false);
    expect(Buffer.from(a.bytes).equals(Buffer.from(fixtureJpeg("fxClean0001")))).toBe(true);
  });

  it("serves a 201 KB picture and a 'picture' that is not a JPEG for the two special ids", async () => {
    expect((await safeFetch("https://i.ytimg.com/vi/fxBigThumb1/mqdefault.jpg", FIXTURE)).bytes.byteLength).toBe(201 * 1024);
    const bad = await safeFetch("https://i.ytimg.com/vi/fxBadThumb1/mqdefault.jpg", FIXTURE);
    expect(new TextDecoder().decode(bad.bytes)).toContain("not a picture");
  });
});

describe("the blog fixture", () => {
  it("serves a clean post with og tags, a buy post, a price post and a post without a title", async () => {
    const text = async (name: string) => new TextDecoder().decode((await safeFetch(`https://blog.test/post/${name}`, FIXTURE)).bytes);
    expect(await text("annual")).toContain('property="og:title" content="A reading of the annual report: annual"');
    expect(await text("buy")).toContain("Five stocks to buy now");
    expect(await text("price")).toContain("Rs 450");
    expect(await text("plain")).not.toContain("<title>");
  });

  it("serves a post whose title is followed by more than 1 MB, and a PDF", async () => {
    expect((await safeFetch("https://blog.test/post/long", FIXTURE)).bytes.byteLength).toBeGreaterThan(1_000_000);
    expect((await safeFetch("https://blog.test/doc.pdf", FIXTURE)).contentType).toBe("application/pdf");
  });

  it("every other YouTube or picture address is a 404 (refused by the guard)", async () => {
    await expect(safeFetch("https://www.youtube.com/watch?v=fxClean0001", FIXTURE)).rejects.toMatchObject({ code: "link-failed" });
    await expect(safeFetch("https://i.ytimg.com/vi/fxClean0001/hqdefault.jpg", FIXTURE)).rejects.toMatchObject({ code: "link-failed" });
  });
});
