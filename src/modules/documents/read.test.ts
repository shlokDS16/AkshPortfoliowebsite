import { describe, expect, it } from "vitest";
import { snippetAround } from "./read";
import { queryWords } from "./verbatim";

const PAGE = `Consolidated Statement of Profit and Loss\n${"filler ".repeat(30)}Revenue from operations 1,284.00 1,102.00\nFinance costs 41.20 38.90 ${"tail ".repeat(40)}`;

describe("snippetAround", () => {
  it("centres on the first hit and stays near 160 characters", () => {
    const s = snippetAround(PAGE, "revenue operations");
    expect(s).toContain("Revenue from operations 1,284.00");
    expect(s.replace(/…/g, "").length).toBeLessThanOrEqual(160);
    expect(s.startsWith("…")).toBe(true);
  });
  it("falls back to the start of the page when no word is found", () => {
    expect(snippetAround(PAGE, "zzz")).toMatch(/^Consolidated Statement/);
  });
  it("keeps a short page whole, spaces folded", () => {
    expect(snippetAround("Finance\n costs   41.20", "costs")).toBe("Finance costs 41.20");
  });
});

describe("queryWords", () => {
  it("drops operators, quotes and negated words", () => {
    expect(queryWords('"finance costs" -interest or tax')).toEqual(["finance", "costs", "tax"]);
  });
});
