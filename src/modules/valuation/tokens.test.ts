import { beforeAll, describe, expect, it } from "vitest";
import { loadTokenizer, type Tokenizer } from "./tokens";

let t: Tokenizer;
beforeAll(async () => {
  t = await loadTokenizer();
});

describe("references of a formula, from the IronCalc tokenizer", () => {
  it("single cells, with and without $", () => {
    const r = t.parse("A1+$B$2*C10");
    expect(r.cells).toEqual([
      { sheet: null, row: 1, col: 1 },
      { sheet: null, row: 2, col: 2 },
      { sheet: null, row: 10, col: 3 },
    ]);
    expect(r.dynamic).toBe(false);
  });

  it("a range", () => {
    expect(t.parse("SUM(A1:B3)").ranges).toEqual([{ sheet: null, row1: 1, col1: 1, row2: 3, col2: 2 }]);
  });

  it("sheet-qualified cells and ranges, quoted names included", () => {
    expect(t.parse("Sheet2!A1*2").cells).toEqual([{ sheet: "Sheet2", row: 1, col: 1 }]);
    expect(t.parse("'My Sheet'!$A$1+1").cells).toEqual([{ sheet: "My Sheet", row: 1, col: 1 }]);
    expect(t.parse("SUM(Sheet2!A1:B2)").ranges).toEqual([{ sheet: "Sheet2", row1: 1, col1: 1, row2: 2, col2: 2 }]);
  });

  it("whole columns and whole rows", () => {
    expect(t.parse("SUM(A:A)").ranges).toEqual([{ sheet: null, row1: 1, col1: 1, row2: 1_048_576, col2: 1 }]);
    expect(t.parse("SUM(1:3)").ranges).toEqual([{ sheet: null, row1: 1, col1: 1, row2: 3, col2: 16_384 }]);
  });

  it("defined names are the identifiers that are not functions", () => {
    const r = t.parse("rate*2+NPV(rate,B2:B6)");
    expect(r.names).toEqual(["rate", "rate"]);
    expect(r.functions).toEqual(["NPV"]);
  });

  it("function names are upper-cased, once per use, and text inside strings is not read", () => {
    const r = t.parse('if(A1>0,"x(SUM(",1)');
    expect(r.functions).toEqual(["IF"]);
    expect(r.cells).toHaveLength(1);
  });

  it("OFFSET and INDIRECT make the cell dynamic and still report their static references", () => {
    const off = t.parse("OFFSET(A1,1,1)");
    expect(off.dynamic).toBe(true);
    expect(off.cells).toEqual([{ sheet: null, row: 1, col: 1 }]);
    expect(t.parse('INDIRECT("B1")').dynamic).toBe(true);
    expect(t.parse("SUM(1,2)").dynamic).toBe(false);
  });

  it("references the tokenizer cannot follow also make the cell dynamic: 3D, structured, spill", () => {
    expect(t.parse("Sheet1!A1:Sheet3!B2").dynamic).toBe(true);
    expect(t.parse("Table1[Col]").dynamic).toBe(true);
    expect(t.parse("A1#").dynamic).toBe(true);
  });

  it("a constant formula has no references", () => {
    const r = t.parse("0.115");
    expect(r).toEqual({ cells: [], ranges: [], names: [], functions: [], dynamic: false });
  });

  it("loading twice returns a working tokenizer both times", async () => {
    const again = await loadTokenizer();
    expect(again.parse("A1").cells).toHaveLength(1);
  });
});
