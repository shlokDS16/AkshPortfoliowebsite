import { describe, expect, it } from "vitest";
import { countStatuses, statusSummaryLabel, totalTests } from "./test-status";

describe("test-status", () => {
  it("counts statuses in the fixed order and spells them for screen readers", () => {
    const counts = countStatuses(["watching", "not_met", "not_met", "no_data"]);
    expect(counts).toEqual({ met: 0, watching: 1, not_met: 2, no_data: 1 });
    expect(totalTests(counts)).toBe(4);
    expect(statusSummaryLabel(counts)).toBe("0 met, 1 watching, 2 not met, 1 no data");
  });
});
