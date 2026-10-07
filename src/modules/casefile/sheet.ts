import { SOURCE_TYPES, type TestStatus } from "@/lib/desk-types";
import { parseNumber } from "./figures";
import { caseFileSchema, EMPTY_CASEFILE, type CaseFile, type CfScenario } from "./schema";

export type SheetError = { line: number; message: string };

export const SHEET_LEGEND = `// O | one line about the company
// S1 | document | type | filed on (YYYY-MM-DD) | link (optional)
// F1 | metric | value | unit | period | as of | source | page | prior period | prior value | quoted line
// T1 | reading or - | unit | reading date or - | last checked | met / watching / not met / no data | min | max | threshold | above or below | prior
// X1 | exhibit title | unit | source | test or - | FY22=81 | FY23=95 | ...
// R | learning-note-slug
// SC | Slow | Base | Fast   then  A | input | values...   and  Y | output | unit | values...`;

const STATUS: Record<string, TestStatus> = { met: "met", watching: "watching", "not met": "not_met", not_met: "not_met", "no data": "no_data", no_data: "no_data" };
const ROW_KINDS = "Start a row with O, S1, F1, T1, X1, R, SC, A or Y.";
const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const dash = (v: string | undefined) => !v || v === "-" || v === "—";

type Lines = { sources: number[]; facts: number[]; tests: number[]; exhibits: number[] };
type ScenarioLines = { sc: number; assumptions: number[]; outputs: number[] };

export function parseFactsSheet(text: string): { caseFile: CaseFile; errors: SheetError[] } {
  const cf: CaseFile = structuredClone(EMPTY_CASEFILE);
  const errors: SheetError[] = [];
  const at: Lines = { sources: [], facts: [], tests: [], exhibits: [] };
  const scenarioAt: ScenarioLines = { sc: 0, assumptions: [], outputs: [] };
  const pendingQuotes: { sourceId: string; factId: string; quote: string }[] = [];
  let scenario: CfScenario | null = null;
  text.replace(/\r\n/g, "\n").split("\n").forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//")) return;
    const cells = (trimmed.includes("\t") ? trimmed.split("\t") : trimmed.split("|")).map((c) => c.trim());
    const [key] = cells;
    const err = (message: string) => errors.push({ line, message });
    const n = (v: string | undefined, what: string) => {
      const value = parseNumber(v ?? "");
      if (value === null) err(`${key}: the ${what} "${v ?? ""}" is not a number.`);
      return value ?? 0;
    };
    if (key === "O") cf.oneLiner = cells[1] || null;
    else if (/^S\d+$/.test(key)) {
      const type = SOURCE_TYPES.find((t) => t.toLowerCase() === (cells[2] ?? "").toLowerCase());
      if (!type) return err(`${key}: the type must be one of ${SOURCE_TYPES.join(", ")}.`);
      at.sources.push(line);
      cf.sources.push({ id: key, doc: cells[1] ?? "", type, filedOn: date(cells[3]) ?? "", url: cells[4] || null, quote: {} });
    } else if (/^F\d+$/.test(key)) {
      const value = n(cells[2], "value");
      // The serializer writes "- | -" before a quote when there is no prior.
      const prior = !dash(cells[8]) && !dash(cells[9]) ? { label: cells[8] ?? "", value: n(cells[9], "prior value") } : null;
      at.facts.push(line);
      cf.facts.push({ id: key, label: cells[1] ?? "", value, unit: cells[3] ?? "", period: cells[4] ?? "", asOf: date(cells[5]) ?? "", sourceId: cells[6] ?? "", locator: cells[7] ?? "", prior });
      if (cells[10]) pendingQuotes.push({ sourceId: cells[6] ?? "", factId: key, quote: cells[10] });
    } else if (/^T\d+$/.test(key)) {
      const status = STATUS[(cells[5] ?? "").toLowerCase()];
      if (!status) return err(`${key}: the status must be met, watching, not met or no data.`);
      at.tests.push(line);
      cf.tests.push({
        id: key, current: dash(cells[1]) ? null : n(cells[1], "reading"), unit: cells[2] ?? "", readingAsOf: dash(cells[3]) ? null : date(cells[3]),
        lastChecked: date(cells[4]) ?? "", status, min: n(cells[6], "min"), max: n(cells[7], "max"), threshold: n(cells[8], "threshold"),
        direction: cells[9] === "below" ? "below" : "above", prior: dash(cells[10]) ? null : n(cells[10], "prior"),
      });
    } else if (/^X\d+$/.test(key)) {
      const points = cells.slice(5).map((cell) => {
        const [period, value] = cell.split("=").map((s) => s.trim());
        return { period: period ?? "", value: dash(value) ? null : n(value, `value for ${period}`) };
      });
      at.exhibits.push(line);
      cf.exhibits.push({ id: key, title: cells[1] ?? "", unit: cells[2] ?? "", sourceId: cells[3] ?? "", testId: dash(cells[4]) ? null : cells[4], points });
    } else if (key === "R") cf.readFirst.push(cells[1] ?? "");
    else if (key === "SC") {
      scenario = { names: cells.slice(1), assumptions: [], outputs: [] };
      scenarioAt.sc = line;
    } else if (key === "A" || key === "Y") {
      if (!scenario) return err("Start the scenario with an SC row naming the scenarios.");
      if (key === "A") {
        scenario.assumptions.push({ label: cells[1] ?? "", values: cells.slice(2) });
        scenarioAt.assumptions.push(line);
      } else {
        scenario.outputs.push({ label: cells[1] ?? "", unit: cells[2] ?? "", values: cells.slice(3) });
        scenarioAt.outputs.push(line);
      }
    } else err(ROW_KINDS);
  });
  for (const q of pendingQuotes) {
    const source = cf.sources.find((s) => s.id === q.sourceId);
    if (source) source.quote[q.factId] = q.quote;
  }
  cf.scenario = scenario;
  if (errors.length > 0) return { caseFile: cf, errors };
  const checked = caseFileSchema.safeParse(cf);
  if (checked.success) return { caseFile: checked.data, errors };
  for (const issue of checked.error.issues) {
    const [group, section, i] = issue.path;
    let lineNo = 0;
    if (group === "scenario") lineNo = (section === "assumptions" || section === "outputs") && typeof i === "number" ? (scenarioAt[section][i] ?? scenarioAt.sc) : scenarioAt.sc;
    else if (typeof group === "string" && typeof section === "number" && group in at) lineNo = at[group as keyof Lines][section] ?? 0;
    errors.push({ line: lineNo, message: issue.message });
  }
  return { caseFile: cf, errors };
}

