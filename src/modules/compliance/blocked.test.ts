import { describe, expect, it } from "vitest";
import { latestFailures } from "./blocked";

const f = (rule: string) => ({ rule, field: "body", sentence: "s", sentenceHash: "h", match: "m", message: "x" });
const base = { revision_id: "r", policy_version: "p" };

describe("latestFailures", () => {
  it("an item is blocked only when its latest decision failed; counts what the gate panel counts", () => {
    const rows = [
      {
        ...base, id: "d1", item_id: "a", verdict: "fail", decided_at: "2026-10-06T10:00:00Z",
        reasons: { failures: [{ rule: "lint", message: "The text lint did not pass." }], lint: { findings: [f("1"), f("2")], allowedBy: [] } },
      },
      { ...base, id: "d2", item_id: "b", verdict: "pass", decided_at: "2026-10-06T09:00:00Z", reasons: { failures: [] } },
      { ...base, id: "d3", item_id: "b", verdict: "fail", decided_at: "2026-10-05T09:00:00Z", reasons: { failures: [{ rule: "3", message: "m" }] } },
      {
        ...base, id: "d4", item_id: "c", verdict: "fail", decided_at: "2026-10-04T09:00:00Z",
        reasons: { failures: [{ rule: "5", message: "m" }, { rule: "6", message: "m" }] },
      },
    ];
    expect(latestFailures(rows)).toEqual([
      { itemId: "a", decidedAt: "2026-10-06T10:00:00Z", failureCount: 2 },
      { itemId: "c", decidedAt: "2026-10-04T09:00:00Z", failureCount: 2 },
    ]);
  });
});
