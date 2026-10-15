import type { Metadata, MetadataRoute } from "next";
import { istDate } from "@/lib/dates";
import { formatDate, formatFileNo } from "@/lib/format";
import { buildCaseStudyView, hasLedgerCases, ledgerCases, monthYear } from "./case-study";
import { buildConceptView, listConceptSummaries } from "./concepts";
import { embedUrl, formatClock, isoDuration, thumbnailUrl } from "@/modules/distribution/public";
import { ordinal, revisionsOf, servedFiles } from "./site";
import type { PublicSnapshot, ShareCardContent } from "./types";
import { listedVideos, type ListedVideo, videoHref } from "./video-list";

// Plan 5a (spec s4, publishing rule 11): metadata, structured data, the sitemap and robots, as pure functions of the public snapshot.
// Text comes only from fields the gate lints (title, learning objective, company and concept names) and fixed copy; a date is a
// gated revision's IST date; a path uses a slug. No id of the database, no figure of a case, no rating, price or offer.

export type SeoRoute = "home" | "files" | "file" | "notes" | "note" | "process" | "processNote" | "cases" | "case" | "mistakes" | "concepts" | "concept" | "videos" | "video" | "about";

export const SITE_NAME = "Aksh Agrawal · Case files";
export const SITE_DESCRIPTION = "Each file says what Aksh expected, what would prove him wrong, and every revision since. For learning, not advice.";
export const CONCEPTS_STANDFIRST = "The ideas Aksh uses to read a business, each with the notes and files where it comes up.";
/** The site card (app/opengraph-image.tsx): its path and alt text, for the index pages that must name it themselves (see `card`). */
const SITE_CARD_PATH = "/opengraph-image";
export const SITE_CARD_ALT = "Aksh Agrawal · Case files: what Aksh expected, what would prove him wrong, and every revision since.";
const AUTHOR = "Aksh Agrawal";
const FEED_TYPES = { "application/rss+xml": "/feed.xml" };

/** What an index route says about itself. `title` is absent on the home page, which keeps the layout's default. */
const INDEX: Record<"home" | "files" | "notes" | "process" | "cases" | "mistakes" | "concepts" | "videos" | "about", { path: string; title?: string; description: string }> = {
  home: { path: "/", description: SITE_DESCRIPTION },
  files: { path: "/companies", title: "Files", description: "Every public case file: version, last revision, tests and the date its figures run to." },
  notes: { path: "/notes", title: "Learning notes", description: "Notes on how to read businesses, each listing the files that use it." },
  process: { path: "/process", title: "Process", description: "How the desk works: how a file is kept, tested and revised." },
  cases: { path: "/cases", title: "Closed cases", description: "Ideas Aksh has closed and written up: what he expected, what happened and what he learned." },
  mistakes: { path: "/mistakes", title: "Mistakes", description: "Cases in which Aksh judged his own process flawed, or named a kind of mistake." },
  concepts: { path: "/concepts", title: "Concepts", description: CONCEPTS_STANDFIRST },
  videos: { path: "/videos", title: "Videos", description: "Videos by Aksh Agrawal, each with its chapters and a transcript of what is said. For learning, not advice." },
  about: { path: "/about", title: "About and disclosures", description: "Who writes the case files, how a page gets published, and the standard disclosure." },
};
/** The section a detail page sits in, for its breadcrumb. */
const SECTION = { file: "files", note: "notes", processNote: "process", case: "cases", concept: "concepts", video: "videos" } as const;

type Detail = {
  route: keyof typeof SECTION; path: string; title: string; description: string; kind: "article" | "website";
  published?: string; modified?: string; revNo?: number; company?: string; crumb: string;
};

/** Day precision, as the site prints dates: midnight at the +05:30 offset of the IST date. */
const stamp = (isoDate: string) => `${isoDate}T00:00:00+05:30`;
const url = (siteUrl: string, path: string) => `${siteUrl.replace(/\/+$/, "")}${path}`;

function dates(s: PublicSnapshot, item: { id: string; publishedAt: string; revisedAt: string }) {
  return { published: istDate(revisionsOf(s, item.id)[0]?.createdAt ?? item.publishedAt), modified: istDate(item.revisedAt) };
}

