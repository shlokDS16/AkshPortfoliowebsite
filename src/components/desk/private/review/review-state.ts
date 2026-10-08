import type { ProposalView, ValueDecision } from "@/modules/ingestion/client";

// What the values list means for the document, worked out in the browser from the rows and Aksh's ticks and typing.
// The server decides again when he files (decide.ts); this is only what the screen says before then.

export type Ticks = Record<string, boolean>;
export type Typed = Record<string, string>;

/** Ticked unless Aksh unticked it, or he dropped it earlier in a past visit. */
export const isTicked = (row: ProposalView, ticks: Ticks): boolean => ticks[row.id] ?? row.status !== "rejected";

export function decisionsOf(shown: ProposalView[], ticks: Ticks, typed: Typed): ValueDecision[] {
  return shown.map((row) => ({ id: row.id, keep: isTicked(row, ticks), ...(typed[row.id] ? { edit: { valueText: typed[row.id] } } : {}) }));
}

export type Summary = { accepted: number; edited: number; rejected: number };

/** Counts under the words the review page uses for a decision: a flag Aksh dropped counts as rejected. */
export function summaryOf(rows: ProposalView[], shown: ProposalView[], ticks: Ticks, typed: Typed): Summary {
  const out: Summary = { accepted: 0, edited: 0, rejected: 0 };
  for (const row of shown) {
    if (!isTicked(row, ticks)) out.rejected += 1;
    else if (row.status === "edited" || typed[row.id]) out.edited += 1;
    else out.accepted += 1;
  }
  out.rejected += rows.filter((r) => r.flags.length > 0 && r.status === "rejected").length;
  return out;
}

/** The record without one key. */
export function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}
