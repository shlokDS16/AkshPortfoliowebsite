import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRichSnapshot, buildSeedSnapshot } from "@/test/fakes/showcase-snapshot";
import { KAVERI, NOTES, PROCESS_NOTE } from "@/test/fixtures/casefile";
import { derivedProblems } from "./derived-scan";
import { jsonLdFor, pageMetadata, robotsFor, serializeJsonLd, SITE_CARD_ALT, sitemapEntries, type SeoRoute } from "./seo";

const SITE = "https://desk.example";
const rich = buildRichSnapshot();
const seed = buildSeedSnapshot();
const FEED = { "application/rss+xml": "/feed.xml" };
const CASE_SLUG = "lc1-a-closed-idea";

const DETAIL: [SeoRoute, string][] = [
  ["file", "kavpump"], ["note", NOTES[0].slug], ["processNote", PROCESS_NOTE.slug], ["case", CASE_SLUG], ["concept", "receivable-days"],
];
/** Every number in a JSON-LD tree with its key path, except the position of a breadcrumb's ListItem. */
function numbersIn(value: unknown, path: string, parent: { "@type"?: string } | null = null): string[] {
  if (typeof value === "number") return parent?.["@type"] === "ListItem" && path.endsWith(".position") ? [] : [`${path}=${value}`];
  if (Array.isArray(value)) return value.flatMap((v, i) => numbersIn(v, `${path}.${i}`, parent));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => numbersIn(v, `${path}.${k}`, value as { "@type"?: string }));
  return [];
}

const INDEX: SeoRoute[] = ["home", "files", "notes", "process", "cases", "mistakes", "concepts", "about"];