const join = (cells: (string | number | null | undefined)[]) => cells.map((c) => (c === null || c === undefined ? "-" : String(c))).join(" | ");

/** A case file whose number cells may still be the text being typed (the desk's Facts form writes cells verbatim). */
type Loose<T> = T extends number ? number | string : T extends object ? { [K in keyof T]: Loose<T[K]> } : T;
export type SheetCaseFile = Loose<CaseFile>;

/** The live revision shown back as a sheet; parseFactsSheet(serializeFactsSheet(x)) equals x. */
export function serializeFactsSheet(cf: SheetCaseFile): string {
  const lines: string[] = [SHEET_LEGEND];
  if (cf.oneLiner) lines.push(join(["O", cf.oneLiner]));
  for (const s of cf.sources) lines.push(join([s.id, s.doc, s.type, s.filedOn, ...(s.url ? [s.url] : [])]));
  for (const f of cf.facts) {
    const quote = cf.sources.find((s) => s.id === f.sourceId)?.quote[f.id];
    const tail = f.prior ? [f.prior.label, f.prior.value, ...(quote ? [quote] : [])] : quote ? ["-", "-", quote] : [];
    lines.push(join([f.id, f.label, f.value, f.unit, f.period, f.asOf, f.sourceId, f.locator, ...tail]));
  }
  for (const t of cf.tests) {
    const word = { met: "met", watching: "watching", not_met: "not met", no_data: "no data" }[t.status];
    lines.push(join([t.id, t.current, t.unit, t.readingAsOf, t.lastChecked, word, t.min, t.max, t.threshold, t.direction, t.prior]));
  }
  for (const x of cf.exhibits) lines.push(join([x.id, x.title, x.unit, x.sourceId, x.testId, ...x.points.map((p) => `${p.period}=${p.value ?? "-"}`)]));
  for (const slug of cf.readFirst) lines.push(join(["R", slug]));
  if (cf.scenario) {
    lines.push(join(["SC", ...cf.scenario.names]));
    for (const a of cf.scenario.assumptions) lines.push(join(["A", a.label, ...a.values]));
    for (const y of cf.scenario.outputs) lines.push(join(["Y", y.label, y.unit, ...y.values]));
  }
  return lines.join("\n");
}
