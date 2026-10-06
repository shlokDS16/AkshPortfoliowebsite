import { describe, expect, it } from "vitest";
import type { ViewBlockData } from "@/lib/view-types";
import { badDates, countDates } from "@/test/iso-dates";
import { lintText } from "@/modules/compliance";
import { figureDates, parseFactsSheet } from "@/modules/casefile/client";
import { KAVERI } from "@/test/fixtures/casefile";
import { buildFiguresAfterDataAsOfSnapshot, buildSeedSnapshot } from "@/test/fakes/showcase-snapshot";
import { buildFileView, buildShareCard } from "./file";
import type { PublicSnapshot } from "./types";

const s = buildSeedSnapshot();
const live = () => buildFileView(s, "kavpump")!;

describe("buildFileView", () => {
  const file = buildFileView(s, "kavpump")!;

  it("assembles the B+ file: dateline, read first, view, tests, facts, exhibits, history", () => {
    expect(file).toMatchObject({ fileNo: "01", company: "Kaveri Pumps (fictional)", holdsPosition: "no", dataAsOf: "2026-08-22", revNo: 2 });
    expect(file.oneLiner).toBe("Fictional maker of farm and municipal water pumps, used to test the desk.");
    expect(file.dateline).toEqual({ revNo: 2, revCount: 2, revisedOn: "2026-08-20", firstWrittenOn: "2026-08-05", dataAsOf: "2026-08-22" });
    expect(file.readFirst).toEqual([{ title: "How to read receivable days", href: "/notes/how-to-read-receivable-days", minutes: 1 }]);
    expect(file.tests.map((t) => t.status)).toEqual(["watching", "not_met", "no_data"]);
    expect(file.factCount).toBe(4);
    expect(file.exhibits[0].title).toBe("Receivable days, FY22 to FY26");
    expect(file.scenario?.frozenAtRev).toBe(2);
    expect(file.sections).toEqual([
      { id: "view", label: "View" },
      { id: "tests", label: "Tests", count: 3 },
      { id: "facts", label: "Facts", count: 4 },
      { id: "history", label: "History", count: "R2" },
    ]);
  });

  it("history: diff between the last two gated revisions and a log with reasons, newest first", () => {
    expect(file.diff?.from).toEqual({ revNo: 1, on: "2026-08-05" });
    expect(file.diff?.to).toEqual({ revNo: 2, on: "2026-08-20" });
    expect(file.diff?.groups).toHaveLength(2);
    expect(file.log.map((l) => [l.revNo, l.reason])).toEqual([
      [2, "Receivable days rose again in FY26; added a test on the dealer count."],
      [1, "First version."],
    ]);
  });

  it("a single-revision file has no diff; an unknown slug is null", () => {
    expect(buildFileView(s, "sahcold")?.diff).toBeNull();
    expect(buildFileView(s, "nope")).toBeNull();
  });

  it("the share card carries only linted fields and dates", () => {
    expect(buildShareCard(s, "kavpump")).toEqual({
      fileNo: "01", revNo: 2, company: "Kaveri Pumps (fictional)", title: "Kaveri Pumps: does pricing power survive slower dealer payments",
      learningObjective: "Learn to read receivable days next to margins when judging pricing power.", revisedOn: "2026-08-20", dataAsOf: "2026-08-22",
    });
  });
});

const chipsOf = (blocks: ViewBlockData[]) =>
  blocks.flatMap((b) => (b.kind === "p" ? b.inline : b.kind === "ul" ? b.items.flat() : [])).flatMap((x) => (typeof x === "string" ? [] : [x.chip]));

/** The seed snapshot with every source of file 01 pointing at `url`. */
function withSourceUrl(url: string): PublicSnapshot {
  return {
    ...s,
    items: s.items.map((i) => {
      if (i.id !== "i1") return i;
      const cf = i.structured as { sources: object[] };
      return { ...i, structured: { ...cf, sources: cf.sources.map((src) => ({ ...src, url })) } };
    }),
  };
}

