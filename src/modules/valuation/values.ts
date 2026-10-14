import type { EngineErrorKind, EngineValue } from "./types";

// Errors compared by KIND. Excel's saved error text and the engine's error text both map to the same small set, so "#DIV/0!" in a
// workbook and "#DIV/0!" from the engine are equal, and a text cell that happens to contain "#NAME?" is never mistaken for an error
// (the engine reports a cell's type separately). Browser-safe.

const KINDS: Record<string, EngineErrorKind> = {
  "#NULL!": "NULL",
  "#DIV/0!": "DIV",
  "#VALUE!": "VALUE",
  "#REF!": "REF",
  "#NAME?": "NAME",
  "#NUM!": "NUM",
  "#N/A": "NA",
  "#ERROR!": "ERROR",
  "#N/IMPL": "NIMPL",
  "#N/IMPL!": "NIMPL",
  "#SPILL!": "SPILL",
  "#CALC!": "CALC",
  "#CIRC!": "CIRC",
};

export const errorKind = (text: string): EngineErrorKind => KINDS[text] ?? "OTHER";

/** An engine value as plain text for the report; long strings are shortened. */
export function describeValue(v: EngineValue): string {
  switch (v.kind) {
    case "n":
      return String(v.v);
    case "s":
      return v.v.length > 60 ? `${v.v.slice(0, 59)}…` : v.v;
    case "b":
      return v.v ? "TRUE" : "FALSE";
    case "e":
      return v.text;
    default:
      return "(empty)";
  }
}
