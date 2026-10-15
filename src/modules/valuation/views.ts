import { cellKey } from "./addr";
import { isDateFormat } from "./format";
import type { CellRow } from "./records";
import { buildLookup, carryForward, type Designation } from "./suggest";
import type { CellClass, IndexCell, ModelObject } from "./types";

// What the model page lists (spec s7.2, s7.3), from the model object (machine) and his rows (his words). Pure and browser-safe: the server
// page runs it and hands the result to the client components. The sheet's label is machine text: it is shown as the sheet's and never
// becomes his label.

/** At most this many results that cannot be chosen are listed, greyed (the report counts them all). */
export const MAX_BLOCKED_ROWS = 20;

/** Why a result cannot be chosen: its own disagreement with Excel, or one it reads ("depends"). */
export type BlockReason = { cls: Exclude<CellClass, "match"> | "depends"; fn: string | null };

export type ConfirmRow = {
  sheet: string;
  addr: string;
  value: number;
  z: string | null;
  /** The text the sheet has beside the cell (machine-read), or null. */
  sheetLabel: string | null;
  /** Confirmed in the previous version and still the same cell: pre-ticked, with the chip "used in version N". */
  carried: boolean;
  blocked: BlockReason | null;
};

export type ConfirmData = { inputs: ConfirmRow[]; outputs: ConfirmRow[]; carriedFrom: number | null };
export type PreviousVersion = { versionNo: number; model: ModelObject; cells: Designation[] };

const numeric = (cell: IndexCell | undefined): cell is [string, string | null, number, "n", string | null] =>
  !!cell && cell[3] === "n" && typeof cell[2] === "number" && Number.isFinite(cell[2]);

export function confirmRows(model: ModelObject, previous: PreviousVersion | null): ConfirmData {
  const lookup = buildLookup(model.index);
  const taint = new Set(model.taint);
  const carried = previous ? carryForward(previous.cells, buildLookup(previous.model.index), lookup, (s, a) => taint.has(cellKey(s, a))) : [];
  const isCarried = (role: Designation["role"], sheet: string, addr: string) => carried.some((d) => d.role === role && d.sheet === sheet && d.addr === addr);

  const row = (sheet: string, addr: string, value: number, z: string | null, role: Designation["role"]): ConfirmRow => ({
    sheet, addr, value, z, sheetLabel: lookup.labelFor(sheet, addr), carried: isCarried(role, sheet, addr), blocked: null,
  });
  const inputs = model.suggestions.inputs.map((s) => row(s.sheet, s.addr, s.value, s.z, "input"));
  const outputs = model.suggestions.outputs.map((s) => row(s.sheet, s.addr, s.value, s.z, "output"));

  // A carried cell the ranking left out is still listed (ticked).
  for (const d of carried) {
    const list = d.role === "input" ? inputs : outputs;
    const cell = lookup.cell(d.sheet, d.addr);
    if (numeric(cell) && !list.some((r) => r.sheet === d.sheet && r.addr === d.addr)) list.push(row(d.sheet, d.addr, cell[2], cell[4], d.role));
  }

  // Numeric results that depend on a disagreement: shown greyed with the reason, never selectable.
  const fnOf = new Map(model.report.listed.map((e) => [e.cell, e.fn]));
  for (const sheet of model.index.sheets) {
    for (const cell of sheet.cells) {
      if (outputs.filter((r) => r.blocked).length >= MAX_BLOCKED_ROWS) break;
      const key = cellKey(sheet.name, cell[0]);
      if (cell[1] === null || !numeric(cell) || !taint.has(key) || isDateFormat(cell[4]) || lookup.inArray(sheet.name, cell[0])) continue;
      const own = model.classes[key];
      outputs.push({ ...row(sheet.name, cell[0], cell[2], cell[4], "output"), carried: false, blocked: { cls: own ?? "depends", fn: fnOf.get(key) ?? null } });
    }
  }
  return { inputs, outputs, carriedFrom: carried.length > 0 && previous ? previous.versionNo : null };
}

/** One confirmed cell as the scenario panels show it. `label` is his (own) or the sheet's; `value` is the workbook's. */
export type ScenarioCell = { id: string; sheet: string; addr: string; role: CellRow["role"]; label: string; own: boolean; value: number; z: string | null };

export function scenarioCells(model: ModelObject, rows: CellRow[]): ScenarioCell[] {
  const lookup = buildLookup(model.index);
  return rows.flatMap((r): ScenarioCell[] => {
    const cell = lookup.cell(r.sheet, r.addr);
    if (!numeric(cell)) return [];
    const label = r.label ?? lookup.labelFor(r.sheet, r.addr) ?? cellKey(r.sheet, r.addr);
    return [{ id: r.id, sheet: r.sheet, addr: r.addr, role: r.role, label, own: r.label !== null, value: cell[2], z: cell[4] }];
  });
}
