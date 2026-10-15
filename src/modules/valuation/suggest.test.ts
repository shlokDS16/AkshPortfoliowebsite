import { beforeAll, describe, expect, it } from "vitest";
import { buildGraph } from "./graph";
import { buildLookup, carryForward, suggest } from "./suggest";
import { loadTokenizer, type Tokenizer } from "./tokens";
import type { IndexCell, SheetIndex } from "./types";

let tokenizer: Tokenizer;
beforeAll(async () => {
  tokenizer = await loadTokenizer();
});

type Spec = { addr: string; f?: string; v?: number | string; z?: string };
const cell = ({ addr, f, v, z }: Spec): IndexCell => [addr, f ?? null, v ?? 1, typeof v === "string" ? "s" : "n", z ?? null];
const book = (sheets: Record<string, Spec[]>, arrays: Record<string, string[]> = {}): SheetIndex => {
  const list = Object.entries(sheets).map(([name, cells]) => ({ name, cells: cells.map(cell), arrays: arrays[name] ?? [] }));
  return { sheets: list, names: [], counts: { sheets: list.length, cells: 0, formulas: 0 }, stringsCut: 0 };
};
const run = (index: SheetIndex, sources: string[] = []) => {
  const g = buildGraph(index, tokenizer);
  const taint = g.taint(sources.map((s) => g.id(s)!));
  return { g, taint, ...suggest(index, g, taint) };
};

describe("suggest: inputs", () => {
  const index = book({
    DCF: [
      { addr: "A1", v: "Cost of equity" }, { addr: "B1", v: 0.115, z: "0.0%" },
      { addr: "A2", v: "Growth" }, { addr: "B2", v: 0.03, z: "0.0%" },
      { addr: "A3", v: "Unused" }, { addr: "B3", v: 99 },
      { addr: "B4", f: "B1*2", v: 0.23 }, { addr: "B5", f: "B1+B2", v: 0.145 }, { addr: "B6", f: "B1/B2", v: 3.8 },
      { addr: "C1", v: 45000, z: "dd-mmm-yy" }, { addr: "C2", f: "C1+1", v: 45001 },
      { addr: "D1", v: "text" }, { addr: "D2", f: 'D1&"x"', v: "textx" },
    ],
  });

  it("are numeric constants with a formula dependent, ranked by dependents", () => {
    const { inputs } = run(index);
    expect(inputs.map((i) => `${i.sheet}!${i.addr}`)).toEqual(["DCF!B1", "DCF!B2"]);
    expect(inputs[0]).toMatchObject({ value: 0.115, z: "0.0%", dependents: 3 });
    expect(inputs[1]).toMatchObject({ value: 0.03, dependents: 2 });
  });

  it("leave out constants nothing uses, text, and date-formatted cells", () => {
    const { inputs } = run(index);
    const keys = inputs.map((i) => i.addr);
    expect(keys).not.toContain("B3");
    expect(keys).not.toContain("D1");
    expect(keys).not.toContain("C1");
  });

  it("leave out values inside an array formula's range", () => {
    const withArray = book({ S: [{ addr: "A1", v: 5 }, { addr: "B1", f: "SUM(A1:A2)", v: 9 }, { addr: "A2", v: 4 }] }, { S: ["A1:A2"] });
    expect(run(withArray).inputs).toEqual([]);
  });

  it("are at most 40, the most depended-on first", () => {
    const cells: Spec[] = [];
    for (let i = 1; i <= 60; i++) cells.push({ addr: `A${i}`, v: i });
    for (let i = 1; i <= 60; i++) cells.push({ addr: `B${i}`, f: `SUM(A${i}:A60)`, v: 1 });
    const { inputs } = run(book({ S: cells }));
    expect(inputs).toHaveLength(40);
    expect(inputs[0]).toMatchObject({ addr: "A60", dependents: 60 });
    expect(inputs[39]).toMatchObject({ addr: "A21", dependents: 21 });
  });
});

describe("suggest: outputs", () => {
  const index = book({
    S: [
      { addr: "A1", v: 0.1 }, { addr: "A2", v: 100 }, { addr: "A3", v: 200 },
      { addr: "B1", f: "A2*(1+A1)", v: 110 }, // feeds C1
      { addr: "B2", f: "A3*(1+A1)", v: 220 }, // feeds C1
      { addr: "C1", f: "B1+B2", v: 330 }, // the result: no dependents
      { addr: "D1", f: "A2*2", v: 200 }, // a second leaf, fewer precedents
      { addr: "E1", f: "0.5", v: 0.5 }, // a constant in disguise
      { addr: "F1", f: 'IF(A1>0,"y","n")', v: "y" }, // text result
      { addr: "G1", f: "A2+1", v: 45000, z: "dd-mmm-yy" }, // a date
    ],
  });

  it("are untainted numeric formula cells; leaves with the most precedents first, then the rest", () => {
    const { outputs } = run(index);
    expect(outputs.map((o) => o.addr)).toEqual(["C1", "D1", "B1", "B2"]);
    expect(outputs[0]).toMatchObject({ value: 330, precedents: 2 });
  });

  it("leave out tainted cells, including everything downstream of one", () => {
    const { outputs } = run(index, ["S!B1"]);
    expect(outputs.map((o) => o.addr)).toEqual(["D1", "B2"]);
  });

  it("leave out text results, date formats and formulas with no references", () => {
    const addrs = run(index).outputs.map((o) => o.addr);
    for (const a of ["F1", "G1", "E1"]) expect(addrs).not.toContain(a);
  });
});

