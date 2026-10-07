import { describe, expect, it } from "vitest";
import { KAVERI } from "@/test/fixtures/casefile";
import { fiscalYearEnd, formatFigure } from "./figures";
import { isLagged, withheldUntil } from "./lag";
import { parseFactsSheet } from "./sheet";
import { splitThesisBody } from "./body";
import type { CaseFile } from "./schema";
import { buildExhibits, buildFactGroups, buildKillTests, buildScenario, buildSourceList, buildViewBlocks, chipFor, niceTicks } from "./view";

const TODAY = "2026-10-06";
const cf = parseFactsSheet(KAVERI.revisions[1].sheet).caseFile;
const R1_VIEW = splitThesisBody(KAVERI.revisions[0].bodyMd).viewMd;
const CONDITIONS = splitThesisBody(KAVERI.revisions[1].bodyMd).conditions;

const withFacts = (patch: (f: CaseFile["facts"][number]) => Partial<CaseFile["facts"][number]>): CaseFile => ({
  ...cf,
  facts: cf.facts.map((f) => ({ ...f, ...patch(f) })),
});
const withTests = (patch: Partial<CaseFile["tests"][number]>): CaseFile => ({ ...cf, tests: cf.tests.map((t) => (t.id === "T1" ? { ...t, ...patch } : t)) });
const withSourceUrl = (url: string | null): CaseFile => ({ ...cf, sources: cf.sources.map((s) => ({ ...s, url })) });
const withLastPoint = (value: number): CaseFile => ({
  ...cf,
  exhibits: cf.exhibits.map((x) => ({ ...x, points: x.points.map((p) => (p.period === "FY26" ? { ...p, value } : p)) })),
});

/** The seeded Kaveri file (F1-F4, all FY26); `topics` files facts under a topic heading, as G rows would. */
const fixtureCaseFile = ({ topics = {} }: { topics?: Record<string, string> } = {}): CaseFile => withFacts((f) => ({ topic: topics[f.id] ?? null }));

describe("figures and lag", () => {
  it("formats figures the Indian way and maps fiscal periods to year ends", () => {
    expect(formatFigure(1284, "₹ cr")).toBe("₹1,284 cr");
    expect(formatFigure(31.4, "%")).toBe("31.4%");
    expect(formatFigure(142, "days")).toBe("142 days");
    expect(fiscalYearEnd("FY26")).toBe("2026-03-31");
    expect(fiscalYearEnd("Q1 FY27")).toBe("2026-06-30");
  });

  it("mirrors SQL private.is_lagged: lagged on or before today - 30", () => {
    expect(isLagged("2026-09-06", TODAY)).toBe(true);
    expect(isLagged("2026-09-07", TODAY)).toBe(false);
    expect(withheldUntil("2026-09-20", TODAY)).toBe("2026-10-20");
    expect(withheldUntil("2026-03-31", TODAY)).toBeNull();
  });
});

