import { describe, expect, it } from "vitest";
import { badDates, countDates } from "@/test/iso-dates";
import { buildSeedSnapshot } from "@/test/fakes/showcase-snapshot";
import { buildHomeStats, buildRegister, buildSiteChrome, buildWhatChanged } from "./site";

const s = buildSeedSnapshot();

describe("site view models", () => {
  it("counts files, notes and process items; mistakes stay 0 until Phase 3; streak is counts only", () => {
    const chrome = buildSiteChrome(s);
    expect(chrome.counts).toEqual({ files: 2, notes: 2, process: 1, mistakes: 0 });
    expect(chrome.streak.cells).toHaveLength(30);
    expect(chrome.streak.daysLogged).toBe(4);
    expect(chrome.streak.lastEntry).toBe("2026-10-05");
  });

  it("register: one row per public file, public R-number is the gated ordinal (D11), tests from the live revision", () => {
    expect(buildRegister(s)).toEqual([
      {
        fileNo: "01", company: "Kaveri Pumps (fictional)", symbol: "KAVPUMP", sector: "Capital goods", revNo: 2, revisedOn: "2026-08-20",
        tests: { met: 0, watching: 1, not_met: 1, no_data: 1 }, dataAsOf: "2026-08-22", href: "/companies/kavpump",
      },
      {
        fileNo: "02", company: "Sahyadri Cold Chain (fictional)", symbol: "SAHCOLD", sector: "Transport and logistics", revNo: 1, revisedOn: "2026-08-12",
        tests: { met: 0, watching: 0, not_met: 2, no_data: 0 }, dataAsOf: "2026-08-22", href: "/companies/sahcold",
      },
    ]);
  });

  it("what changed: newest gated revisions, reason first, then what moved", () => {
    const entries = buildWhatChanged(s);
    expect(entries).toHaveLength(5);
    expect(entries[0]).toEqual({
      on: "2026-08-20", kind: "revision", fileNo: "01", subject: { label: "Kaveri Pumps (fictional)", href: "/companies/kavpump" },
      text: "Receivable days rose again in FY26; added a test on the dealer count.", detail: "Revision R2 · 2 sentences changed · figures to 22 Aug 2026",
    });
    expect(entries[1]).toMatchObject({ kind: "new_file", fileNo: "02", detail: "New file · 2 tests · figures to 22 Aug 2026" });
    expect(entries[3]).toMatchObject({ kind: "process", subject: { href: "/process/how-i-keep-a-case-file" } });
  });

  it("home stats are desk-activity counts only (rule 2)", () => {
    expect(buildHomeStats(s)).toMatchObject({
      files: 2, sectors: 2, lastRevised: "2026-08-20", tests: { met: 0, watching: 1, not_met: 3, no_data: 1 }, revisions: 6,
    });
  });

  describe("carried rules", () => {
    it("rule 1: a reading still under the 30-day lag counts as no_data, never as met or not met", () => {
      // FY26 figures (31 Mar 2026) are 15 days old on 15 Apr 2026.
      const early = buildSeedSnapshot("2026-04-15");
      expect(buildRegister(early).map((f) => f.tests)).toEqual([
        { met: 0, watching: 0, not_met: 0, no_data: 3 },
        { met: 0, watching: 0, not_met: 0, no_data: 2 },
      ]);
      expect(buildHomeStats(early).tests).toEqual({ met: 0, watching: 0, not_met: 0, no_data: 5 });
    });

    it("rule 3: a file strip always has dataAsOf, so an item without one is not a file", () => {
      expect(buildRegister(s).every((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.dataAsOf))).toBe(true);
      const undated = { ...s, items: s.items.map((i) => (i.id === "i1" ? { ...i, dataAsOf: null } : i)) };
      expect(buildRegister(undated).map((f) => f.fileNo)).toEqual(["02"]);
      expect(buildSiteChrome(undated).counts.files).toBe(1);
      expect(buildWhatChanged(undated, 10).some((e) => e.fileNo === "01")).toBe(false);
    });

    it("rule 2: every date handed to the site views is a real calendar date", () => {
      const models = [buildSiteChrome(s), buildRegister(s), buildWhatChanged(s, 10), buildHomeStats(s)];
      expect(countDates(models)).toBeGreaterThan(10);
      expect(badDates(models)).toEqual([]);
    });

    it("rule 2: a malformed capture day or today never becomes a view date", () => {
      expect(() => buildSiteChrome({ ...s, today: "2026-02-30" })).toThrow();
      expect(buildSiteChrome({ ...s, captureDays: [] }).streak.lastEntry).toBeNull();
    });
  });
});
