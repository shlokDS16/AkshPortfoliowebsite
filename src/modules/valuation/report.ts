import { MAX_REPORT_CELLS } from "./limits";
import type { CellClass, EngineValue, IndexCell, Report, ReportEntry, SheetIndex } from "./types";
import { describeValue } from "./values";

// The read report (spec s7.2): counts per class, the first 200 cells that are not a match (differing ones first) with Excel's saved value
// and the desk's, the functions the engine cannot compute, and how many cells depend on a disagreement. Machine output; the words around
// it are the UI's. Pure.

const ORDER: Exclude<CellClass, "match">[] = ["differs", "unsupported", "cycle", "no_cache", "random", "dated"];

/** Excel's saved value as plain text; null when Excel saved none. Long strings are shortened as in describeValue. */
function savedText(cell: IndexCell): string | null {
  const [, , v, t] = cell;
  if (t === "z" || v === null) return null;
  if (t === "n") return describeValue({ kind: "n", v: v as number });
  if (t === "b") return describeValue({ kind: "b", v: Boolean(v) });
  if (t === "e") return String(v);
  return describeValue({ kind: "s", v: String(v) });
}

export type ReportInput = {
  index: SheetIndex;
  classes: Map<string, CellClass>;
  values: Map<string, EngineValue>;
  functionsOf: (key: string) => string[];
  /** Function names the engine cannot compute (from probeFunctions). */
  unimplemented: string[];
  /** Tainted formula cells other than the disagreeing cells themselves. */
  tainted: number;
  dynamic: number;
};

export function buildReport({ index, classes, values, functionsOf, unimplemented, tainted, dynamic }: ReportInput): Report {
  const counts: Record<CellClass, number> = { match: 0, differs: 0, unsupported: 0, cycle: 0, no_cache: 0, random: 0, dated: 0 };
  const missing = new Set(unimplemented);
  const byClass = new Map<Exclude<CellClass, "match">, ReportEntry[]>(ORDER.map((c) => [c, []]));
  for (const sheet of index.sheets) {
    for (const cell of sheet.cells) {
      const key = `${sheet.name}!${cell[0]}`;
      const cls = classes.get(key);
      if (cls === undefined) continue;
      counts[cls]++;
      if (cls === "match") continue;
      const fn = functionsOf(key).find((name) => missing.has(name)) ?? null;
      byClass.get(cls)!.push({ cell: key, cls, excel: savedText(cell), desk: describeValue(values.get(key) ?? { kind: "empty" }), fn: cls === "unsupported" ? fn : null });
    }
  }
  const listed = ORDER.flatMap((c) => byClass.get(c)!).slice(0, MAX_REPORT_CELLS);
  return { counts, listed, unimplemented: [...missing].sort(), tainted, dynamic };
}
