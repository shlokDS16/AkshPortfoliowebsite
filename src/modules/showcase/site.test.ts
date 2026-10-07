import { describe, expect, it } from "vitest";
import { badDates, countDates } from "@/test/iso-dates";
import { buildFiguresAfterDataAsOfSnapshot, buildSeedSnapshot } from "@/test/fakes/showcase-snapshot";
import { buildFileView } from "./file";
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
      files: 2, sectors: 2, lastRevised: "2026-08-20", tests: { met: 0, watching: 1, not_met: 3, no_data: 1 }, revisions: 3,
    });
  });

  it("M6: the Revisions tile counts case-file revisions only (3 file revisions; the 3 note revisions are not counted)", () => {
    expect(s.revisions).toHaveLength(6);
    expect(buildHomeStats(s).revisions).toBe(3);
  });

  it("M4: a company with a public thesis and a public case study is one register row, the thesis its page serves", () => {
    const thesis = s.items.find((i) => i.id === "i1")!;
    const caseStudy = { ...thesis, id: "i3", kind: "case_study" as const, slug: "kavpump-case", revisionId: "r3a", fileNo: 3, revisedAt: "2026-09-01T05:00:00Z" };
    const both = {
      ...s,
      items: [...s.items, caseStudy],
      revisions: [...s.revisions, { ...s.revisions[0], id: "r3a", itemId: "i3", createdAt: "2026-09-01T05:00:00Z" }],
    };
    expect(buildRegister(both).map((f) => [f.fileNo, f.href])).toEqual([["01", "/companies/kavpump"], ["02", "/companies/sahcold"]]);
    expect(buildSiteChrome(both).counts.files).toBe(2);
    expect(buildHomeStats(both)).toMatchObject({ files: 2, lastRevised: "2026-08-20", revisions: 3 });
    // The page keeps serving the thesis, and with the thesis gone the case study takes the company's one row.
    expect(buildFileView(both, "kavpump")?.fileNo).toBe("01");
    const caseOnly = { ...both, items: both.items.filter((i) => i.id !== "i1") };
    expect(buildRegister(caseOnly).map((f) => f.fileNo)).toEqual(["02", "03"]);
    expect(buildFileView(caseOnly, "kavpump")?.fileNo).toBe("03");
  });

  describe("carried rules", () => {
    it("rule 1 (defence in depth): a reading still under the 30-day lag counts as no_data, never as met or not met", () => {
      // FY26 figures (31 Mar 2026) are 15 days old on 15 Apr 2026; the gate would block this state (rule 3a).
      const early = buildFiguresAfterDataAsOfSnapshot();
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

    it("rules 3 and 4, defence in depth: a file whose dataAsOf is under 30 days old on today is not a file", () => {
      // 22 Aug + 30 days = 21 Sep.
      expect(buildRegister(buildSeedSnapshot("2026-09-20")).map((f) => f.fileNo)).toEqual([]);
      expect(buildRegister(buildSeedSnapshot("2026-09-21")).map((f) => f.fileNo)).toEqual(["01", "02"]);
      const young = buildSiteChrome(buildSeedSnapshot("2026-09-20"));
      expect(young.counts.files).toBe(0);
      expect(buildWhatChanged(buildSeedSnapshot("2026-09-20"), 10).some((e) => e.fileNo !== null)).toBe(false);
      expect(buildHomeStats(buildSeedSnapshot("2026-09-20"))).toMatchObject({ files: 0, lastRevised: null });
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

  describe("what changed", () => {
    it("a note revision after the first with no reason reads 'Revised.', the first reads 'First version.'", () => {
      const note = s.items.find((i) => i.slug === "how-to-read-receivable-days")!;
      const revisions = [
        ...s.revisions.filter((r) => r.itemId !== note.id),
        { id: "rn0a", itemId: note.id, revNo: 1, bodyMd: "a", structured: {}, changeReason: null, createdAt: "2026-09-01T05:00:00Z" },
        { id: "rn0b", itemId: note.id, revNo: 2, bodyMd: "b", structured: {}, changeReason: null, createdAt: "2026-09-02T05:00:00Z" },
      ];
      const items = s.items.map((i) => (i.id === note.id ? { ...i, revisionId: "rn0b" } : i));
      const entries = buildWhatChanged({ ...s, items, revisions }, 10).filter((e) => e.subject.href === "/notes/how-to-read-receivable-days");
      expect(entries.map((e) => [e.detail, e.text])).toEqual([["Learning note · R2", "Revised."], ["Learning note · R1", "First version."]]);
    });

    it("stops after `limit` entries: older revisions are not diffed", () => {
      expect(buildWhatChanged(s, 1)).toHaveLength(1);
      expect(buildWhatChanged(s, 0)).toEqual([]);
      // A revision beyond the limit whose body would throw when read is never touched.
      const poisoned = { ...s, revisions: s.revisions.map((r) => (r.id === "r2a" ? { ...r, get bodyMd(): string { throw new Error("diffed"); } } : r)) };
      expect(() => buildWhatChanged(poisoned, 1)).not.toThrow();
    });
  });
});
