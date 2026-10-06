import { ZodError } from "zod";
import { DbError } from "@/lib/supabase/errors";
import { ResearchError } from "./errors";

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
  "save-failed": "Could not save. Try again.",
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
  ACCESS_DENIED: "access-denied",
};

/**
 * The only way a failure reaches a desk screen: a validation message we wrote or a typed ResearchError
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
  if (error instanceof ResearchError) return ERROR_CODE_BY_TYPED[error.code] ?? "save-failed";
  return "save-failed";
}

/** Text for a code in the URL, or null for anything that is not one of ours. */
export function errorText(code: string | undefined): string | null {
  return code !== undefined && Object.hasOwn(ERRORS, code) ? ERRORS[code as ErrorCode] : null;
}

/** What the server log may record about a failure the user was not told about: no message text. */
export function logShape(error: unknown): { name: string; op?: string; code?: string } | null {
  if (error instanceof ZodError || error instanceof ResearchError) return null;
  if (error instanceof DbError) return { name: error.name, op: error.op, code: error.code };
  return { name: error instanceof Error ? error.name : typeof error };
}

/** One-time confirmations carried in the redirect URL as a fixed code, never as free text. */
const NOTICES = {
  "details-saved": "Details saved.",
  "revision-saved": "Revision saved.",
  published: "Published.",
  unpublished: "Unpublished. The item is private again and can be edited.",
  "allowance-saved": "Sentence allowed. Publish again to re-run the gate.",
  "revision-pending-gate":
    "Revision saved. This item is public, so the new revision is waiting for the publishing gate; the public page still shows the previous one.",
} as const;

export type ItemNoticeCode = keyof typeof NOTICES;

export function noticeText(code: string | undefined): string | null {
  return code !== undefined && Object.hasOwn(NOTICES, code) ? NOTICES[code as ItemNoticeCode] : null;
}
