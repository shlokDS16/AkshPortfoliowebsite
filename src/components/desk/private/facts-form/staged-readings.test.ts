import { describe, expect, it } from "vitest";
import { parseFactsSheet } from "@/modules/casefile/client";
import type { StagedReading } from "@/modules/ingestion/client";
import { machineReading } from "@/test/fakes/review-repo";
import { KAVERI } from "@/test/fixtures/casefile";
import { toDraft } from "./draft";
import { mergeReadings } from "./staged";

// A staged reading updates a test's reading, its date and its prior, and nothing else (Plan 2b Task 8, ruling R4): never the status,
// the threshold, the scale, the direction, the last-checked date or the condition in the body.

const base = toDraft(parseFactsSheet(KAVERI.revisions[1].sheet).caseFile);
const t1 = base.tests.find((t) => t.id === "T1")!; // 142 days at 2026-03-31, prior 131, watching, threshold 150
const doc = { id: "d1", title: "Annual report 2026-27", sourceType: "Annual report" as const, filedOn: "2027-05-20", sourceUrl: null, status: "active" as const };
const reading = (id: string, over: Parameters<typeof machineReading>[0] = {}, testId = "T1"): StagedReading => ({ proposalId: id, testId, value: machineReading(over), document: doc });
const NEXT = { current: 158, readingAsOf: "2027-03-31", prior: 142, valueText: "158" };

describe("mergeReadings", () => {
  it("sets the test's reading, its date and its prior, and touches nothing else on the row", () => {
    const out = mergeReadings(base, [reading("r1", NEXT)]);
    const after = out.draft.tests.find((t) => t.id === "T1")!;
    expect(after).toEqual({ ...t1, current: "158", readingAsOf: "2027-03-31", prior: "142" });
    expect(after.status).toBe(t1.status);
    expect(after.lastChecked).toBe(t1.lastChecked);
    expect(out.applied).toEqual([{ testId: "T1", proposalId: "r1" }]);
    expect(out.skipped).toBe(0);
  });

  it("leaves every other row, and the rest of the draft, exactly as it was", () => {
    const out = mergeReadings(base, [reading("r1", NEXT)]);
    expect(out.draft.tests.filter((t) => t.id !== "T1")).toEqual(base.tests.filter((t) => t.id !== "T1"));
    expect({ ...out.draft, tests: [] }).toEqual({ ...base, tests: [] });
  });

  it("keeps the test's own prior when the page gave none", () => {
    const after = mergeReadings(base, [reading("r1", { ...NEXT, prior: null })]).draft.tests[0]!;
    expect(after.prior).toBe(t1.prior);
    expect(after.current).toBe("158");
  });

  it("applies several readings of one test oldest first, so the newest ends up current and the older one is its prior", () => {
    const out = mergeReadings(base, [reading("late", { current: 170, readingAsOf: "2027-09-30", prior: 158 }), reading("early", NEXT)]);
    expect(out.draft.tests[0]).toMatchObject({ current: "170", readingAsOf: "2027-09-30", prior: "158" });
    expect(out.applied.map((a) => a.proposalId)).toEqual(["early", "late"]);
  });

  it("does not move a test back: a reading no newer than the one the test already has stays staged", () => {
    const out = mergeReadings(base, [reading("same", { current: 142, readingAsOf: "2026-03-31" }), reading("older", { current: 120, readingAsOf: "2025-03-31" })]);
    expect(out.draft.tests[0]).toEqual(t1);
    expect(out.applied).toEqual([]);
    expect(out.skipped).toBe(2);
  });

  it("fills a test that has no reading yet", () => {
    const blank = { ...base, tests: [{ ...t1, current: "", readingAsOf: "", prior: "" }] };
    expect(mergeReadings(blank, [reading("r1", { ...NEXT, prior: null })]).draft.tests[0]).toMatchObject({ current: "158", readingAsOf: "2027-03-31", prior: "" });
  });

  it("skips a reading for a test the file does not have, and one whose unit is no longer the test's", () => {
    const out = mergeReadings(base, [reading("gone", NEXT, "T9"), reading("unit", { ...NEXT, unit: "₹ cr" })]);
    expect(out.draft).toEqual(base);
    expect(out.applied).toEqual([]);
    expect(out.skipped).toBe(2);
  });

  it("compares units the way the machine did: case and spacing do not matter", () => {
    expect(mergeReadings(base, [reading("r1", { ...NEXT, unit: " DAYS " })]).applied).toHaveLength(1);
  });
});
