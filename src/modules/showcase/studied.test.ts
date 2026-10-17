import { describe, expect, it } from "vitest";
import { buildSeedSnapshot, STUDIED_HASH, withStudied } from "@/test/fakes/showcase-snapshot";
import { derivedProblems } from "./derived-scan";
import { feedEntries } from "./feed";
import { buildFileView } from "./file";
import { jsonLdFor, sitemapEntries } from "./seo";
import { buildStudiedBlock } from "./studied";

const base = buildSeedSnapshot();
const shown = withStudied(base, [{}, { kind: "web", url: "https://blog.example.org/dealers", title: "Dealer finance, explained", siteName: "Example Blog", channelUrl: null, thumbPath: null, thumbSha256: null, note: "Disagrees with me on credit days." }]);

describe("buildStudiedBlock", () => {
  it("is the cards of one file, in the order he chose", () => {
    const cards = buildStudiedBlock(shown, "i1");
    expect(cards.map((c) => c.title)).toEqual(["How a pump maker finances its dealers", "Dealer finance, explained"]);
    expect(cards[0]).toMatchObject({ origin: "YouTube · Dealer Finance Channel", titleLabel: "Title on YouTube", linkLabel: "Watch on YouTube", picture: { src: `/media/studied/${STUDIED_HASH}.jpg`, width: 320, height: 180 } });
    expect(cards[1]).toMatchObject({ origin: "Example Blog", titleLabel: "Title on the page", linkLabel: "Open the page", picture: null });
  });

  it("is empty for a file with none, for another file, and when the snapshot has no studied field at all (a cache older than the feature)", () => {
    expect(buildStudiedBlock(shown, "sc1")).toEqual([]);
    expect(buildStudiedBlock(base, "i1")).toEqual([]);
    expect(buildStudiedBlock({ ...base, studied: undefined }, "i1")).toEqual([]);
  });

  it("a source whose entry did not show its title is a plain card: the host or 'A video on YouTube', no title, no picture", () => {
    const [plain] = buildStudiedBlock(withStudied(base, [{ title: null, siteName: null, channelUrl: null, thumbPath: null, thumbSha256: null }]), "i1");
    expect(plain).toMatchObject({ title: null, titleLabel: null, origin: "A video on YouTube", picture: null });
  });

  it("carries no id of any kind into a card", () => {
    expect(derivedProblems(JSON.stringify(buildStudiedBlock(shown, "i1")))).toEqual([]);
  });
});

describe("the file view with outside sources", () => {
  it("carries the cards and a Studied entry in the rail, between Facts and History", () => {
    const file = buildFileView(shown, "kavpump")!;
    expect(file.studied).toHaveLength(2);
    expect(file.sections.map((s) => s.id)).toEqual(["view", "tests", "facts", "studied", "history"]);
    expect(file.sections.find((s) => s.id === "studied")).toEqual({ id: "studied", label: "Studied", count: 2 });
  });

  it("has no block and no rail entry when the file lists none", () => {
    const file = buildFileView(base, "kavpump")!;
    expect(file.studied).toEqual([]);
    expect(file.sections.map((s) => s.id)).toEqual(["view", "tests", "facts", "history"]);
  });

  it("changes no derived surface: the feed, the sitemap and the structured data are the same with and without outside sources", () => {
    expect(feedEntries(shown)).toEqual(feedEntries(base));
    expect(sitemapEntries(shown, "https://site.test")).toEqual(sitemapEntries(base, "https://site.test"));
    expect(jsonLdFor("file", shown, "kavpump", "https://site.test")).toEqual(jsonLdFor("file", base, "kavpump", "https://site.test"));
    expect(JSON.stringify(jsonLdFor("file", shown, "kavpump", "https://site.test"))).not.toContain("youtube");
  });
});
