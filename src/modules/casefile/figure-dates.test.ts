import { describe, expect, it } from "vitest";
import { KAVERI } from "@/test/fixtures/casefile";
import { figureDates, latestFigureDate } from "./figure-dates";
import { parseFactsSheet } from "./sheet";

const cf = parseFactsSheet(KAVERI.revisions[1].sheet).caseFile;

describe("figureDates (rule 3a: every dated figure)", () => {
  it("collects fact dates, reading dates and exhibit period ends", () => {
    expect(latestFigureDate(cf)).toBe("2026-03-31");
    expect(new Set(figureDates(cf))).toEqual(new Set(["2026-03-31", "2025-03-31", "2024-03-31", "2023-03-31", "2022-03-31"]));
  });

  it("sees a later fact, a later reading and a later exhibit point", () => {
    const fact = { ...cf, facts: [...cf.facts, { ...cf.facts[0], id: "F9", asOf: "2026-09-30" }] };
    expect(latestFigureDate(fact)).toBe("2026-09-30");
    const reading = { ...cf, tests: [{ ...cf.tests[0], readingAsOf: "2026-08-01" }, ...cf.tests.slice(1)] };
    expect(latestFigureDate(reading)).toBe("2026-08-01");
    const exhibit = { ...cf, exhibits: [{ ...cf.exhibits[0], points: [...cf.exhibits[0].points, { period: "Q1 FY27", value: 150 }] }] };
    expect(latestFigureDate(exhibit)).toBe("2026-06-30");
  });

  it("ignores an exhibit point with no value, and reads unreadable data as no figures", () => {
    const empty = { ...cf, exhibits: [{ ...cf.exhibits[0], points: [...cf.exhibits[0].points, { period: "FY30", value: null }] }] };
    expect(latestFigureDate(empty)).toBe("2026-03-31");
    expect(latestFigureDate({ not: "a case file" })).toBeNull();
    expect(latestFigureDate({})).toBeNull();
  });
});
