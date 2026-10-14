import "server-only";
import { randomUUID } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Model } from "@ironcalc/nodejs";
import { parseAddr } from "./addr";
import { XlsxRefusal } from "./refusal";
import type { EngineValue, SheetIndex } from "./types";
import { errorKind } from "./values";
import { ENGINE_VERSIONS } from "./versions";

// The server-side calculation engine: IronCalc (Rust, native addon) opens the same workbook SheetJS indexed, evaluates it, and gives back
// the raw value and type of every formula cell plus its own byte format for the browser engine. It runs only inside the xlsx_read job
// step, never in a request. The bytes written to disk have already passed the size check, the zip scan and the caps; the file has a
// random name (the upload's name is never used) and is deleted as soon as the engine has loaded it. This is the only file that imports
// @ironcalc/nodejs. Nothing from the workbook goes into an error: a failure is a code.

// IronCalc's CellType numbers (Excel's TYPE() convention). The enum is declared `const` in the package's typings, which isolatedModules
// cannot use, so the one number that matters is named here.
const TYPE_ERROR = 16;

const LOCALE = "en";
const TIME_ZONE = "Asia/Kolkata";
const LANGUAGE = "en";

export type NodeEngineResult = {
  /** Every formula cell of the index, by "Sheet!A1". */
  values: Map<string, EngineValue>;
  /** IronCalc's own binary format, loaded by the browser engine (spec s3). */
  engineBytes: Uint8Array;
  version: string;
};

export type NodeEngineOptions = {
  /** Where the temporary file goes; defaults to os.tmpdir(). */
  tmpDir?: string;
  /** Called with the temporary file's path just before the engine opens it (tests check the name). */
  onTempFile?: (path: string) => void;
  /** Called after each stage ("load", "evaluate", "read") so the caller can enforce its time budget. */
  checkpoint?: (stage: "load" | "evaluate" | "read") => void;
};

/** Opens the workbook from a temp file that is deleted before this returns, whatever happens. */
function openModel(bytes: Uint8Array, opts: NodeEngineOptions): Model {
  const path = join(opts.tmpDir ?? tmpdir(), `desk-xlsx-${randomUUID()}.xlsx`);
  opts.onTempFile?.(path);
  try {
    writeFileSync(path, bytes, { mode: 0o600 });
    return Model.fromXlsx(path, LOCALE, TIME_ZONE, LANGUAGE);
  } catch {
    throw new XlsxRefusal("engine_failed");
  } finally {
    try {
      unlinkSync(path);
    } catch {
      // never written, or already gone
    }
  }
}

function readValue(model: Model, sheet: number, row: number, col: number): EngineValue {
  const type = model.getCellType(sheet, row, col);
  const value = model.getCellValue(sheet, row, col);
  if (type === TYPE_ERROR) {
    const text = String(value ?? "");
    return { kind: "e", error: errorKind(text), text };
  }
  if (typeof value === "number") return { kind: "n", v: value };
  if (typeof value === "string") return { kind: "s", v: value };
  if (typeof value === "boolean") return { kind: "b", v: value };
  return { kind: "empty" };
}

export function runNodeEngine(bytes: Uint8Array, index: SheetIndex, opts: NodeEngineOptions = {}): NodeEngineResult {
  const model = openModel(bytes, opts);
  opts.checkpoint?.("load");
  try {
    model.evaluate();
  } catch {
    throw new XlsxRefusal("engine_failed");
  }
  opts.checkpoint?.("evaluate");

  const positions = new Map(model.getWorksheetsProperties().map((p, i) => [p.name, i]));
  const values = new Map<string, EngineValue>();
  for (const sheet of index.sheets) {
    const at = positions.get(sheet.name);
    for (const [addr, f] of sheet.cells) {
      if (f === null) continue;
      const pos = parseAddr(addr);
      values.set(`${sheet.name}!${addr}`, at === undefined || !pos ? { kind: "empty" } : readValue(model, at, pos.row, pos.col));
    }
  }
  const engineBytes = model.toBytes();
  opts.checkpoint?.("read");
  return { values, engineBytes, version: ENGINE_VERSIONS.ironcalcNode };
}
