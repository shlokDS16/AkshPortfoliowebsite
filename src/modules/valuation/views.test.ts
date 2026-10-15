import { describe, expect, it } from "vitest";
import type { CellRow } from "./records";
import type { ModelObject } from "./types";
import { confirmRows, MAX_BLOCKED_ROWS, scenarioCells } from "./views";

// Plan 2.7 Task 3: what the confirm list and the scenario panels show, from the model object (machine) and his rows (his words). Pure.

function model(over: Partial<ModelObject> = {}): ModelObject {
  return {
    modelVersion: 1,
    engine: { sheetjs: "0.20.3", ironcalcNode: "0.8.3", ironcalcWasm: "0.8.4" },
    index: {
      sheets: [
        {
          name: "DCF",
          arrays: [],
          cells: [
            ["A1", null, "Cost of equity", "s", null],
            ["B1", null, 0.115, "n", "0.0%"],
            ["A2", null, "Terminal growth", "s", null],
            ["B2", null, 0.04, "n", "0.0%"],
            ["A3", null, "Equity value", "s", null],
            ["B3", "B1*1000", 115, "n", "#,##0.0"],
            ["A4", null, "Stale", "s", null],
            ["B4", "B3*1", 120, "n", null],
            ["A5", null, "Reads stale", "s", null],
            ["B5", "B4+1", 121, "n", null],
            ["B6", 'IF(B4>0,"y","n")', "y", "s", null],
          ],
        },
      ],
      names: [],
      counts: { sheets: 1, cells: 11, formulas: 4 },
      stringsCut: 0,
    },
    classes: { "DCF!B4": "unsupported" },
    taint: ["DCF!B4", "DCF!B5", "DCF!B6"],
    dynamic: [],
    suggestions: {
      inputs: [
        { sheet: "DCF", addr: "B1", value: 0.115, z: "0.0%", dependents: 3, label: "Cost of equity" },
        { sheet: "DCF", addr: "B2", value: 0.04, z: "0.0%", dependents: 0, label: "Terminal growth" },
      ],
      outputs: [{ sheet: "DCF", addr: "B3", value: 115, z: "#,##0.0", precedents: 1, label: "Equity value" }],
    },
    report: {
      counts: { match: 1, differs: 0, unsupported: 1, cycle: 0, no_cache: 0, random: 0, dated: 0 },
      listed: [{ cell: "DCF!B4", cls: "unsupported", excel: "120", desk: "#N/IMPL!", fn: "CUBEVALUE" }],
      unimplemented: ["CUBEVALUE"],
      tainted: 2,
      dynamic: 0,
    },
    engineBytes: "",
    ...over,
  };
}

describe("confirmRows", () => {
  it("lists the suggested inputs and results with the sheet's label, nothing carried", () => {
    const data = confirmRows(model(), null);
    expect(data.carriedFrom).toBeNull();
    expect(data.inputs.map((r) => [r.addr, r.sheetLabel, r.carried, r.blocked])).toEqual([
      ["B1", "Cost of equity", false, null],
      ["B2", "Terminal growth", false, null],
    ]);
    expect(data.outputs[0]).toEqual({ sheet: "DCF", addr: "B3", value: 115, z: "#,##0.0", sheetLabel: "Equity value", carried: false, blocked: null });
  });

  it("adds the numeric results that depend on a disagreement, greyed with the reason; a text result is not one", () => {
    const blocked = confirmRows(model(), null).outputs.filter((r) => r.blocked);
    expect(blocked.map((r) => [r.addr, r.blocked])).toEqual([
      ["B4", { cls: "unsupported", fn: "CUBEVALUE" }],
      ["B5", { cls: "depends", fn: null }],
    ]);
  });

  it(`shows at most ${MAX_BLOCKED_ROWS} greyed results`, () => {
    const cells: ModelObject["index"]["sheets"][number]["cells"] = Array.from({ length: 30 }, (_, i) => [`C${i + 1}`, "B4*2", 1, "n", null]);
    const m = model();
    m.index.sheets[0].cells.push(...cells);
    m.taint.push(...cells.map((c) => `DCF!${c[0]}`));
    expect(confirmRows(m, null).outputs.filter((r) => r.blocked)).toHaveLength(MAX_BLOCKED_ROWS);
  });

  it("pre-ticks a cell confirmed in the previous version only when it is still the same kind of cell under the same label", () => {
    const before = model();
    const now = model();
    // B2's label changed, so it is not carried; B1 and the result B3 are.
    now.index.sheets[0].cells[2] = ["A2", null, "Long-run growth", "s", null];
    const data = confirmRows(now, {
      versionNo: 3,
      model: before,
      cells: [
        { sheet: "DCF", addr: "B1", role: "input" },
        { sheet: "DCF", addr: "B2", role: "input" },
        { sheet: "DCF", addr: "B3", role: "output" },
      ],
    });
    expect(data.carriedFrom).toBe(3);
    expect(data.inputs.filter((r) => r.carried).map((r) => r.addr)).toEqual(["B1"]);
    expect(data.outputs.filter((r) => r.carried).map((r) => r.addr)).toEqual(["B3"]);
  });

  it("lists a carried cell the suggestions left out", () => {
    const now = model();
    now.suggestions.inputs = [];
    const data = confirmRows(now, { versionNo: 2, model: model(), cells: [{ sheet: "DCF", addr: "B1", role: "input" }] });
    expect(data.inputs).toEqual([{ sheet: "DCF", addr: "B1", value: 0.115, z: "0.0%", sheetLabel: "Cost of equity", carried: true, blocked: null }]);
  });
});

describe("scenarioCells", () => {
  const row = (over: Partial<CellRow>): CellRow => ({ id: "c1", versionId: "v", sheet: "DCF", addr: "B1", role: "input", label: null, ...over });

  it("shows his label as he typed it, else the sheet's label marked as the sheet's, with the workbook value and format", () => {
    const cells = scenarioCells(model(), [row({ id: "c1", label: "My cost of capital" }), row({ id: "c2", addr: "B2" }), row({ id: "c3", addr: "B3", role: "output" })]);
    expect(cells).toEqual([
      { id: "c1", sheet: "DCF", addr: "B1", role: "input", label: "My cost of capital", own: true, value: 0.115, z: "0.0%" },
      { id: "c2", sheet: "DCF", addr: "B2", role: "input", label: "Terminal growth", own: false, value: 0.04, z: "0.0%" },
      { id: "c3", sheet: "DCF", addr: "B3", role: "output", label: "Equity value", own: false, value: 115, z: "#,##0.0" },
    ]);
  });

  it("names a cell with no label by its address, and leaves out a cell that is not a number in the stored model", () => {
    const cells = scenarioCells(model(), [row({ id: "c1", addr: "B6", role: "output" }), row({ id: "c2", addr: "Z9" })]);
    expect(cells).toEqual([]);
    const m = model();
    m.index.sheets[0].cells.push(["D9", null, 7, "n", null]);
    expect(scenarioCells(m, [row({ addr: "D9" })])[0]).toMatchObject({ label: "DCF!D9", own: false, value: 7 });
  });
});
