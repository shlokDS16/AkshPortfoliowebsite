import { formatCount, formatDate } from "./format";

// Wording of the Closes page, the corporate actions and the Journal (Plan 3a Task 11; spec s31). Plain words; none of the publish
// gate's lexicon; nothing says or implies "cannot be altered", "proof" or "verified". Every string is pending Shlok's approval.
// The error texts of the typed forms are in messages.ts (they travel as codes); the upload's refusals are here, by their closed code.

export const CLOSES_TITLE = "Closes";
export const CLOSES_INTRO =
  "The closing prices the scores rest on. The desk fetches NSE's official files by itself each day; this page is for when it cannot, and for what you enter by hand. A close you type or an action you enter is marked on every score that uses it.";

export const CLOSES_DAYS_HEADING = "Recent days";
export const CLOSES_DAYS_NOTE = "Each day's state, and the companies you track that have no close for an open day.";
export const DAY_STATE_TEXT = {
  open: "Open",
  shut: "Shut: no trading",
  undecided: "Not decided yet",
  today: "Today: NSE publishes its file after the close",
} as const;
export const DAY_UNDECIDED_NOTE = "The daily run has not stored this day yet. A day is marked shut only when NSE has no file for it and a later day is open.";
export const missingText = (names: readonly string[]): string =>
  `No close yet for ${names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${formatCount(names.length - 3, "other")}`}.`;
export const NO_MISSING_TEXT = "Every company you track has a close.";

export const FETCH_HEADING = "Fetch closes now";
export const FETCH_INTRO = "Asks NSE for the days that are not decided yet, then scores the ideas. The public copy is left to the daily run.";
export const FETCH_BUTTON = "Fetch closes now";
export const FETCH_PENDING = "Fetching...";
export const FETCH_STEP_LABEL = { "ledger:prices": "Closing prices", "ledger:score": "Scores" } as const;
export const fetchStepText = (label: string, ok: boolean, detail: string): string => `${label}: ${ok ? "" : "failed. "}${detail}`;

export const DROP_HEADING = "Drop NSE's official file";
export const DROP_INTRO =
  "When NSE does not answer the desk, download the day's files yourself and drop them here. The desk reads them the way it reads its own fetch and stores the closes of the companies you track as NSE's official file, dropped by you. The file itself is not kept.";
export const DROP_DATE_LABEL = "Trading date of the files";
export const DROP_ZIP_LABEL = "Equity file (the day's bhavcopy, a .zip)";
export const DROP_INDEX_LABEL = "Index file (the day's indices, a .csv), optional";
export const DROP_ZIP_HINT = "The Nifty 50 close opens the day, so drop the index file too. On a day marked shut the index file is required.";
export const DROP_BUTTON = "Store the official closes";
export const DROP_PENDING = "Reading the files...";
export const DROP_LIMITS_TEXT = "Limits: the equity zip up to 2 MB, the index file up to 512 KB, both together up to 2.5 MB. The real files are about 210 KB and 20 KB.";

/** What each refusal says. Fixed text per closed code: nothing from the file, a parser or the database is ever shown. */
export const UPLOAD_REFUSAL_TEXT = {
  forbidden: "That request did not come from this page. Nothing was stored.",
  too_large: "The upload is larger than 2.5 MB (the equity zip may be up to 2 MB, the index file up to 512 KB). The real files are far smaller, so this is probably the wrong file. Nothing was stored.",
  not_a_form: "The upload could not be read as this page's form. Reload the page and try again. Nothing was stored.",
  missing_zip: "Choose the equity file (the day's bhavcopy zip) first. Nothing was stored.",
  bad_date: "Choose the trading date the files are for. Nothing was stored.",
  future_date: "That date is in the future. Nothing was stored.",
  too_early: "The market has not closed yet for that date (15:30 India). Drop the files after the close. Nothing was stored.",
  not_zip: "The equity file is not a zip file. Choose the day's bhavcopy zip. Nothing was stored.",
  zip_damaged: "The zip file is damaged or cut short. Download it from NSE again. Nothing was stored.",
  zip_many: "The zip holds more than one file. NSE's bhavcopy zip holds exactly one. Nothing was stored.",
  zip_unsupported: "The zip is locked or uses a format the desk does not read. Nothing was stored.",
  zip_too_large: "The file inside the zip is far larger than a real NSE file. Nothing was stored.",
  not_text: "The file inside the zip is not plain text. Nothing was stored.",
  bad_header: "The first row of the equity file is not the layout NSE uses (a column is missing or repeated). Nothing was stored.",
  empty_file: "The equity file has a header row and no data. Nothing was stored.",
  bad_row: "A row in the equity file is cut short or broken. Nothing was stored.",
  too_many_rows: "The file has far more rows, columns or text than a real NSE file. Nothing was stored.",
  wrong_date: "The equity file is for a different date than the one you chose. Nothing was stored.",
  bad_file_date: "The date inside the equity file could not be read, or the file holds more than one date. Nothing was stored.",
  bad_close:
    "A closing price the desk needs (a company you track) is blank or not a plain number, so the whole file was refused and nothing was stored. To go on, type that close by hand below: it is stored as typed and marked on every score that uses it.",
  duplicate: "A company, or the Nifty 50, appears twice in the files. Nothing was stored.",
  index_bad: "The index file is not NSE's index file (a different layout, a zip, or not text), or its Nifty 50 close is not a plain number. Nothing was stored.",
  index_no_nifty: "The index file has no Nifty 50 row. Nothing was stored.",
  index_wrong_date: "The index file is for a different date than the one you chose. Nothing was stored.",
  day_shut:
    "The daily run found no NSE file for that date and marked it as a day with no trading. An official upload can reopen it, but only together with the index file (the Nifty 50 close). Add the index file and try again. Nothing was stored.",
  store_failed: "The files were read but the desk could not store them just now. Nothing was stored. Try again in a moment.",
} as const;

/** The two refusals that name a date the file carries (a validated YYYY-MM-DD, never raw text). */
export function uploadRefusalText(code: keyof typeof UPLOAD_REFUSAL_TEXT, fileDate?: string): string {
  const base = UPLOAD_REFUSAL_TEXT[code];
  if ((code === "wrong_date" || code === "index_wrong_date") && fileDate) {
    return `${code === "wrong_date" ? "The equity file" : "The index file"} is for ${formatDate(fileDate)}, not the date you chose. Nothing was stored.`;
  }
  return base;
}

export function uploadDoneText(r: { tradeDate: string; stored: number; tracked: number; indexStored: boolean; scored: number | null }): string {
  const parts = [
    `Stored ${formatCount(r.stored, "close")} for ${formatDate(r.tradeDate)} as NSE's official file, dropped by you.`,
    r.indexStored ? "The Nifty 50 close is stored, so the day is open." : "No Nifty 50 close was stored, so the day is not open yet. Drop the index file too.",
  ];
  if (r.tracked > r.stored) parts.push(`${formatCount(r.tracked - r.stored, "company", "companies")} you track had no row in the file.`);
  parts.push(r.scored === null ? "Scoring did not run; the daily run will score it." : `Scored ${formatCount(r.scored, "idea")}.`);
  return parts.join(" ");
}

