import { describe, expect, it } from "vitest";
import { HOLDS_POSITION_VALUES } from "@/lib/desk-types";
import { HOLDS_POSITIONS } from "@/modules/research";
import { KAVERI } from "@/test/fixtures/casefile";
import { EMPTY_CASEFILE, readCaseFile, validateCaseFile } from "./schema";
import { parseFactsSheet } from "./sheet";

const base = {
  ...EMPTY_CASEFILE,
  sources: [{ id: "S1", doc: "Annual report", type: "Annual report", filedOn: "2026-07-12", url: null, quote: { F1: "Revenue rose." } }],
  facts: [{ id: "F1", label: "Revenue", value: 1284, unit: "₹ cr", period: "FY26", asOf: "2026-03-31", sourceId: "S1", locator: "p. 131", prior: null }],
};
const withScenario = (scenario: unknown) => validateCaseFile({ ...base, scenario });
const scenarioOf = (outputLabel: string, extra: { unit?: string; assumption?: string; values?: [string, string]; name?: string } = {}) => ({
  names: [extra.name ?? "Slow", "Fast"],
  assumptions: extra.assumption ? [{ label: extra.assumption, values: ["4%", "8%"] }] : [],
  outputs: [{ label: outputLabel, unit: extra.unit ?? "₹ cr", values: extra.values ?? ["1,390", "1,610"] }],
});

