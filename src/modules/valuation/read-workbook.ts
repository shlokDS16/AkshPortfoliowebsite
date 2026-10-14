import "server-only";
import { read, version as sheetjsVersion, type CellObject, type WorkBook, type WorkSheet } from "xlsx";
import { formatAddr } from "./addr";
import {
  MAX_CELLS,
  MAX_DEFINED_NAMES,
  MAX_FORMULA_CHARS,
  MAX_FORMULAS,
  MAX_SHEET_ROWS,
  MAX_SHEETS,
  MAX_STRING_CHARS,
  XLSX_MAX_BYTES,
} from "./limits";
import { XlsxRefusal } from "./refusal";
import type { IndexCell, IndexName, IndexSheet, SavedType, SheetIndex } from "./types";
import { scanXlsxZip } from "./zip-scan";

// The server-only reader (spec s4, s5.2). SheetJS is the INDEPENDENT reader of the workbook: it gives each cell's formula text, the value
// Excel saved, and its number format; it does not recalculate. The bytes pass the size check and the zip scan before SheetJS sees them,
// and the caps are enforced again on what SheetJS returns. `xlsx` is imported in this one file only. Nothing read from the workbook is
// ever put in an error message: a refusal is a code and a fixed sentence.

export const SHEETJS_VERSION: string = sheetjsVersion;

/** Excel's error codes as SheetJS reports them, in Excel's own words. */
const ERROR_TEXT: Record<number, string> = {
  0x00: "#NULL!",
  0x07: "#DIV/0!",
  0x0f: "#VALUE!",
  0x17: "#REF!",
  0x1d: "#NAME?",
  0x24: "#NUM!",
  0x2a: "#N/A",
  0x2b: "#GETTING_DATA",
};

const ARRAY_RANGE = /^[A-Z]{1,3}[0-9]{1,7}(:[A-Z]{1,3}[0-9]{1,7})?$/;
const XLFN = /_xlfn\.(?:_xlws\.)?|_xlws\./g;
/** A name that points at another workbook ("[1]Sheet1!A1", "[Book.xlsx]Sheet1!A1") or at a URL or share. */
const EXTERNAL_REF = /\[\d+\]|\.xls[xmb]?\]|:\/\/|^\\\\/i;

function savedValue(cell: CellObject): { v: number | string | boolean | null; t: SavedType; cut: boolean } {
  const { t, v } = cell;
  if (v === undefined || v === null || t === "z") return { v: null, t: "z", cut: false };
  if (t === "n") return typeof v === "number" && Number.isFinite(v) ? { v, t: "n", cut: false } : { v: null, t: "z", cut: false };
  if (t === "b") return { v: Boolean(v), t: "b", cut: false };
  if (t === "e") return { v: ERROR_TEXT[Number(v)] ?? "#UNKNOWN!", t: "e", cut: false };
  // Strings (and the rare date type, which cellDates:false never produces) are kept as plain text and cut at the cap.
  const text = String(v);
  if (text.length > MAX_STRING_CHARS) return { v: text.slice(0, MAX_STRING_CHARS - 1) + "…", t: "s", cut: true };
  return { v: text, t: "s", cut: false };
}

function readSheet(name: string, ws: WorkSheet, totals: { cells: number; formulas: number; cut: number }): IndexSheet {
  const rows = (ws as unknown as { "!data"?: (CellObject | undefined | null)[][] })["!data"] ?? [];
  const cells: IndexCell[] = [];
  const arrays = new Set<string>();
  // SheetJS cuts a sheet at its row cap and says so only through !fullref; the zip scan already refused longer sheets.
  if ((ws as unknown as Record<string, unknown>)["!fullref"] !== undefined || rows.length > MAX_SHEET_ROWS) throw new XlsxRefusal("too_many_rows");

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const formula = typeof cell.f === "string" && cell.f.length > 0 ? cell.f : null;
      if (typeof cell.F === "string" && ARRAY_RANGE.test(cell.F)) arrays.add(cell.F);
      if (!formula && (cell.t === "z" || cell.v === undefined)) continue; // a formatted blank cell
      if (formula && formula.length > MAX_FORMULA_CHARS) throw new XlsxRefusal("formula_too_long");
      if (++totals.cells > MAX_CELLS) throw new XlsxRefusal("too_many_cells");
      if (formula && ++totals.formulas > MAX_FORMULAS) throw new XlsxRefusal("too_many_formulas");
      const saved = savedValue(cell);
      if (saved.cut) totals.cut++;
      const addr = formatAddr(r + 1, c + 1);
      const z = typeof cell.z === "string" && cell.z !== "General" ? cell.z : null;
      cells.push([addr, formula ? formula.replace(XLFN, "") : null, saved.v, saved.t, z]);
    }
  }
  return { name, cells, arrays: [...arrays] };
}

function readNames(wb: WorkBook): IndexName[] {
  const names = wb.Workbook?.Names ?? [];
  if (names.length > MAX_DEFINED_NAMES) throw new XlsxRefusal("too_many_names");
  const out: IndexName[] = [];
  for (const n of names) {
    const ref = typeof n.Ref === "string" ? n.Ref : "";
    if (ref.length > MAX_FORMULA_CHARS) throw new XlsxRefusal("formula_too_long");
    if (EXTERNAL_REF.test(ref)) throw new XlsxRefusal("external_name");
    // Excel's own bookkeeping names (print areas, filters) carry no value the model uses.
    if (typeof n.Name !== "string" || n.Name.startsWith("_xlnm.")) continue;
    const local = typeof n.Sheet === "number" ? (wb.SheetNames[n.Sheet] ?? null) : null;
    out.push({ name: n.Name, ref, sheet: local });
  }
  return out;
}

/** Magic bytes, size, zip scan, then SheetJS; returns the sheet index. Throws XlsxRefusal with a code for anything it will not read. */
export function readWorkbook(bytes: Uint8Array): SheetIndex {
  if (bytes.byteLength > XLSX_MAX_BYTES) throw new XlsxRefusal("too_big");
  scanXlsxZip(bytes);

  let wb: WorkBook;
  try {
    wb = read(bytes, {
      type: "buffer",
      dense: true,
      cellFormula: true,
      cellNF: true,
      cellHTML: false,
      cellText: false,
      cellStyles: false,
      cellDates: false,
      // A formula with no saved value is dropped without this; blank formatted stubs it adds are skipped in readSheet.
      sheetStubs: true,
      bookVBA: false,
      bookFiles: false,
      bookDeps: false,
      sheetRows: MAX_SHEET_ROWS,
      WTF: false,
    });
  } catch {
    throw new XlsxRefusal("zip_damaged");
  }
  if (wb.Workbook?.WBProps?.date1904) throw new XlsxRefusal("date_1904");
  if (wb.SheetNames.length > MAX_SHEETS) throw new XlsxRefusal("too_many_sheets");

  const totals = { cells: 0, formulas: 0, cut: 0 };
  const sheets: IndexSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (ws) sheets.push(readSheet(name, ws, totals));
  }
  const names = readNames(wb);
  return { sheets, names, counts: { sheets: sheets.length, cells: totals.cells, formulas: totals.formulas }, stringsCut: totals.cut };
}

