import { describe, expect, it } from "vitest";
import { caseRecordFixture } from "@/test/fixtures/case-record";
import { ledgerCaseOf } from "./ledger-case";

describe("ledgerCaseOf (what the item page reads from the newest revision)", () => {
  it("is not a ledger case for no revision, a note's data or a facts sheet", () => {
    expect(ledgerCaseOf(null)).toEqual({ isLedger: false, record: null });
    expect(ledgerCaseOf({})).toEqual({ isLedger: false, record: null });
    expect(ledgerCaseOf({ facts: [], tests: [] })).toEqual({ isLedger: false, record: null });
  });

  it("is a ledger case, with its record, when the key is there and reads", () => {
    const structured = { ledger: JSON.parse(JSON.stringify(caseRecordFixture())) };
    const out = ledgerCaseOf(structured);
    expect(out.isLedger).toBe(true);
    expect(out.record?.idea).toBe(caseRecordFixture().idea);
  });

  it("is still a ledger case, with no record, when the key is there and does not read (the facts editor stays hidden)", () => {
    expect(ledgerCaseOf({ ledger: { v: 2 } })).toEqual({ isLedger: true, record: null });
    expect(ledgerCaseOf({ ledger: "nope" })).toEqual({ isLedger: true, record: null });
  });
});
