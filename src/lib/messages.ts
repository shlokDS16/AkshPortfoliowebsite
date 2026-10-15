import { ZodError } from "zod";
import { DeskError } from "./errors";
import { formatDate } from "./format";
import { ERROR_CODE_BY_TYPED } from "./message-codes";

/**
 * Failures reach a desk screen as a fixed code in the redirect URL (`?error=title-required`), never as free
 * text, so a crafted link cannot put words on the screen. The page maps the code back to this text.
 */
const ERRORS = {
  "title-required": "Title is required",
  "choose-kind": "Choose a kind",
  "invalid-date": "Use a valid date (YYYY-MM-DD)",
  "choose-holds-position": "Choose yes, no or not disclosed",
  "nothing-to-append": "Nothing to append",
  "reason-required": "Give a reason of at least 3 characters.",
  "invalid-input": "Check the fields and try again.",
  "item-not-found": "This item could not be found.",
  "public-item-locked": "This item is public. Unpublish it before changing its details.",
  "append-only": "Revisions are append-only: an existing revision cannot be changed or deleted. Save a new revision instead.",
  "item-rule": "The database rejected these values. Check the fields (title, kind, linked company or theme) and try again.",
  "access-denied": "You are not allowed to do that. Sign in again as the admin.",
  "body-too-long": "This revision is too long (200,000 characters max). Start a new item or shorten it.", // = BODY_TOO_LONG_MESSAGE (research/schema.ts; a test keeps them equal)
  "capture-not-refilable": "This capture is already filed, or is still being filed. Reload in a minute.",
  "save-failed": "Could not save. Try again.",
  "hand-check-required": "Tick the rule 4 check before running the gate on a file that names a company.",
  "file-structure": "The file's view, tests and facts do not line up yet. The checklist names what is missing.",
  "facts-sheet-invalid": "The facts sheet has a problem; the line is marked in the editor.",
  "name-not-screened": "Screen this name on the New names tab first.",
  "name-required": "Give the name.",
  "choose-sector": "Choose a sector from the list.",
  "name-on-public-item": "A public item names this. Unpublish that item before changing what this name is.",
  "no-figure-date": "This file has no dated figure yet, so there is nothing to set Figures to.",
  // Uploads (= DOCUMENT_ERROR_TEXT in modules/documents/errors.ts; a test keeps them equal).
  "upload-duplicate": "You uploaded this file before. Open the earlier copy.",
  "upload-too-large": "Over 50 MB. Upload the financial statements section, or compress the file.",
  "upload-unsupported": "Drop a PDF, a photo, a voice note or an .xlsx workbook.",
  "upload-image-too-large": "This photo is still over 1 MB after shrinking; crop it to the table.",
  "upload-storage-full": "Storage is over 90% full. Mark finished documents as done to free space.",
  "upload-missing": "The upload did not arrive complete. Upload the file again.",
  "upload-xlsx-too-large": "This workbook is over 10 MB. Remove sheets or pictures the valuation does not use and upload again.",
  "upload-xlsx-needs-company": "Choose the company this workbook is for, then upload it again.",
  "voice-off": "Voice notes are not switched on yet.",
  // The two voice limits are derived in modules/documents/errors.ts from limits.ts; a test keeps these equal to that.
  "voice-too-large": "This voice note is over 25 MB. Record a shorter one.",
  "voice-too-long": "This voice note is longer than 90 minutes. Record a shorter one.",
  // Links and pasted text (= DOCUMENT_ERROR_TEXT likewise).
  "link-invalid": "Use a full link that starts with https:// and has no user name, password or port number.",
  "link-blocked": "That link points somewhere the desk will not open.",
  "link-failed": "The desk could not open that link. Check it, or paste the text instead.",
  "link-redirects": "That link sends the desk through too many other links. Open it in your browser and paste the final link.",
  "link-too-large": "That link is over 50 MB. Download the part you need and upload it.",
  "link-timeout": "That link took longer than 30 seconds to answer. Try again, or paste the text instead.",
  "link-unsupported": "That link is not a web page or a PDF. Upload the file instead.",
  "link-empty": "No readable text was found at that link. Paste the text instead.",
  "text-too-short": "Paste a little more, at least 50 characters.",
  "text-too-long": "That is over 200,000 characters. Paste the part with the figures.",
  // Inbox actions (= INBOX_ERROR_TEXT in modules/ingestion/errors.ts; a test keeps them equal).
  "page-budget-reached": "This document is at its page limit. Raise the limit to read more pages.",
  "budget-range": "Choose a page limit from 1 to 40.",
  "ai-off": "AI reading is off, so figures cannot be read yet. Pages are still read and searchable.",
  "reread-closed": "You marked this document done or skipped, so its pages are not read again.",
  "reread-not-ready": "This page is not ready to be read again. Wait for its first reading to finish.",
  "reread-limit": "This page has been read as many times as the desk allows.",
  // Workbook retry (Plan 2.7 final review I3). Pending Shlok's approval.
  "workbook-retry-limit": "This workbook has been tried as many times as the desk allows. Remove sheets the valuation does not use, save it and upload it again.",
  // Review screen (= REVIEW_ERROR_TEXT in modules/ingestion/errors.ts; a test keeps them equal).
  "type-value-first": "Type the value from the page first.",
  "figure-incomplete": "Add the period, the as-of date and the unit.",
  "figure-not-a-number": "Type the figure as printed on the page, for example 41.20.",
  "figure-filed": "This figure is already filed. Change it in the file's Facts form.",
  "filed-on-required": "Add the date the document was filed.",
  "checks-left": "Check the flagged figures first.",
  "not-this-file": "That is not this company's file. Reload and try again.",
  "no-company": "This document is not linked to a company, so there is no file to put its figures in.",
  "nothing-to-file": "Tick at least one figure to file.",
  "company-locked": "Some of this document's figures are already in its company's file, so the company cannot be changed.",
  "document-closed": "You marked this document done or skipped, so its figures can no longer be reviewed or filed.",
  "workbook-company-locked": "A workbook stays with the company it was uploaded for, because its model versions are numbered under that company.",
  // Ledger (= LEDGER_ERROR_TEXT in modules/ledger/errors.ts; a test keeps them equal). Pending Shlok's approval, spec s19.
  "ledger-no-symbol": "This company has no NSE symbol yet. Add it under Names first.",
  "ledger-company-not-ready": "This company is still waiting for review, or has been merged into another. Settle it under Names, then record the idea on the company it became.",
  "ledger-not-open": "This idea is not open, so that entry cannot be added.",
  "ledger-not-closed": "This idea is still open. Close it before writing what you learned.",
  "ledger-void-too-late": "This idea can no longer be withdrawn, because its entry price is about to be fixed. Close it instead.",
  "ledger-words-required": "Write your own words first. An entry cannot be empty.",
  "ledger-body-too-long": "That is over 10,000 characters. Shorten it.",
  "ledger-bad-horizon": "Choose a horizon from 30 days to 10 years.",
  "ledger-bad-input": "Check this idea's fields and try again.",
  "ledger-is-void": "This idea was withdrawn, so nothing more can be added to it.",
  "ledger-opposite-open": "An open idea on this company expects the opposite. Close or withdraw it first.",
  "ledger-not-found": "This idea or company could not be found.",
  "ledger-integrity": "The ledger failed its own check. Nothing was saved. Run the integrity check on the Ledger page.",
  "ledger-bad-close": "Type the close as a plain number such as 1234.50 (up to four decimals, no commas).",
  "ledger-bad-date": "Choose a real date that is not in the future.",
  "ledger-close-too-early": "The market has not closed yet for that date (15:30 India). A close can be typed after it.",
  "ledger-close-weekend": "NSE has no session on a Saturday or Sunday, so a close cannot be typed for it.",
  "ledger-close-not-stored": "That close was not stored: only a company that has an idea on file (not a withdrawn one) takes a close.",
  "ledger-close-kept-official": "That day already has a close for this company from NSE's fetched file or from a file you uploaded, so the typed close was not stored and the earlier close stands.",
  "ledger-close-too-old": "That date is more than 400 days back. A close can be typed or dropped for a day in the last 400 days.",
  "ledger-bad-factor": "The factor must be a number from 0.001 to 1000, and not 1 for a split, bonus or other action. For 'No action needed' leave it at 1.",
  "ledger-action-duplicate": "That action is already entered. To change it, choose 'Correct this entry' on the earlier one.",
  "ledger-note-too-long": "That note is over 500 characters. Shorten it.",
  "ledger-fetch-busy": "A fetch is already running. Wait for it to finish, then reload this page.",
  "ledger-item-other-company": "That file is about a different company. Open the idea from the company's own file, or without a link to a file.",
  "ledger-day-shut": "NSE had no trading on that date, so a closing price cannot be typed for it. If NSE did trade that day, upload NSE's official file for it instead.",
  // Case studies from the ledger (Plan 3b Task 2, spec s33.8; = CASE_ERROR_TEXT in modules/cases/errors.ts, a test keeps them equal). Pending Shlok's approval.
  "case-not-found": "This idea could not be found.",
  "case-not-closed": "This idea is still open. A case study can be drafted once it is closed.",
  "case-void": "This idea was withdrawn, so it cannot be shown as a case study.",
  "case-no-lesson": "A case study shows what you learned. Write the lesson first.",
  "case-exit-pending": "The exit price is not fixed yet. A case study can be drafted once it is.",
  "case-record-unreadable": "The ledger record could not be read. Run the integrity check on the Ledger page.",
  "case-not-ledger": "This item does not carry a ledger record.",
} as const;

