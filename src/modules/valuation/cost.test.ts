import { describe, expect, it } from "vitest";
import { estimateFormulaNs, NS_PER_PRESENT_CELL } from "./cost";
import { MAX_EVAL_ESTIMATE_MS } from "./limits";

const ms = (ns: number) => ns / 1e6;
const cap = MAX_EVAL_ESTIMATE_MS;

describe("estimateFormulaNs: an upper estimate of how long the engine takes over one formula", () => {
  it("a formula with no ranges costs nothing worth counting", () => {
    expect(estimateFormulaNs({ functions: ["NPV"], ranges: [], dynamic: false, totalCells: 1000 })).toBe(0);
  });

  it("an ordinary function costs per cell actually filled, however large the reference says it is", () => {
    const wholeColumn = { declared: 1_048_576, present: 800 };
    expect(estimateFormulaNs({ functions: ["SUM"], ranges: [wholeColumn], dynamic: false, totalCells: 1000 })).toBe(800 * NS_PER_PRESENT_CELL);
  });

  it("a function that scans the whole reference costs per cell of the reference", () => {
    const wholeColumn = { declared: 1_048_576, present: 800 };
    const scan = estimateFormulaNs({ functions: ["MAX"], ranges: [wholeColumn], dynamic: false, totalCells: 1000 });
    expect(ms(scan)).toBeGreaterThan(40); // measured 10 ms; the estimate is meant to be above
    expect(ms(scan)).toBeLessThan(200);
  });

  it("an array function over whole columns is the expensive case", () => {
    const cols = [{ declared: 1_048_576, present: 800 }, { declared: 1_048_576, present: 800 }];
    const array = estimateFormulaNs({ functions: ["SUMPRODUCT"], ranges: cols, dynamic: false, totalCells: 1000 });
    expect(ms(array)).toBeGreaterThan(400); // measured 390-437 ms
  });

  it("a dynamic cell is charged for the whole workbook, since its reach is unknown", () => {
    expect(estimateFormulaNs({ functions: ["OFFSET"], ranges: [], dynamic: true, totalCells: 100_000 })).toBe(100_000 * NS_PER_PRESENT_CELL);
  });
});

describe("the cap, against the shapes measured on 2026-10-14 (Node 24, IronCalc 0.8.3)", () => {
  const total = (n: number, per: number) => ms(n * per);

  it("20,000 formulas that each sum the 80,000-cell block (measured 96 s) are over the cap", () => {
    expect(total(20_000, estimateFormulaNs({ functions: ["SUM"], ranges: [{ declared: 80_000, present: 80_000 }], dynamic: false, totalCells: 100_000 }))).toBeGreaterThan(cap);
  });

  it("a realistic at-cap workbook (measured 0.13 s to evaluate) is far under it", () => {
    const chain = 18_000 * estimateFormulaNs({ functions: [], ranges: [], dynamic: false, totalCells: 100_000 });
    const slices = 1_950 * estimateFormulaNs({ functions: ["SUM"], ranges: [{ declared: 100, present: 100 }], dynamic: false, totalCells: 100_000 });
    const blocks = 50 * estimateFormulaNs({ functions: ["SUM"], ranges: [{ declared: 60_000, present: 60_000 }], dynamic: false, totalCells: 100_000 });
    expect(ms(chain + slices + blocks)).toBeLessThan(cap / 10);
  });

  it("a few hundred lookups on whole columns are fine; twenty thousand are not", () => {
    const lookup = estimateFormulaNs({ functions: ["MATCH"], ranges: [{ declared: 1_048_576, present: 800 }], dynamic: false, totalCells: 100_000 });
    expect(total(300, lookup)).toBeLessThan(cap);
    expect(total(20_000, lookup)).toBeGreaterThan(cap);
  });

  it("twenty SUMPRODUCT(A:A,B:B) (measured 8.7 s) pass; fifty do not", () => {
    const sp = estimateFormulaNs({ functions: ["SUMPRODUCT"], ranges: [{ declared: 1_048_576, present: 800 }, { declared: 1_048_576, present: 800 }], dynamic: false, totalCells: 100_000 });
    expect(total(20, sp)).toBeLessThan(cap);
    expect(total(50, sp)).toBeGreaterThan(cap);
  });

  it("thousands of OFFSET or INDIRECT cells are over the cap", () => {
    const dyn = estimateFormulaNs({ functions: ["OFFSET"], ranges: [], dynamic: true, totalCells: 100_000 });
    expect(total(200, dyn)).toBeLessThan(cap);
    expect(total(10_000, dyn)).toBeGreaterThan(cap);
  });
});