describe("view builders", () => {
  it("turns [F1] into a chip whose card carries figure, prior, quote, source and as-of", () => {
    const blocks = buildViewBlocks(R1_VIEW, cf, TODAY);
    const first = blocks[0];
    expect(first.kind).toBe("p");
    const chip = first.kind === "p" ? first.inline.find((x) => typeof x !== "string") : undefined;
    expect(chip).toMatchObject({
      chip: { label: "S1 p. 131", card: { figure: "₹1,284 cr", prior: { label: "FY25", value: "₹1,102 cr" }, quote: "Revenue from operations rose to ₹1,284 crore.", asOf: "2026-03-31", withheldUntil: null } },
    });
  });

  it("never puts a withheld number into the page (rule 3, D26)", () => {
    const young = { ...cf, facts: cf.facts.map((f) => (f.id === "F1" ? { ...f, asOf: "2026-09-25" } : f)) };
    const chip = chipFor(young.facts[0], young, TODAY);
    expect(chip.card).toMatchObject({ figure: "", prior: null, quote: null, withheldUntil: "2026-10-25" });
    const row = buildFactGroups(young, TODAY)[0].rows[0];
    expect(row).toMatchObject({ value: null, prior: null, withheldUntil: "2026-10-25" });
    expect(JSON.stringify(buildFactGroups(young, TODAY))).not.toContain("1,284");
  });

  it("strips withheld figures from the whole view model, not just the chip and row (rule d)", () => {
    const young = withFacts((f) => ({ asOf: "2026-09-25", value: 98765, prior: f.prior ? { ...f.prior, value: 87654 } : null }));
    const json = JSON.stringify([buildViewBlocks(R1_VIEW, young, TODAY), buildFactGroups(young, TODAY), buildSourceList(young)]);
    for (const leaked of ["98,765", "87,654", "98765", "87654", "Revenue from operations rose"]) expect(json).not.toContain(leaked);
  });

  it("groups by topic first, then by period for facts without a topic, with the period on topic rows", () => {
    const cf = fixtureCaseFile({ topics: { F1: "P&L", F2: "Working capital", F3: "Working capital" } }); // F4 has no topic
    const groups = buildFactGroups(cf, "2026-10-07");
    expect(groups.map((g) => g.title)).toEqual(["P&L", "Working capital", "FY26"]);
    expect(groups[1]?.rows.map((r) => r.period)).toEqual(["FY26", "FY26"]);
    expect(groups[2]?.rows[0]?.period).toBeNull();
  });

  it("dates a topic group by its latest fact, and still withholds a young fact inside it (rule 3)", () => {
    const young = fixtureCaseFile({ topics: { F3: "Working capital", F4: "Working capital" } });
    young.facts[3] = { ...young.facts[3], period: "Q1 FY27", asOf: "2026-09-25" };
    const [wc] = buildFactGroups(young, "2026-10-07");
    expect(wc).toMatchObject({ title: "Working capital", asOf: "2026-09-25" });
    expect(wc.rows.map((r) => [r.id, r.period, r.value])).toEqual([["F3", "FY26", "142"], ["F4", "Q1 FY27", null]]);
    expect(JSON.stringify(wc)).not.toContain("2,150");
  });

  it("joins Aksh's conditions with the sheet's readings by T-number; a test without a reading is No data", () => {
    const tests = buildKillTests(CONDITIONS, cf, TODAY, "2026-09-01", "public");
    expect(tests.map((t) => [t.id, t.status])).toEqual([["T1", "watching"], ["T2", "not_met"], ["T3", "no_data"]]);
    expect(tests[0]).toMatchObject({ condition: "Receivable days stay above 150 for two straight years.", reading: "142 days" });
    expect(tests[0].meter?.labels.threshold).toBe("Test 1 line: 150 days");
    expect(tests[2]).toMatchObject({ reading: null, meter: null, lastChecked: "2026-09-01" });
  });

  it("builds exhibits with a threshold from the linked test, a data cap and a table", () => {
    const [ex] = buildExhibits("01", "Kaveri Pumps (fictional)", cf, TODAY);
    expect(ex).toMatchObject({ fileNo: "01", n: 1, title: "Receivable days, FY22 to FY26", dataTo: "2026-03-31" });
    expect(ex.chart.thresholds).toEqual([{ y: 150, label: "Test 1 line: 150 days" }]);
    expect(ex.chart.dataCap).toEqual({ x: "FY26", label: "Data to 31 Mar 2026" });
    expect(ex.chart.yTicks).toEqual([75, 100, 125, 150]);
    expect(ex.ledger.rows[0].values).toEqual(["81", "95", "118", "131", "142"]);
    expect(ex.chart.summary).toBe("Receivable days, FY22 to FY26: from 81 days in FY22 to 142 days in FY26; test 1 line at 150 days.");
  });

  it("picks round chart ticks", () => {
    expect(niceTicks(81, 150)).toEqual([75, 100, 125, 150]);
    expect(niceTicks(71, 88)).toEqual([70, 80, 90]);
  });
});

