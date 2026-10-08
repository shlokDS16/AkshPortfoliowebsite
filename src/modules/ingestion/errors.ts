import { DeskError } from "@/lib/errors";

/**
 * Fixed text per code, equal to the entries in src/lib/messages.ts (a test keeps them equal). Messages never
 * carry data: the screen shows the text for the code the action returned.
 */
export const INBOX_ERROR_TEXT = {
  "page-budget-reached": "This document is at its page limit. Raise the limit to read more pages.",
  "budget-range": "Choose a page limit from 1 to 40.",
  "ai-off": "AI reading is off, so figures cannot be read yet. Pages are still read and searchable.",
} as const;

export type InboxErrorCode = keyof typeof INBOX_ERROR_TEXT;

export class InboxError extends DeskError {
  readonly code: InboxErrorCode;
  constructor(code: InboxErrorCode) {
    super(INBOX_ERROR_TEXT[code]);
    this.code = code;
    this.name = "InboxError";
  }
}

/** The review screen's refusals (spec s6.5). Text equals the entries in src/lib/messages.ts (a test keeps them equal). */
export const REVIEW_ERROR_TEXT = {
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

export type ReviewErrorCode = keyof typeof REVIEW_ERROR_TEXT;

export class ReviewError extends DeskError {
  readonly code: ReviewErrorCode;
  constructor(code: ReviewErrorCode) {
    super(REVIEW_ERROR_TEXT[code]);
    this.code = code;
    this.name = "ReviewError";
  }
}
