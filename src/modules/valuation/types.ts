// The shapes the module passes around. Browser-safe: types only. Everything here is MACHINE-READ from the workbook or computed by the
// desk; Aksh's own words and choices (labels, roles, scenario values) live in other tables and never in these shapes (spec s9).

/** The type of a saved value, as SheetJS reports it: number, string, boolean, error, or "z" for a formula cell with no saved value. */
export type SavedType = "n" | "s" | "b" | "e" | "z";

/** One non-empty cell: [address, formula text without "=" or null, Excel's saved value or null, its type, its Excel number format or null]. */
export type IndexCell = [addr: string, f: string | null, v: number | string | boolean | null, t: SavedType, z: string | null];

export type IndexSheet = {
  name: string;
  cells: IndexCell[];
  /** Array-formula ranges ("F1:F2"); every cell inside one is treated as unsupported and never offered as an input. */
  arrays: string[];
};

export type IndexName = {
  name: string;
  /** The reference text, for example "Sheet1!$A$1:$A$3" or a constant such as "0.12". */
  ref: string;
  /** The sheet the name is local to, or null for a workbook-wide name. */
  sheet: string | null;
};

export type SheetIndex = {
  sheets: IndexSheet[];
  names: IndexName[];
  counts: { sheets: number; cells: number; formulas: number };
  /** Strings longer than the cap that were cut (and end in an ellipsis). */
  stringsCut: number;
};

/** How the desk's recalculation compares with Excel's saved value for one formula cell (spec s5.4). */
export type CellClass = "match" | "differs" | "unsupported" | "cycle" | "no_cache" | "random" | "dated";

/** What the desk's engine produced for one cell. Errors are kept by kind, never compared as strings. */
export type EngineErrorKind = "NULL" | "DIV" | "VALUE" | "REF" | "NAME" | "NUM" | "NA" | "ERROR" | "NIMPL" | "SPILL" | "CALC" | "CIRC" | "OTHER";
export type EngineValue =
  | { kind: "n"; v: number }
  | { kind: "s"; v: string }
  | { kind: "b"; v: boolean }
  | { kind: "e"; error: EngineErrorKind; text: string }
  | { kind: "empty" };

/** A row of the report (spec s7.2): which cell, what Excel saved, what the desk computed, and why they differ in plain words. */
export type ReportEntry = { cell: string; cls: Exclude<CellClass, "match">; excel: string | null; desk: string | null; fn: string | null };

export type Report = {
  counts: Record<CellClass, number>;
  /** At most MAX_REPORT_CELLS entries, differing cells first. */
  listed: ReportEntry[];
  /** Function names the engine does not know or has not implemented, over all formula cells (names only, from a fixed pattern). */
  unimplemented: string[];
  /** Cells whose result depends on a cell that differs, is unsupported, loops, has no saved value or is random. */
  tainted: number;
  /** Cells with references the desk cannot follow (OFFSET, INDIRECT, structured or 3D references). */
  dynamic: number;
};

export type InputSuggestion = { sheet: string; addr: string; value: number; z: string | null; dependents: number; label: string | null };
export type OutputSuggestion = { sheet: string; addr: string; value: number; z: string | null; precedents: number; label: string | null };
export type Suggestions = { inputs: InputSuggestion[]; outputs: OutputSuggestion[] };

/** The object stored at models/<versionId>.json (spec s5.7). Machine output only. */
export type ModelObject = {
  modelVersion: 1;
  engine: { sheetjs: string; ironcalcNode: string; ironcalcWasm: string };
  index: SheetIndex;
  /** Every formula cell that is not a match, by "Sheet!A1". */
  classes: Record<string, Exclude<CellClass, "match">>;
  /** Cells reachable forward from a differing, unsupported, cyclic, unsaved or random cell. */
  taint: string[];
  /** Cells whose precedents the desk cannot list. */
  dynamic: string[];
  suggestions: Suggestions;
  report: Report;
  /** Base64 of the Node engine's toBytes(), loaded by the browser engine. */
  engineBytes: string;
};
