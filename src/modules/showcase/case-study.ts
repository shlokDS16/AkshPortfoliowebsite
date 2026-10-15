import { istDate, istTime } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { isRecord } from "@/lib/records";
import {
  CASE_CLOSE_REASON_LABEL, CASE_PROCESS_LABEL, expectationSentence, horizonPhrase, isIsoDate, isLagged, isLedgerCase, mistakeTagsSentence,
  parseCaseRecord, parseProse, PUBLIC_FINGERPRINT_FILE, inlineText, type CaseEvent, type CaseMistakeTag, type CaseProcessCall, type CaseRecordV1,
} from "@/modules/casefile";
import { ordinal } from "./site";
import type { CaseBodyBlock, CaseChartView, CaseEntryView, CaseStudyView, CaseSummary, MistakeEntry, PublicItemRow, PublicSnapshot } from "./types";

// Plan 3b D36/D41/D46: a ledger case study is its body plus its record, read from the item's CURRENT revision only (anon can read
// every revision that ever passed the gate; an older one is never shown). Other keys next to `ledger` are ignored. An item whose
// record does not parse as a whole is not shown at all.

export type LedgerCase = { item: PublicItemRow; record: CaseRecordV1 };

export const caseHref = (slug: string) => `/cases/${slug}`;

const KIND_LABEL: Record<CaseEvent["kind"], string> = { open: "Opening entry", revise: "Change of period", close: "Closing entry", review: "Review" };
const monthYear = (iso: string) => formatDate(iso).split(" ").slice(1).join(" ");
const lastOf = (record: CaseRecordV1, kind: CaseEvent["kind"]) => record.events.findLast((e) => e.kind === kind);

/** A published case needs a close and a lesson; the gate guarantees both, and a record without them is not shown. */
function hasWholeShape(record: CaseRecordV1): boolean {
  return record.events.filter((e) => e.kind === "open").length === 1 && lastOf(record, "close") !== undefined && lastOf(record, "review") !== undefined;
}

/** Public ledger case studies, newest publication first. Defence in depth for rules 3 and 10: the lag is re-checked here. */
export function ledgerCases(s: PublicSnapshot): LedgerCase[] {
  return s.items
    .flatMap((item): LedgerCase[] => {
      if (item.kind !== "case_study" || !isLedgerCase(item.structured) || !isRecord(item.structured)) return [];
      const record = parseCaseRecord(item.structured.ledger);
      if (!record || !hasWholeShape(record) || item.slug === "") return [];
      if (!isIsoDate(item.dataAsOf) || item.dataAsOf !== record.figures_to || !isLagged(record.figures_to, s.today)) return [];
      return [{ item, record }];
    })
    .sort((a, b) => b.item.publishedAt.localeCompare(a.item.publishedAt));
}

export const hasLedgerCases = (s: PublicSnapshot): boolean => ledgerCases(s).length > 0;

function entryView(e: CaseEvent): CaseEntryView {
  const on = istDate(e.at);
  const horizon = e.stance.horizon_days;
  return {
    seq: e.seq, kind: e.kind, kindLabel: KIND_LABEL[e.kind], sealedOn: on, words: e.words, hash: e.hash, prevHash: e.prev_hash, canonical: e.canonical,
    lead: e.kind === "revise" ? (typeof horizon === "number" && Number.isInteger(horizon) && horizon > 0 ? `Changed the period to ${horizonPhrase(horizon)} on ${formatDate(on)}.` : `Revised on ${formatDate(on)}.`) : null,
    writtenLine: `Written on ${formatDate(on)}.`, sealedLabel: `His words, sealed ${formatDate(on)}, ${istTime(e.at)} IST`,
    listedLine: e.listed_on ? `Listed in the public file on ${formatDate(e.listed_on)}.` : null,
    findLine: e.listed_on ? `Find ${formatDate(on)}'s line in the public file; its list of fingerprints includes this one.` : null,
  };
}

const PROCESS_CALLS = Object.keys(CASE_PROCESS_LABEL);
const callLine = (call: CaseProcessCall) => `His call on his own process: ${CASE_PROCESS_LABEL[call]}.`;

