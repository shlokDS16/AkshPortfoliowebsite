import type { FileNo, ISODate, SourceRef } from "@/lib/desk-types";
import { formatDate, formatNumber } from "@/lib/format";
import type { ChartPoint, ExhibitData, FactGroup, KillTest, ScenarioData, SourceChipData, SourceListItem, ViewBlockData, ViewInline } from "@/lib/view-types";
import { parseProse, type Condition, type Inline } from "./body";
import { fiscalYearEnd, formatFigure } from "./figures";
import { isIsoDate, withheldUntil } from "./lag";
import { httpUrl } from "./safe";
import { scenarioBreaksRule9, type CaseFile, type CfFact, type CfSource } from "./schema";

/**
 * Builders turn a validated case file into the view contracts. Three rules hold throughout:
 * rule 3 (a withheld value is removed from the model, never just hidden), rule a (a view only receives real
 * dates: stored data that fails the check is skipped or left out, a bad date from the caller throws RangeError)
 * and rule c (a source link survives only as http or https).
 */
function assertDate(value: string, what: string): void {
  if (!isIsoDate(value)) throw new RangeError(`${what} must be a YYYY-MM-DD date`);
}

function sourceRef(s: CfSource | undefined, id: string, locator: string): SourceRef {
  return { id, doc: s?.doc ?? "Source not listed", locator, filedOn: isIsoDate(s?.filedOn) ? s.filedOn : undefined, url: httpUrl(s?.url) };
}

const datedFacts = (cf: CaseFile): CfFact[] => cf.facts.filter((f) => isIsoDate(f.asOf));

/** Rule 3 (D26): a withheld fact contributes no number, prior or quote to the page at all. */
export function chipFor(fact: CfFact, cf: CaseFile, today: ISODate): SourceChipData {
  assertDate(fact.asOf, `${fact.id}'s as-of date`);
  const source = cf.sources.find((s) => s.id === fact.sourceId);
  const hold = withheldUntil(fact.asOf, today);
  return {
    chipId: fact.id,
    label: `${fact.sourceId} ${fact.locator}`,
    card: {
      figure: hold ? "" : formatFigure(fact.value, fact.unit),
      unit: null,
      prior: hold || !fact.prior ? null : { label: fact.prior.label, value: formatFigure(fact.prior.value, fact.unit) },
      quote: hold ? null : (source?.quote[fact.id] ?? null),
      source: sourceRef(source, fact.sourceId, fact.locator),
      asOf: fact.asOf,
      withheldUntil: hold,
    },
  };
}

function resolve(inline: Inline[], cf: CaseFile, facts: CfFact[], today: ISODate): ViewInline[] {
  return inline.map((x) => {
    if (typeof x === "string") return x;
    const fact = facts.find((f) => f.id === x.chip);
    return fact ? { chip: chipFor(fact, cf, today) } : `[${x.chip}]`;
  });
}

export function buildViewBlocks(md: string, cf: CaseFile, today: ISODate): ViewBlockData[] {
  assertDate(today, "today");
  const facts = datedFacts(cf);
  return parseProse(md).map((b) =>
    b.kind === "p" ? { kind: "p", inline: resolve(b.inline, cf, facts, today) } : b.kind === "ul" ? { kind: "ul", items: b.items.map((i) => resolve(i, cf, facts, today)) } : b,
  );
}

export function buildKillTests(conditions: Condition[], cf: CaseFile, today: ISODate, checkedOn: ISODate): KillTest[] {
  assertDate(today, "today");
  assertDate(checkedOn, "checkedOn");
  return conditions.map((c) => {
    const t = cf.tests.find((r) => r.id === c.id);
    const n = Number(c.id.slice(1));
    const readingDate = t && isIsoDate(t.readingAsOf) ? t.readingAsOf : null;
    const hold = readingDate ? withheldUntil(readingDate, today) : null;
    // A reading shows only with a real date old enough; one with no readable date has an unknown age and stays hidden.
    const showable = readingDate !== null && hold === null;
    const hidden = t !== undefined && t.current !== null && !showable;
    return {
      id: c.id,
      n,
      condition: c.text,
      reading: t && showable && t.current !== null ? formatFigure(t.current, t.unit) : null,
      readingAsOf: readingDate,
      withheldUntil: hold,
      lastChecked: t && isIsoDate(t.lastChecked) ? t.lastChecked : checkedOn,
      status: t?.status ?? "no_data",
      meter:
        !t || hidden
          ? null
          : {
              min: t.min, max: t.max, threshold: t.threshold, current: showable ? t.current : null, prior: showable ? t.prior : null, direction: t.direction, unit: t.unit,
              labels: { min: formatFigure(t.min, t.unit), max: formatFigure(t.max, t.unit), threshold: `Test ${n} line: ${formatFigure(t.threshold, t.unit)}` },
            },
    };
  });
}

