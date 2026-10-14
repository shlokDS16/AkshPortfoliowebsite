import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildModel, type BuildStage } from "../../src/modules/valuation/build-model";
import { buildGraph } from "../../src/modules/valuation/graph";
import { loadTokenizer } from "../../src/modules/valuation/tokens";
import { XlsxRefusal } from "../../src/modules/valuation/refusal";
import { loadEngine } from "../../src/modules/valuation/engine-client";
import { readWorkbook } from "../../src/modules/valuation/read-workbook";
import { colLetters, buildXlsx, type CellSpec } from "../../src/test/xlsx-builder";

// Plan 2.7 Task 1, "Measurement": a workbook AT the caps (100,000 cells, 20,000 of them formulas) through the whole read, and one wasm
// recalculation. Results are appended to the file named by MEASURE_OUT (one JSON line per run) and echoed to stdout.

const OUT = process.env.MEASURE_OUT;
const emit = (record: Record<string, unknown>) => {
  const line = JSON.stringify(record);
  process.stdout.write(`MEASURE ${line}\n`);
  if (OUT) appendFileSync(OUT, `${line}\n`);
};
const mb = (kb: number) => Math.round(kb / 1024);

/**
 * 80,000 constants on "Data" (800 rows x 100 columns) and 20,000 formulas on "Calc":
 *  - 18,000 chain cells (180 rows x 100 columns): each adds the one above to a Data cell, so a change at the top moves 180 cells;
 *  - 1,950 SUMs over a 100-cell column slice;
 *  - 50 SUMs over distinct big blocks of Data (up to 80,000 cells each), the worst case for the reference graph.
 * Every saved value is computed here in plain arithmetic, so the workbook agrees with Excel the way a real one does.
 */
function atCapWorkbook(): { bytes: Uint8Array; cells: number; formulas: number } {
  const ROWS = 800;
  const COLS = 100;
  const data: number[][] = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => ((r * 31 + c * 17) % 97) + 1));
  const dataCells: CellSpec[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) dataCells.push({ addr: `${colLetters(c + 1)}${r + 1}`, v: data[r][c] });

  const calc: CellSpec[] = [];
  const chain: number[][] = Array.from({ length: 180 }, () => new Array<number>(COLS).fill(0));
  for (let r = 0; r < 180; r++) {
    for (let c = 0; c < COLS; c++) {
      const col = colLetters(c + 1);
      const above = r === 0 ? 0 : chain[r - 1][c];
      chain[r][c] = above * 1.001 + data[r][c];
      calc.push({ addr: `${col}${r + 1}`, f: r === 0 ? `Data!${col}1` : `${col}${r}*1.001+Data!${col}${r + 1}`, v: chain[r][c] });
    }
  }
  // 1,950 SUMs of a 100-row slice, in columns A..CV of rows 200..
  for (let i = 0; i < 1950; i++) {
    const c = i % COLS;
    const start = (Math.floor(i / COLS) * 37) % (ROWS - 100);
    let sum = 0;
    for (let r = start; r < start + 100; r++) sum += data[r][c];
    calc.push({ addr: `${colLetters(c + 1)}${200 + Math.floor(i / COLS)}`, f: `SUM(Data!${colLetters(c + 1)}${start + 1}:${colLetters(c + 1)}${start + 100})`, v: sum });
  }
  // 50 big blocks, distinct end rows: A1:CV{n}, n = 400..800.
  for (let i = 0; i < 50; i++) {
    const n = 400 + Math.round((i * 400) / 49);
    let sum = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < COLS; c++) sum += data[r][c];
    calc.push({ addr: `${colLetters(i + 1)}300`, f: `SUM(Data!A1:CV${n})`, v: sum });
  }
  const formulas = calc.length;
  const cells = dataCells.length + calc.length;
  return { bytes: buildXlsx({ sheets: [{ name: "Data", cells: dataCells }, { name: "Calc", cells: calc }] }), cells, formulas };
}

