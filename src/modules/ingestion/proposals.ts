import { onPage, parsePrinted, type Basis, type PageKind } from "@/modules/documents/client";
import type { Extraction } from "./prompts";
import { periodFromHeader, unitFromHeader } from "./periods";
import { classifyRow, normaliseLabel, type RowClass } from "./relevance";
import { machineFactSchema, type Flag, type MachineFact } from "./proposed-fact";

// Turns one page's extraction into proposals (spec s6.4): the period and unit from the printed headings in code (E3),
// every value and quote checked against the stored page text (ADR-004 s4.6), then the relevance filter. Pure.

export type NewProposal = { dedupeKey: string; machineValue: MachineFact; flags: Flag[]; reason: RowClass["reason"]; movedPct: number | null };

const LABEL_MAX = 80;
const QUOTE_MAX = 600;
/** A page proposes every core and tracked line, but only this many lines that merely moved (spec s6.4). */
export const MOVED_PER_PAGE = 3;

type Input = {
  extraction: Extraction;
  pageNo: number;
  pageText: string;
  pageKind: PageKind;
  /** The selector's verdict for this page, used when the page itself does not say consolidated or standalone. */
  pageBasis: Basis | null;
  docBasis: Basis;
  fileLabels: Set<string>;
};

export function buildProposals(i: Input): NewProposal[] {
  const { extraction: ex, pageNo, pageText } = i;
  const current = periodFromHeader(ex.current_header);
  const prior = periodFromHeader(ex.prior_header);
  const unit = unitFromHeader(ex.unit_header);
  const basis: Basis = ex.basis !== "unknown" ? ex.basis : (i.pageBasis ?? i.docBasis);

  const seen = new Set<string>();
  const built: NewProposal[] = [];
  for (const row of ex.rows) {
    const value = parsePrinted(row.current_text);
    if (value === null) continue;
    const priorText = row.prior_text?.trim() ? row.prior_text : null;
    const priorValue = priorText === null ? null : parsePrinted(priorText);
    const label = row.label.trim().slice(0, LABEL_MAX).trim();
    const klass = classifyRow({ label, current: value, prior: priorValue }, i.pageKind, i.fileLabels);
    if (!klass) continue;

    const flags: Flag[] = [];
    if (!onPage(row.current_text, pageText)) flags.push("value_not_on_page");
    if (!onPage(row.line, pageText)) flags.push("quote_not_on_page");
    if (priorText !== null && priorValue !== null && !onPage(priorText, pageText)) flags.push("prior_not_on_page");
    if (!current || (priorValue !== null && !prior)) flags.push("period_unknown");
    if (!unit) flags.push("unit_unknown");

    const fact: MachineFact = {
      label,
      value,
      valueText: row.current_text.trim(),
      unit,
      period: current?.period ?? null,
      asOf: current?.asOf ?? null,
      prior: priorValue !== null && priorText !== null ? { label: prior?.period ?? null, value: priorValue, valueText: priorText.trim() } : null,
      page: pageNo,
      locator: `p. ${pageNo}`,
      quote: row.line.trim().slice(0, QUOTE_MAX),
      basis,
      topic: klass.topic,
      statement: i.pageKind,
    };
    if (!machineFactSchema.safeParse(fact).success) continue;

    // An unknown period adds the page, so two periods' rows are never silently dropped by the unique key (ruling R22).
    const dedupeKey = `${normaliseLabel(label)}|${current?.period ?? `?p${pageNo}`}|${basis}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    built.push({ dedupeKey, machineValue: fact, flags, reason: klass.reason, movedPct: klass.movedPct });
  }

  const keep = new Set(
    built
      .filter((p) => p.reason === "moved")
      .sort((a, b) => Math.abs(b.movedPct ?? 0) - Math.abs(a.movedPct ?? 0))
      .slice(0, MOVED_PER_PAGE),
  );
  return built.filter((p) => p.reason !== "moved" || keep.has(p));
}