export function buildFactGroups(cf: CaseFile, today: ISODate): FactGroup[] {
  assertDate(today, "today");
  const groups = new Map<string, FactGroup>();
  for (const f of datedFacts(cf)) {
    const hold = withheldUntil(f.asOf, today);
    const group = groups.get(f.period) ?? { title: f.period, asOf: f.asOf, rows: [] };
    if (f.asOf > group.asOf) group.asOf = f.asOf;
    group.rows.push({
      id: f.id, label: f.label, unit: f.unit || null, withheldUntil: hold,
      value: hold ? null : formatNumber(f.value), prior: hold || !f.prior ? null : formatNumber(f.prior.value),
      source: sourceRef(cf.sources.find((s) => s.id === f.sourceId), f.sourceId, f.locator),
    });
    groups.set(f.period, group);
  }
  return [...groups.values()];
}

export function buildSourceList(cf: CaseFile): SourceListItem[] {
  return cf.sources.map((s) => ({ ...sourceRef(s, s.id, ""), type: s.type }));
}

export function niceTicks(lo: number, hi: number, target = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
  const raw = (hi - lo) / (target - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; ; v += step) {
    ticks.push(Number(v.toFixed(6)));
    if (v >= hi) return ticks;
  }
}

export function buildExhibits(fileNo: FileNo, subjectLabel: string, cf: CaseFile, today: ISODate): ExhibitData[] {
  assertDate(today, "today");
  return cf.exhibits.map((x, i) => {
    const source = cf.sources.find((s) => s.id === x.sourceId);
    const test = x.testId ? cf.tests.find((t) => t.id === x.testId) : undefined;
    const n = test ? Number(test.id.slice(1)) : 0;
    // A period we cannot read is dated today, so it counts as withheld, never as old.
    const points = x.points.map((p) => {
      const end = fiscalYearEnd(p.period) ?? today;
      const until = withheldUntil(end, today);
      const point: ChartPoint = until ? { x: p.period, y: null, withheld: true, withheldUntil: until } : { x: p.period, y: p.value, withheld: false };
      return { point, end, until, value: until ? null : p.value };
    });
    const shown = points.filter((p) => p.value !== null);
    const first = shown[0];
    const last = shown[shown.length - 1];
    const values = shown.map((p) => p.value as number).concat(test ? [test.threshold] : []);
    const fig = (v: number) => formatFigure(v, x.unit);
    const line = test ? `; test ${n} line at ${fig(test.threshold)}` : "";
    // The summary is built from the figures shown, so it can never state a withheld one.
    const summary =
      first && last
        ? first === last
          ? `${x.title}: ${fig(first.value as number)} in ${first.point.x}${line}.`
          : `${x.title}: from ${fig(first.value as number)} in ${first.point.x} to ${fig(last.value as number)} in ${last.point.x}${line}.`
        : `${x.title}: no figures old enough to show yet.`;
    return {
      fileNo, n: i + 1, title: x.title, sub: null, dataTo: last?.end ?? today,
      source: `${x.sourceId} ${source?.doc ?? "Source not listed"}`,
      key: [
        { mark: "subject" as const, label: subjectLabel },
        ...(test ? [{ mark: "threshold" as const, label: `Test ${n} line` }] : []),
        ...(points.some((p) => p.until) ? [{ mark: "withheld" as const, label: "Withheld (under 30 days)" }] : []),
      ],
      chart: {
        series: [{ kind: "subject" as const, label: x.title, points: points.map((p) => p.point) }],
        thresholds: test ? [{ y: test.threshold, label: `Test ${n} line: ${fig(test.threshold)}` }] : [],
        dataCap: last ? { x: last.point.x, label: `Data to ${formatDate(last.end)}` } : null,
        yTicks: values.length ? niceTicks(Math.min(...values), Math.max(...values)) : [0, 1],
        unit: x.unit,
        summary,
      },
      ledger: {
        periods: points.map((p) => ({ label: p.point.x, yearEnd: p.end, source: sourceRef(source, x.sourceId, ""), current: p === last })),
        rows: [{ label: x.title, unit: x.unit, values: points.map((p) => (p.value === null ? null : formatNumber(p.value))), withheld: points.map((p) => p.until) }],
      },
    };
  });
}

/** Rule 9: a scenario holding a value, price or target row never reaches a public view. */
export function buildScenario(cf: CaseFile, frozenAtRev: number, dataAsOf: ISODate): ScenarioData | null {
  assertDate(dataAsOf, "dataAsOf");
  if (!cf.scenario || scenarioBreaksRule9(cf.scenario)) return null;
  return { ...cf.scenario, frozenAtRev, dataAsOf };
}
