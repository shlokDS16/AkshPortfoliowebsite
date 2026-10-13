import { formatCount, formatDate } from "./format";

// Ledger wording (Plan 3a Task 4). The error texts are in messages.ts (they travel in redirect codes); the rest is here so
// that messages.ts stays small. Plain words; none of the publish gate's lexicon. Pending Shlok's approval (spec s19).

export const LEDGER_EXPECTS_TEXT = {
  outperform: "Expects to do better than the Nifty 50",
  underperform: "Expects to do worse than the Nifty 50",
} as const;

export const LEDGER_KIND_TEXT = {
  open: "Idea recorded",
  note: "Note",
  revise: "Revised",
  upsize: "Bought more",
  downsize: "Sold some",
  close: "Closed",
  review: "What I learned",
  void: "Withdrawn",
} as const;

export const LEDGER_CLOSE_REASON_TEXT = {
  played_out: "Played out",
  thesis_broken: "Thesis broken",
  horizon_reached: "Horizon reached",
  better_use: "Better use of the money",
  other: "Other",
} as const;

export const LEDGER_PROCESS_TEXT = { sound: "Process was sound", flawed: "Process was flawed" } as const;

export const LEDGER_TAG_TEXT = {
  thesis: "Thesis",
  valuation: "Valuation",
  timing: "Timing",
  sizing: "Sizing",
  process: "Process",
  behaviour: "Behaviour",
  luck: "Luck",
  none: "No mistake",
} as const;

/** The four cells of the journal grid: his process call against how the idea ended. */
export const LEDGER_GRID_TEXT = {
  earned: { title: "Earned", detail: "Sound process, ended ahead" },
  lucky: { title: "Lucky", detail: "Flawed process, ended ahead" },
  unlucky: { title: "Unlucky", detail: "Sound process, ended behind" },
  deserved: { title: "Deserved", detail: "Flawed process, ended behind" },
} as const;

/** One line per score flag. Machine facts about a score, not Aksh's words. */
export const LEDGER_FLAG_TEXT = {
  entry_pending: "Entry will be set at the next close.",
  exit_pending: "Exit will be set at the next close.",
  hand_price: "Includes a close that was entered by hand.",
  stale: "The latest close is three or more weekdays old.",
  jump: "Needs a check: the price moved sharply. Was there a split or bonus?",
  isin_changed: "Needs a check: the share's identity code changed.",
  implausible: "Needs a check: the return is too large to be believed.",
} as const;
export const LEDGER_UNKNOWN_FLAG_TEXT = "Needs a check.";

/** Why a sealed day differs from the entries (`check_ledger_anchors().reason`). Unknown reasons are not echoed. */
const ANCHOR_REASON_TEXT: Record<string, string> = {
  early_event: "an entry is dated before the first sealed day",
  gap: "a sealed day is missing",
  count: "the number of entries differs",
  seq: "the entry numbers differ",
  head: "the fingerprint differs",
  line: "the stored line differs",
};

/**
 * What a passing check may say: the stored entries and the sealed days agree with themselves. Never "unaltered",
 * "cannot be altered" or "tamper-proof" (ADR-005 s6, spec s17).
 */
export const chainOkText = (events: number, sealedDays: number): string =>
  `Consistent with itself: ${formatCount(events, "entry", "entries")}, ${formatCount(sealedDays, "sealed day")}.`;

export const CHAIN_LIMIT_TEXT = "This checks that the entries and the sealed days agree with each other. It does not show that nothing could have been changed.";

export const chainBrokenText = (firstBadSeq: number | null): string =>
  firstBadSeq === null ? "The ledger chain is broken." : `The ledger chain is broken at entry ${firstBadSeq}.`;

export function anchorBrokenText(firstBadDate: string | null, reason: string | null): string {
  const from = firstBadDate === null ? "" : ` from ${formatDate(firstBadDate)}`;
  const why = reason !== null && Object.hasOwn(ANCHOR_REASON_TEXT, reason) ? ` (${ANCHOR_REASON_TEXT[reason]})` : "";
  return `The sealed days and the entries disagree${from}${why}. Nothing was changed. Tell Shlok.`;
}