describe("casefile/1 schema", () => {
  it("accepts a consistent file and rejects broken cross-references", () => {
    expect(validateCaseFile(base).ok).toBe(true);
    const orphan = validateCaseFile({ ...base, sources: [{ ...base.sources[0], quote: {} }], facts: [{ ...base.facts[0], sourceId: "S9" }] });
    expect(orphan).toEqual({ ok: false, issues: ["F1 cites S9, which is not in the sources."] });
    const quote = validateCaseFile({ ...base, sources: [{ ...base.sources[0], quote: { F7: "x" } }] });
    expect(quote.ok).toBe(false);
  });

  it("rule 9: a public scenario output can never be a value, price or target", () => {
    const scenario = { names: ["Slow", "Fast"], assumptions: [], outputs: [{ label: "Equity value per share", unit: "₹", values: ["1", "2"] }] };
    const result = validateCaseFile({ ...base, scenario });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toMatch(/Rule 9/);
  });

  it.each([
    ["a per-share unit", scenarioOf("Intrinsic worth", { unit: "₹ per share" })],
    ["a slash-share unit", scenarioOf("Revenue", { unit: "₹/share" })],
    ["a slash-sh unit", scenarioOf("Revenue", { unit: "₹ / sh" })],
    ["a hyphen split", scenarioOf("Fair-value")],
    ["a non-breaking space", scenarioOf("Equity\u00a0value")],
    ["a zero-width split", scenarioOf("Equity\u200b value")],
    ["a Cyrillic lookalike", scenarioOf(`Equ${String.fromCharCode(0x456)}ty value`)],
    ["enterprise value", scenarioOf("Enterprise value")],
    ["intrinsic value", scenarioOf("Intrinsic value")],
    ["EPS", scenarioOf("FY28 EPS")],
    ["a target in an assumption row", scenarioOf("FY28 revenue", { assumption: "Target price" })],
    ["a value in an assumption row", scenarioOf("FY28 revenue", { assumption: "Equity value" })],
    ["a per-share cell", scenarioOf("FY28 revenue", { values: ["1,390", "₹1,500 per share"] })],
    ["a price in a scenario name", scenarioOf("FY28 revenue", { name: "Target price case" })],
    ["a valuation multiple", scenarioOf("EV/EBITDA", { unit: "x" })],
  ])("rule 9: rejects %s", (_name, scenario) => {
    const result = withScenario(scenario);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toMatch(/Rule 9/);
  });

  it.each([
    ["FY28 PE", scenarioOf("FY28 PE", { unit: "x" })],
    ["PE multiple", scenarioOf("PE multiple", { unit: "x" })],
    ["NAV", scenarioOf("NAV")],
    ["Net asset value", scenarioOf("Net asset value")],
    ["EV to EBITDA", scenarioOf("EV to EBITDA", { unit: "x" })],
    ["SOTP value", scenarioOf("SOTP value")],
    ["a bare Value in rupees", scenarioOf("Value", { unit: "₹ cr" })],
    ["a bare Worth in rupees", scenarioOf("FY28 worth", { unit: "₹" })],
    ["Price as an output", scenarioOf("Average selling price")],
    ["Upside as an output", scenarioOf("Upside", { unit: "%" })],
    ["a market capitalisation", scenarioOf("Market capitalisation")],
  ])("rule 9: refuses %s", (_name, scenario) => {
    const result = withScenario(scenario);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toMatch(/Rule 9/);
  });

  it.each([
    ["scenario name Upside", scenarioOf("FY28 revenue", { name: "Upside" })],
    ["scenario name Downside", scenarioOf("FY28 revenue", { name: "Downside" })],
    ["assumption Price hike", scenarioOf("FY28 revenue", { assumption: "Price hike" })],
    ["assumption Steel price change", scenarioOf("FY28 revenue", { assumption: "Steel price change" })],
    ["assumption Average selling price", scenarioOf("FY28 revenue", { assumption: "Average selling price" })],
    ["assumption Market capacity", scenarioOf("FY28 revenue", { assumption: "Market capacity" })],
    ["output FY28 order book value", scenarioOf("FY28 order book value", { unit: "₹ cr" })],
    ["output Revenue per employee", scenarioOf("Revenue per employee", { unit: "₹ lakh" })],
    ["output Market share", scenarioOf("Market share", { unit: "%" })],
    ["output Revenue per shipment", scenarioOf("Revenue per shipment", { unit: "₹" })],
    ["output Perpetual", scenarioOf("Perpetual", { unit: "%" })],
    ["output Openness", scenarioOf("Openness", { unit: "%" })],
  ])("rule 9: allows %s", (_name, scenario) => {
    expect(withScenario(scenario).ok).toBe(true);
  });

  it("rule 9: operating rows stay allowed", () => {
    expect(withScenario(scenarioOf("FY28 EBITDA margin", { unit: "%", assumption: "Volume growth", values: ["12", "14"] })).ok).toBe(true);
    expect(withScenario(scenarioOf("Market share", { unit: "%", values: ["11", "14"] })).ok).toBe(true);
  });

  it("rule 9: the facts sheet reports the offending row's line", () => {
    const sheet = "S1 | Doc | Annual report | 2026-07-12\nSC | Slow | Fast\nA | Volume growth | 4% | 8%\nY | FY28 revenue | ₹ cr | 1 | 2\nY | Equity value per share | ₹ | 1 | 2";
    const { errors } = parseFactsSheet(sheet);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 5 });
    expect(errors[0].message).toMatch(/Rule 9/);
  });

  it("reads anything invalid as an empty file instead of throwing on a public page", () => {
    expect(readCaseFile({ foo: 1 })).toEqual(EMPTY_CASEFILE);
    expect(readCaseFile(base).facts).toHaveLength(1);
  });

  it("reads a file with a malformed or impossible date as empty (rule a: views only ever see real dates)", () => {
    for (const asOf of ["soon", "2026-02-30", "2026-13-01", "31/03/2026", ""]) {
      expect(readCaseFile({ ...base, facts: [{ ...base.facts[0], asOf }] })).toEqual(EMPTY_CASEFILE);
    }
    expect(readCaseFile({ ...base, sources: [{ ...base.sources[0], filedOn: "2026-02-30" }] })).toEqual(EMPTY_CASEFILE);
  });

  it("keeps Aksh's words out of the structured file: unknown keys such as prose never survive validation (rule h)", () => {
    const result = validateCaseFile({ ...base, bodyMd: "Aksh's view", thesis: "x", tests: [], facts: [{ ...base.facts[0], condition: "Aksh's words" }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.data).sort()).toEqual(Object.keys(EMPTY_CASEFILE).sort());
      expect(Object.keys(result.data.facts[0]).sort()).toEqual(["asOf", "id", "label", "locator", "period", "prior", "sourceId", "unit", "value"]);
      expect(JSON.stringify(result.data)).not.toContain("Aksh's");
    }
  });

  it("parses the seed sheets without schema errors", () => {
    expect(validateCaseFile(parseFactsSheet(KAVERI.revisions[1].sheet).caseFile).ok).toBe(true);
  });

  it("mirrors the HoldsPosition values the desk types copy (the lib leaf cannot import research)", () => {
    expect([...HOLDS_POSITION_VALUES]).toEqual([...HOLDS_POSITIONS]);
  });
});
