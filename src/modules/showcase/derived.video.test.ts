import { describe, expect, it } from "vitest";
import { buildRichSnapshot, buildSeedSnapshot, VIDEO_CHAPTERS, VIDEO_ID, VIDEO_SEGMENTS, withVideo } from "@/test/fakes/showcase-snapshot";
import { derivedProblems } from "./derived-scan";
import { feedEntries, FEED_FIXED_LINE, renderRss } from "./feed";
import { jsonLdFor, pageMetadata, serializeJsonLd, sitemapEntries, videoCard } from "./seo";
import { buildSiteChrome, buildWhatChanged } from "./site";
import { transcriptPlainText } from "@/modules/distribution/public";

// Plan 5b (spec s7.7): a listed video appears in every derived surface; an unlisted one in none, and no machine column of YouTube's
// (channel, description, privacy, fetch problem) is anywhere in them. Built from a snapshot whose own text holds no figure and no id.

const SITE = "https://desk.example";
const SLUG = "v1-reading-the-ageing-table";
const rich = withVideo(buildRichSnapshot());
const plain = buildRichSnapshot();
const types = (nodes: object[]) => nodes.map((n) => (n as { "@type": string })["@type"]);

describe("metadata", () => {
  it("a video: his title and objective, its own path, an article with the IST dates of its gated revisions", () => {
    const m = pageMetadata("video", rich, SLUG);
    expect(m.title).toBe("Reading the ageing table");
    expect(m.description).toBe("How to read who pays late.");
    expect(m.alternates).toEqual({ canonical: `/videos/${SLUG}`, types: { "application/rss+xml": "/feed.xml" } });
    expect(m.openGraph).toMatchObject({ type: "article", url: `/videos/${SLUG}`, publishedTime: "2026-09-25T00:00:00+05:30", modifiedTime: "2026-09-25T00:00:00+05:30" });
  });

  it("the index route needs no snapshot; an unknown or unlisted video says nothing about itself", () => {
    expect(pageMetadata("videos", null)).toMatchObject({ title: "Videos", alternates: { canonical: "/videos" } });
    expect(pageMetadata("video", plain, SLUG)).toEqual({});
    expect(pageMetadata("video", null, SLUG)).toEqual({});
  });
});

