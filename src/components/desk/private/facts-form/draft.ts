import type { SourceType, TestStatus } from "@/lib/desk-types";
import { CASEFILE_SCHEMA, serializeFactsSheet, type CaseFile, type SheetCaseFile } from "@/modules/casefile/client";

// The Facts form's working copy of a case file: every cell is the text Aksh typed, so nothing he types is ever
// coerced away. It becomes the facts sheet text through casefile's own serializer, and the server parses that.
export type SourceDraft = { id: string; doc: string; type: SourceType; filedOn: string; url: string };
export type FactDraft = {
  id: string; label: string; value: string; unit: string; period: string; asOf: string; sourceId: string; locator: string;
  priorLabel: string; priorValue: string; quote: string;
};
export type TestDraft = {
  id: string; current: string; unit: string; readingAsOf: string; lastChecked: string; status: TestStatus;
  min: string; max: string; threshold: string; direction: "above" | "below"; prior: string;
};
export type PointDraft = { period: string; value: string };
export type ExhibitDraft = { id: string; title: string; unit: string; sourceId: string; testId: string; points: PointDraft[] };
export type RowDraft = { label: string; values: string[] };
export type OutputDraft = RowDraft & { unit: string };
export type ScenarioDraft = { names: string[]; assumptions: RowDraft[]; outputs: OutputDraft[] };
export type Draft = {
  oneLiner: string; sources: SourceDraft[]; facts: FactDraft[]; tests: TestDraft[]; exhibits: ExhibitDraft[];
  readFirst: string[]; scenario: ScenarioDraft | null;
};

const str = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(v));
const orNull = (v: string) => (v.trim() === "" ? null : v);

export function toDraft(cf: CaseFile): Draft {
  return {
    oneLiner: cf.oneLiner ?? "",
    sources: cf.sources.map((s) => ({ id: s.id, doc: s.doc, type: s.type, filedOn: s.filedOn, url: s.url ?? "" })),
    facts: cf.facts.map((f) => ({
      id: f.id, label: f.label, value: str(f.value), unit: f.unit, period: f.period, asOf: f.asOf, sourceId: f.sourceId, locator: f.locator,
      priorLabel: f.prior?.label ?? "", priorValue: str(f.prior?.value), quote: cf.sources.find((s) => s.id === f.sourceId)?.quote[f.id] ?? "",
    })),
    tests: cf.tests.map((t) => ({
      id: t.id, current: str(t.current), unit: t.unit, readingAsOf: t.readingAsOf ?? "", lastChecked: t.lastChecked, status: t.status,
      min: str(t.min), max: str(t.max), threshold: str(t.threshold), direction: t.direction, prior: str(t.prior),
    })),
    exhibits: cf.exhibits.map((x) => ({
      id: x.id, title: x.title, unit: x.unit, sourceId: x.sourceId, testId: x.testId ?? "", points: x.points.map((p) => ({ period: p.period, value: str(p.value) })),
    })),
    readFirst: [...cf.readFirst],
    scenario: cf.scenario
      ? {
          names: [...cf.scenario.names],
          assumptions: cf.scenario.assumptions.map((a) => ({ label: a.label, values: [...a.values] })),
          outputs: cf.scenario.outputs.map((y) => ({ label: y.label, unit: y.unit, values: [...y.values] })),
        }
      : null,
  };
}

/** The draft as a facts sheet, written by casefile's serializer; cells go in exactly as typed. */
export function draftToSheet(d: Draft): string {
  const quotes = (sourceId: string) => Object.fromEntries(d.facts.filter((f) => f.sourceId === sourceId && f.quote.trim() !== "").map((f) => [f.id, f.quote]));
  const cf: SheetCaseFile = {
    schema: CASEFILE_SCHEMA,
    oneLiner: orNull(d.oneLiner),
    sources: d.sources.map((s) => ({ id: s.id, doc: s.doc, type: s.type, filedOn: s.filedOn, url: orNull(s.url), quote: quotes(s.id) })),
    facts: d.facts.map((f) => ({
      id: f.id, label: f.label, value: f.value, unit: f.unit, period: f.period, asOf: f.asOf, sourceId: f.sourceId, locator: f.locator,
      prior: f.priorLabel.trim() === "" && f.priorValue.trim() === "" ? null : { label: f.priorLabel, value: f.priorValue },
    })),
    tests: d.tests.map((t) => ({
      id: t.id, current: orNull(t.current), unit: t.unit, readingAsOf: orNull(t.readingAsOf), lastChecked: t.lastChecked, status: t.status,
      min: t.min, max: t.max, threshold: t.threshold, direction: t.direction, prior: orNull(t.prior),
    })),
    exhibits: d.exhibits.map((x) => ({
      id: x.id, title: x.title, unit: x.unit, sourceId: x.sourceId, testId: orNull(x.testId), points: x.points.map((p) => ({ period: p.period, value: orNull(p.value) })),
    })),
    readFirst: d.readFirst,
    scenario: d.scenario,
  };
  return serializeFactsSheet(cf);
}

/** Ids are never renumbered (a body citation keeps pointing at the same fact); a new row takes the next free number. */
export function nextId(prefix: string, ids: string[]): string {
  const top = Math.max(0, ...ids.map((id) => Number(id.slice(prefix.length))).filter(Number.isFinite));
  return `${prefix}${top + 1}`;
}

export const blankSource = (id: string): SourceDraft => ({ id, doc: "", type: "Annual report", filedOn: "", url: "" });
export const blankFact = (id: string, sourceId: string): FactDraft => ({
  id, label: "", value: "", unit: "", period: "", asOf: "", sourceId, locator: "", priorLabel: "", priorValue: "", quote: "",
});
export const blankTest = (id: string, today: string): TestDraft => ({
  id, current: "", unit: "", readingAsOf: "", lastChecked: today, status: "no_data", min: "", max: "", threshold: "", direction: "above", prior: "",
});
export const blankExhibit = (id: string, sourceId: string): ExhibitDraft => ({
  id, title: "", unit: "", sourceId, testId: "", points: [{ period: "", value: "" }, { period: "", value: "" }],
});
export const blankScenario = (): ScenarioDraft => ({ names: ["", ""], assumptions: [], outputs: [{ label: "", unit: "", values: ["", ""] }] });