/** What a detail route is, from the snapshot alone; null for an unknown slug (the page 404s). */
function detailOf(route: keyof typeof SECTION, s: PublicSnapshot, slug: string): Detail | null {
  if (route === "file") {
    const found = servedFiles(s).find((f) => f.company.slug === slug);
    if (!found) return null;
    const { item, company } = found;
    return {
      route, path: `/companies/${company.slug}`, title: `${company.name} · File ${formatFileNo(item.fileNo)}`, description: item.learningObjective ?? "", kind: "article",
      ...dates(s, item), revNo: ordinal(s, item).revNo, company: company.name, crumb: company.name,
    };
  }
  if (route === "note" || route === "processNote") {
    const kind = route === "note" ? "learning" : "process";
    const item = s.items.find((i) => i.kind === kind && i.slug === slug);
    if (!item) return null;
    return { route, path: `${route === "note" ? "/notes" : "/process"}/${item.slug}`, title: item.title, description: item.learningObjective ?? "", kind: "article", ...dates(s, item), revNo: ordinal(s, item).revNo, crumb: item.title };
  }
  if (route === "case") {
    const found = ledgerCases(s).find((c) => c.item.slug === slug);
    if (!found) return null;
    const { item } = found;
    return { route, path: `/cases/${item.slug}`, title: item.title, description: item.learningObjective ?? "", kind: "article", ...dates(s, item), revNo: ordinal(s, item).revNo, crumb: item.title };
  }
  if (route === "video") {
    const found = listedVideos(s).find((v) => v.item.slug === slug);
    if (!found) return null;
    const { item } = found;
    return { route, path: videoHref(item.slug), title: item.title, description: item.learningObjective ?? "", kind: "article", ...dates(s, item), revNo: ordinal(s, item).revNo, crumb: item.title };
  }
  const view = buildConceptView(s, slug);
  return view ? { route, path: `/concepts/${view.slug}`, title: view.name, description: view.standfirst, kind: "website", crumb: view.name } : null;
}

function card(path: string, title: string | undefined, description: string, d?: Detail): Metadata {
  const base = { url: path, siteName: SITE_NAME, locale: "en_IN", title: title ?? "Case files", description };
  // A page's `openGraph` replaces its parent's whole, images included. A detail page has a card of its own in its own segment, which Next
  // adds; an index page has none, so it names the site card (the one the root segment gives every page that says nothing about itself).
  const openGraph: Metadata["openGraph"] = !d
    ? { ...base, type: "website", images: [{ url: SITE_CARD_PATH, width: 1200, height: 630, alt: SITE_CARD_ALT }] }
    : d.kind === "article"
      ? { ...base, type: "article", publishedTime: stamp(d.published!), modifiedTime: stamp(d.modified!), authors: [AUTHOR] }
      : { ...base, type: "website" };
  // A page's `alternates` replaces the layout's, so the feed link is repeated here.
  return { ...(title ? { title } : {}), description, alternates: { canonical: path, types: FEED_TYPES }, openGraph, twitter: { card: "summary_large_image" } };
}

/**
 * The Metadata of a public route. An index route needs no snapshot; a detail route with an unknown slug, or with the snapshot down,
 * gives {} (the page 404s, or shows its Unavailable state, and says nothing about itself).
 */
export function pageMetadata(route: SeoRoute, s: PublicSnapshot | null, slug?: string): Metadata {
  if (route in INDEX) {
    const i = INDEX[route as keyof typeof INDEX];
    return card(i.path, i.title, i.description);
  }
  const d = s && slug !== undefined ? detailOf(route as keyof typeof SECTION, s, slug) : null;
  return d ? card(d.path, d.title, d.description, d) : {};
}

const person = (siteUrl: string) => ({ "@type": "Person", name: AUTHOR, url: url(siteUrl, "/about") });
const node = <T extends object>(n: T) => ({ "@context": "https://schema.org", ...n });