export type ErrorCode = keyof typeof ERRORS;

const ERROR_CODE_BY_TEXT = new Map<string, ErrorCode>(
  (Object.entries(ERRORS) as [ErrorCode, string][]).map(([code, text]) => [text, code]),
);

/**
 * The only way a failure reaches a desk screen: a validation message we wrote or a typed DeskError
 * becomes its code; a DbError or anything unknown becomes `save-failed`. Raw SQL never reaches the UI.
 */
export function errorCode(error: unknown): ErrorCode {
  if (error instanceof ZodError) {
    for (const issue of error.issues) {
      const code = ERROR_CODE_BY_TEXT.get(issue.message);
      if (code) return code;
    }
    return "invalid-input";
  }
  if (error instanceof DeskError) return ERROR_CODE_BY_TYPED[error.code] ?? "save-failed";
  return "save-failed";
}

/** Text for a code in the URL, or null for anything that is not one of ours. */
export function errorText(code: string | undefined): string | null {
  return code !== undefined && Object.hasOwn(ERRORS, code) ? ERRORS[code as ErrorCode] : null;
}

/** True for the failures a screen already explains (validation, typed desk errors): they are not logged. */
export function userWasTold(error: unknown): boolean {
  return error instanceof ZodError || error instanceof DeskError;
}

