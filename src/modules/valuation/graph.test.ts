import { beforeAll, describe, expect, it } from "vitest";
import { buildGraph, type Graph } from "./graph";
import { XlsxRefusal } from "./refusal";
import { loadTokenizer, type Tokenizer } from "./tokens";
import type { IndexCell, SheetIndex } from "./types";

let tokenizer: Tokenizer;
beforeAll(async () => {
  tokenizer = await loadTokenizer();
});

type Spec = [addr: string, f: string | null, v?: number | string];
const cell = ([addr, f, v]: Spec): IndexCell => [addr, f, v ?? (f === null ? 1 : 1), typeof v === "string" ? "s" : "n", null];
const book = (sheets: Record<string, Spec[]>, names: SheetIndex["names"] = []): SheetIndex => {
  const list = Object.entries(sheets).map(([name, cells]) => ({ name, cells: cells.map(cell), arrays: [] }));
  const count = list.flatMap((s) => s.cells);
  return { sheets: list, names, counts: { sheets: list.length, cells: count.length, formulas: count.filter((c) => c[1] !== null).length }, stringsCut: 0 };
};
const id = (g: Graph, key: string): number => {
  const found = g.id(key);
  if (found === undefined) throw new Error(`no cell ${key}`);
  return found;
};
const tainted = (g: Graph, sources: string[]): string[] => {
  const t = g.taint(sources.map((s) => id(g, s)));
  return Array.from({ length: g.size }, (_, i) => i).filter((i) => t[i]).map((i) => g.key(i)).sort();
};

