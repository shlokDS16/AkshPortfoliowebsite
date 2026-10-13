import { DeskError, toDeskError } from "@/lib/errors";
import { dbError } from "@/lib/supabase/errors";

/**
 * Fixed text per code, equal to the entries in src/lib/messages.ts (a test keeps them equal). Messages never carry
 * data. Pending Shlok's approval (spec s19).
 */
export const LEDGER_ERROR_TEXT = {
  "ledger-no-symbol": "This company has no NSE symbol yet. Add it under Names first.",
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
} as const;

export type LedgerErrorCode = keyof typeof LEDGER_ERROR_TEXT;

export class LedgerError extends DeskError {
  readonly code: LedgerErrorCode;
  constructor(code: LedgerErrorCode) {
    super(LEDGER_ERROR_TEXT[code]);
    this.code = code;
    this.name = "LedgerError";
  }
}

/** The `ledger:<code>` messages open_idea() and add_idea_event() raise (SQLSTATE P0001), by code. */
const SQL_CODES: Record<string, LedgerErrorCode> = {
  no_symbol: "ledger-no-symbol",
  not_open: "ledger-not-open",
  not_closed: "ledger-not-closed",
  void_too_late: "ledger-void-too-late",
  words_required: "ledger-words-required",
  is_void: "ledger-is-void",
  opposite_open: "ledger-opposite-open",
  bad_horizon: "ledger-bad-horizon",
  bad_stance: "ledger-bad-input",
  bad_kind: "ledger-bad-input",
};

/**
 * Turns a Postgres error from a ledger call into a typed desk error. A ledger code we do not list (chain_broken,
 * projection_mismatch, ...) stays a DbError: it is not Aksh's mistake and must not read as one.
 */
export function ledgerErrorFromDb(op: string, error: { message: string; code?: string }): Error {
  if (error.code === "P0001") {
    const match = /^ledger:([a-z_]+)$/.exec(error.message);
    const mapped = match ? SQL_CODES[match[1] as string] : undefined;
    return mapped ? new LedgerError(mapped) : dbError(op, error);
  }
  if (error.code === "P0002") return new LedgerError("ledger-not-found");
  if (error.code === "23514") return new LedgerError("ledger-bad-input");
  if (error.code === "42501") return toDeskError(op, error);
  return dbError(op, error);
}
