import { formatCount, formatDate, formatTime } from "./format";

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

/**
 * The four cells of the journal grid: his process call against whether the call ended as expected. The words hold for an idea
 * that expected to do worse than the Nifty 50 as much as for one that expected to do better (the database flips the sign).
 */
export const LEDGER_GRID_TEXT = {
  earned: { title: "Earned", detail: "Sound process, ended as expected" },
  lucky: { title: "Lucky", detail: "Flawed process, ended as expected" },
  unlucky: { title: "Unlucky", detail: "Sound process, did not end as expected" },
  deserved: { title: "Deserved", detail: "Flawed process, did not end as expected" },
} as const;

/** The words a screen puts beside the closed and all-ideas figures: "4 of 7 ended as expected". */
export const LEDGER_OUTCOME_TEXT = "ended as expected";
/** Beside the closed figure: closed ideas left out of it. */
export const closedNotCountedText = (n: number): string =>
  `${formatCount(n, "closed idea")} not counted yet (needs a check, waiting for a close, or exit not fixed).`;

/** One line per score flag. Machine facts about a score, not Aksh's words. */
export const LEDGER_FLAG_TEXT = {
  entry_pending: "Entry will be set at the next close.",
  exit_pending: "Exit will be set at the next close.",
  hand_price: "Includes a close that was entered by hand.",
  attested: "Includes a split, bonus or note about a price move that you entered by hand.",
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
  return `The sealed days and the entries disagree${from}${why}. This check changed nothing. Tell Shlok.`;
}

// ---- Screens A (Plan 3a Task 10; spec s28). Controller-delegated picks, pending Shlok's approval. ----

export const LEDGER_EMPTY_TEXT = "No ideas yet. Write the first one when you have a view you would stand behind.";
/** Beside the all-ideas figure: open ideas have not ended, so the words are "so far" (LEDGER_OUTCOME_TEXT is for closed ideas). */
export const LEDGER_ALL_OUTCOME_TEXT = "as expected so far";
export const LEDGER_RESULT_WORD = { yes: "as expected", no: "not as expected" } as const;
/** The same words for a result that is still moving: an open idea's figure is not a verdict. */
export const LEDGER_RESULT_SO_FAR = { yes: "as expected so far", no: "not as expected so far" } as const;
export const LEDGER_DIRECTION_NOTE =
  "Each idea is judged in the direction of its own call: an idea that expected to do worse than the Nifty 50 counts as expected when it did.";
/** An open idea whose entry close is in but that has not been held a day yet (the summary also leaves it out). */
export const entrySetText = (on: string): string => `Entry: close of ${formatDate(on)}. The first result appears after the next close.`;
export const LEDGER_NO_RESULT_TEXT = "No result yet: waiting for a close.";
export const LEDGER_PRICE_ONLY_TEXT = "Price return only: dividends are left out on both sides.";
export const LEDGER_PLAIN_FIGURES_NOTE = "Fewer than 5 closed ideas: no percentage and no median are shown.";

export const LEDGER_SOURCE_TEXT = {
  nse_fetch: "NSE's official file, fetched by the desk",
  nse_upload: "a file you uploaded as NSE's official file",
  manual: "a close you typed",
} as const;

export const entryLateText = (days: number): string => `Entry taken ${formatCount(days, "trading day")} late: the share had no close on the days before it.`;
export const exitLateText = (days: number): string => `Exit taken ${formatCount(days, "trading day")} late: the share had no close on the days before it.`;
export const restatedText = (on: string): string => `Restated on ${formatDate(on)}.`;
/** A restatement that changed a column with no label of its own (flags, sources): the date is never shown with an empty body. */
export const LEDGER_OTHER_CHANGE_TEXT = "Another part of the score changed.";
export const LEDGER_REMOVED_TEXT = "The idea was withdrawn, so its score was removed.";
/** Names of the fields a restatement can show, by the database's column name. A field not listed is not shown, only the date. */
export const LEDGER_FIELD_TEXT = {
  entry_date: "Entry date",
  entry_close: "Entry close",
  entry_index: "Nifty 50 at entry",
  mark_date: "Marked on",
  mark_close: "Latest close",
  mark_index: "Nifty 50 at the mark",
  factor: "Split or bonus factor",
  idea_return: "Share move",
  index_return: "Nifty 50 move",
  excess: "Result for the call",
  holding_days: "Days held",
} as const;

export const sealedLineText = (recordedAt: string): string => `Sealed ${formatDate(recordedAt)}, ${formatTime(recordedAt)}.`;

export const CHAIN_CHECK_LABEL = { chain: "Entry chain check", anchors: "Sealed-day check" } as const;
/** The integrity check threw: it did not run. Never worded as intact, and never as broken either. */
export const CHAIN_UNREADABLE_TEXT = "Could not check: the integrity check did not run just now. This says nothing about the ledger either way. Reload to try again.";

export const closesLineText = (latestOpenDay: string | null, handEnteredDays: number): string => {
  const base = latestOpenDay ? `Closes to ${formatDate(latestOpenDay)}.` : "No closing prices yet.";
  return handEnteredDays > 0 ? `${base} ${formatCount(handEnteredDays, "day")} rest on closes entered or dropped by hand.` : base;
};
export const copyLineText = (latestPublishedDate: string | null, waitingDays: number): string => {
  if (latestPublishedDate) {
    const waiting = waitingDays > 0 ? ` ${formatCount(waitingDays, "sealed day")} not published yet.` : "";
    return `Public copy of the fingerprints to ${formatDate(latestPublishedDate)}.${waiting}`;
  }
  return waitingDays > 0
    ? `Nothing in the public copy yet; ${formatCount(waitingDays, "sealed day")} waiting (the public copy may be switched off).`
    : "Nothing in the public copy yet.";
};
export const LEDGER_JOB_LABEL = { "ledger:prices": "Closing prices", "ledger:score": "Scores", "ledger:anchor": "Public copy" } as const;

/** The entry forms: what each kind is called in the chooser, on its button, and above its text box (spec s4, s10). */
export const LEDGER_ACTION_TEXT = {
  note: "Add a note",
  revise: "Revise the thesis or the horizon",
  upsize: "Record that I bought more",
  downsize: "Record that I sold some",
  close: "Close this idea",
  review: "Write what I learned",
  void: "Withdraw this idea",
} as const;
export const LEDGER_SUBMIT_TEXT = {
  note: "Add the note",
  revise: "Save the revision",
  upsize: "Record the purchase",
  downsize: "Record the sale",
  close: "Close the idea",
  review: "Save what I learned",
  void: "Withdraw the idea",
} as const;
export const LEDGER_WORDS_LABEL = {
  note: "Your note",
  revise: "What changed in your thinking",
  upsize: "Why you bought more",
  downsize: "Why you sold some",
  close: "Why you are closing it",
  review: "What you learned",
  void: "Why you are withdrawing it",
} as const;
export const LEDGER_SEALED_WARNING = "Once saved, this screen has no way to edit or delete an entry, and the desk sets its date. Write it the way you would stand behind it.";
export const LEDGER_CLOSE_HINT = "The exit is set at the next close. A closed idea cannot be reopened.";
export const voidHintText = (until: string): string =>
  `You can withdraw this idea until ${formatDate(until)}, ${formatTime(until)}. After that its entry price is fixed and you can only close it.`;
