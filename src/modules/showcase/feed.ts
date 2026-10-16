import { istDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { buildCaseStudyView, ledgerCases } from "./case-study";
import { describeRevision, revisionsOf, servedFiles } from "./site";
import { SITE_DESCRIPTION } from "./seo";
import type { PublicSnapshot } from "./types";

// Plan 5a (spec s4.5): an RSS 2.0 feed of gated revisions, built only from the public snapshot. His words (change reason, learning
// objective, a note's title) are copied as they are; the machine's are the dates, the revision line and one fixed sentence. Nothing here
// reads the clock: an unchanged snapshot gives the same bytes, so a reader does not see a new feed.

export type FeedEntry = { title: string; path: string; guid: string; on: string; description: string };

export const FEED_FIXED_LINE = "For learning, not advice. Figures on the page are at least 30 days old.";
export const FEED_TITLE = "Case files · Aksh Agrawal";

/**
 * Newest first, at most `limit`: one entry per gated revision of a served file, a learning note, a process note or a ledger case study.
 * A case entry never carries a figure or a verdict (rule 10.7): his reason, "Closed case · written {date}" and his objective.
 */
export function feedEntries(s: PublicSnapshot, limit = 50): FeedEntry[] {
  const served = servedFiles(s);
  const cases = new Map(ledgerCases(s).map((c) => [c.item.id, c.item.slug]));
  const entries: FeedEntry[] = [];
  // Stop as soon as `limit` entries exist, so no sentence diff is computed for an older revision.
  for (const rev of [...s.revisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (entries.length >= limit) break;
    const objective = (id: string) => s.items.find((i) => i.id === id)?.learningObjective ?? "";
    const caseSlug = cases.get(rev.itemId);
    if (caseSlug !== undefined) {
      const view = buildCaseStudyView(s, caseSlug);
      const n = revisionsOf(s, rev.itemId).findIndex((r) => r.id === rev.id) + 1;
      if (!view) continue;
      const path = `/cases/${caseSlug}`;
      entries.push({
        title: `${view.company}: ${view.title}`, path, guid: `${path}#r${n}`, on: istDate(rev.createdAt),
        description: [rev.changeReason ?? (n === 1 ? "First version." : "Revised."), `Closed case · written ${formatDate(view.dateline.writtenOn)}`, objective(rev.itemId), FEED_FIXED_LINE].join("\n\n"),
      });
      continue;
    }
    const d = describeRevision(s, served, rev);
    if (!d) continue;
    const { entry, n, path } = d;
    entries.push({
      title: entry.fileNo ? `${entry.subject.label} · File ${entry.fileNo} · R${n}` : entry.subject.label, path, guid: `${path}#r${n}`, on: entry.on,
      description: [entry.text, entry.detail, objective(rev.itemId), FEED_FIXED_LINE].join("\n\n"),
    });
  }
  return entries;
}

const INVALID = /[\u0000-\u0008\u000b-\u001f￾￿]/g;

/**
 * Text for an XML element: C0 controls other than tab and newline, and U+FFFE and U+FFFF, are dropped (XML 1.0 forbids them and a
 * parser then refuses the whole document); the five markup characters are escaped.
 */
export function escapeXml(text: string): string {
  return text
    .replace(INVALID, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon, 05 Oct 2026 00:00:00 +0530": the IST date at day precision, as the site prints dates. */
function rfc822(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y} 00:00:00 +0530`;
}

export function renderRss(entries: FeedEntry[], siteUrl: string): string {
  const site = siteUrl.replace(/\/+$/, "");
  const item = (e: FeedEntry) =>
    `<item>\n<title>${escapeXml(e.title)}</title>\n<link>${escapeXml(site + e.path)}</link>\n<guid isPermaLink="false">${escapeXml(e.guid)}</guid>\n<pubDate>${rfc822(e.on)}</pubDate>\n<description>${escapeXml(e.description)}</description>\n</item>`;
  const newest = entries.map((e) => e.on).sort().at(-1);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(FEED_TITLE)}</title>`,
    `<link>${escapeXml(`${site}/`)}</link>`,
    `<atom:link href="${escapeXml(`${site}/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    `<description>${escapeXml(SITE_DESCRIPTION)}</description>`,
    "<language>en-IN</language>",
    ...(newest ? [`<lastBuildDate>${rfc822(newest)}</lastBuildDate>`] : []),
    ...entries.map(item),
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
}
