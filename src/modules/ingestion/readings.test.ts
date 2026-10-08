import { describe, expect, it } from "vitest";
import { buildReadings, machineReadingSchema, type ReadingTest } from "./readings";
import type { NewProposal } from "./proposals";
import type { MachineFact } from "./proposed-fact";

// A reading proposal (Plan 2b Task 8, R4): a figure whose label is the one a test watches, in the unit the test uses. It sets only the
// test's reading, its date and its prior; it is never a status. Pure.

const fact = (over: Partial<MachineFact> = {}): MachineFact => ({
  label: "Receivable days", value: 142, valueText: "142", unit: "days", period: "FY26", asOf: "2026-03-31",
  prior: { label: "FY25", value: 131, valueText: "131" }, page: 7, locator: "p. 7", quote: "Receivable days 142 131", basis: "consolidated", topic: "Working capital", statement: "notes",
  ...over,
});
const proposal = (over: Partial<MachineFact> = {}, flags: NewProposal["flags"] = []): NewProposal => ({
  dedupeKey: `k${Math.random()}`, machineValue: fact(over), flags, reason: "core", movedPct: null,
});
const T1: ReadingTest = { id: "T1", metric: "Receivable days", unit: "days" };

describe("buildReadings", () => {
  it("proposes the current value, its date and the prior for a test whose metric is the figure's label", () => {
    const [r] = buildReadings([proposal()], [T1]);
    expect(r).toMatchObject({ testId: "T1", machine: { current: 142, readingAsOf: "2026-03-31", prior: 131, unit: "days" } });
    expect(machineReadingSchema.safeParse(r!.machine).success).toBe(true);
  });

  it("carries what Aksh needs to check it against the page: the label, the period, the printed value and the printed line", () => {
    const [r] = buildReadings([proposal()], [T1]);
    expect(r!.machine).toMatchObject({ label: "Receivable days", period: "FY26", valueText: "142", quote: "Receivable days 142 131", page: 7 });
  });

  it("compares labels the way the relevance filter does: case, numbering and punctuation do not matter", () => {
    const test: ReadingTest = { id: "T2", metric: "Revenue from operations", unit: "₹ cr" };
    expect(buildReadings([proposal({ label: "(a) REVENUE from operations", unit: "₹ cr" })], [test])).toHaveLength(1);
    expect(buildReadings([proposal({ label: "Revenue from operations (net)", unit: "₹ cr" })], [test])).toHaveLength(0);
  });

  it("proposes nothing when the unit differs, so a crore is never read as a day", () => {
    expect(buildReadings([proposal({ unit: "₹ cr" })], [T1])).toEqual([]);
    expect(buildReadings([proposal({ unit: null })], [T1])).toEqual([]);
    expect(buildReadings([proposal({ unit: "DAYS" })], [T1])).toHaveLength(1);
  });

  it("proposes nothing from a flagged figure or one with no date, and nothing for a test with no metric", () => {
    expect(buildReadings([proposal({}, ["value_not_on_page"])], [T1])).toEqual([]);
    expect(buildReadings([proposal({ asOf: null })], [T1])).toEqual([]);
    expect(buildReadings([proposal()], [{ id: "T1", metric: null, unit: "days" }])).toEqual([]);
  });

  it("reads a figure with no prior as prior null", () => {
    expect(buildReadings([proposal({ prior: null })], [T1])[0]!.machine.prior).toBeNull();
  });

  it("keeps the first match for a test on a page (the figures arrive best first) and fills each test once", () => {
    const out = buildReadings(
      [proposal({ value: 142, valueText: "142" }), proposal({ value: 150, valueText: "150", basis: "standalone" }), proposal({ label: "Gross margin", unit: "%", value: 31.4, valueText: "31.4" })],
      [T1, { id: "T2", metric: "Gross margin", unit: "%" }],
    );
    expect(out.map((r) => [r.testId, r.machine.current])).toEqual([["T1", 142], ["T2", 31.4]]);
  });

  it("two tests may watch one metric", () => {
    expect(buildReadings([proposal()], [T1, { id: "T3", metric: "Receivable days", unit: "days" }]).map((r) => r.testId)).toEqual(["T1", "T3"]);
  });
});

describe("machineReadingSchema", () => {
  it("is strict: extra keys, a missing date or a non-finite number are refused", () => {
    const ok = { current: 1, readingAsOf: "2026-03-31", prior: null, unit: "days", label: "x", period: "FY26", valueText: "1", quote: "x 1", page: 3 };
    expect(machineReadingSchema.safeParse(ok).success).toBe(true);
    expect(machineReadingSchema.safeParse({ ...ok, status: "met" }).success).toBe(false);
    expect(machineReadingSchema.safeParse({ ...ok, readingAsOf: null }).success).toBe(false);
    expect(machineReadingSchema.safeParse({ ...ok, current: Number.POSITIVE_INFINITY }).success).toBe(false);
  });
});
