import { describe, expect, it } from "vitest";
import { record } from "@/test/fakes/review-repo";
import { groupValues } from "./review-values";
import { whyFor, type ProposalView } from "./review-types";
import { toView } from "./review-view";

describe("whyFor", () => {
  it("says it in the words of spec s6.5", () => {
    expect(whyFor(["value_not_on_page", "quote_not_on_page", "prior_not_on_page", "period_unknown", "unit_unknown"], { valueText: "41.70", page: 4 })).toEqual([
      "The figure 41.70 is not on p. 4.",
      "The quoted line is not on p. 4.",
      "The prior-year figure is not on p. 4.",
      "The column heading did not say which year.",
      "The page did not say crore or lakh.",
    ]);
  });
});

describe("groupValues", () => {
  const view = (id: string, label: string, over: Partial<ProposalView> = {}): ProposalView => ({ ...toView(record(id, { fact: { label } }))!, ...over });
  it("groups by topic in the order of the core lines, core lines first, then Other figures", () => {
    const rows = [
      view("a", "Trade receivables", { topic: "Working capital" }),
      view("b", "Employee benefits expense", { topic: "Other figures", page: 9 }),
      view("c", "Profit for the year"),
      view("d", "Revenue from operations"),
      view("e", "Total borrowings", { topic: "Balance sheet", page: 5 }),
    ];
    const { values } = groupValues(rows, "consolidated");
    expect(values.map((g) => g.topic)).toEqual(["P&L", "Balance sheet", "Working capital", "Other figures"]);
    expect(values[0].rows.map((r) => r.label)).toEqual(["Revenue from operations", "Profit for the year"]);
  });
  it("counts standalone repeats of a consolidated line in hiddenBasis and does not list them", () => {
    const rows = [
      view("a", "Revenue from operations", { basis: "consolidated" }),
      view("b", "Revenue from operations", { basis: "standalone", page: 6 }),
      view("c", "Total income", { basis: "standalone", page: 6 }),
    ];
    const { values, hiddenBasis } = groupValues(rows, "consolidated");
    expect(hiddenBasis).toBe(1);
    expect(values.flatMap((g) => g.rows.map((r) => r.id)).sort()).toEqual(["a", "c"]);
  });
  it("leaves out a flagged figure that waits for a check or was dropped, and a filed one", () => {
    const rows = [
      view("a", "Finance costs", { flags: ["value_not_on_page"] }),
      view("b", "Total income", { flags: ["unit_unknown"], status: "rejected" }),
      view("c", "Total equity", { status: "filed" }),
      view("d", "Finance costs", { flags: ["value_not_on_page"], status: "edited" }),
    ];
    expect(groupValues(rows, "consolidated").values.flatMap((g) => g.rows.map((r) => r.id))).toEqual(["d"]);
  });
});
