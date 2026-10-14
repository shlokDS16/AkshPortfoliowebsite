import { parseAddr } from "./addr";
import { DIFF_TOLERANCE } from "./limits";
import type { CellClass, EngineValue, SavedType, SheetIndex } from "./types";
import { errorKind } from "./values";

// The diff (spec s5.4): the desk's recalculation against the value Excel saved, one class per formula cell. Pure. Errors are compared by
// kind, and a string is never taken for an error: the engine reports a cell's type apart from its text.

const RANDOM_FUNCTIONS = new Set(["RAND", "RANDBETWEEN", "RANDARRAY"]);
const DATED_FUNCTIONS = new Set(["TODAY", "NOW"]);

export type ClassifyInput = {
  saved: { f: string | null; v: number | string | boolean | null; t: SavedType };
  engine: EngineValue;
  /** Upper-cased function names of the formula. */
  functions: string[];
  /** The cell lies inside an array-formula range (an array or spill result). */
  inArray: boolean;
};

/** Equal when they differ by at most 1e-9 of the larger of 1 and the two magnitudes. */
export function numbersEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= DIFF_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
}

function sameValue(saved: ClassifyInput["saved"], engine: EngineValue): boolean {
  switch (saved.t) {
    case "n":
      if (engine.kind === "n") return numbersEqual(saved.v as number, engine.v);
      return engine.kind === "empty" && saved.v === 0;
    case "s":
      if (engine.kind === "s") return saved.v === engine.v;
      return engine.kind === "empty" && saved.v === "";
    case "b":
      return engine.kind === "b" && saved.v === engine.v;
    case "e":
      return engine.kind === "e" && errorKind(String(saved.v)) === engine.error;
    default:
      return false;
  }
}

export function classifyCell({ saved, engine, functions, inArray }: ClassifyInput): CellClass {
  if (functions.some((fn) => RANDOM_FUNCTIONS.has(fn))) return "random";
  if (functions.some((fn) => DATED_FUNCTIONS.has(fn))) return "dated";
  if (inArray) return "unsupported";
  if (engine.kind === "e") {
    if (engine.error === "CIRC") return "cycle";
    if (engine.error === "NIMPL") return "unsupported";
  }
  if (saved.t === "z") return "no_cache";
  // Where Excel had a value and the engine does not know the function or cannot spill, the engine is the one that is missing something.
  if (engine.kind === "e" && saved.t !== "e" && (engine.error === "NAME" || engine.error === "SPILL" || engine.error === "CALC")) return "unsupported";
  return sameValue(saved, engine) ? "match" : "differs";
}

/** Whether "B7" lies inside any of the ranges ("B1:B9" or a single cell "B7"). */
function inAnyRange(addr: string, ranges: { row1: number; col1: number; row2: number; col2: number }[]): boolean {
  const pos = parseAddr(addr);
  if (!pos) return false;
  return ranges.some((r) => pos.row >= r.row1 && pos.row <= r.row2 && pos.col >= r.col1 && pos.col <= r.col2);
}

function parseRange(text: string): { row1: number; col1: number; row2: number; col2: number } | null {
  const [a, b] = text.split(":");
  const first = parseAddr(a);
  const last = parseAddr(b ?? a);
  if (!first || !last) return null;
  return { row1: Math.min(first.row, last.row), col1: Math.min(first.col, last.col), row2: Math.max(first.row, last.row), col2: Math.max(first.col, last.col) };
}

/** One class for every formula cell of the index, by "Sheet!A1". `values` holds the engine's value per formula cell. */
export function diffWorkbook(index: SheetIndex, values: Map<string, EngineValue>, functionsOf: (key: string) => string[]): Map<string, CellClass> {
  const out = new Map<string, CellClass>();
  for (const sheet of index.sheets) {
    const arrays = sheet.arrays.map(parseRange).filter((r): r is NonNullable<typeof r> => r !== null);
    for (const [addr, f, v, t] of sheet.cells) {
      if (f === null) continue;
      const key = `${sheet.name}!${addr}`;
      out.set(
        key,
        classifyCell({ saved: { f, v, t }, engine: values.get(key) ?? { kind: "empty" }, functions: functionsOf(key), inArray: arrays.length > 0 && inAnyRange(addr, arrays) }),
      );
    }
  }
  return out;
}
