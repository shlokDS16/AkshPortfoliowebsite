import { parseAddr } from "./addr";
import { isDateFormat } from "./format";
import type { Graph } from "./graph";
import { MAX_LABEL_CHARS, MAX_SUGGESTIONS } from "./limits";
import type { IndexCell, InputSuggestion, OutputSuggestion, SheetIndex, Suggestions } from "./types";

// Suggestions by rule, no LLM (spec s5.6). Candidate inputs are numeric constants that formulas read; candidate outputs are untainted
// numeric formula cells. Everything here is machine-read text and numbers: the sheet label is shown as "sheet says", never stored as
// Aksh's label. Pure; the graph and the taint come from graph.ts.

type Range = { row1: number; col1: number; row2: number; col2: number };
type SheetData = {
  cells: Map<string, IndexCell>;
  arrays: Range[];
  /** Text cells by row, ascending by column; and by column, ascending by row. */
  textByRow: Map<number, { at: number; text: string }[]>;
  textByCol: Map<number, { at: number; text: string }[]>;
};

export type SheetLookup = {
  cell(sheet: string, addr: string): IndexCell | undefined;
  /** The nearest text cell to the left in the row, else the nearest above in the column; null when there is neither. */
  labelFor(sheet: string, addr: string): string | null;
  inArray(sheet: string, addr: string): boolean;
};

function parseRange(text: string): Range | null {
  const [a, b] = text.split(":");
  const first = parseAddr(a);
  const last = parseAddr(b ?? a);
  if (!first || !last) return null;
  return { row1: Math.min(first.row, last.row), col1: Math.min(first.col, last.col), row2: Math.max(first.row, last.row), col2: Math.max(first.col, last.col) };
}

const cut = (text: string): string => (text.length > MAX_LABEL_CHARS ? `${text.slice(0, MAX_LABEL_CHARS - 1)}…` : text);

export function buildLookup(index: SheetIndex): SheetLookup {
  const sheets = new Map<string, SheetData>();
  for (const sheet of index.sheets) {
    const data: SheetData = {
      cells: new Map(),
      arrays: sheet.arrays.map(parseRange).filter((r): r is Range => r !== null),
      textByRow: new Map(),
      textByCol: new Map(),
    };
    for (const cell of sheet.cells) {
      data.cells.set(cell[0], cell);
      const text = typeof cell[2] === "string" && cell[3] === "s" ? cell[2].trim() : "";
      const pos = parseAddr(cell[0]);
      if (!text || !pos) continue;
      (data.textByRow.get(pos.row) ?? data.textByRow.set(pos.row, []).get(pos.row)!).push({ at: pos.col, text });
      (data.textByCol.get(pos.col) ?? data.textByCol.set(pos.col, []).get(pos.col)!).push({ at: pos.row, text });
    }
    for (const list of [...data.textByRow.values(), ...data.textByCol.values()]) list.sort((a, b) => a.at - b.at);
    sheets.set(sheet.name, data);
  }
  const nearestBefore = (list: { at: number; text: string }[] | undefined, at: number): string | null => {
    let found: string | null = null;
    for (const item of list ?? []) {
      if (item.at >= at) break;
      found = item.text;
    }
    return found;
  };
  return {
    cell: (sheet, addr) => sheets.get(sheet)?.cells.get(addr),
    inArray(sheet, addr) {
      const data = sheets.get(sheet);
      const pos = parseAddr(addr);
      return !!data && !!pos && data.arrays.some((r) => pos.row >= r.row1 && pos.row <= r.row2 && pos.col >= r.col1 && pos.col <= r.col2);
    },
    labelFor(sheet, addr) {
      const data = sheets.get(sheet);
      const pos = parseAddr(addr);
      if (!data || !pos) return null;
      const label = nearestBefore(data.textByRow.get(pos.row), pos.col) ?? nearestBefore(data.textByCol.get(pos.col), pos.row);
      return label === null ? null : cut(label);
    },
  };
}

const isNumber = (cell: IndexCell): cell is [string, string | null, number, "n", string | null] => cell[3] === "n" && typeof cell[2] === "number";

/** Up to 40 inputs and 40 outputs, nothing pre-ticked (the caller decides what is ticked). */
export function suggest(index: SheetIndex, graph: Graph, taint: Uint8Array): Suggestions {
  const lookup = buildLookup(index);
  const inputs: (InputSuggestion & { order: number })[] = [];
  const outputs: (OutputSuggestion & { order: number; leaf: boolean })[] = [];
  for (const sheet of index.sheets) {
    for (const cell of sheet.cells) {
      if (!isNumber(cell)) continue;
      const [addr, f, value, , z] = cell;
      const id = graph.id(`${sheet.name}!${addr}`);
      if (id === undefined || isDateFormat(z) || lookup.inArray(sheet.name, addr)) continue;
      if (f === null) {
        const dependents = graph.dependents(id);
        if (dependents > 0) inputs.push({ sheet: sheet.name, addr, value, z, dependents, label: null, order: id });
      } else if (!taint[id]) {
        const precedents = graph.precedents(id);
        // A formula that reads nothing (=0.5) is an input in disguise, not a result; one that reads cells the desk cannot follow stays.
        if (precedents > 0 || graph.isDynamic(id)) outputs.push({ sheet: sheet.name, addr, value, z, precedents, label: null, order: id, leaf: graph.dependents(id) === 0 });
      }
    }
  }
  inputs.sort((a, b) => b.dependents - a.dependents || a.order - b.order);
  // Results nothing else uses come first (they are what a model is for), then the cells with the most behind them.
  outputs.sort((a, b) => Number(b.leaf) - Number(a.leaf) || b.precedents - a.precedents || a.order - b.order);
  const label = <T extends { sheet: string; addr: string }>({ order: _order, ...rest }: T & { order: number }) => ({ ...rest, label: lookup.labelFor(rest.sheet, rest.addr) });
  return {
    inputs: inputs.slice(0, MAX_SUGGESTIONS).map((i) => label(i) as InputSuggestion),
    outputs: outputs.slice(0, MAX_SUGGESTIONS).map(({ leaf: _leaf, ...o }) => label(o) as OutputSuggestion),
  };
}

export type Designation = { sheet: string; addr: string; role: "input" | "output" };

const normalise = (label: string): string => label.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * The designations of the previous version that may be pre-ticked in the new one (spec s7.2): the same sheet!cell is still the same kind
 * of cell (a numeric constant for an input, an untainted numeric formula for an output) and the sheet label beside it has not changed.
 * A cell that had no label before is never carried: nothing shows it is the same cell.
 */
export function carryForward(previous: Designation[], before: SheetLookup, now: SheetLookup, isTainted: (sheet: string, addr: string) => boolean): Designation[] {
  return previous.filter((d) => {
    const cell = now.cell(d.sheet, d.addr);
    if (!cell || !isNumber(cell) || isDateFormat(cell[4]) || now.inArray(d.sheet, d.addr)) return false;
    if (d.role === "input" ? cell[1] !== null : cell[1] === null || isTainted(d.sheet, d.addr)) return false;
    const was = before.labelFor(d.sheet, d.addr);
    const is = now.labelFor(d.sheet, d.addr);
    return was !== null && is !== null && normalise(was) === normalise(is);
  });
}