/** Each review is read from its own sealed choices; the latest is the record's (the gate builds both from the same entry). */
function reviewLines(record: CaseRecordV1, e: CaseEvent, latest: boolean): { call: string | null; mistakes: string | null } {
  if (latest) return { call: callLine(record.process), mistakes: mistakeTagsSentence(record.tags) };
  const { process, tags } = e.stance;
  const call = typeof process === "string" && PROCESS_CALLS.includes(process) ? callLine(process as CaseProcessCall) : null;
  const named = Array.isArray(tags) && tags.every((t): t is CaseMistakeTag => typeof t === "string") ? mistakeTagsSentence(tags) : null;
  return { call, mistakes: call ? named : null };
}

function chartView(record: CaseRecordV1): CaseChartView | null {
  const points = record.chart?.points ?? [];
  if (points.length < 2) return null;
  const [from, to] = [points[0].d, points[points.length - 1].d];
  return {
    points, company: record.company, from, to,
    alt: `Weekly line chart of ${record.company} and the Nifty 50, both rebased to 100 at the entry close on ${formatDate(from)}, to ${formatDate(to)}. Values are not printed: this site prints no figure for how an idea did.`,
    caption: `Closing prices, NSE. Rebased to 100 on ${formatDate(from)}. Figures to ${formatDate(record.figures_to)}. Price only, dividends not included. A past case, not a view on the share today.`,
  };
}

function bodyBlocks(md: string): CaseBodyBlock[] {
  return parseProse(md).map((b): CaseBodyBlock =>
    b.kind === "p" ? { kind: "p", text: inlineText(b.inline) } : b.kind === "ul" ? { kind: "ul", items: b.items.map(inlineText) } : b,
  );
}

export function buildCaseStudyView(s: PublicSnapshot, slug: string): CaseStudyView | null {
  const found = ledgerCases(s).find((c) => c.item.slug === slug);
  if (!found) return null;
  const { item, record } = found;
  const close = lastOf(record, "close")!;
  const closedOn = istDate(close.at);
  const reviews = record.events.filter((e) => e.kind === "review");
  const { revNo, revCount } = ordinal(s, item);
  return {
    slug: item.slug, company: record.company, symbol: record.symbol, title: item.title, standfirst: item.learningObjective ?? "",
    holdsPosition: item.holdsPosition ?? "not_disclosed", reviewedOn: istDate(item.revisedAt), revNo, revCount,
    dateline: { writtenOn: istDate(record.events[0].at), closedOn, figuresTo: record.figures_to },
    expected: expectationSentence(record.company, record.expects, record.horizon_days),
    opening: entryView(record.events[0]),
    revisions: record.events.filter((e) => e.kind === "revise").map(entryView),
    happened: {
      chart: chartView(record),
      priceLine: `Entry: NSE close of ${formatDate(record.entry_date)}. Exit: NSE close of ${formatDate(record.exit_date)}. ${record.holding_days} days from entry to exit.`,
      closedLine: `Closed on ${formatDate(closedOn)}. His reason: ${CASE_CLOSE_REASON_LABEL[record.close_reason]}.`,
      closing: entryView(close),
    },
    learned: reviews.map((e, i) => ({ ...reviewLines(record, e, i === reviews.length - 1), entry: entryView(e) })),
    lookingBack: bodyBlocks(item.bodyMd),
    checks: record.events.map(entryView),
    publicFile: PUBLIC_FINGERPRINT_FILE,
  };
}

export function listCaseSummaries(s: PublicSnapshot): CaseSummary[] {
  return ledgerCases(s).map(({ item, record }) => ({
    slug: item.slug, href: caseHref(item.slug), company: record.company, title: item.title, standfirst: item.learningObjective ?? "",
    closedMonth: monthYear(istDate(lastOf(record, "close")!.at)),
  }));
}

/** D35: his own review decides (process flawed, or a kind of mistake other than luck or none); never the outcome, never a count. */
export function buildMistakes(s: PublicSnapshot): MistakeEntry[] {
  return ledgerCases(s)
    .filter(({ record }) => record.process === "flawed" || record.tags.some((t) => t !== "luck" && t !== "none"))
    .map(({ item, record }) => ({
      slug: item.slug, href: caseHref(item.slug), company: record.company, title: item.title, closedMonth: monthYear(istDate(lastOf(record, "close")!.at)),
      call: callLine(record.process), mistakes: mistakeTagsSentence(record.tags), entry: entryView(lastOf(record, "review")!),
    }));
}
