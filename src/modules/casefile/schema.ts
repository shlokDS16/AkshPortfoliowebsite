import { z } from "zod";
import { SOURCE_TYPES, TEST_STATUSES } from "@/lib/desk-types";

export const CASEFILE_SCHEMA = "casefile/1";
export const PERIOD_RE = /^(?:FY\d{2}|Q[1-4] FY\d{2})$/;
/**
 * Rule 9: a DCF output is a price target by another name; public scenario tables show operating figures only.
 * Matched against folded text (see foldForRule9), so spacing, hyphens, case and look-alike letters do not slip past.
 * False positives are the safe direction (ADR-001 s5): "Realised price" is refused too.
 */
export const FORBIDDEN_OUTPUT_RE = new RegExp(
  [
    String.raw`\b(?:equity|enterprise|intrinsic|fair|implied|terminal|dcf|book|market|stock|share|exit)\s+(?:value|worth|valuation)\b`,
    String.raw`\bper\s?sh(?:are)?s?\b`,
    String.raw`/\s*sh(?:are)?s?\b`,
    String.raw`\b(?:target|price|valuation|upside|downside|eps|dps|bvps|dcf|npv|mcap)\b`,
    String.raw`\bmarket\s?cap`,
    String.raw`\b(?:ev|p)\s*/\s*(?:e|b|s|ebitda|ebit|sales|revenue)\b`,
  ].join("|"),
  "i",
);

const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
// Cyrillic and Greek lower-case letters that read as Latin ones (the same idea as the lint's normaliser).
const LOOKALIKE: Record<string, string> = {
  "\u0430": "a", "\u0435": "e", "\u043E": "o", "\u0440": "p", "\u0441": "c", "\u0443": "y", "\u0445": "x", "\u043A": "k",
  "\u043C": "m", "\u0442": "t", "\u043D": "h", "\u0432": "b", "\u0456": "i", "\u0458": "j", "\u0455": "s",
  "\u03BF": "o", "\u03B1": "a", "\u03B5": "e", "\u03C1": "p", "\u03C4": "t", "\u03C5": "u", "\u03BA": "k", "\u03BD": "v",
};
const LOOKALIKE_RE = new RegExp(`[${Object.keys(LOOKALIKE).join("")}]`, "g");