/** One-time confirmations carried in the redirect URL as a fixed code, never as free text. */
const NOTICES = {
  "details-saved": "Details saved.",
  "revision-saved": "Revision saved.",
  published: "Published.",
  "published-lagged": "Passed the gate. The file shows on the public site once its Figures to date is 30 days old (30-day lag); the date is beside Unpublish.",
  unpublished: "Unpublished. The item is private again and can be edited.",
  "allowance-saved": "Sentence allowed. Run the publishing gate again.",
  "allowance-removed": "Allowance removed. Run the publishing gate again.",
  "company-public": "Company made public. It is listed only once a file that names it passes the gate.",
  "figures-to-set": "Figures to updated to the latest figure date. Run the publishing gate again.",
  refiled: "Filed.",
  "name-saved": "Saved. The name is screened.",
  // Ledger (Plan 3a Task 10, spec s28). Pending Shlok's approval.
  "idea-recorded": "Idea recorded and sealed.",
  "entry-added": "Entry added and sealed.",
  // Closes page and corporate actions (Plan 3a Task 11, spec s31). Pending Shlok's approval.
  "close-entered": "Close stored as typed. It is marked on every score that uses it.",
  "action-added": "Action entered. It is marked on every score whose period it falls in.",
  // Case studies from the ledger (Plan 3b Task 2). Pending Shlok's approval.
  "case-drafted": "Drafted from the ledger. Add the learning objective and what you took from it, then run the gate.",
  "case-refreshed": "Refreshed from the ledger. Run the publishing gate again.",
  "case-unchanged": "This case study already matches the ledger.",
  "revision-saved-provenance-missing":
    "Saved. The record of where some figures came from could not be written; they stay staged and are skipped as duplicates next time.",
  "revision-saved-readings-missing":
    "Saved. The test readings could not be marked as filed; they stay staged, and are left out next time because the tests already have them.",
  "revision-pending-gate":
    "Revision saved. This item is public, so the new revision is waiting for the publishing gate; the public page still shows the previous one.",
} as const;

