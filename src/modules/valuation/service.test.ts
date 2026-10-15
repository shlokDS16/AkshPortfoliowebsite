import { describe, expect, it } from "vitest";
import { checkChoice, checkScenario, CHOICE_TEXT } from "./service";
import type { CellRow } from "./records";
import type { ModelObject } from "./types";

// Spec s6, last bullet: the checks the SQL cannot make because it cannot read the model object. An input is a numeric constant that is not
// a date; an output is an untainted numeric formula. And the scenario checks: his values are for his inputs, finite and within 1e15.

const model = (): ModelObject => ({
  modelVersion: 1,
  engine: { sheetjs: "0.20.3", ironcalcNode: "0.8.3", ironcalcWasm: "0.8.4" },
  index: {
    sheets: [
      {
        name: "DCF",
        arrays: ["F1:F2"],
        cells: [
          ["B2", null, 0.11, "n", "0.0%"], // cost of equity: a plain input
          ["B3", null, "Growth", "s", null], // text
          ["B4", null, 45000, "n", "dd-mmm-yy"], // a date
          ["B5", "B2*2", 0.22, "n", null], // a formula
          ["B6", "B2+B7", 1, "n", null], // a formula that reads a differing cell
          ["B7", "CUBEVALUE()", 5, "n", null], // differs
          ["B8", "B2*100", 11, "n", null], // a clean result
          ["B9", 'IF(B2>0,"yes","no")', "yes", "s", null], // a text result
          ["B10", null, 12, "n", null], // a constant
          ["F1", null, 3, "n", null], // inside an array range
          ["B11", "TODAY()", 46000, "n", null], // dated: allowed as a result
          ["B12", "B2*3", null, "z", null], // no saved value
        ],
      },
    ],
    names: [],
    counts: { sheets: 1, cells: 12, formulas: 7 },
    stringsCut: 0,
  },
  classes: { "DCF!B7": "differs", "DCF!B11": "dated", "DCF!B12": "no_cache" },
  taint: ["DCF!B6", "DCF!B7", "DCF!B12"],
  dynamic: [],
  suggestions: { inputs: [], outputs: [] },
  report: { counts: { match: 3, differs: 1, unsupported: 0, cycle: 0, no_cache: 1, random: 0, dated: 1 }, listed: [], unimplemented: [], tainted: 1, dynamic: 0 },
  engineBytes: "",
});

const input = (addr: string, label: string | null = null) => ({ sheet: "DCF", addr, role: "input" as const, label });
const output = (addr: string, label: string | null = null) => ({ sheet: "DCF", addr, role: "output" as const, label });

describe("checkChoice", () => {
  it("accepts a numeric constant as an input and an untainted numeric formula as a result", () => {
    expect(checkChoice(model(), [input("B2"), input("B10"), output("B8")])).toEqual({ ok: true });
  });

  it("accepts a TODAY() result: dated is marked, not blocked (D9)", () => {
    expect(checkChoice(model(), [input("B2"), output("B11")])).toEqual({ ok: true });
  });

  it.each([
    ["a formula as an input", input("B5"), "input_formula"],
    ["a text cell as an input", input("B3"), "input_not_number"],
    ["a date-formatted number as an input", input("B4"), "input_date"],
    ["a cell inside an array range as an input", input("F1"), "input_in_array"],
    ["a cell the workbook does not have as an input", input("Z99"), "input_missing"],
    ["a cell of a sheet the workbook does not have as an input", { ...input("B2"), sheet: "Nope" }, "input_missing"],
    ["a constant as a result", output("B10"), "output_not_formula"],
    ["a text result", output("B9"), "output_not_number"],
    ["a result that differs from Excel", output("B7"), "output_tainted"],
    ["a result that reads a cell that differs (tainted)", output("B6"), "output_tainted"],
    ["a result with no saved value", output("B12"), "output_tainted"],
    ["a cell the workbook does not have as a result", output("Z99"), "output_missing"],
  ])("refuses %s", (_what, cell, code) => {
    const choice = [cell.role === "input" ? cell : input("B2"), cell.role === "output" ? cell : output("B8")];
    expect(checkChoice(model(), choice)).toEqual({ ok: false, code, cell: `${cell.sheet}!${cell.addr}` });
  });

  it("names the first problem in the order given", () => {
    expect(checkChoice(model(), [input("B3"), input("B5"), output("B8")])).toMatchObject({ code: "input_not_number" });
  });

  it("has a plain sentence for every code, with no data from the workbook in it", () => {
    for (const [code, text] of Object.entries(CHOICE_TEXT)) {
      expect(text, code).toMatch(/\.$/);
      expect(text, code).not.toMatch(/DCF|B\d/);
    }
  });
});

describe("checkScenario", () => {
  const cells: CellRow[] = [
    { id: "11111111-1111-4111-8111-111111111111", versionId: "v", sheet: "DCF", addr: "B2", role: "input", label: null },
    { id: "22222222-2222-4222-8222-222222222222", versionId: "v", sheet: "DCF", addr: "B10", role: "input", label: "Terminal growth" },
    { id: "33333333-3333-4333-8333-333333333333", versionId: "v", sheet: "DCF", addr: "B8", role: "output", label: null },
  ];
  const A = cells[0].id;
  const B = cells[1].id;
  const OUT = cells[2].id;

  it("accepts values for his inputs, trims the name and the note", () => {
    expect(checkScenario(cells, { name: "  Bear  ", note: " slow ", values: { [A]: 0.135, [B]: -2 } })).toEqual({
      ok: true, name: "Bear", note: "slow", values: { [A]: 0.135, [B]: -2 },
    });
  });

  it("accepts a note left out", () => {
    expect(checkScenario(cells, { name: "Base", values: { [A]: 1 } })).toMatchObject({ ok: true, note: "" });
  });

  it.each([
    ["no values", {}],
    ["a value for a result", { [OUT]: 5 }],
    ["a value for a cell of no version of his", { "44444444-4444-4444-8444-444444444444": 5 }],
    ["a text value", { [A]: "5" }],
    ["NaN", { [A]: Number.NaN }],
    ["infinity", { [A]: Number.POSITIVE_INFINITY }],
    ["a value over 1e15", { [A]: 1e15 + 1e3 }],
    ["a value under -1e15", { [A]: -1e15 - 1e3 }],
    ["null", { [A]: null }],
  ])("refuses %s", (_what, values) => {
    expect(checkScenario(cells, { name: "Bear", note: "", values: values as Record<string, unknown> })).toEqual({ ok: false, code: "scenario_values" });
  });

  it("takes exactly 1e15 and -1e15", () => {
    expect(checkScenario(cells, { name: "Edge", values: { [A]: 1e15, [B]: -1e15 } })).toMatchObject({ ok: true });
  });

  it.each([
    ["an empty name", { name: "   ", values: { [A]: 1 } }],
    ["a name over 80 characters", { name: "n".repeat(81), values: { [A]: 1 } }],
    ["a note over 500 characters", { name: "Bear", note: "n".repeat(501), values: { [A]: 1 } }],
    ["a name that is not text", { name: 5, values: { [A]: 1 } }],
  ])("refuses %s", (_what, body) => {
    expect(checkScenario(cells, body as { name: unknown; note?: unknown; values: Record<string, unknown> })).toEqual({ ok: false, code: "scenario_name" });
  });
});
