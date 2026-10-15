import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dcfBook } from "@/test/dcf-fixture";
import { loadEngine, type CalcEngine, type ResultCell, type ResultValue } from "./engine-client";
import { runNodeEngine, type NodeEngineResult } from "./engine-node";
import { readWorkbook } from "./read-workbook";
import type { SheetIndex } from "./types";

const wasmFile = readFileSync(new URL("../../../node_modules/@ironcalc/wasm/wasm_bg.wasm", import.meta.url));
// In Node the module is initialised from the file's bytes; in the browser, from a URL (Task 3). The wrapper takes the initialiser as an argument.
const initFromFile = (wasm: { initSync: (m: { module: Uint8Array }) => unknown }) => wasm.initSync({ module: wasmFile });

let dir: string;
let index: SheetIndex;
let node: NodeEngineResult;
let cells: ResultCell[];
let engine: CalcEngine;

const formulaCells = (i: SheetIndex): ResultCell[] =>
  i.sheets.flatMap((s, sheet) => s.cells.filter((c) => c[1] !== null).map((c) => ({ sheet, addr: c[0] })));

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "desk-client-test-"));
  const bytes = dcfBook();
  index = readWorkbook(bytes);
  node = await runNodeEngine(bytes, index, { tmpDir: dir });
  cells = formulaCells(index);
  engine = await loadEngine(node.engineBytes, initFromFile, cells);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const sig15 = (n: number) => Number(n.toPrecision(15));
const valueAt = (results: ResultValue[], addr: string): ResultValue => results[cells.findIndex((c) => c.addr === addr)];

describe("the browser engine (wasm 0.8.4) reads what the server engine (Node 0.8.3) wrote", () => {
  it("gives the same value for every formula cell (the version-skew guard)", () => {
    engine.evaluate();
    const results = engine.readResults(cells);
    for (const [i, cell] of cells.entries()) {
      const expected = node.values.get(`${index.sheets[cell.sheet].name}!${cell.addr}`)!;
      const got = results[i];
      if (expected.kind === "n") expect(got, cell.addr).toEqual({ kind: "number", value: expect.closeTo(expected.v, 12) });
      else if (expected.kind === "s") expect(got, cell.addr).toEqual({ kind: "text", text: expected.v });
      else if (expected.kind === "e") expect(got, cell.addr).toEqual({ kind: "error", text: expected.text });
      else if (expected.kind === "b") expect(got, cell.addr).toEqual({ kind: "boolean", value: expected.v });
    }
  });

  it("the full-precision readback equals the Node raw value to 15 significant digits", () => {
    engine.evaluate();
    const results = engine.readResults(cells);
    for (const [i, cell] of cells.entries()) {
      const expected = node.values.get(`${index.sheets[cell.sheet].name}!${cell.addr}`)!;
      if (expected.kind !== "n") continue;
      const got = results[i];
      expect(got.kind).toBe("number");
      if (got.kind === "number") expect(got.value, cell.addr).toBe(sig15(expected.v));
    }
  });

  it("names the sheets in the engine's order", () => {
    expect(engine.sheetNames()).toEqual(index.sheets.map((s) => s.name));
  });
});

describe("changing an input", () => {
  it("moves the cells that depend on it", () => {
    engine.setInputs([{ sheet: 0, addr: "B1", value: 0.2 }]);
    engine.evaluate();
    const npv = -100 + 30 / 1.2 + 50 / 1.2 ** 2 + 80 / 1.2 ** 3;
    expect(valueAt(engine.readResults(cells), "B3")).toEqual({ kind: "number", value: expect.closeTo(npv, 9) });
    expect(valueAt(engine.readResults(cells), "B8")).toEqual({ kind: "number", value: 0.2 });
  });

  it("takes a percent-formatted cell as the plain fraction: 0.2 is 20%, not 0.2%", () => {
    engine.setInputs([{ sheet: 0, addr: "B1", value: 0.115 }]);
    engine.evaluate();
    expect(valueAt(engine.readResults(cells), "B8")).toEqual({ kind: "number", value: 0.115 });
  });

  it("refuses a value that is not a finite number within 1e15", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 1e15 + 1, -1e16]) {
      expect(() => engine.setInputs([{ sheet: 0, addr: "B1", value }])).toThrow(RangeError);
    }
    expect(() => engine.setInputs([{ sheet: 0, addr: "B1", value: 1e15 }])).not.toThrow();
    engine.setInputs([{ sheet: 0, addr: "B1", value: 0.115 }]);
  });

  it("refuses an address that is not a cell", () => {
    expect(() => engine.setInputs([{ sheet: 0, addr: "ZZZZ9", value: 1 }])).toThrow(RangeError);
  });

  it("small and large values survive the trip into the engine", () => {
    for (const value of [1e-7, -3.5, 123456.789, 1e12]) {
      engine.setInputs([{ sheet: 0, addr: "B1", value }]);
      engine.evaluate();
      expect(valueAt(engine.readResults(cells), "B8")).toEqual({ kind: "number", value: sig15(value) });
    }
    engine.setInputs([{ sheet: 0, addr: "B1", value: 0.115 }]);
  });

  it("25 recalculations of a small model are quick", () => {
    const start = performance.now();
    for (let n = 0; n < 25; n++) {
      engine.setInputs([{ sheet: 0, addr: "B1", value: 0.1 + n / 1000 }]);
      engine.evaluate();
      engine.readResults(cells);
    }
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
