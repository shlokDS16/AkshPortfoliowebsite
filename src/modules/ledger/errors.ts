import { DeskError, toDeskError } from "@/lib/errors";
import { dbError } from "@/lib/supabase/errors";

/**
 * Fixed text per code, equal to the entries in src/lib/messages.ts (a test keeps them equal). Messages never carry
 * data. Pending Shlok's approval (spec s19).
 */
export const LEDGER_ERROR_TEXT = {
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
  "ledger-item-other-company": "That file is about a different company. Open the idea from the company's own file, or without a link to a file.",
  "ledger-bad-close": "Type the close as a plain number such as 1234.50 (up to four decimals, no commas).",
  "ledger-bad-date": "Choose a real date that is not in the future.",
  "ledger-close-too-early": "The market has not closed yet for that date (15:30 India). A close can be typed after it.",
  "ledger-close-weekend": "NSE has no session on a Saturday or Sunday, so a close cannot be typed for it.",
  "ledger-close-not-stored": "That close was not stored: only a company that has an idea on file (not a withdrawn one) takes a close.",
  "ledger-bad-factor": "The factor must be a number from 0.001 to 1000, and not 1 for a split, bonus or other action. For 'No action needed' leave it at 1.",
  "ledger-action-duplicate": "That action is already entered. To change it, choose 'Correct this entry' on the earlier one.",
  "ledger-note-too-long": "That note is over 500 characters. Shorten it.",
  "ledger-fetch-busy": "A fetch is already running. Wait for it to finish, then reload this page.",
  "ledger-day-shut": "NSE had no trading on that date, so a closing price cannot be typed for it. If NSE did trade that day, upload NSE's official file for it instead.",
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
  company_not_ready: "ledger-company-not-ready",
  not_open: "ledger-not-open",
  not_closed: "ledger-not-closed",
  void_too_late: "ledger-void-too-late",
  words_required: "ledger-words-required",
  is_void: "ledger-is-void",
  opposite_open: "ledger-opposite-open",
  bad_horizon: "ledger-bad-horizon",
  day_shut: "ledger-day-shut",
  future_date: "ledger-close-too-early",
  weekend: "ledger-close-weekend",
  bad_close: "ledger-bad-close",
  bad_rows: "ledger-bad-input",
  item_other_company: "ledger-item-other-company",
  bad_stance: "ledger-bad-input",
  bad_kind: "ledger-bad-input",
  chain_broken: "ledger-integrity",
  projection_mismatch: "ledger-integrity",
  anchor_mismatch: "ledger-integrity",
};

/** The codes that mean the ledger failed one of its own checks: not Aksh's mistake, and the most serious signal there is. */
const INTEGRITY_CODES = new Set(["chain_broken", "projection_mismatch", "anchor_mismatch"]);

/**
 * Turns a Postgres error from a ledger call into a typed desk error. A ledger code we do not list stays a DbError. The three
 * integrity codes (chain_broken, projection_mismatch, anchor_mismatch) get their own message, and are logged here by shape
 * (operation and code), because a typed error is one the screens treat as "already explained" and do not log.
 */
export function ledgerErrorFromDb(op: string, error: { message: string; code?: string }): Error {
  if (error.code === "P0001") {
    const match = /^ledger:([a-z_]+)$/.exec(error.message);
    const sqlCode = match?.[1];
    const mapped = sqlCode !== undefined && Object.hasOwn(SQL_CODES, sqlCode) ? SQL_CODES[sqlCode] : undefined;
    if (sqlCode !== undefined && INTEGRITY_CODES.has(sqlCode)) console.error("ledger integrity failure", { op, code: error.code, ledger: sqlCode });
    return mapped ? new LedgerError(mapped) : dbError(op, error);
  }
  if (error.code === "P0002") return new LedgerError("ledger-not-found");
  if (error.code === "23514") return new LedgerError("ledger-bad-input");
  if (error.code === "42501") return toDeskError(op, error);
  return dbError(op, error);
}