function foldForRule9(text: string): string {
  return text
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .toLowerCase()
    .replace(LOOKALIKE_RE, (ch) => LOOKALIKE[ch] ?? ch)
    .replace(/[-_\u2010-\u2015−]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const breaksRule9 = (text: string): boolean => FORBIDDEN_OUTPUT_RE.test(foldForRule9(text));

type ScenarioShape = { names: string[]; assumptions: { label: string; values: string[] }[]; outputs: { label: string; unit: string; values: string[] }[] };

/** Every scenario text a reader sees: names, row labels, units and cells, in assumptions and outputs alike. */
function rule9Paths(s: ScenarioShape): (string | number)[][] {
  const paths: (string | number)[][] = [];
  s.names.forEach((n, i) => breaksRule9(n) && paths.push(["names", i]));
  s.assumptions.forEach((r, i) => [r.label, ...r.values].some(breaksRule9) && paths.push(["assumptions", i]));
  s.outputs.forEach((r, i) => [r.label, r.unit, ...r.values].some(breaksRule9) && paths.push(["outputs", i]));
  return paths;
}

/** True when a scenario holds a value, price or target row: such a scenario never reaches a public page. */
export const scenarioBreaksRule9 = (s: ScenarioShape): boolean => rule9Paths(s).length > 0;

const RULE_9_MESSAGE = "Rule 9: public scenario tables show operating outputs only, never a value, price or target.";

const id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}\\d{1,3}$`));
const text = (max: number) => z.string().trim().min(1).max(max);
const date = z.iso.date();
const num = z.number().finite();

const sourceSchema = z.object({
  id: id("S"), doc: text(160), type: z.enum(SOURCE_TYPES), filedOn: date, url: z.url().nullable(),
  quote: z.record(id("F"), text(600)),
});
const factSchema = z.object({
  id: id("F"), label: text(80), value: num, unit: z.string().trim().max(12), period: z.string().regex(PERIOD_RE),
  asOf: date, sourceId: id("S"), locator: text(40), prior: z.object({ label: z.string().regex(PERIOD_RE), value: num }).nullable(),
});
const testSchema = z
  .object({
    id: id("T"), current: num.nullable(), unit: z.string().trim().max(12), readingAsOf: date.nullable(), lastChecked: date,
    status: z.enum(TEST_STATUSES), min: num, max: num, threshold: num, direction: z.enum(["above", "below"]), prior: num.nullable(),
  })
  .refine((t) => t.min < t.max && t.threshold >= t.min && t.threshold <= t.max, { message: "the threshold must sit between min and max" });
const exhibitSchema = z.object({
  id: id("X"), title: text(100), unit: z.string().trim().max(12), sourceId: id("S"), testId: id("T").nullable(),
  points: z.array(z.object({ period: z.string().regex(PERIOD_RE), value: num.nullable() })).min(2).max(12),
});
const row = z.object({ label: text(60), values: z.array(text(20)) });
const scenarioSchema = z
  .object({
    names: z.array(text(20)).min(2).max(4),
    assumptions: z.array(row).max(8),
    outputs: z.array(row.extend({ unit: z.string().trim().max(12) })).min(1).max(8),
  })
  .superRefine((s, ctx) => {
    for (const path of rule9Paths(s)) ctx.addIssue({ code: "custom", path, message: RULE_9_MESSAGE });
    if (![...s.assumptions, ...s.outputs].every((r) => r.values.length === s.names.length)) {
      ctx.addIssue({ code: "custom", message: "every scenario row needs one value per scenario" });
    }
  });

export const caseFileSchema = z
  .object({
    schema: z.literal(CASEFILE_SCHEMA),
    oneLiner: text(160).nullable(),
    sources: z.array(sourceSchema).max(30),
    facts: z.array(factSchema).max(80),
    tests: z.array(testSchema).max(12),
    exhibits: z.array(exhibitSchema).max(6),
    readFirst: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)).max(4),
    scenario: scenarioSchema.nullable(),
  })
  .superRefine((cf, ctx) => {
    const sources = new Set(cf.sources.map((s) => s.id));
    const facts = new Map(cf.facts.map((f) => [f.id, f.sourceId]));
    const tests = new Set(cf.tests.map((t) => t.id));
    const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    cf.facts.forEach((f, i) => sources.has(f.sourceId) || fail(["facts", i], `${f.id} cites ${f.sourceId}, which is not in the sources.`));
    cf.exhibits.forEach((x, i) => {
      if (!sources.has(x.sourceId)) fail(["exhibits", i], `${x.id} cites ${x.sourceId}, which is not in the sources.`);
      if (x.testId && !tests.has(x.testId)) fail(["exhibits", i], `${x.id} draws ${x.testId}, which has no reading row.`);
    });
    cf.sources.forEach((s, i) =>
      Object.keys(s.quote).forEach((f) => facts.get(f) === s.id || fail(["sources", i], `The quote for ${f} sits on ${s.id}, but ${f} cites another source.`)),
    );
    for (const [name, list] of [["sources", cf.sources], ["facts", cf.facts], ["tests", cf.tests], ["exhibits", cf.exhibits]] as const) {
      const ids = list.map((x) => x.id);
      ids.forEach((v, i) => ids.indexOf(v) !== i && fail([name, i], `${v} appears twice.`));
    }
  });

export type CaseFile = z.infer<typeof caseFileSchema>;
export type CfSource = CaseFile["sources"][number];
export type CfFact = CaseFile["facts"][number];
export type CfTest = CaseFile["tests"][number];
export type CfExhibit = CaseFile["exhibits"][number];
export type CfScenario = NonNullable<CaseFile["scenario"]>;

export const EMPTY_CASEFILE: CaseFile = {
  schema: CASEFILE_SCHEMA, oneLiner: null, sources: [], facts: [], tests: [], exhibits: [], readFirst: [], scenario: null,
};

export function validateCaseFile(value: unknown): { ok: true; data: CaseFile } | { ok: false; issues: string[] } {
  const result = caseFileSchema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, issues: result.error.issues.map((i) => i.message) };
}

/** Public pages must never throw on old or hand-edited JSON: anything invalid reads as an empty file. */
export function readCaseFile(value: unknown): CaseFile {
  const result = caseFileSchema.safeParse(value);
  return result.success ? result.data : EMPTY_CASEFILE;
}
