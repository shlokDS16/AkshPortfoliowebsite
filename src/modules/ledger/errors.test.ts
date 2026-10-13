import { describe, expect, it, vi } from "vitest";
import { AccessDeniedError } from "@/lib/errors";
import { DbError } from "@/lib/supabase/errors";
import { errorCode, errorText } from "@/lib/messages";
import { LEDGER_ERROR_TEXT, LedgerError, ledgerErrorFromDb, type LedgerErrorCode } from "./errors";

const sql = (message: string, code = "P0001") => ledgerErrorFromDb("ledger.test", { message, code });

describe("each database code becomes a desk message", () => {
  it.each([
    ["ledger:no_symbol", "ledger-no-symbol"],
    ["ledger:company_not_ready", "ledger-company-not-ready"],
    ["ledger:not_open", "ledger-not-open"],
    ["ledger:not_closed", "ledger-not-closed"],
    ["ledger:void_too_late", "ledger-void-too-late"],
    ["ledger:words_required", "ledger-words-required"],
    ["ledger:is_void", "ledger-is-void"],
    ["ledger:opposite_open", "ledger-opposite-open"],
    ["ledger:bad_horizon", "ledger-bad-horizon"],
    ["ledger:bad_stance", "ledger-bad-input"],
    ["ledger:bad_kind", "ledger-bad-input"],
  ])("%s -> %s", (message, key) => {
    const error = sql(message);
    expect(error).toBeInstanceOf(LedgerError);
    expect(errorCode(error)).toBe(key);
    expect(errorText(key)).toBe((error as LedgerError).message);
  });

  it("an unknown company or idea (P0002) is 'not found'", () => {
    expect(errorCode(sql("ledger: company not found", "P0002"))).toBe("ledger-not-found");
  });

  it("a check violation is bad input", () => {
    expect(errorCode(sql("new row for relation violates check constraint", "23514"))).toBe("ledger-bad-input");
  });

  it("a caller who is not the admin is access denied", () => {
    expect(sql("ledger: not allowed", "42501")).toBeInstanceOf(AccessDeniedError);
  });

  it.each(["chain_broken", "projection_mismatch", "anchor_mismatch"])("ledger:%s is the ledger failing its own check, in its own words", (code) => {
    const error = sql(`ledger:${code}`);
    expect(error).toBeInstanceOf(LedgerError);
    expect(errorCode(error)).toBe("ledger-integrity");
    expect((error as LedgerError).message).toBe("The ledger failed its own check. Nothing was saved. Run the integrity check on the Ledger page.");
  });

  it("an integrity failure is logged by shape (operation and code, no message), because the screen will not log a typed error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      sql("ledger:chain_broken");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(spy.mock.calls[0])).toContain("chain_broken");
      expect(JSON.stringify(spy.mock.calls[0])).toContain("ledger.test");
    } finally {
      spy.mockRestore();
    }
  });

  it("a ledger code we do not know, and a failure with no code, stay database errors (save-failed), never free text", () => {
    for (const error of [sql("ledger:something_new"), sql("connection reset", "08006"), sql("boom", undefined as unknown as string)]) {
      expect(error).toBeInstanceOf(DbError);
      expect(errorCode(error)).toBe("save-failed");
    }
  });

  it("does not mistake other P0001 messages (append-only, other modules) for ledger codes", () => {
    expect(sql("idea_events is append-only")).toBeInstanceOf(DbError);
    expect(sql("xledger:no_symbol")).toBeInstanceOf(DbError);
  });
});

describe("messages", () => {
  it("every LedgerError code is a desk message code whose text equals the error's message", () => {
    for (const key of Object.keys(LEDGER_ERROR_TEXT) as LedgerErrorCode[]) {
      expect(errorCode(new LedgerError(key))).toBe(key);
      expect(errorText(key)).toBe(new LedgerError(key).message);
    }
  });

  it("the six keys the plan names exist", () => {
    for (const key of ["ledger-no-symbol", "ledger-not-open", "ledger-not-closed", "ledger-void-too-late", "ledger-words-required", "ledger-bad-input"]) {
      expect(Object.keys(LEDGER_ERROR_TEXT)).toContain(key);
    }
  });

  it("the texts are distinct (the screen maps text back to a code) and use none of the gate's lexicon", () => {
    const texts = Object.values(LEDGER_ERROR_TEXT);
    expect(new Set(texts).size).toBe(texts.length);
    for (const text of texts) expect(text).not.toMatch(/\b(buy|sell|recommend|target|guarantee)\b/i);
  });
});