describe("pageMetadata", () => {
  it("a file: his objective byte for byte, the canonical path, an article with the IST dates of its first and current gated revisions", () => {
    const m = pageMetadata("file", rich, "kavpump");
    expect(m.title).toBe("Kaveri Pumps (fictional) · File 01");
    expect(m.description).toBe(KAVERI.learningObjective);
    expect(m.alternates).toEqual({ canonical: "/companies/kavpump", types: FEED });
    expect(m.openGraph).toMatchObject({
      type: "article", url: "/companies/kavpump", siteName: "Aksh Agrawal · Case files", locale: "en_IN", title: "Kaveri Pumps (fictional) · File 01",
      description: KAVERI.learningObjective, publishedTime: "2026-08-05T00:00:00+05:30", modifiedTime: "2026-08-20T00:00:00+05:30", authors: ["Aksh Agrawal"],
    });
    expect(m.twitter).toEqual({ card: "summary_large_image" });
  });

  it("a learning note and a process note: their own titles and objectives, under their own paths", () => {
    const note = pageMetadata("note", rich, NOTES[0].slug);
    expect(note).toMatchObject({ title: NOTES[0].title, description: NOTES[0].learningObjective, alternates: { canonical: `/notes/${NOTES[0].slug}` } });
    expect(note.openGraph).toMatchObject({ type: "article", publishedTime: "2026-08-01T00:00:00+05:30", modifiedTime: "2026-08-01T00:00:00+05:30" });
    const process = pageMetadata("processNote", rich, PROCESS_NOTE.slug);
    expect(process).toMatchObject({ title: PROCESS_NOTE.title, description: PROCESS_NOTE.learningObjective, alternates: { canonical: `/process/${PROCESS_NOTE.slug}` } });
  });

  it("a case: the title and his objective; an article dated from its gated revision", () => {
    const m = pageMetadata("case", rich, CASE_SLUG);
    expect(m.title).toBe("Kaveri Seed Company Limited: a closed idea, Jan 2026 to Jun 2026");
    expect(m.description).toBe("How a margin story can fail while the demand story holds.");
    expect(m.alternates).toEqual({ canonical: `/cases/${CASE_SLUG}`, types: FEED });
    expect(m.openGraph).toMatchObject({ type: "article", publishedTime: "2026-07-20T00:00:00+05:30" });
  });

  it("a concept: its name and the page's standfirst, as a website page", () => {
    const m = pageMetadata("concept", rich, "receivable-days");
    expect(m.title).toBe("Receivable days");
    expect(m.description).toBe("Notes and case files by Aksh Agrawal that use Receivable days, newest first.");
    expect(m.openGraph).toMatchObject({ type: "website", url: "/concepts/receivable-days" });
    expect(m.openGraph).not.toHaveProperty("publishedTime");
  });

  it("every index route has a canonical path, the feed link and a website card, with no snapshot at all", () => {
    const paths: Record<string, string> = { home: "/", files: "/companies", notes: "/notes", process: "/process", cases: "/cases", mistakes: "/mistakes", concepts: "/concepts", about: "/about" };
    for (const route of INDEX) {
      const m = pageMetadata(route, null);
      expect(m.alternates, route).toEqual({ canonical: paths[route], types: FEED });
      expect(m.openGraph, route).toMatchObject({ type: "website", url: paths[route], siteName: "Aksh Agrawal · Case files", locale: "en_IN" });
      expect(m.twitter, route).toEqual({ card: "summary_large_image" });
      expect(typeof m.description, route).toBe("string");
    }
    expect(pageMetadata("home", null).title).toBeUndefined();
    expect(pageMetadata("files", null).title).toBe("Files");
    expect(pageMetadata("about", null).title).toBe("About and disclosures");
  });

  // A page's own `openGraph` replaces its parent's whole, images included, so an index page that says anything about itself would lose the
  // site card that app/opengraph-image.tsx gives it. Found by the Task 4 e2e (no og:image on /, /companies, /about ...). A detail page has its
  // own card in its own segment, which Next adds, so it names none here.
  it("an index route names the site card itself; a detail route leaves its own card to its segment", () => {
    for (const route of INDEX) {
      const images = (pageMetadata(route, null).openGraph as { images?: unknown } | undefined)?.images;
      expect(images, route).toEqual([{ url: "/opengraph-image", width: 1200, height: 630, alt: SITE_CARD_ALT }]);
    }
    for (const [route, slug] of DETAIL) expect(pageMetadata(route, rich, slug).openGraph, route).not.toHaveProperty("images");
  });

  it("the site card's alt text is the one app/opengraph-image.tsx exports", () => {
    const file = readFileSync(new URL("../../app/opengraph-image.tsx", import.meta.url), "utf8");
    expect(file).toContain(`export const alt = ${JSON.stringify(SITE_CARD_ALT)};`);
  });

  it("an unknown slug, or a detail route with no snapshot, gives {} as the pages do today (the page 404s)", () => {
    expect(pageMetadata("file", rich, "nope")).toEqual({});
    expect(pageMetadata("note", rich, PROCESS_NOTE.slug)).toEqual({});
    expect(pageMetadata("case", seed, CASE_SLUG)).toEqual({});
    expect(pageMetadata("concept", seed, "receivable-days")).toEqual({});
    expect(pageMetadata("file", null, "kavpump")).toEqual({});
  });
});

