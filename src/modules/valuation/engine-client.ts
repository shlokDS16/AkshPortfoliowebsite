import type { Model as WasmModel } from "@ironcalc/wasm";
import { parseAddr } from "./addr";
import { MAX_SCENARIO_VALUE } from "./limits";

// The browser-safe wrapper over the IronCalc wasm module (spec s3, s7.4, D24). The caller supplies the initialiser, because starting the
// module differs by place: in the browser it is `wasm.default({ module_or_path: url })` with the file served from public/vendor, in Node
// (the tests, the measurement) it is `wasm.initSync({ module: bytes })`. wasm 0.8.4 has no raw-value getter, so the result cells get the
// number format `0.00000000000000E+00` and are read through getFormattedCellValue: 15 significant digits, enough to display and to compare.
// This file and tokens.ts are the only importers of @ironcalc/wasm. Model bytes come from the server's own engine, never from the upload.

export type WasmApi = typeof import("@ironcalc/wasm");
export type ResultCell = { sheet: number; addr: string };
export type InputValue = { sheet: number; addr: string; value: number };
export type ResultValue =
  | { kind: "number"; value: number }
  | { kind: "text"; text: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "error"; text: string }
  | { kind: "empty" };

export type CalcEngine = {
  sheetNames(): string[];
  /** Sets plain numbers, as a user would type them. Throws RangeError (and sets nothing) for a non-finite or huge value or a bad address. */
  setInputs(inputs: InputValue[]): void;
  evaluate(): void;
  readResults(cells: ResultCell[]): ResultValue[];
  dispose(): void;
};

const FULL_PRECISION = "0.00000000000000E+00";
// IronCalc's cell type numbers (Excel's TYPE() convention).
const T_NUMBER = 1;
const T_TEXT = 2;
const T_LOGICAL = 4;
const T_ERROR = 16;

function position(cell: ResultCell): { sheet: number; row: number; col: number } {
  const pos = parseAddr(cell.addr);
  if (!pos || !Number.isInteger(cell.sheet) || cell.sheet < 0) throw new RangeError("not a cell");
  return { sheet: cell.sheet, ...pos };
}

function readOne(model: WasmModel, cell: ResultCell): ResultValue {
  const { sheet, row, col } = position(cell);
  const type = model.getCellType(sheet, row, col);
  const text = model.getFormattedCellValue(sheet, row, col);
  if (type === T_ERROR) return { kind: "error", text };
  if (type === T_NUMBER) {
    const value = Number(text);
    return Number.isFinite(value) ? { kind: "number", value } : { kind: "text", text };
  }
  if (type === T_LOGICAL) return { kind: "boolean", value: text === "TRUE" };
  if (type === T_TEXT) return { kind: "text", text };
  return { kind: "empty" };
}

/** Loads the server's model bytes. `resultCells` get the full-precision format (set once, here); `init` starts the wasm module. */
export async function loadEngine(
  engineBytes: Uint8Array,
  init: (wasm: WasmApi) => unknown,
  resultCells: ResultCell[] = [],
): Promise<CalcEngine> {
  const wasm = await import("@ironcalc/wasm");
  await init(wasm);
  const model = wasm.Model.from_bytes(engineBytes, "en");
  for (const cell of resultCells) {
    const { sheet, row, col } = position(cell);
    model.updateRangeStyle({ sheet, row, column: col, width: 1, height: 1 }, "num_fmt", FULL_PRECISION);
  }
  model.evaluate();

  return {
    sheetNames: () => model.getWorksheetsProperties().map((p) => p.name),
    setInputs(inputs) {
      const checked = inputs.map((input) => {
        if (!Number.isFinite(input.value) || Math.abs(input.value) > MAX_SCENARIO_VALUE) throw new RangeError("value out of range");
        return { ...position(input), value: input.value };
      });
      // wasm 0.8.4's Model recalculates on every setUserInput unless evaluation is paused (measured: at the caps that is a second 190 ms
      // pass per input). Paused, a change costs the one explicit evaluate() the caller makes next.
      model.pauseEvaluation();
      try {
        for (const { sheet, row, col, value } of checked) model.setUserInput(sheet, row, col, String(value));
      } finally {
        model.resumeEvaluation();
      }
    },
    evaluate: () => model.evaluate(),
    readResults: (cells) => cells.map((cell) => readOne(model, cell)),
    dispose: () => model.free(),
  };
}
