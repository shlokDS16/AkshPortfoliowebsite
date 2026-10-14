// The caps on an uploaded workbook and on the work done for it (spec 2026-10-14-valuation-2.7-design s4). Browser-safe: plain numbers
// only. A change here needs a spec edit in the same commit; Plan 2.7 Task 1 measured the at-cap run (see docs/progress.md).

/** Largest .xlsx accepted, checked at the drop bar and again on the stored object. */
export const XLSX_MAX_BYTES = 10 * 1024 * 1024;

/** Zip scan (s4.3): entries, bytes per entry once inflated, bytes over all entries. */
export const ZIP_MAX_ENTRIES = 1_000;
export const ZIP_MAX_ENTRY_BYTES = 25 * 1024 * 1024;
export const ZIP_MAX_TOTAL_BYTES = 60 * 1024 * 1024;

/** After the SheetJS parse (s4.5). */
export const MAX_SHEETS = 30;
export const MAX_CELLS = 100_000;
export const MAX_FORMULAS = 20_000;
export const MAX_DEFINED_NAMES = 500;
export const MAX_FORMULA_CHARS = 8_192;
export const MAX_STRING_CHARS = 2_000;
/** Excel's own limits: a sheet name, a defined name and a number format. Anything longer did not come from Excel. */
export const MAX_SHEET_NAME_CHARS = 31;
export const MAX_NAME_CHARS = 255;
export const MAX_NUMBER_FORMAT_CHARS = 255;
/** Cell tags (filled or only formatted) over all sheets, counted before the parse; a safety bound well above MAX_CELLS. */
export const MAX_CELL_TAGS = 500_000;
/** SheetJS stops reading a sheet after this many rows; a sheet that has more is refused, never silently cut. */
export const MAX_SHEET_ROWS = 20_000;

/** The stored model object (s4.5) and the time one read may take (s4.6). */
export const MODEL_OBJECT_MAX_BYTES = 12 * 1024 * 1024;
export const READ_BUDGET_MS = 180_000;

/** Reference graph: the most range-membership entries it will hold (a pathological workbook is refused, not analysed forever). */
export const MAX_GRAPH_MEMBERS = 5_000_000;

/** Suggestions (s5.6) and the report listing (s6). */
export const MAX_SUGGESTIONS = 40;
export const MAX_REPORT_CELLS = 200;
export const MAX_LABEL_CHARS = 80;

/** Diff (s5.4): numbers are equal when they differ by at most this fraction of the larger magnitude (or of 1). */
export const DIFF_TOLERANCE = 1e-9;

/** Largest absolute scenario value (the database check, s6). */
export const MAX_SCENARIO_VALUE = 1e15;

/**
 * The most time the engine's single evaluate() may be estimated to take (cost.ts), checked before it runs. A third of the 60 s ceiling the
 * spec sets, because the estimate is an upper bound but not a guarantee and the call cannot be interrupted.
 */
export const MAX_EVAL_ESTIMATE_MS = 30_000;
