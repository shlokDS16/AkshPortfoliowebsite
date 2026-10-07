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