/** One script per page: the nodes of a route, from `pageMetadata`'s own facts. An unknown slug has none. */
export function jsonLdFor(route: SeoRoute, s: PublicSnapshot | null, slug: string | undefined, siteUrl: string, extra?: { transcript?: string }): object[] {
  if (route === "home") {
    return [
      node({ "@type": "WebSite", name: "Case files · Aksh Agrawal", url: url(siteUrl, "/"), description: SITE_DESCRIPTION, inLanguage: "en-IN", publisher: { "@type": "Person", name: AUTHOR } }),
      node(person(siteUrl)),
    ];
  }
  if (route in INDEX) {
    const i = INDEX[route as keyof typeof INDEX];
    return [node({ "@type": route === "about" ? "AboutPage" : "CollectionPage", name: i.title, description: i.description, url: url(siteUrl, i.path), inLanguage: "en-IN", isPartOf: { "@type": "WebSite", url: url(siteUrl, "/") } })];
  }
  const d = s && slug !== undefined ? detailOf(route as keyof typeof SECTION, s, slug) : null;
  if (!d) return [];
  const section = INDEX[SECTION[d.route]];
  const crumbs = node({
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Case files", item: url(siteUrl, "/") },
      { "@type": "ListItem", position: 2, name: section.title, item: url(siteUrl, section.path) },
      { "@type": "ListItem", position: 3, name: d.crumb, item: url(siteUrl, d.path) },
    ],
  });
  if (d.kind === "website") {
    return [
      node({ "@type": "DefinedTerm", name: d.title, description: d.description, url: url(siteUrl, d.path), inDefinedTermSet: { "@type": "DefinedTermSet", url: url(siteUrl, "/concepts") } }),
      crumbs,
    ];
  }
  if (d.route === "video") {
    const video = listedVideos(s as PublicSnapshot).find((v) => v.item.slug === slug);
    return video ? [videoNode(d, video, siteUrl, extra?.transcript), crumbs] : [];
  }
  return [
    node({
      "@type": "Article", headline: d.title, description: d.description, datePublished: d.published, dateModified: d.modified, author: person(siteUrl),
      mainEntityOfPage: url(siteUrl, d.path), isAccessibleForFree: true, inLanguage: "en-IN", version: `R${d.revNo}`,
      ...(d.company ? { about: { "@type": "Corporation", name: d.company } } : {}),
    }),
    crumbs,
  ];
}

/**
 * Spec s7.7. His title and objective; the machine's id, dates, duration and (when the page has read it) the transcript, copied as stored.
 * The only numbers are the second each chapter starts (spec amendment 2026-10-16 (m)): they are his chapter list, not a figure.
 */
function videoNode(d: Detail, video: ListedVideo, siteUrl: string, transcript: string | undefined): object {
  const { row, chapters } = video;
  const page = url(siteUrl, d.path);
  return node({
    "@type": "VideoObject", name: d.title, description: d.description, url: page, inLanguage: "en-IN", isAccessibleForFree: true, author: person(siteUrl),
    thumbnailUrl: thumbnailUrl(row.youtubeId), embedUrl: embedUrl(row.youtubeId),
    uploadDate: row.publishedAt ? new Date(row.publishedAt).toISOString() : stamp(d.published!),
    datePublished: d.published, dateModified: d.modified,
    ...(row.durationSeconds ? { duration: isoDuration(row.durationSeconds) } : {}),
    ...(transcript ? { transcript } : {}),
    ...(chapters.length > 0 ? { hasPart: chapters.map((c) => ({ "@type": "Clip", name: c.title, startOffset: c.s, url: `${page}#chapter-${c.s}` })) } : {}),
  });
}

/** His titles are user text inside a script element: `<`, `>` and `&` cannot close it, and U+2028 and U+2029 cannot end a line. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Spec s4.6. The static routes always; /cases and /mistakes once a case is public and /concepts once a public concept is used (the pages
 * 404 otherwise); then every served page with its current revision's IST date. No snapshot: the static routes only.
 */
export function sitemapEntries(s: PublicSnapshot | null, siteUrl: string): MetadataRoute.Sitemap {
  const stat = (...routes: (keyof typeof INDEX)[]) => routes.map((r) => ({ url: url(siteUrl, INDEX[r].path) }));
  if (!s) return stat("home", "files", "notes", "process", "about");
  const concepts = listConceptSummaries(s);
  const videos = listedVideos(s);
  const page = (path: string, modified: string) => ({ url: url(siteUrl, path), lastModified: modified });
  return [
    ...stat("home", "files", "notes", "process", "about"),
    ...(hasLedgerCases(s) ? stat("cases", "mistakes") : []),
    ...(concepts.length > 0 ? stat("concepts") : []),
    ...(videos.length > 0 ? stat("videos") : []),
    ...servedFiles(s).map(({ item, company }) => page(`/companies/${company.slug}`, istDate(item.revisedAt))),
    ...s.items.flatMap((i) => (i.kind === "learning" ? [page(`/notes/${i.slug}`, istDate(i.revisedAt))] : i.kind === "process" ? [page(`/process/${i.slug}`, istDate(i.revisedAt))] : [])),
    ...ledgerCases(s).map(({ item }) => page(`/cases/${item.slug}`, istDate(item.revisedAt))),
    ...videos.map(({ item }) => page(videoHref(item.slug), istDate(item.revisedAt))),
    ...concepts.flatMap((c) => {
      const view = buildConceptView(s, c.slug);
      const newest = view ? [...view.notes, ...view.applied].map((i) => i.since).sort().at(-1) : undefined;
      return newest ? [page(`/concepts/${c.slug}`, newest)] : [];
    }),
  ];
}

