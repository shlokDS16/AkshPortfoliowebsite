import { describe, expect, it } from "vitest";
import { buildStudiedCards, studiedByItem, type PublicStudiedRow } from "./public";

const SHA = "e".repeat(64);
const row = (over: Partial<PublicStudiedRow> = {}): PublicStudiedRow => ({
  itemId: "item-1", position: 1, kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ", savedOn: "2026-10-03", note: "why it matters",
  title: "A talk on moats", siteName: "Some Channel", channelUrl: "https://www.youtube.com/@some", thumbPath: `yt/${SHA}.jpg`, thumbSha256: SHA, ...over,
});

describe("buildStudiedCards: what a reader sees for each outside source", () => {
  it("shows a YouTube source whose title was chosen: picture from our own route, title, channel, date, his note, a nofollow link", () => {
    const [card] = buildStudiedCards([row()]);
    expect(card).toEqual({
      position: 1, kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ", title: "A talk on moats", titleLabel: "Title on YouTube", origin: "YouTube · Some Channel",
      picture: { src: `/media/studied/${SHA}.jpg`, width: 320, height: 180 }, saved: "Saved 3 Oct 2026", note: "why it matters", linkLabel: "Watch on YouTube",
    });
  });

  it("shows a page's title and site name, with no picture", () => {
    const [card] = buildStudiedCards([row({ kind: "web", url: "https://www.blog.example/p/1", title: "The post", siteName: "The Blog", channelUrl: null, thumbPath: null, thumbSha256: null })]);
    expect(card).toMatchObject({ kind: "web", title: "The post", titleLabel: "Title on the page", origin: "The Blog", picture: null, linkLabel: "Open the page" });
  });

  it("falls back to the host when a page has a title but no site name", () => {
    const [card] = buildStudiedCards([row({ kind: "web", url: "https://www.blog.example/p/1", siteName: null, channelUrl: null, thumbPath: null, thumbSha256: null })]);
    expect(card.origin).toBe("blog.example");
  });

  it("shows only 'YouTube' as the origin when the channel is not known", () => {
    expect(buildStudiedCards([row({ siteName: null, channelUrl: null })])[0].origin).toBe("YouTube");
  });

  it("shows a source whose title was not chosen (or changed) as the plain card: no title, no picture, only the kind or the host", () => {
    const hidden = { title: null, siteName: null, channelUrl: null, thumbPath: null, thumbSha256: null };
    const yt = buildStudiedCards([row(hidden)])[0];
    expect(yt).toMatchObject({ title: null, titleLabel: null, picture: null, origin: "A video on YouTube", linkLabel: "Watch on YouTube", note: "why it matters" });
    const web = buildStudiedCards([row({ ...hidden, kind: "web", url: "https://www.blog.example/p/1" })])[0];
    expect(web).toMatchObject({ title: null, origin: "blog.example", linkLabel: "Open the page" });
  });

  it("never builds a picture address from anything but a 64-character hash", () => {
    for (const thumbSha256 of ["../../x", "A".repeat(64), "abc", `${SHA}/../x`]) {
      expect(buildStudiedCards([row({ thumbSha256 })])[0].picture, thumbSha256).toBeNull();
    }
  });

  it("carries no id of any kind into the card", () => {
    const text = JSON.stringify(buildStudiedCards([row()]));
    expect(text).not.toMatch(/item-1|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("puts the cards in the order he chose, whatever order the rows came in", () => {
    const cards = buildStudiedCards([row({ position: 3, url: "https://a.example/3" }), row({ position: 1, url: "https://a.example/1" }), row({ position: 2, url: "https://a.example/2" })]);
    expect(cards.map((c) => c.position)).toEqual([1, 2, 3]);
  });

  it("keeps his note as typed and shows an empty note as none", () => {
    expect(buildStudiedCards([row({ note: "" })])[0].note).toBe("");
  });

  it("refuses a link that is not https from a card's address, so a crafted row cannot make a script link", () => {
    expect(buildStudiedCards([row({ url: "javascript:alert(1)" })])).toEqual([]);
    expect(buildStudiedCards([row({ url: "http://a.example/x" })])).toEqual([]);
  });
});

describe("studiedByItem", () => {
  it("groups the cards by the file they belong to, each file's cards in order", () => {
    const grouped = studiedByItem([row({ itemId: "a", position: 2, url: "https://a.example/2" }), row({ itemId: "b", position: 1, url: "https://b.example/1" }), row({ itemId: "a", position: 1, url: "https://a.example/1" })]);
    expect([...grouped.keys()].sort()).toEqual(["a", "b"]);
    expect(grouped.get("a")?.map((c) => c.position)).toEqual([1, 2]);
    expect(grouped.get("b")).toHaveLength(1);
  });
});