describe("the reference graph: edges", () => {
  it("a direct reference is an edge, so the input has one dependent", () => {
    const g = buildGraph(book({ S: [["A1", null], ["B1", "A1*2"]] }), tokenizer);
    expect(g.dependents(id(g, "S!A1"))).toBe(1);
    expect(g.precedents(id(g, "S!B1"))).toBe(1);
    expect(g.dependents(id(g, "S!B1"))).toBe(0);
  });

  it("a range A1:A5 is an edge from each filled cell inside it", () => {
    const g = buildGraph(book({ S: [["A1", null], ["A2", null], ["A4", null], ["A9", null], ["B1", "SUM(A1:A5)"]] }), tokenizer);
    for (const k of ["S!A1", "S!A2", "S!A4"]) expect(g.dependents(id(g, k)), k).toBe(1);
    expect(g.dependents(id(g, "S!A9"))).toBe(0);
    expect(g.precedents(id(g, "S!B1"))).toBe(3);
  });

  it("a sheet-qualified reference, quoted names included", () => {
    const g = buildGraph(book({ "My Sheet": [["B1", null]], T: [["A1", "'My Sheet'!$B$1+1"]] }), tokenizer);
    expect(g.dependents(id(g, "My Sheet!B1"))).toBe(1);
  });

  it("a whole-column reference is clamped to the cells that exist", () => {
    const g = buildGraph(book({ S: [["A1", null], ["A3", null], ["B1", "SUM(A:A)"]] }), tokenizer);
    expect(g.precedents(id(g, "S!B1"))).toBe(2);
  });

  it("a reference to an empty cell is no edge, and a reference to an unknown sheet makes the cell dynamic", () => {
    const g = buildGraph(book({ S: [["B1", "A1+1"], ["B2", "Nowhere!A1+1"]] }), tokenizer);
    expect(g.precedents(id(g, "S!B1"))).toBe(0);
    expect(g.isDynamic(id(g, "S!B1"))).toBe(false);
    expect(g.isDynamic(id(g, "S!B2"))).toBe(true);
  });

  it("defined names resolve to their cells and ranges, local names before workbook-wide ones", () => {
    const names = [
      { name: "rate", ref: "S!$A$1", sheet: null },
      { name: "flows", ref: "S!$A$2:$A$3", sheet: null },
      { name: "rate", ref: "T!$A$1", sheet: "T" },
    ];
    const g = buildGraph(book({ S: [["A1", null], ["A2", null], ["A3", null], ["B1", "rate*SUM(flows)"]], T: [["A1", null], ["B1", "rate+1"]] }, names), tokenizer);
    expect(g.dependents(id(g, "S!A1"))).toBe(1);
    expect(g.dependents(id(g, "S!A2"))).toBe(1);
    expect(g.dependents(id(g, "T!A1"))).toBe(1);
    expect(g.precedents(id(g, "T!B1"))).toBe(1);
  });

  it("a name that is a constant adds no edge; names that refer to names resolve; a loop of names makes the cell dynamic", () => {
    const names = [
      { name: "k", ref: "0.12", sheet: null },
      { name: "outer", ref: "inner", sheet: null },
      { name: "inner", ref: "S!$A$1", sheet: null },
      { name: "a", ref: "b", sheet: null },
      { name: "b", ref: "a", sheet: null },
    ];
    const g = buildGraph(book({ S: [["A1", null], ["B1", "k*2"], ["B2", "outer+1"], ["B3", "a+1"]] }, names), tokenizer);
    expect(g.precedents(id(g, "S!B1"))).toBe(0);
    expect(g.precedents(id(g, "S!B2"))).toBe(1);
    expect(g.isDynamic(id(g, "S!B3"))).toBe(true);
  });

  it("an INDIRECT or OFFSET cell is dynamic; its static references still count", () => {
    const g = buildGraph(book({ S: [["A1", null], ["B1", 'INDIRECT("A1")'], ["B2", "OFFSET(A1,1,0)"], ["B3", "A1+1"]] }), tokenizer);
    expect(g.isDynamic(id(g, "S!B1"))).toBe(true);
    expect(g.isDynamic(id(g, "S!B2"))).toBe(true);
    expect(g.isDynamic(id(g, "S!B3"))).toBe(false);
    expect(g.precedents(id(g, "S!B2"))).toBe(1);
  });

  it("records the functions each formula uses", () => {
    const g = buildGraph(book({ S: [["A1", null], ["B1", "NPV(0.1,A1)+RAND()"]] }), tokenizer);
    expect(g.functions(id(g, "S!B1"))).toEqual(["NPV", "RAND"]);
  });

  it("refuses a workbook whose ranges would need more than the membership budget", () => {
    const cells: Spec[] = Array.from({ length: 30 }, (_, i) => [`A${i + 1}`, null] as Spec);
    const formulas: Spec[] = Array.from({ length: 30 }, (_, i) => [`B${i + 1}`, `SUM(A1:A${i + 1})`] as Spec);
    let code = "";
    try {
      buildGraph(book({ S: [...cells, ...formulas] }), tokenizer, { maxMembers: 100 });
    } catch (error) {
      code = (error as XlsxRefusal).code;
    }
    expect(code).toBe("too_complex");
  });

  it("identical ranges are expanded once", () => {
    const cells: Spec[] = Array.from({ length: 10 }, (_, i) => [`A${i + 1}`, null] as Spec);
    const formulas: Spec[] = Array.from({ length: 40 }, (_, i) => [`B${i + 1}`, "SUM($A$1:$A$10)"] as Spec);
    const g = buildGraph(book({ S: [...cells, ...formulas] }), tokenizer, { maxMembers: 15 });
    expect(g.dependents(id(g, "S!A1"))).toBe(40);
  });
});

describe("the reference graph: taint", () => {
  const chain = book({
    S: [
      ["A1", null], // input
      ["B1", "A1*2"], // source of trouble
      ["C1", "B1+1"],
      ["D1", "C1+1"],
      ["E1", "D1+1"], // three steps downstream of B1's dependents
      ["B2", "A1*3"], // sibling: depends on A1 only
      ["F1", "SUM(B1:B2)"], // through a range
    ],
  });

  it("reaches a result three steps downstream, through a range, and not a sibling", () => {
    const g = buildGraph(chain, tokenizer);
    expect(tainted(g, ["S!B1"])).toEqual(["S!B1", "S!C1", "S!D1", "S!E1", "S!F1"]);
  });

  it("a source taints itself and nothing upstream", () => {
    const g = buildGraph(chain, tokenizer);
    expect(tainted(g, ["S!D1"])).toEqual(["S!D1", "S!E1"]);
  });

  it("several sources at once, and none", () => {
    const g = buildGraph(chain, tokenizer);
    expect(tainted(g, ["S!B2", "S!D1"])).toEqual(["S!B2", "S!D1", "S!E1", "S!F1"]);
    expect(tainted(g, [])).toEqual([]);
  });

  it("crosses sheets and defined names", () => {
    const names = [{ name: "growth", ref: "S!$B$1", sheet: null }];
    const g = buildGraph(book({ S: [["A1", null], ["B1", "A1+1"]], T: [["A1", "growth*2"], ["A2", "A1+S!B1"]] }, names), tokenizer);
    expect(tainted(g, ["S!B1"])).toEqual(["S!B1", "T!A1", "T!A2"]);
  });

  it("a dynamic cell is tainted only if it is itself a source, even when a static argument is tainted", () => {
    const g = buildGraph(book({ S: [["A1", null], ["B1", "A1+1"], ["C1", "OFFSET(B1,1,0)"], ["D1", "C1+1"]] }), tokenizer);
    expect(tainted(g, ["S!B1"])).toEqual(["S!B1"]);
    expect(tainted(g, ["S!C1"])).toEqual(["S!C1", "S!D1"]);
  });
});

