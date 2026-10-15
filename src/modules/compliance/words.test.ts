import { describe, expect, it } from "vitest";
import { lintWords } from "./words";

describe("lintWords (the hint while writing sealed words)", () => {
  it("flags an instruction to act, with the sentence as typed and the rule's title", () => {
    expect(lintWords("The margin story is intact. I will buy more below 500.")).toEqual([
      { sentence: "I will buy more below 500.", rule: "1", title: "Rule 1: no actionable language" },
    ]);
  });

  it("flags a performance claim under rule 2", () => {
    const found = lintWords("We had a 90% hit rate on these calls.");
    expect(found.map((f) => f.rule)).toContain("2");
    expect(found[0]?.title).toBe("Rule 2: no performance claims");
  });

  it("says nothing about a clean sentence or empty text", () => {
    expect(lintWords("Orders are growing faster than the street expects.")).toEqual([]);
    expect(lintWords("")).toEqual([]);
    expect(lintWords("   \n  ")).toEqual([]);
  });

  it("reports each flagged sentence once, in order, even when it breaks two patterns", () => {
    const found = lintWords("Sell now.\n\nFine sentence.\n\nBuy more at 400, target price 600.");
    expect(found.map((f) => f.sentence)).toEqual(["Sell now.", "Buy more at 400, target price 600."]);
  });

  it("sees through a hidden character inside the word, as the gate does", () => {
    expect(lintWords("I will bu\u200By it.")).toHaveLength(1);
  });

  it("never throws or hangs on very long text", () => {
    expect(() => lintWords("word ".repeat(20000))).not.toThrow();
  });

  it("flags a price or a return in his words under rule 10, on the same list as the gate", () => {
    const found = lintWords("The share is down 18% since I opened it.");
    expect(found).toEqual([{ sentence: "The share is down 18% since I opened it.", rule: "10", title: "Rule 10: case studies from the ledger" }]);
    expect(lintWords("It trades at Rs 450.").map((f) => f.rule)).toEqual(["10"]);
    expect(lintWords("Revenue grew 20% last year.")).toEqual([]);
  });
});