export type ItemNoticeCode = keyof typeof NOTICES;

export function noticeText(code: string | undefined): string | null {
  return code !== undefined && Object.hasOwn(NOTICES, code) ? NOTICES[code as ItemNoticeCode] : null;
}

/**
 * Public file, source card (Plan 2b Task 9, R19): says what happened and no more. Verified rows are pre-ticked, so it
 * does not claim a person read the figure. `doc` is the already-public source name of the published fact (the text the
 * card already prints, gated at publish); nothing is read from `documents`. The facts form may have filled that name from
 * the uploaded document's title (facts-form/staged.ts), which Aksh then saved and published. Wording is the controller's
 * pick, pending Shlok's approval (spec s16.14).
 */
export const CHECKED_SOURCE_FALLBACK = "the filing";
export function checkedAgainstPageText(page: number, doc: string): string {
  return `Printed on p. ${page} of ${doc.trim() === "" || doc === "Source not listed" ? CHECKED_SOURCE_FALLBACK : doc}; matched by the desk and accepted by the analyst.`;
}

/**
 * Scan reader, third refusal in a row while our own count of the day is under its cap (final review M-2). OCR.space's free
 * limit is counted per internet address, so the desk cannot tell a shared-address limit from a key problem; it says so and
 * blames neither Aksh nor the key. Wording is the build's pick, pending Shlok's approval (spec s16.15).
 */
export const OCR_SERVICE_REFUSED =
  "The scan reader has refused three requests in a row. Its free daily limit is counted per internet address, so this may be that shared limit or the desk's key. Try again later, or upload a text PDF instead.";

/**
 * Classifier gave up on some pages (live smoke S3): the pages stay unselected and Aksh is told once, on the document's
 * reading state. Pending Shlok's approval, spec s16.15.
 */
export const pagesNotSortedText = (pages: number): string =>
  `${pages === 1 ? "1 page" : `${pages} pages`} could not be sorted by the desk. You can choose the pages to read yourself.`;

/**
 * The ledger half of the publish gate (migration 0014): the plain words for each reason code publish_revision() records
 * with a refusal. The database stores the same sentences as its fallback; these are what a screen shows, so the wording can
 * change without a migration. `clearFrom` is the ISO day a refusal under rule 4 lifts. Pending Shlok's approval (spec s22).
 */
export const GATE_LEDGER_TEXT = {
  ledger_recent_entry: (clearFrom: string | null): string | null =>
    clearFrom
      ? `The ledger has an entry on this company from the last 30 days. This can be published from ${formatDate(clearFrom)}.`
      : null,
  ledger_position: (): string => "The ledger shows a position in this company; the disclosure cannot say no.",
  ledger_check_failed: (): string =>
    "The ledger failed its own check, so nothing about this company can be published until it is looked at. Run the integrity check on the Ledger page.",
} as const;

/** The screen text for a recorded gate reason code, or null for a code this build does not know (the stored sentence is then shown). */
export function gateReasonText(code: string | null | undefined, clearFrom: string | null | undefined): string | null {
  if (!code || !Object.hasOwn(GATE_LEDGER_TEXT, code)) return null;
  return GATE_LEDGER_TEXT[code as keyof typeof GATE_LEDGER_TEXT](clearFrom ?? null);
}
