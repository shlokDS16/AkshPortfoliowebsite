import { describe, expect, it } from "vitest";
import { buildRichSnapshot, buildSeedSnapshot, LETTER_ENTRIES, withLetter } from "@/test/fakes/showcase-snapshot";
import { derivedProblems } from "./derived-scan";
import { feedEntries, FEED_FIXED_LINE, renderRss } from "./feed";
import { jsonLdFor, letterCard, pageMetadata, serializeJsonLd, sitemapEntries } from "./seo";
import { buildSiteChrome, buildWhatChanged } from "./site";

// Plan 5c (spec s8.9, Task 14): a published letter appears in every derived surface; an unpublished one in none. Built from a snapshot whose own
// text holds no figure and no id, so anything of those in an output was added by a builder.

const SITE = "https://desk.example";
const SLUG = "l1-what-changed-this-fortnight";
const rich = withLetter(buildRichSnapshot());
const plain = buildRichSnapshot();
const types = (nodes: object[]) => nodes.map((n) => (n as { "@type": string })["@type"]);

describe("metadata", () => {
  it("a letter: his subject and sentence, its own path, an article dated by its gated revisions", () => {
    const m = pageMetadata("letter", rich, SLUG);
    expect(m.title).toBe("What changed this fortnight");
    expect(m.description).toBe("Two pages changed and one test moved.");
    expect(m.alternates).toEqual({ canonical: `/letters/${SLUG}`, types: { "application/rss+xml": "/feed.xml" } });
    expect(m.openGraph).toMatchObject({ type: "article", url: `/letters/${SLUG}`, publishedTime: "2026-09-28T00:00:00+05:30", modifiedTime: "2026-09-28T00:00:00+05:30" });
  });

  it("the index needs no snapshot; an unknown or unpublished letter says nothing about itself", () => {
    expect(pageMetadata("letters", null)).toMatchObject({ title: "Letters", alternates: { canonical: "/letters" } });
    expect(pageMetadata("letter", plain, SLUG)).toEqual({});
    expect(pageMetadata("letter", null, SLUG)).toEqual({});
    expect(pageMetadata("letter", rich, "nope")).toEqual({});
  });
});

describe("structured data", () => {
  const nodes = jsonLdFor("letter", rich, SLUG, SITE);

  it("is one Article and a breadcrumb through Letters", () => {
    expect(types(nodes)).toEqual(["Article", "BreadcrumbList"]);
    expect(JSON.stringify(nodes[1])).toContain(`${SITE}/letters`);
    expect(nodes[0]).toMatchObject({ headline: "What changed this fortnight", description: "Two pages changed and one test moved.", datePublished: "2026-09-28", mainEntityOfPage: `${SITE}/letters/${SLUG}` });
  });

  it("the index is a CollectionPage; an unpublished letter has none", () => {
    expect(types(jsonLdFor("letters", rich, undefined, SITE))).toEqual(["CollectionPage"]);
    expect(jsonLdFor("letter", plain, SLUG, SITE)).toEqual([]);
  });

  it("never rates, prices or offers, and carries no number except a breadcrumb position", () => {
    expect(JSON.stringify(nodes)).not.toMatch(/Review|Rating|Offer|"price"/);
    expect(derivedProblems(JSON.stringify(nodes))).toEqual([]);
  });

  it("escapes a hostile subject, so the script element cannot be closed", () => {
    const hostile = withLetter(buildSeedSnapshot(), { title: "</script><script>alert(1)</script>" });
    expect(serializeJsonLd(jsonLdFor("letter", hostile, SLUG, SITE))).not.toMatch(/[<>&]/);
  });
});

describe("the sitemap", () => {
  it("lists /letters and the page with the IST date of its current revision, once a letter is public", () => {
    const entries = sitemapEntries(rich, SITE);
    expect(entries).toContainEqual({ url: `${SITE}/letters` });
    expect(entries).toContainEqual({ url: `${SITE}/letters/${SLUG}`, lastModified: "2026-09-28" });
  });

  it("lists neither before a letter is public, nor when the snapshot is down", () => {
    expect(sitemapEntries(plain, SITE).filter((e) => e.url.includes("/letters"))).toEqual([]);
    expect(sitemapEntries(null, SITE).filter((e) => e.url.includes("/letters"))).toEqual([]);
  });

  it("drops a letter the moment it is unpublished (its item and revisions leave the snapshot)", () => {
    const gone = { ...rich, items: rich.items.filter((i) => i.kind !== "letter"), revisions: rich.revisions.filter((r) => r.itemId !== "l1") };
    expect(sitemapEntries(gone, SITE).filter((e) => e.url.includes("/letters"))).toEqual([]);
  });
});

describe("the card", () => {
  it("is a Letter card: his subject and sentence and the date, no figure", () => {
    const c = letterCard(rich, SLUG)!;
    expect(c).toMatchObject({ tag: "Letter", number: "L", sub: "R1", title: "What changed this fortnight", standfirst: "Two pages changed and one test moved.", footerLeft: "Published 28 Sep 2026", footerRight: "For learning, not advice" });
    expect(derivedProblems(JSON.stringify(c))).toEqual([]);
  });

  it("cuts a long subject on a word boundary and says nothing of an unpublished letter", () => {
    const long = withLetter(buildSeedSnapshot(), { title: "word ".repeat(24).trim() });
    expect(letterCard(long, SLUG)!.title.endsWith("…")).toBe(true);
    expect(letterCard(plain, SLUG)).toBeNull();
  });
});

describe("the feed", () => {
  const entries = feedEntries(rich);

  it("has one entry per gated revision of a public letter, with the page address as guid", () => {
    const entry = entries.find((e) => e.guid === `/letters/${SLUG}#r1`)!;
    expect(entry).toMatchObject({ title: "What changed this fortnight", path: `/letters/${SLUG}`, on: "2026-09-28" });
    expect(entry.description.split("\n\n")).toEqual(["First version.", "Letter · R1", "Two pages changed and one test moved.", FEED_FIXED_LINE]);
  });

  it("is in date order with the other kinds", () => {
    const dates = entries.map((e) => e.on);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(entries).toHaveLength(feedEntries(plain).length + 1);
  });

  it("carries no id, percent, rupee sign or figure", () => {
    const xml = renderRss(entries, SITE);
    expect(derivedProblems(xml.replace(/<atom:link[^>]*>/, ""))).toEqual([]);
  });

  it("drops an unpublished letter, and a letter whose entries are all gone", () => {
    const gone = { ...rich, items: rich.items.filter((i) => i.kind !== "letter") };
    expect(feedEntries(gone).map((e) => e.guid)).toEqual(feedEntries(plain).map((e) => e.guid));
    const hollow = withLetter(buildRichSnapshot(), { structured: { schema: "letter/1", entries: [{ ...LETTER_ENTRIES[0], revisionId: "nowhere" }] } });
    expect(feedEntries(hollow).map((e) => e.guid)).toEqual(feedEntries(plain).map((e) => e.guid));
  });
});

describe("What changed and the chrome", () => {
  it("What changed on the home page does not list a letter (it lists pages, not mail)", () => {
    expect(buildWhatChanged(rich, 20).map((e) => e.subject.label)).not.toContain("What changed this fortnight");
  });

  it("counts public letters only when there are some, so the rail shows the entry only then", () => {
    expect(buildSiteChrome(rich).counts.letters).toBe(1);
    expect(buildSiteChrome(plain).counts).not.toHaveProperty("letters");
  });
});
