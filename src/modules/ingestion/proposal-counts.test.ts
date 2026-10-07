import { describe, expect, it } from "vitest";
import { tallyPending } from "./proposal-counts";

describe("tallyPending", () => {
  it("counts pending figures per document and the flagged ones among them", () => {
    const tally = tallyPending([
      { document_id: "a", flags: [] },
      { document_id: "a", flags: ["value_not_on_page"] },
      { document_id: "a", flags: ["period_unknown", "unit_unknown"] },
      { document_id: "b", flags: [] },
    ]);
    expect(tally.get("a")).toEqual({ pending: 3, flagged: 2 });
    expect(tally.get("b")).toEqual({ pending: 1, flagged: 0 });
    expect(tally.get("c")).toBeUndefined();
  });
});
