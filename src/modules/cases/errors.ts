import { DeskError, toDeskError } from "@/lib/errors";
import { dbError } from "@/lib/supabase/errors";

/**
 * Fixed text per code, equal to the entries in src/lib/messages.ts (a test keeps them equal). Messages never carry data.
 * The two sentences for "no lesson" and "exit not fixed" are spec s33.8; the rest are the build's own. Pending Shlok's approval.
 */
export const CASE_ERROR_TEXT = {
  "case-not-found": "This idea could not be found.",
  "case-not-closed": "This idea is still open. A case study can be drafted once it is closed.",
  "case-void": "This idea was withdrawn, so it cannot be shown as a case study.",
  "case-no-lesson": "A case study shows what you learned. Write the lesson first.",
  "case-exit-pending": "The exit price is not fixed yet. A case study can be drafted once it is.",
  "case-record-unreadable": "The ledger record could not be read. Run the integrity check on the Ledger page.",
  "case-not-ledger": "This item does not carry a ledger record.",
} as const;

export type CaseErrorCode = keyof typeof CASE_ERROR_TEXT;

export class CaseError extends DeskError {
  readonly code: CaseErrorCode;
  constructor(code: CaseErrorCode) {
    super(CASE_ERROR_TEXT[code]);
    this.code = code;
    this.name = "CaseError";
  }
}

/** The `case:<code>` messages private.case_study_record raises (SQLSTATE P0001), by code. */
const SQL_CODES: Record<string, CaseErrorCode> = {
  not_closed: "case-not-closed",
  void: "case-void",
  no_review: "case-no-lesson",
  exit_pending: "case-exit-pending",
};

/** Turns a Postgres error from the case study doors into a typed desk error; a code not listed stays a DbError. */
export function caseErrorFromDb(op: string, error: { message: string; code?: string }): Error {
  if (error.code === "P0001") {
    const sqlCode = /^case:([a-z_]+)$/.exec(error.message)?.[1];
    const mapped = sqlCode !== undefined && Object.hasOwn(SQL_CODES, sqlCode) ? SQL_CODES[sqlCode] : undefined;
    return mapped ? new CaseError(mapped) : dbError(op, error);
  }
  if (error.code === "42501") return toDeskError(op, error);
  return dbError(op, error);
}
