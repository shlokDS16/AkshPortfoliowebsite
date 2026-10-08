import type { Basis, DocSourceType } from "@/modules/documents/client";
import type { Flag } from "./proposed-fact";
import type { ActionFailure } from "./upload-flow";

// Browser-safe shapes of the review screen (ruling R21): the components import these from "./client", never review.ts.

export type ProposalStatus = "pending" | "accepted" | "edited" | "rejected" | "filed";

/** One machine-read figure as the review screen shows it: the value shown is Aksh's once he has decided on it. */
export type ProposalView = {
  id: string;
  page: number;
  label: string;
  valueText: string;
  /** "" when the page did not say. */
  unit: string;
  period: string;
  asOf: string;
  prior: string | null;
  priorPeriod: string;
  quote: string;
  topic: string;
  flags: Flag[];
  why: string[];
  status: ProposalStatus;
  reason: "core" | "label_match" | "moved";
  basis: Basis | null;
  /** What the machine read, kept beside whatever Aksh typed. */
  machineText: string;
};

export type ReviewCounts = { pending: number; accepted: number; edited: number; rejected: number; filed: number };

export type ReviewData = {
  document: { id: string; title: string; companyId: string | null; companyName: string | null; filedOn: string | null; sourceUrl: string | null; sourceType: DocSourceType };
  /** Every figure that carries a flag, in page order, whatever has been decided so far ("Check 1 of 2"). */
  flags: ProposalView[];
  /** Every figure not yet filed, flagged or not: the screen regroups them as Aksh resolves flags. */
  rows: ProposalView[];
  /** The figures that can be filed: grouped by topic, standalone repeats of a consolidated line left out. */
  values: { topic: string; rows: ProposalView[] }[];
  hiddenBasis: number;
  /** The basis the list prefers (the document's own): a repeat on the other basis is left out. */
  preferredBasis: Basis;
  target: { itemId: string; title: string } | null;
  pageTexts: Record<number, string>;
  counts: ReviewCounts;
};

/** What Aksh typed to resolve a figure; empty fields keep what the figure already has. */
export type EditFields = { valueText: string; unit?: string; period?: string; asOf?: string; priorValueText?: string; priorPeriod?: string };
export type ResolveInput = { kind: "edit"; fields: EditFields } | { kind: "reject" };
export type ValueDecision = { id: string; keep: boolean; edit?: EditFields };
export type FileUnderInput = { itemId: string; title: string; sourceType: DocSourceType; filedOn: string; sourceUrl: string | null };

export type ResolveResult = { ok: true; view: ProposalView } | ActionFailure;
export type SaveValuesResult = { ok: true; accepted: number; edited: number; rejected: number } | ActionFailure;
export type FileUnderResult = { ok: true; itemId: string; count: number } | ActionFailure;

/** Why a figure is flagged, in the words of spec s6.5. */
export function whyFor(flags: readonly Flag[], p: { valueText: string; page: number }): string[] {
  const text: Record<Flag, string> = {
    value_not_on_page: `The figure ${p.valueText} is not on p. ${p.page}.`,
    quote_not_on_page: `The quoted line is not on p. ${p.page}.`,
    prior_not_on_page: `The prior-year figure is not on p. ${p.page}.`,
    period_unknown: "The column heading did not say which year.",
    unit_unknown: "The page did not say crore or lakh.",
  };
  return flags.map((f) => text[f]);
}
