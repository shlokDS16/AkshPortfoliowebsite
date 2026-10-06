import type { ZodError } from "zod";

/**
 * Failures reach the capture UI as a fixed code, never as free text: a crafted input or a database
 * message must not be able to put words on screen. The UI maps a code back to the text below.
 */
const SUBMIT_ERRORS = {
  "empty-capture": "Nothing to save. Write something first.",
  "too-long": "That is too long to capture (20,000 characters max).",
  "invalid-capture": "This capture is malformed and was not saved.",
  "save-failed": "Saved on this device; it will sync when the desk is reachable.",
} as const;

export type SubmitErrorCode = keyof typeof SUBMIT_ERRORS;

/** Validation messages written in service.ts, mapped to their code. */
export const EMPTY_CAPTURE_MESSAGE = "Empty capture";
export const CAPTURE_TOO_LONG_MESSAGE = "Capture is too long (20,000 characters max)";

export function submitErrorText(code: SubmitErrorCode): string {
  return SUBMIT_ERRORS[code];
}

/** Plain-English reason for a rejected capture; an unknown code gets the generic malformed text. */
export function rejectionText(code: string): string {
  return Object.hasOwn(SUBMIT_ERRORS, code) ? SUBMIT_ERRORS[code as SubmitErrorCode] : SUBMIT_ERRORS["invalid-capture"];
}

export function submitErrorCode(error: ZodError): Exclude<SubmitErrorCode, "save-failed"> {
  const messages = new Set(error.issues.map((issue) => issue.message));
  if (messages.has(EMPTY_CAPTURE_MESSAGE)) return "empty-capture";
  if (messages.has(CAPTURE_TOO_LONG_MESSAGE)) return "too-long";
  return "invalid-capture";
}

/**
 * What a saved capture records when it could not be filed. `filing-failed`: the text is stored but no
 * item exists. `link-failed`: the item exists but the capture row was not linked to it.
 */
export const FILING_ERRORS = ["filing-failed", "link-failed"] as const;
export type FilingErrorCode = (typeof FILING_ERRORS)[number];

export function asFilingError(value: unknown): FilingErrorCode | null {
  return FILING_ERRORS.find((code) => code === value) ?? null;
}

const FILING_TEXT: Record<FilingErrorCode, string> = {
  "filing-failed": "Saved, but not filed as an item yet.",
  "link-failed": "Filed as an item; the link back to this capture is missing.",
};

export function filingErrorText(code: FilingErrorCode): string {
  return FILING_TEXT[code];
}