describe("carried rules on the public file view (defence in depth: figures dated after data_as_of, which publish rule 3a blocks)", () => {
  // FY26 figures are dated 31 Mar 2026: 15 days old on 15 Apr 2026, so withheld until 30 Apr 2026.
  const early = buildFileView(buildFiguresAfterDataAsOfSnapshot(), "kavpump")!;

  it("rule 1: tests are built for the public audience, so a withheld reading cannot show which side of the line it is on", () => {
    expect(early.tests.map((t) => [t.status, t.reading, t.meter])).toEqual([["no_data", null, null], ["no_data", null, null], ["no_data", null, null]]);
    expect(live().tests.map((t) => t.status)).toEqual(["watching", "not_met", "no_data"]);
  });

  it("rule 2: every date handed to the view is a real calendar date", () => {
    const all = [live(), buildShareCard(s, "kavpump"), early];
    expect(countDates(all)).toBeGreaterThan(40);
    expect(badDates(all)).toEqual([]);
  });

  it("rule 3: the file carries dataAsOf at the top level, in the dateline and on the share card", () => {
    expect(live().dataAsOf).toBe("2026-08-22");
    expect(live().dateline.dataAsOf).toBe("2026-08-22");
    expect(buildShareCard(s, "kavpump")?.dataAsOf).toBe("2026-08-22");
    const undated: PublicSnapshot = { ...s, items: s.items.map((i) => (i.id === "i1" ? { ...i, dataAsOf: null } : i)) };
    expect(buildFileView(undated, "kavpump")).toBeNull();
    expect(buildShareCard(undated, "kavpump")).toBeNull();
  });

  it("rule 4: the scenario table is public only once dataAsOf is 30 days old in IST (22 Aug + 30 = 21 Sep)", () => {
    // Before that day the whole file is withheld, so its scenario cannot reach a page either.
    expect(buildFileView(buildSeedSnapshot("2026-09-20"), "kavpump")).toBeNull();
    expect(buildFileView(buildSeedSnapshot("2026-09-21"), "kavpump")?.scenario).toMatchObject({ frozenAtRev: 2, dataAsOf: "2026-08-22" });
    expect(early.scenario).toMatchObject({ frozenAtRev: 2, dataAsOf: "2026-03-01" }); // lagged in this fixture
    expect(buildShareCard(buildSeedSnapshot("2026-09-20"), "kavpump")).toBeNull();
  });

  it("rule 5: LedgerRow values[i] is null wherever withheld[i] is set", () => {
    const rows = early.exhibits.flatMap((x) => x.ledger.rows);
    expect(rows.some((r) => r.withheld.some(Boolean))).toBe(true);
    for (const row of rows) row.withheld.forEach((w, i) => w && expect(row.values[i]).toBeNull());
    expect(live().exhibits[0].ledger.rows[0].withheld.every((w) => w === null)).toBe(true);
  });

  it("rule 6: a withheld chart point has y null and the date it clears", () => {
    const points = early.exhibits[0].chart.series[0].points;
    expect(points.at(-1)).toEqual({ x: "FY26", y: null, withheld: true, withheldUntil: "2026-04-30" });
    expect(points.filter((p) => p.withheld).every((p) => p.y === null && "withheldUntil" in p)).toBe(true);
  });

  it("rule 7: series labels, summaries, facts and chips never carry a withheld figure", () => {
    const exhibit = early.exhibits[0];
    expect(exhibit.chart.summary).not.toContain("142");
    expect(JSON.stringify(exhibit)).not.toMatch(/\b142\b/);
    expect(exhibit.chart.dataCap?.label).toBe("Data to 31 Mar 2025");
    const withheldRows = early.factGroups.flatMap((g) => g.rows).filter((r) => r.withheldUntil);
    expect(withheldRows).toHaveLength(4);
    expect(withheldRows.every((r) => r.value === null && r.prior === null)).toBe(true);
    const chips = chipsOf(early.view);
    expect(chips.length).toBeGreaterThan(0);
    for (const c of chips) expect(c.card).toMatchObject({ figure: "", prior: null, quote: null, withheldUntil: "2026-04-30" });
  });

  it("rule 8: an https source link survives; javascript, ftp and data links are dropped everywhere", () => {
    const ok = buildFileView(withSourceUrl("https://example.com/ar.pdf"), "kavpump")!;
    expect(ok.sources).toHaveLength(1);
    expect(ok.sources[0].url).toBe("https://example.com/ar.pdf");
    for (const bad of ["javascript:alert(1)", "ftp://example.com/a", "data:text/html,x"]) {
      const v = buildFileView(withSourceUrl(bad), "kavpump")!;
      expect(v.sources).toHaveLength(1);
      expect(v.sources[0].url).toBeUndefined();
      expect(v.factGroups.flatMap((g) => g.rows).every((r) => r.source.url === undefined)).toBe(true);
      expect(chipsOf(v.view).every((c) => c.card.source.url === undefined)).toBe(true);
      expect(v.exhibits.flatMap((x) => x.ledger.periods).every((p) => p.source.url === undefined)).toBe(true);
    }
  });
});

describe("a realistic file: today at least 30 days after dataAsOf, every figure dated at or before dataAsOf", () => {
  const view = live();
  const cf = parseFactsSheet(KAVERI.revisions[1].sheet).caseFile;

  it("meets the publish gate's rule 3a, so the gate would have let it through", () => {
    expect(view.dataAsOf).toBe("2026-08-22");
    expect(figureDates(cf).length).toBeGreaterThan(5);
    expect(figureDates(cf).every((d) => d <= view.dataAsOf)).toBe(true);
    const lint = lintText({
      revisionId: "r", kind: "thesis", title: "T", slug: "t", learningObjective: "Learn to read a file.", bodyMd: "V.\n\n## What would prove me wrong\n- T1: x.",
      structured: cf as unknown as Record<string, unknown>, changeReason: null, companyName: null, companyOneLiner: null, themeName: null,
      companyId: "c1", holdsPosition: "no", dataAsOf: view.dataAsOf, today: "2026-10-06", allowances: new Set(),
    });
    expect(lint.findings.filter((f) => f.field === "structured")).toEqual([]);
  });

  it("the whole view carries no figure of a fact dated after dataAsOf, and shows the ones that are old enough", () => {
    const json = JSON.stringify(view);
    const after = cf.facts.filter((f) => f.asOf > view.dataAsOf);
    expect(after).toEqual([]);
    for (const f of after) expect(json).not.toContain(String(f.value));
    // Every fact is old enough here, so its figure is on the page (guards against a vacuous pass).
    expect(cf.facts.length).toBe(4);
    expect(view.factGroups.flatMap((g) => g.rows).every((r) => r.value !== null && r.withheldUntil === null)).toBe(true);
    expect(json).toContain("2,150");
  });
});
