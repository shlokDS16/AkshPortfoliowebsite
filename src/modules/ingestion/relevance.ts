import { normaliseText, type PageKind } from "@/modules/documents/client";

// Which printed lines are worth proposing (spec s6.4): the core lines of the statements, any line the case file
// already tracks, and the few non-core lines that moved by a fifth or more. Pure.

export type Topic = "P&L" | "Balance sheet" | "Cash flow" | "Working capital" | "Segments" | "Other figures";

export const CORE_LINES: { key: string; topic: Topic; match: RegExp }[] = [
  { key: "revenue", topic: "P&L", match: /^revenue from operations$/ },
  { key: "total-income", topic: "P&L", match: /^total income$/ },
  { key: "finance-costs", topic: "P&L", match: /^finance costs?$/ },
  { key: "depreciation", topic: "P&L", match: /^depreciation(?: and| &) amorti[sz]ation(?: expenses?)?$/ },
  { key: "pbt", topic: "P&L", match: /^profit before (?:exceptional items and )?tax$/ },
  { key: "pat", topic: "P&L", match: /^(?:net )?profit (?:for the (?:year|period)|after tax)$/ },
  { key: "cfo", topic: "Cash flow", match: /^net cash (?:generated )?(?:from|used in) operating activities$/ },
  { key: "capex", topic: "Cash flow", match: /^(?:purchase|acquisition) of property,? plant and equipment/ },
  { key: "borrowings", topic: "Balance sheet", match: /^(?:total )?borrowings$/ },
  { key: "cash", topic: "Balance sheet", match: /^cash and cash equivalents$/ },
  { key: "equity", topic: "Balance sheet", match: /^total equity$/ },
  { key: "receivables", topic: "Working capital", match: /^trade receivables$/ },
  { key: "inventories", topic: "Working capital", match: /^inventories$/ },
  { key: "payables", topic: "Working capital", match: /^(?:total )?trade payables$/ },
  { key: "segment-revenue", topic: "Segments", match: /^(?:total )?segment revenue$/ },
];

const TOPIC_BY_KIND: Record<PageKind, Topic> = {
  pl: "P&L", bs: "Balance sheet", cf: "Cash flow", segment: "Segments", notes: "Other figures", mdna: "Other figures", other: "Other figures",
};

/** Row cap and threshold for lines that matched nothing but moved (spec s6.4). */
export const MOVED_THRESHOLD_PCT = 20;

/** Lower-case, without numbering such as "(a)" or "ii.", punctuation or double spaces: how labels are compared. */
export const normaliseLabel = (label: string): string =>
  normaliseText(label).replace(/^\(?(?:[a-z]|[ivx]{1,4}|\d{1,2})[).]\s+/, "").replace(/[^a-z0-9&,' -]/g, "").replace(/\s+/g, " ").trim();

export const topicFor = (kind: PageKind): Topic => TOPIC_BY_KIND[kind];

export type RowClass = { reason: "core" | "label_match" | "moved"; topic: Topic; movedPct: number | null };

export function classifyRow(row: { label: string; current: number; prior: number | null }, kind: PageKind, fileLabels: Set<string>): RowClass | null {
  const label = normaliseLabel(row.label);
  const core = CORE_LINES.find((c) => c.match.test(label));
  if (core) return { reason: "core", topic: core.topic, movedPct: null };
  if (fileLabels.has(label)) return { reason: "label_match", topic: TOPIC_BY_KIND[kind], movedPct: null };
  if (row.prior !== null && row.prior !== 0) {
    const pct = ((row.current - row.prior) / Math.abs(row.prior)) * 100;
    if (Math.abs(pct) >= MOVED_THRESHOLD_PCT) return { reason: "moved", topic: TOPIC_BY_KIND[kind], movedPct: Math.round(pct * 10) / 10 };
  }
  return null;
}