describe("sheet labels: the nearest text to the left in the row, else above in the column", () => {
  const index = book({
    S: [
      { addr: "A1", v: "Header" },
      { addr: "A3", v: "Cost of equity" }, { addr: "B3", v: 0.11 }, { addr: "C3", v: 0.12 },
      { addr: "B5", v: 7 },
      { addr: "B1", v: "Year 1" }, { addr: "B2", v: 9 },
      { addr: "E9", v: 4 },
    ],
  });
  const lookup = buildLookup(index);

  it("takes the text to the left, skipping numbers on the way", () => {
    expect(lookup.labelFor("S", "B3")).toBe("Cost of equity");
    expect(lookup.labelFor("S", "C3")).toBe("Cost of equity");
  });

  it("takes the text above when there is none to the left", () => {
    expect(lookup.labelFor("S", "B2")).toBe("Year 1");
  });

  it("is null when there is neither", () => {
    expect(lookup.labelFor("S", "E9")).toBeNull();
    expect(lookup.labelFor("Nowhere", "A1")).toBeNull();
  });

  it("is cut at 80 characters and trimmed", () => {
    const long = buildLookup(book({ S: [{ addr: "A1", v: `  ${"x".repeat(100)}  ` }, { addr: "B1", v: 1 }] }));
    expect(long.labelFor("S", "B1")).toBe("x".repeat(79) + "…");
  });

  it("appears in the suggestions", () => {
    const withLabels = book({ S: [{ addr: "A1", v: "Cost of equity" }, { addr: "B1", v: 0.11 }, { addr: "B2", f: "B1*2", v: 0.22 }] });
    const { inputs, outputs } = run(withLabels);
    expect(inputs[0].label).toBe("Cost of equity");
    expect(outputs[0].label).toBeNull(); // B2 has no text to its left, none above (B1 is a number)
  });
});

describe("carryForward: only cells that are still the same cell", () => {
  const prev = buildLookup(
    book({ S: [{ addr: "A1", v: "Cost of equity" }, { addr: "B1", v: 0.1 }, { addr: "A2", v: "Value per share" }, { addr: "B2", f: "B1*10", v: 1 }, { addr: "B3", v: 5 }] }),
  );
  const designations = [
    { sheet: "S", addr: "B1", role: "input" as const },
    { sheet: "S", addr: "B2", role: "output" as const },
    { sheet: "S", addr: "B3", role: "input" as const },
  ];
  const never = () => false;

  it("keeps a cell that is still a constant with the same sheet label", () => {
    const cur = buildLookup(
      book({ S: [{ addr: "A1", v: "cost of  equity" }, { addr: "B1", v: 0.12 }, { addr: "A2", v: "Value per share" }, { addr: "B2", f: "B1*10", v: 1.2 }] }),
    );
    expect(carryForward(designations, prev, cur, never)).toEqual([
      { sheet: "S", addr: "B1", role: "input" },
      { sheet: "S", addr: "B2", role: "output" },
    ]);
  });

  it("drops a cell whose label changed, that became a formula, or that is gone", () => {
    const cur = buildLookup(book({ S: [{ addr: "A1", v: "Discount rate" }, { addr: "B1", v: 0.12 }, { addr: "A2", v: "Value per share" }, { addr: "B2", v: 12 }] }));
    expect(carryForward(designations, prev, cur, never)).toEqual([]);
  });

  it("drops an output that is now tainted, and a cell that had no label before", () => {
    const cur = buildLookup(
      book({ S: [{ addr: "A1", v: "Cost of equity" }, { addr: "B1", v: 0.1 }, { addr: "A2", v: "Value per share" }, { addr: "B2", f: "B1*10", v: 1 }, { addr: "B3", v: 5 }] }),
    );
    const kept = carryForward(designations, prev, cur, (sheet, addr) => sheet === "S" && addr === "B2");
    expect(kept).toEqual([{ sheet: "S", addr: "B1", role: "input" }]);
  });
});