describe("jsonLdFor", () => {
  const types = (nodes: object[]) => nodes.map((n) => (n as { "@type": string })["@type"]);

  it("home: a WebSite with its publisher and a Person", () => {
    const nodes = jsonLdFor("home", rich, undefined, SITE);
    expect(types(nodes)).toEqual(["WebSite", "Person"]);
    expect(nodes[0]).toMatchObject({ name: "Case files · Aksh Agrawal", url: `${SITE}/`, inLanguage: "en-IN", publisher: { "@type": "Person", name: "Aksh Agrawal" } });
    expect(nodes[1]).toMatchObject({ name: "Aksh Agrawal", url: `${SITE}/about` });
  });

  it("a file: an Article about the company's name only, with its dates and version, and a breadcrumb", () => {
    const [article, crumbs] = jsonLdFor("file", rich, "kavpump", SITE) as Record<string, unknown>[];
    expect(article).toMatchObject({
      "@type": "Article", headline: "Kaveri Pumps (fictional) · File 01", description: KAVERI.learningObjective, datePublished: "2026-08-05", dateModified: "2026-08-20",
      author: { "@type": "Person", name: "Aksh Agrawal", url: `${SITE}/about` }, mainEntityOfPage: `${SITE}/companies/kavpump`, isAccessibleForFree: true,
      inLanguage: "en-IN", version: "R2", about: { "@type": "Corporation", name: "Kaveri Pumps (fictional)" },
    });
    expect(crumbs).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Case files", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Files", item: `${SITE}/companies` },
        { "@type": "ListItem", position: 3, name: "Kaveri Pumps (fictional)", item: `${SITE}/companies/kavpump` },
      ],
    });
  });

  it("a note, a process note and a case are Articles with a breadcrumb; only a file has an about", () => {
    for (const [route, slug] of [["note", NOTES[0].slug], ["processNote", PROCESS_NOTE.slug], ["case", CASE_SLUG]] as [SeoRoute, string][]) {
      const nodes = jsonLdFor(route, rich, slug, SITE);
      expect(types(nodes), route).toEqual(["Article", "BreadcrumbList"]);
      expect(nodes[0], route).not.toHaveProperty("about");
    }
  });

  it("an index is a CollectionPage; a concept is a DefinedTerm in the concepts set, with a breadcrumb", () => {
    for (const route of ["files", "notes", "process", "cases", "mistakes", "concepts"] as SeoRoute[]) expect(types(jsonLdFor(route, rich, undefined, SITE)), route).toEqual(["CollectionPage"]);
    const [term, crumbs] = jsonLdFor("concept", rich, "receivable-days", SITE) as Record<string, unknown>[];
    expect(term).toMatchObject({
      "@type": "DefinedTerm", name: "Receivable days", url: `${SITE}/concepts/receivable-days`,
      inDefinedTermSet: { "@type": "DefinedTermSet", url: `${SITE}/concepts` },
    });
    expect((crumbs as { itemListElement: unknown[] }).itemListElement).toHaveLength(3);
  });

  it("an unknown slug, or no snapshot behind a detail page, has no structured data; an index page still does", () => {
    expect(jsonLdFor("file", rich, "nope", SITE)).toEqual([]);
    expect(jsonLdFor("case", null, CASE_SLUG, SITE)).toEqual([]);
    expect(types(jsonLdFor("notes", null, undefined, SITE))).toEqual(["CollectionPage"]);
  });

  it("never rates, prices or offers: no Review, Rating, Offer, FinancialProduct, InvestmentOrDeposit or price anywhere", () => {
    for (const route of INDEX) expect(JSON.stringify(jsonLdFor(route, rich, undefined, SITE)), route).not.toMatch(/Review|Rating|Offer|FinancialProduct|InvestmentOrDeposit|"price"/);
    for (const [route, slug] of DETAIL) expect(JSON.stringify(jsonLdFor(route, rich, slug, SITE)), route).not.toMatch(/Review|Rating|Offer|FinancialProduct|InvestmentOrDeposit|"price"/);
  });

  // Spec s4.3 (as amended 2026-10-16): no numeric property, except the integer position schema.org requires on a breadcrumb's list items.
  it("carries no number anywhere except the position of a breadcrumb's list items", () => {
    const numbers: string[] = [];
    for (const route of INDEX) numbers.push(...numbersIn(jsonLdFor(route, rich, undefined, SITE), route));
    for (const [route, slug] of DETAIL) numbers.push(...numbersIn(jsonLdFor(route, rich, slug, SITE), route));
    expect(numbers).toEqual([]);
  });

  it("the number check bites: a count, a numeric version or a position outside a list item is reported", () => {
    expect(numbersIn({ "@type": "Article", wordCount: 900, version: 2, itemListElement: [{ "@type": "ListItem", position: 1 }, { "@type": "Thing", position: 2 }] }, "x")).toEqual([
      "x.wordCount=900",
      "x.version=2",
      "x.itemListElement.1.position=2",
    ]);
  });
});

