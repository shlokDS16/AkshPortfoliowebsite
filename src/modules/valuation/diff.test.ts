import { describe, expect, it } from "vitest";
import { classifyCell, diffWorkbook, numbersEqual } from "./diff";
import type { CellClass, EngineValue, IndexCell, SheetIndex } from "./types";

const n = (v: number): EngineValue => ({ kind: "n", v });
const err = (error: "DIV" | "NAME" | "NIMPL" | "CIRC" | "SPILL" | "REF" | "NA", text = "#X"): EngineValue => ({ kind: "e", error, text });
const cls = (saved: Pick<IndexCell, 1 | 2 | 3>, engine: EngineValue, functions: string[] = [], inArray = false): CellClass =>
  classifyCell({ saved: { f: saved[0], v: saved[1], t: saved[2] }, engine, functions, inArray });

describe("numbersEqual: a relative tolerance of 1e-9 against the larger of 1 and the two magnitudes", () => {
  it("passes within 1e-9 relative and fails at 1e-6", () => {
    expect(numbersEqual(1000, 1000 * (1 + 5e-10))).toBe(true);
    expect(numbersEqual(1000, 1000 * (1 + 1e-6))).toBe(false);
    expect(numbersEqual(1e12, 1e12 + 500)).toBe(true);
    expect(numbersEqual(1e12, 1e12 * (1 + 1e-6))).toBe(false);
  });

  it("small numbers are compared against 1, not against themselves", () => {
    expect(numbersEqual(0, 5e-10)).toBe(true);
    expect(numbersEqual(0, 1e-6)).toBe(false);
    expect(numbersEqual(0.115, 0.115 + 1e-10)).toBe(true);
  });

  it("handles signs and exact equality", () => {
    expect(numbersEqual(-24.8357127, -24.8357127)).toBe(true);
    expect(numbersEqual(-1, 1)).toBe(false);
  });
});

describe("classifyCell: match and differs", () => {
  it("equal numbers, strings and booleans match; unequal ones differ", () => {
    expect(cls(["A1*2", 4, "n"], n(4))).toBe("match");
    expect(cls(["A1*2", 4, "n"], n(4.001))).toBe("differs");
    expect(cls(["A1&B1", "ab", "s"], { kind: "s", v: "ab" })).toBe("match");
    expect(cls(["A1&B1", "ab", "s"], { kind: "s", v: "aB" })).toBe("differs");
    expect(cls(["A1>1", true, "b"], { kind: "b", v: true })).toBe("match");
    expect(cls(["A1>1", true, "b"], { kind: "b", v: false })).toBe("differs");
  });

  it("a value of another type differs", () => {
    expect(cls(["A1", 1, "n"], { kind: "s", v: "1" })).toBe("differs");
    expect(cls(["A1", "x", "s"], n(1))).toBe("differs");
    expect(cls(["A1", true, "b"], n(1))).toBe("differs");
  });

  it("an empty result matches a saved zero or empty string, and nothing else", () => {
    expect(cls(["A9", 0, "n"], { kind: "empty" })).toBe("match");
    expect(cls(["A9", "", "s"], { kind: "empty" })).toBe("match");
    expect(cls(["A9", 5, "n"], { kind: "empty" })).toBe("differs");
  });

  it("errors are compared by kind: the same kind matches, another differs", () => {
    expect(cls(["1/0", "#DIV/0!", "e"], err("DIV", "#DIV/0!"))).toBe("match");
    expect(cls(["1/0", "#DIV/0!", "e"], err("REF", "#REF!"))).toBe("differs");
    expect(cls(["NA()", "#N/A", "e"], err("NA", "#N/A"))).toBe("match");
  });

  it("a text cell that holds error-looking text is a string, not an error", () => {
    expect(cls(["A1&\"\"", "#DIV/0!", "s"], { kind: "s", v: "#DIV/0!" })).toBe("match");
    expect(cls(["A1&\"\"", "#DIV/0!", "s"], err("DIV", "#DIV/0!"))).toBe("differs");
  });

  it("an error where Excel had a value differs", () => {
    expect(cls(["A1/B1", 2, "n"], err("DIV", "#DIV/0!"))).toBe("differs");
  });
});

describe("classifyCell: the other classes", () => {
  it("unsupported: the engine says not implemented", () => {
    expect(cls(["FOO(1)", 3, "n"], err("NIMPL", "#N/IMPL!"))).toBe("unsupported");
  });

  it("unsupported: #NAME? where Excel had a value; but a #NAME? Excel also has is a match", () => {
    expect(cls(["CUBEVALUE(\"x\")", 3, "n"], err("NAME", "#NAME?"))).toBe("unsupported");
    expect(cls(["BADNAME+1", "#NAME?", "e"], err("NAME", "#NAME?"))).toBe("match");
  });

  it("unsupported: a spill error where Excel had a value, and any cell in an array range", () => {
    expect(cls(["SORT(A1:A3)", 1, "n"], err("SPILL", "#SPILL!"))).toBe("unsupported");
    expect(cls(["SUM(A1:A2)", 3, "n"], n(3), [], true)).toBe("unsupported");
  });

  it("cycle: the engine's circular-reference error", () => {
    expect(cls(["B2+1", 7, "n"], err("CIRC", "#CIRC!"))).toBe("cycle");
  });

  it("no_cache: Excel saved no value", () => {
    expect(cls(["A1*2", null, "z"], n(4))).toBe("no_cache");
  });

  it("random: RAND and RANDBETWEEN, whatever the values", () => {
    expect(cls(["RAND()", 0.3, "n"], n(0.9), ["RAND"])).toBe("random");
    expect(cls(["RANDBETWEEN(1,6)", 3, "n"], n(3), ["RANDBETWEEN"])).toBe("random");
  });

  it("dated: TODAY and NOW differ by design, whatever the values", () => {
    expect(cls(["TODAY()", 46000, "n"], n(46309), ["TODAY"])).toBe("dated");
    expect(cls(["NOW()", 46000.5, "n"], n(46000.5), ["NOW"])).toBe("dated");
  });
});

describe("diffWorkbook", () => {
  const index: SheetIndex = {
    sheets: [
      {
        name: "S",
        arrays: ["C1:C2"],
        cells: [
          ["A1", null, 2, "n", null],
          ["B1", "A1*2", 4, "n", null],
          ["B2", "A1*3", 7, "n", null],
          ["B3", "TODAY()", 1, "n", null],
          ["C1", "SUM(A1:A1)", 2, "n", null],
        ],
      },
    ],
    names: [],
    counts: { sheets: 1, cells: 5, formulas: 4 },
    stringsCut: 0,
  };

  it("classifies every formula cell and no constants", () => {
    const values = new Map<string, EngineValue>([
      ["S!B1", n(4)],
      ["S!B2", n(6)],
      ["S!B3", n(46309)],
      ["S!C1", n(2)],
    ]);
    const classes = diffWorkbook(index, values, (key) => (key === "S!B3" ? ["TODAY"] : []));
    expect(Object.fromEntries(classes)).toEqual({ "S!B1": "match", "S!B2": "differs", "S!B3": "dated", "S!C1": "unsupported" });
  });

  it("a formula the engine produced no value for differs", () => {
    const classes = diffWorkbook(index, new Map(), () => []);
    expect(classes.get("S!B1")).toBe("differs");
  });
});
