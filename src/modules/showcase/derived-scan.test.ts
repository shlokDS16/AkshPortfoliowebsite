import { describe, expect, it } from "vitest";
import { derivedProblems } from "./derived-scan";

describe("derivedProblems", () => {
  it("is empty for plain words, dates and R-numbers", () => {
    expect(derivedProblems("Revision R2 · 4 sentences changed · figures to 22 Aug 2026. Closed Jun 2026.")).toEqual([]);
  });

  it("names a uuid, a percent sign, a rupee sign, an Rs figure and a verdict", () => {
    expect(derivedProblems("id 8a1f0f64-0000-4a00-8000-000000000001")).toEqual(["uuid"]);
    expect(derivedProblems("up 12 %")).toEqual(["percent"]);
    expect(derivedProblems("₹ 120")).toEqual(["rupee sign"]);
    expect(derivedProblems("Rs 120 and Rs120")).toEqual(["Rs figure"]);
    expect(derivedProblems("it ended ahead of the index")).toEqual(["ended ahead"]);
    expect(derivedProblems("It Ended Behind.")).toEqual(["ended behind"]);
  });

  it("does not take the word Rs inside another word for a figure", () => {
    expect(derivedProblems("Cars 2 and Hours 3")).toEqual([]);
  });

  it("lists each problem once, in a fixed order", () => {
    expect(derivedProblems("5% and 6%, ended behind, ₹1")).toEqual(["percent", "rupee sign", "ended behind"]);
  });
});
