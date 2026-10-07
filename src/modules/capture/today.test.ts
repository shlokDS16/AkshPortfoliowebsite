import { describe, expect, it } from "vitest";
import { groupTodayByCompany } from "./today";
import type { CaptureListEntry } from "./types";

const capture = (id: string, createdAt: string, company: { id: string; symbol: string } | null): CaptureListEntry => ({
  id,
  rawText: id,
  createdAt,
  itemId: null,
  companyId: company?.id ?? null,
  companySymbol: company?.symbol ?? null,
  companyName: company?.symbol ?? null,
  parseError: null,
  parsedMissing: false,
});

describe("groupTodayByCompany", () => {
  it("keeps only today's captures (IST) and puts 'No company' last", () => {
    const tcs = { id: "c-tcs", symbol: "TCS" };
    const infy = { id: "c-infy", symbol: "INFY" };
    const groups = groupTodayByCompany(
      [
        capture("1", "2026-10-04T10:00:00Z", tcs),
        capture("2", "2026-10-04T09:00:00Z", null),
        capture("3", "2026-10-04T08:00:00Z", infy),
        capture("4", "2026-10-04T07:00:00Z", tcs),
        capture("5", "2026-10-03T10:00:00Z", tcs), // 15:30 IST on 3 Oct
      ],
      "2026-10-04",
    );
    expect(groups.map((g) => [g.label, g.entries.map((e) => e.id)])).toEqual([
      ["INFY", ["3"]],
      ["TCS", ["1", "4"]],
      ["No company", ["2"]],
    ]);
  });

  it("uses the IST calendar day, so 00:30 IST belongs to the new day", () => {
    const tcs = { id: "c-tcs", symbol: "TCS" };
    const groups = groupTodayByCompany([capture("1", "2026-10-03T19:00:00Z", tcs)], "2026-10-04");
    expect(groups).toHaveLength(1);
  });

  it("returns nothing when there are no captures today", () => {
    expect(groupTodayByCompany([capture("1", "2026-10-01T10:00:00Z", null)], "2026-10-04")).toEqual([]);
  });
});