describe("serializeJsonLd", () => {
  it("escapes < > & U+2028 and U+2029, so a title cannot close the script element, and parses back to the same value", () => {
    const value = { headline: "</script><script>alert(1)</script> A & B \u2028 \u2029" };
    const out = serializeJsonLd(value);
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(out).toContain("\\u003c/script\\u003e");
    expect(JSON.parse(out)).toEqual(value);
  });
});

describe("sitemapEntries", () => {
  const urls = (s: Parameters<typeof sitemapEntries>[0]) => sitemapEntries(s, SITE).map((e) => e.url);

  it("deploy state (nothing ledger, no concept): the static routes, then every served file and note, each with its current revision's date", () => {
    expect(urls(seed)).toEqual([
      `${SITE}/`, `${SITE}/companies`, `${SITE}/notes`, `${SITE}/process`, `${SITE}/about`,
      `${SITE}/companies/kavpump`, `${SITE}/companies/sahcold`, `${SITE}/notes/${NOTES[0].slug}`, `${SITE}/notes/${NOTES[1].slug}`, `${SITE}/process/${PROCESS_NOTE.slug}`,
    ]);
    expect(urls(seed)).not.toContain(`${SITE}/cases`);
    expect(urls(seed)).not.toContain(`${SITE}/mistakes`);
    expect(urls(seed)).not.toContain(`${SITE}/concepts`);
    expect(sitemapEntries(seed, SITE).find((e) => e.url.endsWith("/companies/kavpump"))?.lastModified).toBe("2026-08-20");
    expect(sitemapEntries(seed, SITE)[0].lastModified).toBeUndefined();
  });

  it("with a published case it adds /cases, /mistakes and the case; with a public concept it adds /concepts and the concept", () => {
    const all = urls(rich);
    expect(all).toEqual(expect.arrayContaining([`${SITE}/cases`, `${SITE}/mistakes`, `${SITE}/cases/${CASE_SLUG}`, `${SITE}/concepts`, `${SITE}/concepts/receivable-days`]));
    expect(sitemapEntries(rich, SITE).find((e) => e.url.endsWith(`/cases/${CASE_SLUG}`))?.lastModified).toBe("2026-07-20");
    expect(new Set(all).size).toBe(all.length);
  });

  it("snapshot unavailable: the static routes only", () => {
    expect(urls(null)).toEqual([`${SITE}/`, `${SITE}/companies`, `${SITE}/notes`, `${SITE}/process`, `${SITE}/about`]);
  });
});

describe("robotsFor", () => {
  it("production: allow the site, keep the private areas out, name the sitemap", () => {
    expect(robotsFor("production", SITE)).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/desk", "/login", "/auth", "/api", "/dev"] },
      sitemap: `${SITE}/sitemap.xml`,
    });
  });

  it("preview, development and unset: disallow everything and name no sitemap", () => {
    for (const env of ["preview", "development", undefined]) expect(robotsFor(env, SITE)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});

describe("rule 11: nothing a builder adds is an id or a figure", () => {
  it("every output built from a snapshot with every public kind passes the scan", () => {
    const outputs: unknown[] = [];
    for (const route of INDEX) outputs.push(pageMetadata(route, rich), jsonLdFor(route, rich, undefined, SITE));
    for (const [route, slug] of DETAIL) outputs.push(pageMetadata(route, rich, slug), jsonLdFor(route, rich, slug, SITE));
    outputs.push(sitemapEntries(rich, SITE), robotsFor("production", SITE));
    expect(outputs.length).toBeGreaterThan(20);
    expect(derivedProblems(JSON.stringify(outputs))).toEqual([]);
  });
});