describe("the reference graph: the engine-time estimate", () => {
  it("charges a whole-column SUM for the cells filled, and a whole-column MAX for every row it walks", () => {
    const cells: Spec[] = Array.from({ length: 100 }, (_, i) => [`A${i + 1}`, null] as Spec);
    const sum = buildGraph(book({ S: [...cells, ["B1", "SUM(A:A)"]] }), tokenizer);
    const max = buildGraph(book({ S: [...cells, ["B1", "MAX(A:A)"]] }), tokenizer);
    expect(sum.estimatedEvalMs).toBeCloseTo((100 * 60) / 1e6, 6);
    expect(max.estimatedEvalMs).toBeGreaterThan(40);
  });

  it("charges an OFFSET cell for the whole workbook, and a constant formula for nothing", () => {
    const cells: Spec[] = Array.from({ length: 100 }, (_, i) => [`A${i + 1}`, null] as Spec);
    const g = buildGraph(book({ S: [...cells, ["B1", "OFFSET(A1,1,1)"], ["B2", "0.5"]] }), tokenizer);
    expect(g.estimatedEvalMs).toBeCloseTo((102 * 60) / 1e6, 6);
  });

  it("is the sum over formulas, and identical ranges are charged each time they are read", () => {
    const cells: Spec[] = Array.from({ length: 10 }, (_, i) => [`A${i + 1}`, null] as Spec);
    const formulas: Spec[] = Array.from({ length: 40 }, (_, i) => [`B${i + 1}`, "SUM($A$1:$A$10)"] as Spec);
    expect(buildGraph(book({ S: [...cells, ...formulas] }), tokenizer).estimatedEvalMs).toBeCloseTo((40 * 10 * 60) / 1e6, 6);
  });
});

describe("the reference graph: defined names a hostile workbook can use (review of Task 1)", () => {
  it("charges a function inside a defined name, so SUMPRODUCT over whole columns hidden in a name is priced like the plain formula", () => {
    const cells: Spec[] = Array.from({ length: 10 }, (_, i) => [`A${i + 1}`, null] as Spec);
    const names = [{ name: "heavy", ref: "SUMPRODUCT(S!$A:$A,S!$B:$B)", sheet: null }];
    const plain = buildGraph(book({ S: [...cells, ["C1", "SUMPRODUCT($A:$A,$B:$B)"]] }), tokenizer);
    const hidden = buildGraph(book({ S: [...cells, ["C1", "heavy"]] }, names), tokenizer);
    expect(hidden.estimatedEvalMs).toBeCloseTo(plain.estimatedEvalMs, 6);
    expect(hidden.functions(id(hidden, "S!C1"))).toEqual([]); // the cell's own functions (the diff's classes) are unchanged
  });

  it("refuses names that fan out to names (10 wide, 5 deep) instead of expanding them for ever", () => {
    const layer = (k: number) => Array.from({ length: 10 }, (_, i) => `L${k}_${i}`);
    const names = [1, 2, 3, 4].flatMap((k) => layer(k).map((name) => ({ name, ref: layer(k + 1).join("+"), sheet: null })));
    names.push(...layer(5).map((name) => ({ name, ref: "S!$A$1", sheet: null })));
    const formulas: Spec[] = Array.from({ length: 50 }, (_, i) => [`B${i + 1}`, layer(1).join("+")] as Spec);
    const started = Date.now();
    let code = "";
    try {
      buildGraph(book({ S: [["A1", null], ...formulas] }, names), tokenizer);
    } catch (error) {
      code = (error as XlsxRefusal).code;
    }
    expect(code).toBe("too_complex");
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});