export const NOT_SIGNED_IN_TEXT = "You are signed out. Sign in again, then drop the files again. Nothing was stored.";

export const TYPE_HEADING = "Type a close";
export const TYPE_INTRO =
  "For one company and one day, when the official file is not available. It is stored as typed and marked on every score that uses it. Not before 15:30 India on the day, not on a weekend, and not on a day marked shut.";
export const TYPE_COMPANY_LABEL = "Company";
export const TYPE_DATE_LABEL = "Trading date";
export const TYPE_CLOSE_LABEL = "Closing price of the company";
export const TYPE_INDEX_LABEL = "Nifty 50 close for the same day, optional";
export const TYPE_INDEX_HINT = "A day is open only when its Nifty 50 close is stored, and a score needs both closes.";
export const TYPE_BUTTON = "Store the close";

export const HAND_HEADING = "Closes you typed or dropped";
export const HAND_NOTE = "Closes that are not NSE's own fetched file, in the last 30 days. The fetched file replaces them when it arrives.";
export const HAND_EMPTY = "None in the last 30 days.";

export const RESTATED_HEADING = "Scores restated lately";
export const RESTATED_NOTE = "A stored close that changed an idea's fixed entry or final score leaves a dated row here.";
export const RESTATED_EMPTY = "No score has been restated in the last 30 days.";

export const ACTIONS_HEADING = "Splits, bonuses and other actions";
export const ACTIONS_INTRO =
  "Enter what you know changed a share's price base. Factor is new shares per old share: 5 for a 1:5 split (one old share became five), 2 for a 1:1 bonus. Choose 'No action needed' when you looked at a sharp move and nothing explains it. This screen has no way to edit or remove an entry: a correction is a new entry that replaces the earlier one, and the earlier one stays listed.";
export const ACTIONS_MARK_NOTE =
  "Any action you enter with an ex-date from the day an idea opened to the day it is marked to marks that idea's score: 'Includes a split, bonus or note about a price move that you entered by hand.'";
export const ACTION_KIND_TEXT = { split: "Split", bonus: "Bonus", other: "Other", none: "No action needed" } as const;
export const ACTION_COMPANY_LABEL = "Company";
export const ACTION_KIND_LABEL = "What happened";
export const ACTION_DATE_LABEL = "Ex-date";
export const ACTION_FACTOR_LABEL = "Factor (0.001 to 1000)";
export const ACTION_FACTOR_HINT = "Not needed for 'No action needed'. Not 1 for a split, bonus or other.";
export const ACTION_NOTE_LABEL = "Note, optional (up to 500 characters)";
export const ACTION_BUTTON = "Enter the action";
export const ACTION_CORRECT_BUTTON = "Enter the correction";
export const ACTION_CORRECT_LINK = "Correct this entry";
export const ACTION_CORRECTING_TEXT = "You are correcting an earlier entry. The new entry replaces it; the earlier one stays listed as replaced.";
export const ACTIONS_EMPTY = "No actions entered.";
export const ACTION_SUPERSEDED_TEXT = "Replaced by a later entry";
export const actionFactorText = (kind: keyof typeof ACTION_KIND_TEXT, factor: number): string => (kind === "none" ? "no price change to apply" : `factor ${factor}`);

export const JOURNAL_TITLE = "What I learned";
export const JOURNAL_INTRO = "The lessons you wrote when you closed ideas, newest first, exactly as you typed them.";
export const JOURNAL_EMPTY = "No lessons yet. When you close an idea, write what you learned and it will be listed here.";
export const journalMoreText = (hidden: number): string => `${formatCount(hidden, "more lesson")} not shown.`;
