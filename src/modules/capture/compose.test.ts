import { describe, expect, it } from "vitest";
import { captureReceipt, insertToken, receiptLabel } from "./compose";

const none = new Set<string>();
const known = { symbols: new Set(["KAVPUMP"]), themes: new Set<string>(), ignoredSymbols: none, ignoredThemes: none };

describe("captureReceipt (one line: where this will go)", () => {
  it("empty input files to today as a private note", () => {
    expect(captureReceipt("  ", known)).toEqual({ empty: true, chips: [], warning: null });
  });

  it("names the kind, the company and the theme; unknown names go to New names", () => {
    expect(captureReceipt("t: $KAVPUMP dealers #capex", known)).toEqual({
      empty: false,
      chips: [
        { kind: "kind", label: "Thesis" },
        { kind: "company", label: "$KAVPUMP" },
        { kind: "theme-new", label: "#capex → New names" },
      ],
      warning: null,
    });
    expect(receiptLabel(captureReceipt("$NEWCO margins", known))).toBe("$NEWCO");
    expect(receiptLabel(captureReceipt("plain thought", known))).toBe("private note");
  });

  it("warns that a thesis needs a company (Plan 1A files it as a private draft without one)", () => {
    expect(captureReceipt("t: margins look thin", known).warning).toBe(
      "A thesis belongs to one company. Add $SYMBOL, or this saves as a private draft without one.",
    );
  });

  it("skips ignored tokens, as filing does: $AND $KAVPUMP with AND ignored names $KAVPUMP", () => {
    const ignored = { ...known, ignoredSymbols: new Set(["AND"]) };
    expect(captureReceipt("$AND $KAVPUMP", ignored).chips).toContainEqual({ kind: "company", label: "$KAVPUMP" });
    expect(captureReceipt("$AND $KAVPUMP", ignored).chips).not.toContainEqual({ kind: "company-new", label: "$AND → New names" });
  });
});

describe("insertToken (the key row)", () => {
  it("puts a kind key at the start, replacing any existing one", () => {
    expect(insertToken("margins thin", 7, "t:")).toEqual({ value: "t: margins thin", caret: 10 });
    expect(insertToken("l: margins", 5, "p:")).toEqual({ value: "p: margins", caret: 5 });
  });

  it("inserts $ and # at the caret with a separating space", () => {
    expect(insertToken("dealers", 7, "$")).toEqual({ value: "dealers $", caret: 9 });
    expect(insertToken("", 0, "#")).toEqual({ value: "#", caret: 1 });
  });
});
