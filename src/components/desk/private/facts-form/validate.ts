import { httpUrl, isIsoDate, parseNumber, PERIOD_RE, scenarioBreaksRule9, type SheetError } from "@/modules/casefile/client";
import type { Draft } from "./draft";

/** Field errors keyed "F3.value", "X1.points.2.period", "Y0.label": plain words next to the field (rule 2). */
export type FieldErrors = Record<string, string>;

const NUMBER = "Enter a number, like 1284 or 31.4.";
const DATE = "Pick a date.";
const PERIOD = "Write the period as FY26 or Q1 FY27.";
const SOURCE = "Pick a source from the list above.";
const PIPE = "Take out the | character; the sheet uses it to split columns.";
const RULE_9 = "Rule 9: public scenario tables show operating figures only, never a value, price or target.";
const SLUG = "Use the note's slug: lower-case words joined by hyphens.";

export function fieldErrors(d: Draft): FieldErrors {
  const out: FieldErrors = {};
  const set = (key: string, message: string) => (out[key] ??= message);
  const need = (key: string, v: string, what: string) => v.trim() === "" && set(key, `Enter the ${what}.`);
  const num = (key: string, v: string, optional = false) => (optional && v.trim() === "" ? null : parseNumber(v) === null && set(key, NUMBER));
  const day = (key: string, v: string, optional = false) => (optional && v.trim() === "" ? null : !isIsoDate(v) && set(key, DATE));
  const period = (key: string, v: string) => !PERIOD_RE.test(v) && set(key, PERIOD);
  const sources = new Set(d.sources.map((s) => s.id));

  d.sources.forEach((s) => {
    need(`${s.id}.doc`, s.doc, "document name");
    day(`${s.id}.filedOn`, s.filedOn);
    if (s.url.trim() !== "" && !httpUrl(s.url)) set(`${s.id}.url`, "Use a link that starts with http:// or https://.");
  });
  d.facts.forEach((f) => {
    need(`${f.id}.label`, f.label, "metric");
    num(`${f.id}.value`, f.value);
    period(`${f.id}.period`, f.period);
    day(`${f.id}.asOf`, f.asOf);
    if (!sources.has(f.sourceId)) set(`${f.id}.sourceId`, SOURCE);
    need(`${f.id}.locator`, f.locator, "page or locator");
    if (f.priorLabel.trim() !== "" || f.priorValue.trim() !== "") {
      period(`${f.id}.priorLabel`, f.priorLabel);
      num(`${f.id}.priorValue`, f.priorValue);
    }
  });
  d.tests.forEach((t) => {
    num(`${t.id}.current`, t.current, true);
    day(`${t.id}.readingAsOf`, t.readingAsOf, true);
    day(`${t.id}.lastChecked`, t.lastChecked);
    for (const k of ["min", "max", "threshold"] as const) num(`${t.id}.${k}`, t[k]);
    num(`${t.id}.prior`, t.prior, true);
  });
  d.exhibits.forEach((x) => {
    need(`${x.id}.title`, x.title, "exhibit title");
    if (!sources.has(x.sourceId)) set(`${x.id}.sourceId`, SOURCE);
    x.points.forEach((p, i) => {
      period(`${x.id}.points.${i}.period`, p.period);
      num(`${x.id}.points.${i}.value`, p.value, true);
    });
  });
  d.readFirst.forEach((slug, i) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && set(`R${i}.slug`, SLUG));
  if (d.scenario) scenarioErrors(d.scenario, set);
  pipeErrors(d, set);
  return out;
}

function scenarioErrors(s: NonNullable<Draft["scenario"]>, set: (key: string, message: string) => void) {
  s.names.forEach((n, i) => {
    if (n.trim() === "") set(`SC.names.${i}`, "Name the scenario.");
    else if (scenarioBreaksRule9({ names: [n], assumptions: [], outputs: [] })) set(`SC.names.${i}`, RULE_9);
  });
  const cells = (key: string, values: string[]) => values.forEach((v, i) => v.trim() === "" && set(`${key}.values.${i}`, "Enter a value."));
  s.assumptions.forEach((a, i) => {
    if (a.label.trim() === "") set(`A${i}.label`, "Enter the input.");
    if (scenarioBreaksRule9({ names: [], assumptions: [a], outputs: [] })) set(`A${i}.label`, RULE_9);
    cells(`A${i}`, a.values);
  });
  s.outputs.forEach((y, i) => {
    if (y.label.trim() === "") set(`Y${i}.label`, "Enter the output.");
    if (scenarioBreaksRule9({ names: [], assumptions: [], outputs: [y] })) set(`Y${i}.label`, RULE_9);
    cells(`Y${i}`, y.values);
  });
}

/** A | or a tab inside a cell would split it into two columns of the sheet. */
function pipeErrors(d: Draft, set: (key: string, message: string) => void) {
  const check = (key: string, value: string) => /[|\t]/.test(value) && set(key, PIPE);
  check("O.oneLiner", d.oneLiner);
  for (const row of [...d.sources, ...d.facts, ...d.tests, ...d.exhibits]) {
    for (const [k, v] of Object.entries(row)) if (typeof v === "string") check(`${row.id}.${k}`, v);
  }
  d.exhibits.forEach((x) => x.points.forEach((p, i) => (check(`${x.id}.points.${i}.period`, p.period), check(`${x.id}.points.${i}.value`, p.value))));
  d.readFirst.forEach((slug, i) => check(`R${i}.slug`, slug));
  d.scenario?.names.forEach((n, i) => check(`SC.names.${i}`, n));
  const rows = [...(d.scenario?.assumptions.map((a, i) => [`A${i}`, a] as const) ?? []), ...(d.scenario?.outputs.map((y, i) => [`Y${i}`, y] as const) ?? [])];
  for (const [key, row] of rows) {
    check(`${key}.label`, row.label);
    if ("unit" in row) check(`${key}.unit`, row.unit);
    row.values.forEach((v, i) => check(`${key}.values.${i}`, v));
  }
}

/**
 * The parser's own errors (cross-row rules: duplicate ids, threshold outside min and max, a scenario row short of
 * values) placed on the row they came from. Rows are keyed as fieldErrors keys them: "F3", "R0", "A1", "Y0", "SC".
 */
export function rowErrors(sheet: string, errors: SheetError[]): Record<string, string[]> {
  const counts: Record<string, number> = {};
  const keys = sheet.split("\n").map((line) => {
    const cell = line.trim().startsWith("//") ? "" : (line.split("|")[0] ?? "").trim();
    if (cell !== "R" && cell !== "A" && cell !== "Y") return cell;
    counts[cell] = (counts[cell] ?? 0) + 1;
    return `${cell}${counts[cell] - 1}`;
  });
  const out: Record<string, string[]> = {};
  for (const e of errors) {
    const key = keys[e.line - 1] || "file";
    (out[key] ??= []).push(e.message);
  }
  return out;
}

/** Body citations ([F3]) with no fact row: removing a cited fact warns before saving, and the body is never edited (rule 4). */
export function brokenCitations(bodyMd: string, d: Draft): string[] {
  const facts = new Set(d.facts.map((f) => f.id));
  return [...new Set([...bodyMd.matchAll(/\[(F\d{1,3})\]/g)].map((m) => m[1]))].filter((id) => !facts.has(id));
}