describe("structured data", () => {
  const nodes = jsonLdFor("video", rich, SLUG, SITE, { transcript: transcriptPlainText(VIDEO_SEGMENTS) });
  const video = nodes[0] as Record<string, unknown>;

  it("is one VideoObject and a breadcrumb through Videos", () => {
    expect(types(nodes)).toEqual(["VideoObject", "BreadcrumbList"]);
    expect(JSON.stringify(nodes[1])).toContain(`${SITE}/videos`);
  });

  it("names the video as the spec says: his title and objective, the YouTube dates and duration, the thumbnail, the privacy-enhanced embed, the transcript", () => {
    expect(video).toMatchObject({
      "@context": "https://schema.org", name: "Reading the ageing table", description: "How to read who pays late.", inLanguage: "en-IN", isAccessibleForFree: true,
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`, uploadDate: "2026-09-24T08:30:00.000Z", duration: "PT1H2M5S",
      embedUrl: `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`, url: `${SITE}/videos/${SLUG}`, transcript: VIDEO_SEGMENTS.map((g) => g.t).join(" "),
    });
  });

  it("has a Clip per chapter, his title and his second, linking to its place on the page", () => {
    expect(video.hasPart).toEqual(
      VIDEO_CHAPTERS.map((c) => ({ "@type": "Clip", name: c.title, startOffset: c.s, url: `${SITE}/videos/${SLUG}#chapter-${c.s}` })),
    );
  });

  it("leaves the transcript out when none is given, and a video with no chapters has no parts", () => {
    expect(jsonLdFor("video", rich, SLUG, SITE)[0]).not.toHaveProperty("transcript");
    const none = withVideo(buildSeedSnapshot(), { structured: { schema: "video/1", youtubeId: VIDEO_ID, chapters: [] } });
    expect(jsonLdFor("video", none, SLUG, SITE)[0]).not.toHaveProperty("hasPart");
  });

  it("the index is a CollectionPage; an unlisted video has none", () => {
    expect(types(jsonLdFor("videos", rich, undefined, SITE))).toEqual(["CollectionPage"]);
    expect(jsonLdFor("video", plain, SLUG, SITE)).toEqual([]);
  });

  it("never rates, prices or offers, and carries no number except a breadcrumb position and a chapter's second", () => {
    expect(JSON.stringify(nodes)).not.toMatch(/Review|Rating|Offer|FinancialProduct|InvestmentOrDeposit|"price"/);
    const numbers: string[] = [];
    const walk = (value: unknown, path: string, parent: { "@type"?: string } | null) => {
      if (typeof value === "number") {
        const allowed = (parent?.["@type"] === "ListItem" && path.endsWith(".position")) || (parent?.["@type"] === "Clip" && path.endsWith(".startOffset"));
        if (!allowed) numbers.push(`${path}=${value}`);
      } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}.${i}`, parent));
      else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, value as { "@type"?: string });
    };
    walk(nodes, "video", null);
    expect(numbers).toEqual([]);
  });

  it("escapes a hostile title, so the script element cannot be closed", () => {
    const hostile = withVideo(buildSeedSnapshot(), { title: "</script><script>alert(1)</script>" });
    const out = serializeJsonLd(jsonLdFor("video", hostile, SLUG, SITE));
    expect(out).not.toMatch(/[<>&]/);
  });
});

describe("the sitemap", () => {
  const entries = sitemapEntries(rich, SITE);
  it("lists /videos and the page with the IST date of its current revision, once a video is listed", () => {
    expect(entries).toContainEqual({ url: `${SITE}/videos` });
    expect(entries).toContainEqual({ url: `${SITE}/videos/${SLUG}`, lastModified: "2026-09-25" });
  });

  it("lists neither before a video is listed, nor when the snapshot is down", () => {
    expect(sitemapEntries(plain, SITE).map((e) => e.url).filter((u) => u.includes("/videos"))).toEqual([]);
    expect(sitemapEntries(null, SITE).map((e) => e.url).filter((u) => u.includes("/videos"))).toEqual([]);
  });

  it("drops a video the moment it is unlisted: no row for it, no line", () => {
    expect(sitemapEntries({ ...rich, videos: [] }, SITE).map((e) => e.url).filter((u) => u.includes("/videos"))).toEqual([]);
  });
});

describe("the card", () => {
  it("is a Video card: his title and objective, the duration and the revision date, no figure", () => {
    const c = videoCard(rich, SLUG)!;
    expect(c).toMatchObject({ tag: "Video", number: "V", sub: "R1", title: "Reading the ageing table", standfirst: "How to read who pays late.", footerRight: "For learning, not advice" });
    expect(c.footerLeft).toBe("1:02:05 · Revised 25 Sep 2026");
    expect(derivedProblems(JSON.stringify(c))).toEqual([]);
  });

  it("cuts a long title on a word boundary and says nothing of an unlisted video", () => {
    const long = withVideo(buildSeedSnapshot(), { title: "word ".repeat(40).trim() });
    expect(videoCard(long, SLUG)!.title.endsWith("…")).toBe(true);
    expect(videoCard(plain, SLUG)).toBeNull();
  });

  it("a video with no duration has a date-only footer", () => {
    const s = withVideo(buildSeedSnapshot(), {}, { durationSeconds: null });
    expect(videoCard(s, SLUG)!.footerLeft).toBe("Revised 25 Sep 2026");
  });
});

describe("the feed and What changed", () => {
  const entries = feedEntries(rich);

  it("has one entry per gated revision of a listed video, with the page address as guid", () => {
    const entry = entries.find((e) => e.guid === `/videos/${SLUG}#r1`)!;
    expect(entry).toMatchObject({ title: "Reading the ageing table", path: `/videos/${SLUG}`, on: "2026-09-25" });
    expect(entry.description.split("\n\n")).toEqual(["First version.", "Video · R1", "How to read who pays late.", FEED_FIXED_LINE]);
  });

  it("is in date order with the other kinds", () => {
    const dates = entries.map((e) => e.on);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(entries).toHaveLength(feedEntries(plain).length + 1);
  });

  it("carries no id, percent, rupee sign or figure, and none of YouTube's private columns", () => {
    const xml = renderRss(entries, SITE);
    expect(derivedProblems(xml.replace(/<atom:link[^>]*>/, ""))).toEqual([]);
    expect(xml).not.toMatch(/channel_id|privacy|fetch|yt_description|own_channel/i);
  });

  it("drops an unpublished or unlisted video: no entry, even though its revisions are in the snapshot", () => {
    expect(feedEntries({ ...rich, videos: [] }).map((e) => e.guid)).toEqual(feedEntries(plain).map((e) => e.guid));
    expect(feedEntries({ ...rich, items: rich.items.filter((i) => i.kind !== "video") }).map((e) => e.guid)).toEqual(feedEntries(plain).map((e) => e.guid));
  });

  it("What changed lists a video as a video, with its title as the link", () => {
    const top = buildWhatChanged(rich, 10).find((e) => e.kind === "video")!;
    expect(top).toMatchObject({ kind: "video", fileNo: null, subject: { label: "Reading the ageing table", href: `/videos/${SLUG}` }, text: "First version.", detail: "Video · R1" });
  });
});

describe("the site chrome", () => {
  it("counts listed videos only when there are some, so the rail shows the entry only then", () => {
    expect(buildSiteChrome(rich).counts.videos).toBe(1);
    expect(buildSiteChrome(plain).counts).not.toHaveProperty("videos");
  });
});