describe("rule 3 across the builders (d, e)", () => {
  const YOUNG = "2026-04-15"; // FY26 ended 31 Mar 2026: 15 days old, clears on 30 Apr 2026

  it("a withheld chart point carries no y, the date it clears, and no figure anywhere in the exhibit", () => {
    const [ex] = buildExhibits("01", "Kaveri Pumps (fictional)", withLastPoint(9876), YOUNG);
    const points = ex.chart.series[0].points;
    expect(points[4]).toEqual({ x: "FY26", y: null, withheld: true, withheldUntil: "2026-04-30" });
    expect(points.slice(0, 4).every((p) => !p.withheld && typeof p.y === "number")).toBe(true);
    expect(ex.ledger.rows[0].values[4]).toBeNull();
    expect(ex.ledger.rows[0].withheld[4]).toBe("2026-04-30");
    expect(ex.key.map((k) => k.mark)).toContain("withheld");
    expect(JSON.stringify(ex)).not.toContain("9876");
    expect(JSON.stringify(ex)).not.toContain("9,876");
  });

  it("the summary, labels, data cap and axis ignore withheld values", () => {
    const [ex] = buildExhibits("01", "Kaveri Pumps (fictional)", withLastPoint(9876), YOUNG);
    expect(ex.chart.summary).toBe("Receivable days, FY22 to FY26: from 81 days in FY22 to 131 days in FY25; test 1 line at 150 days.");
    expect(ex.chart.dataCap).toEqual({ x: "FY25", label: "Data to 31 Mar 2025" });
    expect(ex.dataTo).toBe("2025-03-31");
    expect(Math.max(...ex.chart.yTicks)).toBeLessThan(1000);
  });

  it("an exhibit with nothing old enough says so and shows no figure", () => {
    const allYoung: CaseFile = { ...cf, exhibits: cf.exhibits.map((x) => ({ ...x, points: [{ period: "FY26", value: 4321 }, { period: "FY27", value: 5432 }] })) };
    const [ex] = buildExhibits("01", "Kaveri Pumps (fictional)", allYoung, YOUNG);
    expect(ex.chart.summary).toBe("Receivable days, FY22 to FY26: no figures old enough to show yet.");
    expect(ex.chart.dataCap).toBeNull();
    expect(ex.ledger.rows[0].values).toEqual([null, null]);
    expect(JSON.stringify(ex)).not.toMatch(/4,?321|5,?432/);
  });

  it("dataTo is null, not today, when no figure is old enough", () => {
    const allYoung: CaseFile = { ...cf, exhibits: cf.exhibits.map((x) => ({ ...x, points: [{ period: "FY26", value: 4321 }, { period: "FY27", value: 5432 }] })) };
    expect(buildExhibits("01", "Kaveri", allYoung, YOUNG)[0].dataTo).toBeNull();
  });

  it("an unreadable period counts as withheld, never as old", () => {
    const odd: CaseFile = { ...cf, exhibits: cf.exhibits.map((x) => ({ ...x, points: [{ period: "FY25", value: 1 }, { period: "H1 2026", value: 8765 }] })) };
    const [ex] = buildExhibits("01", "Kaveri", odd, TODAY);
    expect(ex.chart.series[0].points[1]).toMatchObject({ y: null, withheld: true });
    expect(JSON.stringify(ex)).not.toContain("8765");
  });

  it("a withheld reading drops the number and the meter; Aksh's condition text stays his", () => {
    const young = withTests({ readingAsOf: "2026-09-25", current: 4242, prior: 3131 });
    const [t1] = buildKillTests(CONDITIONS, young, TODAY, "2026-09-01", "public");
    expect(t1).toMatchObject({ reading: null, meter: null, withheldUntil: "2026-10-25" });
    expect(JSON.stringify(t1)).not.toMatch(/4,?242|3,?131/);
    expect(t1.condition).toBe("Receivable days stay above 150 for two straight years.");
  });

  it("a reading with no date cannot be shown: its age is unknown", () => {
    const [t1] = buildKillTests(CONDITIONS, withTests({ readingAsOf: null, current: 4242 }), TODAY, "2026-09-01", "public");
    expect(t1).toMatchObject({ reading: null, meter: null, readingAsOf: null });
    expect(JSON.stringify(t1)).not.toContain("4,242");
  });
});