/** Spec s4.6: only production is crawled; a preview URL is never indexed, whatever Vercel's own header says. */
export function robotsFor(vercelEnv: string | undefined, siteUrl: string): MetadataRoute.Robots {
  if (vercelEnv !== "production") return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/desk", "/login", "/auth", "/api", "/dev"] }, sitemap: url(siteUrl, "/sitemap.xml") };
}

// ---- Share cards (spec s4.4). Each is a pure function of the snapshot; null means the page 404s. ----

const CARD_FOOTER = "For learning, not advice";
export const TITLE_BUDGET = 72;
export const OBJECTIVE_BUDGET = 120;

/**
 * At most `max` characters (code points): text over the budget is cut on a word boundary and ends with "…", so a card slot never
 * overflows and his words are never re-worded. A single word longer than the budget is cut by characters.
 */
export function cutWords(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const room = chars.slice(0, max - 1);
  const space = room.lastIndexOf(" ");
  const end = chars[room.length] === " " || space <= 0 ? room.length : space;
  return `${room.slice(0, end).join("").replace(/[\s,;:]+$/, "")}…`;
}

function noteCardOf(s: PublicSnapshot, kind: "learning" | "process", slug: string): ShareCardContent | null {
  const item = s.items.find((i) => i.kind === kind && i.slug === slug);
  if (!item) return null;
  return {
    tag: kind === "learning" ? "Learning note" : "Process note", number: kind === "learning" ? "N" : "P", sub: `R${ordinal(s, item).revNo}`,
    title: cutWords(item.title, TITLE_BUDGET), standfirst: cutWords(item.learningObjective ?? "", OBJECTIVE_BUDGET),
    footerLeft: `Revised ${formatDate(istDate(item.revisedAt))}`, footerRight: CARD_FOOTER,
  };
}

export const noteCard = (s: PublicSnapshot, slug: string) => noteCardOf(s, "learning", slug);
export const processCard = (s: PublicSnapshot, slug: string) => noteCardOf(s, "process", slug);

/** A closed case: no figure, no verdict and no chart (rule 10.7); the fixed sub-line is the wording rule 10 already approved. */
export function caseCard(s: PublicSnapshot, slug: string): ShareCardContent | null {
  const view = buildCaseStudyView(s, slug);
  if (!view) return null;
  return {
    tag: "Closed case", number: "C", sub: `R${view.revNo}`, kicker: cutWords(view.company, 40), title: cutWords(view.title, TITLE_BUDGET),
    standfirst: cutWords(view.standfirst, OBJECTIVE_BUDGET), aside: "A past case, not a view on the share today.",
    footerLeft: `Written ${formatDate(view.dateline.writtenOn)} · closed ${monthYear(view.dateline.closedOn)}`, footerRight: CARD_FOOTER,
  };
}

export function conceptCard(s: PublicSnapshot, slug: string): ShareCardContent | null {
  const view = buildConceptView(s, slug);
  const summary = listConceptSummaries(s).find((c) => c.slug === slug);
  if (!view || !summary) return null;
  return { tag: "Concept", number: "Aa", sub: "", title: cutWords(view.name, TITLE_BUDGET), standfirst: cutWords(view.standfirst, OBJECTIVE_BUDGET), footerLeft: summary.countLine, footerRight: CARD_FOOTER };
}

/** Spec s7.7: tag "Video", his title and objective, the length and the revision date. No figure, and no id of YouTube's on the card. */
export function videoCard(s: PublicSnapshot, slug: string): ShareCardContent | null {
  const found = listedVideos(s).find((v) => v.item.slug === slug);
  if (!found) return null;
  const { item, row } = found;
  const revised = `Revised ${formatDate(istDate(item.revisedAt))}`;
  return {
    tag: "Video", number: "V", sub: `R${ordinal(s, item).revNo}`, title: cutWords(item.title, TITLE_BUDGET), standfirst: cutWords(item.learningObjective ?? "", OBJECTIVE_BUDGET),
    footerLeft: row.durationSeconds ? `${formatClock(row.durationSeconds)} \u00b7 ${revised}` : revised, footerRight: CARD_FOOTER,
  };
}
