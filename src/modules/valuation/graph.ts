import { parseAddr } from "./addr";
import { estimateFormulaNs } from "./cost";
import { MAX_GRAPH_MEMBERS } from "./limits";
import { XlsxRefusal } from "./refusal";
import type { FormulaRefs, Tokenizer } from "./tokens";
import type { SheetIndex } from "./types";

// The reference graph (spec s5.5): which cells a formula reads, from the IronCalc tokenizer, with ranges expanded WITHIN THE USED AREA
// only (an empty cell has nothing to depend on) and defined names resolved. Cells whose precedents cannot be listed (OFFSET, INDIRECT,
// 3D or structured references, an unknown sheet, a loop of names) are `dynamic`. Taint walks forward from the cells that disagree with
// Excel; a dynamic cell is infected only if it is itself one of those sources.
//
// Ranges are nodes, not bundles of edges: a range is expanded once (identical ranges share it), its users are the formulas that read it,
// and the walk crosses it once, so a thousand SUMs over one column cost one expansion and one crossing. The total number of range
// members is capped; a workbook beyond the cap is refused ("too_complex"), not analysed for ever.

export type Graph = {
  readonly size: number;
  key(id: number): string;
  id(key: string): number | undefined;
  isFormula(id: number): boolean;
  isDynamic(id: number): boolean;
  /** Upper-cased function names the formula uses (empty for a constant). */
  functions(id: number): string[];
  /** Cells the formula reads directly, plus the filled cells of its ranges. */
  precedents(id: number): number;
  /** Formulas that read the cell directly or through a range. */
  dependents(id: number): number;
  /** Estimated milliseconds the engine will take over every formula (cost.ts), known before it runs. */
  readonly estimatedEvalMs: number;
  /** 1 for every source and every cell reachable forward from one (dynamic cells excepted, unless they are sources). */
  taint(sources: Iterable<number>): Uint8Array;
};

export type GraphOptions = { maxMembers?: number };

const MAX_NAME_DEPTH = 5;

type Column = { rows: number[]; ids: number[] };