describe("at-cap workbook", () => {
  it("measures the whole read and one wasm recalculation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "desk-measure-"));
    try {
      const built = performance.now();
      const { bytes, cells, formulas } = atCapWorkbook();
      emit({ what: "workbook", cells, formulas, fileBytes: bytes.byteLength, buildMs: Math.round(performance.now() - built) });
      expect(cells).toBe(100_000);
      expect(formulas).toBe(20_000);

      const baseline = process.resourceUsage().maxRSS;
      const marks: Record<string, number> = {};
      const t0 = performance.now();
      let last = t0;
      const model = await buildModel(bytes, {
        tmpDir: dir,
        onStage: (stage: BuildStage) => {
          const now = performance.now();
          marks[`${stage}Ms`] = Math.round(now - last);
          last = now;
        },
      });
      const totalMs = Math.round(performance.now() - t0);
      const json = Buffer.byteLength(JSON.stringify(model));
      emit({
        what: "node-read",
        totalMs,
        stagesMs: marks,
        modelObjectBytes: json,
        engineBytesBase64: model.engineBytes.length,
        baselineRssMb: mb(baseline),
        peakRssMb: mb(process.resourceUsage().maxRSS),
        counts: model.report.counts,
        tainted: model.report.tainted,
        dynamic: model.report.dynamic,
      });

      // SheetJS parse alone, for the record.
      const p0 = performance.now();
      readWorkbook(bytes);
      const index = readWorkbook(bytes);
      emit({ what: "readWorkbook-alone", ms: Math.round(performance.now() - p0) });
      const g0 = performance.now();
      const graph = buildGraph(index, await loadTokenizer());
      emit({ what: "graph-alone", ms: Math.round(performance.now() - g0), estimatedEvalMs: Math.round(graph.estimatedEvalMs) });

      // wasm: load the server's bytes, then recalculate after one input change, and 25 times as a sensitivity grid does.
      const wasmFile = readFileSync(new URL("../../node_modules/@ironcalc/wasm/wasm_bg.wasm", import.meta.url));
      const engineBytes = new Uint8Array(Buffer.from(model.engineBytes, "base64"));
      const results = [{ sheet: 1, addr: "A180" }, { sheet: 1, addr: "A300" }, { sheet: 1, addr: "CV180" }];
      const l0 = performance.now();
      const engine = await loadEngine(engineBytes, (wasm) => wasm.initSync({ module: wasmFile }), results);
      const loadMs = Math.round(performance.now() - l0);
      const one = (value: number) => {
        const s = performance.now();
        engine.setInputs([{ sheet: 0, addr: "A1", value }]);
        engine.evaluate();
        const r = engine.readResults(results);
        return { ms: performance.now() - s, r };
      };
      const first = one(11);
      const runs = Array.from({ length: 25 }, (_, i) => one(12 + i).ms);
      const evalOnly = (() => {
        const s = performance.now();
        engine.evaluate();
        return performance.now() - s;
      })();
      emit({
        what: "wasm",
        loadMs,
        firstChangeAndEvaluateMs: Math.round(first.ms * 10) / 10,
        gridOf25Ms: Math.round(runs.reduce((a, b) => a + b, 0)),
        perChangeMs: { min: Math.round(Math.min(...runs) * 10) / 10, max: Math.round(Math.max(...runs) * 10) / 10 },
        evaluateOnlyMs: Math.round(evalOnly * 10) / 10,
        sample: first.r,
        peakRssMb: mb(process.resourceUsage().maxRSS),
      });
      engine.dispose();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    writeFileSync(join(tmpdir(), "desk-measure-done.txt"), "ok");
  });
});

/**
 * The adversarial shape the cell caps do NOT bound: many formulas that each read the whole 80,000-cell data block. Evaluation is one
 * synchronous native call, so its time is cells read x formulas. N formulas of the given kind are measured through the full read; the
 * 20,000-formula figure is extrapolated linearly (and one run is made at the full 20,000 for SUM to confirm the line).
 */
function blockWorkbook(kind: "SUM" | "SUMPRODUCT", n: number): Uint8Array {
  const ROWS = 800;
  const COLS = 100;
  const data: CellSpec[] = [];
  let total = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = ((r * 31 + c * 17) % 97) + 1;
      total += kind === "SUM" ? v : v * v;
      data.push({ addr: `${colLetters(c + 1)}${r + 1}`, v });
    }
  }
  const calc: CellSpec[] = [];
  const f = kind === "SUM" ? "SUM(Data!A1:CV800)" : "SUMPRODUCT(Data!A1:CV800,Data!A1:CV800)";
  for (let i = 0; i < n; i++) calc.push({ addr: `${colLetters((i % 100) + 1)}${Math.floor(i / 100) + 1}`, f, v: total });
  return buildXlsx({ sheets: [{ name: "Data", cells: data }, { name: "Calc", cells: calc }] });
}

describe("many formulas that each read the whole block", () => {
  for (const [kind, n] of [["SUM", 500], ["SUMPRODUCT", 500], ["SUM", 20_000]] as const) {
    it(`${n} x ${kind}`, async () => {
      const dir = mkdtempSync(join(tmpdir(), "desk-measure-"));
      try {
        const bytes = blockWorkbook(kind, n);
        const marks: Record<string, number> = {};
        let last = performance.now();
        const t0 = last;
        try {
          const model = await buildModel(bytes, {
            tmpDir: dir,
            budgetMs: 1_000_000,
            onStage: (stage) => {
              const now = performance.now();
              marks[`${stage}Ms`] = Math.round(now - last);
              last = now;
            },
          });
          emit({ what: `block-${kind}-${n}`, totalMs: Math.round(performance.now() - t0), stagesMs: marks, counts: model.report.counts, peakRssMb: mb(process.resourceUsage().maxRSS) });
        } catch (error) {
          // The cost estimate (cost.ts) refuses what it expects to take over 30 s, before the engine starts.
          if (!(error instanceof XlsxRefusal)) throw error;
          emit({ what: `block-${kind}-${n}`, refused: error.code, totalMs: Math.round(performance.now() - t0), stagesMs: marks });
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