describe("status never reveals a withheld reading (public) but desk keeps it", () => {
  const status = (patch: Partial<CaseFile["tests"][number]>, audience: "public" | "desk") =>
    buildKillTests(CONDITIONS, withTests({ status: "not_met", ...patch }), TODAY, "2026-09-01", audience)[0].status;

  it("public: a withheld reading reports no_data", () => {
    expect(status({ readingAsOf: "2026-09-25" }, "public")).toBe("no_data");
  });
  it("public: a reading of unknown age reports no_data", () => {
    expect(status({ readingAsOf: null }, "public")).toBe("no_data");
    expect(status({ readingAsOf: "2026-02-30" }, "public")).toBe("no_data");
  });
  it("public: a showable reading keeps its status", () => {
    expect(status({ readingAsOf: "2026-03-31" }, "public")).toBe("not_met");
  });
  it("desk: a withheld or undated reading keeps the true status, and the figure stays hidden", () => {
    expect(status({ readingAsOf: "2026-09-25" }, "desk")).toBe("not_met");
    expect(status({ readingAsOf: null }, "desk")).toBe("not_met");
    const [t] = buildKillTests(CONDITIONS, withTests({ readingAsOf: "2026-09-25", current: 4242 }), TODAY, "2026-09-01", "desk");
    expect(t.reading).toBeNull();
  });
});