function lowerBound(rows: number[], target: number): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function buildGraph(index: SheetIndex, tokenizer: Tokenizer, opts: GraphOptions = {}): Graph {
  const maxMembers = opts.maxMembers ?? MAX_GRAPH_MEMBERS;

  // 1. An id for every filled cell, and per sheet a column index (sorted rows per column) for range expansion.
  const keys: string[] = [];
  const idByKey = new Map<string, number>();
  const sheetByName = new Map<string, number>();
  const columns: Map<number, Column>[] = [];
  const columnList: number[][] = [];
  const formulaOf: (string | null)[] = [];
  const sheetOf: number[] = [];
  index.sheets.forEach((sheet, s) => {
    sheetByName.set(sheet.name.toLowerCase(), s);
    const cols = new Map<number, Column>();
    for (const [addr, f] of sheet.cells) {
      const pos = parseAddr(addr);
      if (!pos) continue;
      const id = keys.length;
      const key = `${sheet.name}!${addr}`;
      keys.push(key);
      idByKey.set(key, id);
      formulaOf.push(f);
      sheetOf.push(s);
      let col = cols.get(pos.col);
      if (!col) cols.set(pos.col, (col = { rows: [], ids: [] }));
      col.rows.push(pos.row);
      col.ids.push(id);
    }
    // The index is row-major, so each column's rows arrive ascending; sort anyway so a hand-made index cannot break the search.
    for (const col of cols.values()) {
      const order = col.rows.map((_, i) => i).sort((a, b) => col.rows[a] - col.rows[b]);
      col.rows = order.map((i) => col.rows[i]);
      col.ids = order.map((i) => col.ids[i]);
    }
    columns.push(cols);
    columnList.push([...cols.keys()].sort((a, b) => a - b));
  });
  const size = keys.length;

  const cellAt = (s: number, row: number, col: number): number | undefined => {
    const column = columns[s].get(col);
    if (!column) return undefined;
    const at = lowerBound(column.rows, row);
    return column.rows[at] === row ? column.ids[at] : undefined;
  };

  // 2. Defined names: local to a sheet first, then workbook-wide. Each is tokenized once.
  const nameRefs = new Map<string, FormulaRefs>();
  const nameKey = (name: string, sheet: string | null) => `${(sheet ?? "").toLowerCase()}\u0000${name.toLowerCase()}`;
  const refsOfName = new Map<string, string>();
  for (const n of index.names) refsOfName.set(nameKey(n.name, n.sheet), n.ref);
  const lookupName = (name: string, sheet: string): { key: string; refs: FormulaRefs } | null => {
    const key = refsOfName.has(nameKey(name, sheet)) ? nameKey(name, sheet) : refsOfName.has(nameKey(name, null)) ? nameKey(name, null) : null;
    if (key === null) return null;
    let refs = nameRefs.get(key);
    if (!refs) nameRefs.set(key, (refs = tokenizer.parse(refsOfName.get(key) ?? "")));
    return { key, refs };
  };

  // 3. Per formula: direct cell precedents and range nodes.
  const rangeIds = new Map<string, number>();
  const rangeMembers: Int32Array[] = [];
  const rangeUsers: number[][] = [];
  const rangeDeclared: number[] = [];
  let memberTotal = 0;
  const rangeNode = (s: number, row1: number, col1: number, row2: number, col2: number): number => {
    const k = `${s}:${row1}:${col1}:${row2}:${col2}`;
    let node = rangeIds.get(k);
    if (node !== undefined) return node;
    const list: number[] = [];
    const present = columnList[s];
    // Only the columns that exist between col1 and col2.
    let lo = 0;
    let hi = present.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (present[mid] < col1) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < present.length && present[i] <= col2; i++) {
      const column = columns[s].get(present[i])!;
      for (let at = lowerBound(column.rows, row1); at < column.rows.length && column.rows[at] <= row2; at++) {
        list.push(column.ids[at]);
        if (memberTotal + list.length > maxMembers) throw new XlsxRefusal("too_complex");
      }
    }
    memberTotal += list.length;
    node = rangeMembers.length;
    rangeMembers.push(Int32Array.from(list));
    rangeUsers.push([]);
    rangeDeclared.push((row2 - row1 + 1) * (col2 - col1 + 1));
    rangeIds.set(k, node);
    return node;
  };

  const cellPre: number[][] = new Array(size);
  const rangePre: number[][] = new Array(size);
  const dynamic = new Uint8Array(size);
  const fns: string[][] = new Array(size);
  const precedentCount = new Int32Array(size);
  let estimatedNs = 0;

  const gather = (f: number, s: number, refs: FormulaRefs, depth: number, cells: Set<number>, ranges: Set<number>, uses: number[]): void => {
    if (refs.dynamic) dynamic[f] = 1;
    for (const ref of refs.cells) {
      const target = ref.sheet === null ? s : sheetByName.get(ref.sheet.toLowerCase());
      if (target === undefined) {
        dynamic[f] = 1;
        continue;
      }
      const id = cellAt(target, ref.row, ref.col);
      if (id !== undefined) cells.add(id);
    }
    for (const r of refs.ranges) {
      const target = r.sheet === null ? s : sheetByName.get(r.sheet.toLowerCase());
      if (target === undefined) {
        dynamic[f] = 1;
        continue;
      }
      const node = rangeNode(target, r.row1, r.col1, r.row2, r.col2);
      ranges.add(node);
      uses.push(node);
    }
    for (const name of refs.names) {
      const found = lookupName(name, index.sheets[s].name);
      if (!found) continue; // an unknown name is the engine's #NAME?; a LET variable is not a name at all
      if (depth >= MAX_NAME_DEPTH) {
        dynamic[f] = 1;
        continue;
      }
      gather(f, s, found.refs, depth + 1, cells, ranges, uses);
    }
  };

  for (let f = 0; f < size; f++) {
    const formula = formulaOf[f];
    if (formula === null) {
      cellPre[f] = [];
      rangePre[f] = [];
      fns[f] = [];
      continue;
    }
    const refs = tokenizer.parse(formula);
    fns[f] = refs.functions;
    const cells = new Set<number>();
    const ranges = new Set<number>();
    const uses: number[] = []; // every reading of a range, repeats included: the engine pays for each
    gather(f, sheetOf[f], refs, 0, cells, ranges, uses);
    cells.delete(f);
    cellPre[f] = [...cells];
    rangePre[f] = [...ranges];
    for (const r of ranges) rangeUsers[r].push(f);
    let count = cells.size;
    for (const r of ranges) count += rangeMembers[r].length;
    precedentCount[f] = count;
    estimatedNs += estimateFormulaNs({
      functions: refs.functions,
      ranges: uses.map((r) => ({ declared: rangeDeclared[r], present: rangeMembers[r].length })),
      dynamic: dynamic[f] === 1,
      totalCells: size,
    });
  }

  // 4. Inverse maps: formulas that read a cell directly, and (compressed) the range nodes that contain it.
  const cellUsers: number[][] = new Array(size);
  for (let c = 0; c < size; c++) cellUsers[c] = [];
  for (let f = 0; f < size; f++) for (const c of cellPre[f]) cellUsers[c].push(f);
  const offsets = new Int32Array(size + 1);
  for (const members of rangeMembers) for (const c of members) offsets[c + 1]++;
  for (let c = 0; c < size; c++) offsets[c + 1] += offsets[c];
  const rangesOfCell = new Int32Array(offsets[size]);
  const fill = offsets.slice(0, size);
  rangeMembers.forEach((members, r) => {
    for (const c of members) rangesOfCell[fill[c]++] = r;
  });

  const dependentCount = new Int32Array(size);
  for (let c = 0; c < size; c++) {
    let n = cellUsers[c].length;
    for (let i = offsets[c]; i < offsets[c + 1]; i++) n += rangeUsers[rangesOfCell[i]].length;
    dependentCount[c] = n;
  }

  return {
    size,
    estimatedEvalMs: estimatedNs / 1e6,
    key: (id) => keys[id],
    id: (key) => idByKey.get(key),
    isFormula: (id) => formulaOf[id] !== null,
    isDynamic: (id) => dynamic[id] === 1,
    functions: (id) => fns[id],
    precedents: (id) => precedentCount[id],
    dependents: (id) => dependentCount[id],
    taint(sources) {
      const tainted = new Uint8Array(size);
      const seenRange = new Uint8Array(rangeMembers.length);
      const queue: number[] = [];
      for (const s of sources) {
        if (!tainted[s]) {
          tainted[s] = 1;
          queue.push(s);
        }
      }
      const infect = (f: number) => {
        if (!tainted[f] && !dynamic[f]) {
          tainted[f] = 1;
          queue.push(f);
        }
      };
      for (let head = 0; head < queue.length; head++) {
        const c = queue[head];
        for (const f of cellUsers[c]) infect(f);
        for (let i = offsets[c]; i < offsets[c + 1]; i++) {
          const r = rangesOfCell[i];
          if (seenRange[r]) continue;
          seenRange[r] = 1;
          for (const f of rangeUsers[r]) infect(f);
        }
      }
      return tainted;
    },
  };
}
