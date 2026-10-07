import { describe, expect, it } from "vitest";
import { PERIOD_RE } from "@/modules/casefile/client";
import { periodFromHeader, unitFromHeader } from "./periods";

describe("periodFromHeader", () => {
  it.each([
    ["Year ended March 31, 2026", "FY26", "2026-03-31"],
    ["As at 31st March, 2026", "FY26", "2026-03-31"],
    ["31.03.2025", "FY25", "2025-03-31"],
    ["Quarter ended June 30, 2025", "Q1 FY26", "2025-06-30"],
    ["Three months ended 31-12-2025", "Q3 FY26", "2025-12-31"],
    ["Quarter ended 30 Sep 2025", "Q2 FY26", "2025-09-30"],
    ["3 months ended 31/03/2026", "Q4 FY26", "2026-03-31"],
    ["Year ended December 31, 2025", "FY25", "2025-12-31"], // calendar-year companies keep the calendar year
    ["FY 2025-26", "FY26", "2026-03-31"],
    ["2025-26", "FY26", "2026-03-31"],
    ["Q1 FY26", "Q1 FY26", "2025-06-30"],
  ])("%s -> %s ending %s", (header, period, asOf) => {
    expect(periodFromHeader(header)).toEqual({ period, asOf });
    expect(period).toMatch(PERIOD_RE);
  });

  it("reads the last date of a header that names two", () => {
    expect(periodFromHeader("Period from April 1, 2025 to March 31, 2026")).toEqual({ period: "FY26", asOf: "2026-03-31" });
  });

  it.each([["Particulars"], [""], [null], ["Note 31"], ["31.13.2025"]])("is null for %j", (header) => {
    expect(periodFromHeader(header as string | null)).toBeNull();
  });
});

describe("unitFromHeader", () => {
  it.each([
    ["(Rs. in crore)", "₹ cr"],
    ["(₹ in Crores)", "₹ cr"],
    ["(Rs. in Cr.)", "₹ cr"],
    ["(₹ in lakhs)", "₹ lakh"],
    ["(Rs. in lacs)", "₹ lakh"],
    ["Rupees in Million", "₹ mn"],
    ["(₹ in billion)", "₹ bn"],
    ["Amount in ₹", "₹"],
    ["All amounts in INR", "₹"],
  ])("%s -> %s", (header, unit) => {
    expect(unitFromHeader(header)).toBe(unit);
  });

  it.each([["Particulars"], [null], [""], ["(₹ in thousands)"], ["(US$ in million)"]])("is null for %j, so a flag is raised rather than a wrong unit", (header) => {
    expect(unitFromHeader(header as string | null)).toBeNull();
  });
});