describe("source links (c)", () => {
  const BAD = ["javascript:alert(1)", "JAVASCRIPT:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "data:text/html,x", "vbscript:x", "ftp://x.com/a", "mailto:a@b.c", "//evil.com", "/relative"];

  it.each(BAD)("drops %j everywhere a source is shown", (url) => {
    const c = withSourceUrl(url);
    const [ex] = buildExhibits("01", "Kaveri", c, TODAY);
    const all = [buildViewBlocks(R1_VIEW, c, TODAY), buildFactGroups(c, TODAY), buildSourceList(c), ex];
    expect(buildSourceList(c)[0].url).toBeUndefined();
    expect(JSON.stringify(all)).not.toMatch(/javascript|script:|data:|ftp:|mailto|evil|relative/i);
    expect(JSON.stringify(all)).not.toContain('"url"');
  });

  it("keeps http and https", () => {
    expect(buildSourceList(withSourceUrl("https://www.bseindia.com/a.pdf"))[0].url).toBe("https://www.bseindia.com/a.pdf");
    expect(buildSourceList(withSourceUrl("http://example.org/x"))[0].url).toBe("http://example.org/x");
    expect(buildFactGroups(withSourceUrl("https://example.org/x"), TODAY)[0].rows[0].source.url).toBe("https://example.org/x");
    expect(buildSourceList(withSourceUrl(null))[0].url).toBeUndefined();
  });
});

describe("dates handed to views are real dates (a)", () => {
  const BAD_DATE = "2026-02-30";

  it("skips a fact whose date cannot be read instead of throwing", () => {
    const broken = withFacts((f) => (f.id === "F1" ? { asOf: BAD_DATE } : {}));
    expect(() => buildFactGroups(broken, TODAY)).not.toThrow();
    expect(buildFactGroups(broken, TODAY).flatMap((g) => g.rows.map((r) => r.id))).not.toContain("F1");
    expect(JSON.stringify(buildFactGroups(broken, TODAY))).not.toContain(BAD_DATE);
    const blocks = buildViewBlocks(R1_VIEW, broken, TODAY);
    expect(JSON.stringify(blocks)).toContain("[F1]");
    expect(JSON.stringify(blocks)).not.toContain(BAD_DATE);
    expect(() => chipFor(broken.facts[0], broken, TODAY)).toThrow(RangeError);
  });

  it("falls back for a bad last-checked date and treats a bad reading date as unknown", () => {
    const broken = withTests({ lastChecked: "soon", readingAsOf: BAD_DATE });
    const [t1] = buildKillTests(CONDITIONS, broken, TODAY, "2026-09-01", "public");
    expect(t1).toMatchObject({ lastChecked: "2026-09-01", readingAsOf: null, reading: null, meter: null });
  });

  it("omits a bad filing date from a source", () => {
    const broken: CaseFile = { ...cf, sources: cf.sources.map((s) => ({ ...s, filedOn: BAD_DATE })) };
    const list = buildSourceList(broken);
    expect(list[0].filedOn).toBeUndefined();
    expect(JSON.stringify([list, buildFactGroups(broken, TODAY), buildExhibits("01", "K", broken, TODAY)])).not.toContain(BAD_DATE);
  });

  it("refuses bad dates the caller supplies rather than passing them on", () => {
    expect(() => buildKillTests(CONDITIONS, cf, "yesterday", "2026-09-01", "public")).toThrow(RangeError);
    expect(() => buildKillTests(CONDITIONS, cf, TODAY, "soon", "public")).toThrow(RangeError);
    expect(() => buildFactGroups(cf, "yesterday")).toThrow(RangeError);
    expect(() => buildViewBlocks(R1_VIEW, cf, "yesterday")).toThrow(RangeError);
    expect(() => buildExhibits("01", "K", cf, "yesterday")).toThrow(RangeError);
    expect(() => buildScenario(cf, 2, "soon")).toThrow(RangeError);
  });
});

describe("scenario (f)", () => {
  it("passes operating rows through with the freeze revision and data date", () => {
    expect(buildScenario(cf, 2, "2026-03-31")).toMatchObject({ frozenAtRev: 2, dataAsOf: "2026-03-31", names: ["Slow", "Base", "Fast"] });
    expect(buildScenario(parseFactsSheet(KAVERI.revisions[0].sheet).caseFile, 1, "2026-03-31")).toBeNull();
  });

  it("returns nothing at all when a row would be a value, price or target", () => {
    const bad: CaseFile = { ...cf, scenario: { names: ["Slow", "Fast"], assumptions: [], outputs: [{ label: "Fair value", unit: "₹/share", values: ["1", "2"] }] } };
    expect(buildScenario(bad, 2, "2026-03-31")).toBeNull();
  });
});

describe("Aksh's words and machine facts never share a field (h)", () => {
  it("keeps the condition text his and the reading the sheet's", () => {
    const conditions = [{ id: "T1", text: "Receivable days stay above 999 for two straight years." }];
    const [t1] = buildKillTests(conditions, cf, TODAY, "2026-09-01", "public");
    expect(t1.condition).toBe("Receivable days stay above 999 for two straight years.");
    expect(t1.reading).toBe("142 days");
    expect(t1.condition).not.toContain("142");
    expect(t1.reading).not.toContain("Receivable");
  });

  it("keeps view text verbatim around chips, and puts only facts inside them", () => {
    const [first] = buildViewBlocks(R1_VIEW, cf, TODAY);
    if (first.kind !== "p") throw new Error("expected a paragraph");
    expect(first.inline[0]).toBe("Kaveri ships most of its pumps through about 1,900 dealers. Revenue reached ₹1,284 cr in FY26 ");
    expect(first.inline[2]).toBe(", up from ₹1,102 cr a year earlier.");
    const chip = first.inline[1];
    if (typeof chip === "string") throw new Error("expected a chip");
    expect(Object.keys(chip)).toEqual(["chip"]);
    expect(Object.keys(chip.chip).sort()).toEqual(["card", "chipId", "label"]);
    expect(chip.chip.label).toBe("S1 p. 131");
  });
});
