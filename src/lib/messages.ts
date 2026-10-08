import { ZodError } from "zod";
import { DeskError } from "./errors";

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
  "upload-unsupported": "Drop a PDF, a photo or a voice note.",
  "upload-image-too-large": "This photo is still over 1 MB after shrinking; crop it to the table.",
  "upload-storage-full": "Storage is over 90% full. Mark finished documents as done to free space.",
  "upload-missing": "The upload did not arrive complete. Upload the file again.",
  "voice-off": "Voice notes are not switched on yet.",
  // The two voice limits are derived in modules/documents/errors.ts from limits.ts; a test keeps these equal to that.
  "voice-too-large": "This voice note is over 25 MB. Record a shorter one.",
  "voice-too-long": "This voice note is longer than 90 minutes. Record a shorter one.",
  // Inbox actions (= INBOX_ERROR_TEXT in modules/ingestion/errors.ts; a test keeps them equal).
  "page-budget-reached": "This document is at its page limit. Raise the limit to read more pages.",
  "budget-range": "Choose a page limit from 1 to 40.",
  "ai-off": "AI reading is off, so figures cannot be read yet. Pages are still read and searchable.",
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
} as const;

export type ErrorCode = keyof typeof ERRORS;

const ERROR_CODE_BY_TEXT = new Map<string, ErrorCode>(
  (Object.entries(ERRORS) as [ErrorCode, string][]).map(([code, text]) => [text, code]),
);
const ERROR_CODE_BY_TYPED: Record<string, ErrorCode> = {
  ITEM_NOT_FOUND: "item-not-found",
  PUBLIC_ITEM_LOCKED: "public-item-locked",
  REVISION_APPEND_ONLY: "append-only",
  ITEM_RULE: "item-rule",
  INVALID_INPUT: "invalid-input",
  ACCESS_DENIED: "access-denied",
  CAPTURE_NOT_REFILABLE: "capture-not-refilable",
  HAND_CHECK_REQUIRED: "hand-check-required",
  FILE_STRUCTURE: "file-structure",
  FACTS_SHEET_INVALID: "facts-sheet-invalid",
  NAME_NOT_SCREENED: "name-not-screened",
  NAME_ON_PUBLIC_ITEM: "name-on-public-item",
  NO_FIGURE_DATE: "no-figure-date",
  // DocumentError carries the message code itself.
  "upload-duplicate": "upload-duplicate",
  "upload-too-large": "upload-too-large",
  "upload-unsupported": "upload-unsupported",
  "upload-image-too-large": "upload-image-too-large",
  "upload-storage-full": "upload-storage-full",
  "upload-missing": "upload-missing",
  "voice-off": "voice-off",
  "voice-too-large": "voice-too-large",
  "voice-too-long": "voice-too-long",
  // InboxError likewise.
  "page-budget-reached": "page-budget-reached",
  "budget-range": "budget-range",
  "ai-off": "ai-off",
  // ReviewError likewise.
  "type-value-first": "type-value-first",
  "figure-incomplete": "figure-incomplete",
  "figure-not-a-number": "figure-not-a-number",
  "figure-filed": "figure-filed",
  "filed-on-required": "filed-on-required",
  "checks-left": "checks-left",
  "not-this-file": "not-this-file",
  "no-company": "no-company",
  "nothing-to-file": "nothing-to-file",
  "document-closed": "document-closed",
  "company-locked": "company-locked",
};

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
  "revision-saved-provenance-missing":
    "Saved. The record of where some figures came from could not be written; they stay staged and are skipped as duplicates next time.",
  "revision-pending-gate":
    "Revision saved. This item is public, so the new revision is waiting for the publishing gate; the public page still shows the previous one.",
} as const;

export type ItemNoticeCode = keyof typeof NOTICES;

export function noticeText(code: string | undefined): string | null {
  return code !== undefined && Object.hasOwn(NOTICES, code) ? NOTICES[code as ItemNoticeCode] : null;
}
