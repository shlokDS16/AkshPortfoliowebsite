import { describe, expect, it } from "vitest";
import { buildSeedSnapshot, withLetter, withVideo } from "@/test/fakes/showcase-snapshot";
import { feedEntries } from "./feed";
import { hasLetters } from "./letters";
import { withoutKinds } from "./hide-kinds";
import { sitemapEntries } from "./seo";
import { buildSiteChrome } from "./site";
import { hasVideos } from "./videos";

// Phase 5d (spec s8): while a feature is off the snapshot carries none of its items, so feed, sitemap, cards, counts, the rail and every
// page built from it omit them without each builder knowing.
const SITE = "https://desk.example.test";
const plain = buildSeedSnapshot();
const both = withLetter(withVideo(plain));
const linked = { ...both, conceptLinks: [...both.conceptLinks, { itemId: "v1", revisionId: "v1-rev", conceptId: "c-any", position: 1 }, { itemId: "l1", revisionId: "l1-rev", conceptId: "c-any", position: 1 }] };

describe("withoutKinds", () => {
  it("is the same snapshot when nothing is hidden", () => {
    expect(withoutKinds(linked, [])).toBe(linked);
  });

  it("drops the items, revisions, video rows and concept links of a hidden kind, and nothing else", () => {
    const out = withoutKinds(linked, ["video", "letter"]);
    expect(out.items).toEqual(plain.items);
    expect(out.revisions).toEqual(plain.revisions);
    expect(out.videos).toEqual([]);
    expect(out.conceptLinks).toEqual(plain.conceptLinks);
    expect(out.companies).toBe(linked.companies);
    expect(out.captureDays).toBe(linked.captureDays);
  });

  it("hides one kind and keeps the other", () => {
    const noLetters = withoutKinds(linked, ["letter"]);
    expect(hasVideos(noLetters)).toBe(true);
    expect(hasLetters(noLetters)).toBe(false);
    const noVideos = withoutKinds(linked, ["video"]);
    expect(hasVideos(noVideos)).toBe(false);
    expect(hasLetters(noVideos)).toBe(true);
  });

  it("leaves the feed, the sitemap and the rail counts as if none had ever been public", () => {
    const out = withoutKinds(linked, ["video", "letter"]);
    expect(feedEntries(out)).toEqual(feedEntries(plain));
    expect(sitemapEntries(out, SITE)).toEqual(sitemapEntries(plain, SITE));
    expect(buildSiteChrome(out).counts).toEqual(buildSiteChrome(plain).counts);
    expect(buildSiteChrome(out).counts).not.toHaveProperty("videos");
    expect(buildSiteChrome(out).counts).not.toHaveProperty("letters");
  });

  it("is a control: with both on, the same builders do list them", () => {
    expect(buildSiteChrome(linked).counts).toMatchObject({ videos: 1, letters: 1 });
    expect(JSON.stringify(sitemapEntries(linked, SITE))).toContain("/letters");
    expect(JSON.stringify(sitemapEntries(linked, SITE))).toContain("/videos");
    expect(feedEntries(linked).some((e) => e.path.startsWith("/letters/"))).toBe(true);
  });
});
