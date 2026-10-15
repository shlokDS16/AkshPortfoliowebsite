import "server-only";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { Model } from "@ironcalc/nodejs";
import { parseAddr } from "./addr";
import { ENGINE_MAX_MS, MODEL_OBJECT_MAX_BYTES } from "./limits";
import { XlsxRefusal } from "./refusal";
import type { EngineValue, SheetIndex } from "./types";
import { errorKind } from "./values";
import { ENGINE_VERSIONS } from "./versions";

// The server-side calculation engine: IronCalc (Rust, native addon) opens the same workbook SheetJS indexed, evaluates it, and gives back
// the raw value and type of every formula cell plus its own byte format for the browser engine. It runs only inside the xlsx_read job
// step, never in a request. The bytes written to disk have already passed the size check, the zip scan and the caps; the file has a
// random name (the upload's name is never used) and is deleted as soon as the engine has loaded it. This is the only file that imports
// @ironcalc/nodejs. Nothing from the workbook goes into an error: a failure is a code.
//
// The workbook is opened and evaluated in a CHILD PROCESS that is killed at a hard deadline. evaluate() is one native call: neither the
// event loop nor a worker thread's terminate() can stop it (measured: terminate() waited for the call to return), and the engine-time
// estimate (cost.ts) cannot see ranges built by OFFSET or INDIRECT, which can name a whole sheet (one such formula ran for minutes). A
// killed process can. The child gets the addon's path, the temp file's path and the cells to read; it has no environment beyond what a
// process needs to start (no secrets), and its error output is discarded (engine text never reaches a log).

// IronCalc's CellType numbers (Excel's TYPE() convention). The enum is declared `const` in the package's typings, which isolatedModules
// cannot use, so the one number that matters is named here.
const TYPE_ERROR = 16;

const LOCALE = "en";
const TIME_ZONE = "Asia/Kolkata";
const LANGUAGE = "en";

/** The most the child may write back: values and engine bytes for a model the store would take, with room for long strings. */
const MAX_CHILD_OUTPUT = 4 * MODEL_OBJECT_MAX_BYTES;
/** The child's whole environment: none of the parent's (keys, tokens, NODE_OPTIONS stay behind). Node and the addon start without any. */
const CHILD_ENV: NodeJS.ProcessEnv = { NODE_ENV: "production" };

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
  /** Called after each stage ("load", "evaluate", "read") so the caller can enforce its time budget; a throw stops the engine. */
  checkpoint?: (stage: "load" | "evaluate" | "read") => void;
  /** Wall time the engine may take before it is killed and the workbook refused (`too_complex`); default ENGINE_MAX_MS. */
  timeoutMs?: number;
};

// Plain CommonJS run with `node --input-type=commonjs -e`. argv: addon path, workbook path, locale, time zone, language. stdin: the cells
// to read as [sheet name, row, column]. stdout: one JSON object per line ({stage}, {refusal}, then {result}).
const CHILD_SOURCE = String.raw`
const [addon, file, locale, timeZone, language] = process.argv.slice(1);
const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { input += d; });
process.stdin.on("end", () => {
  const cells = JSON.parse(input);
  let model;
  try {
    model = require(addon).Model.fromXlsx(file, locale, timeZone, language);
  } catch (e) {
    send({ refusal: e instanceof Error && e.message.includes("data table formulas") ? "data_tables" : "engine_failed" });
    return;
  }
  send({ stage: "load" });
  try { model.evaluate(); } catch { send({ refusal: "engine_failed" }); return; }
  send({ stage: "evaluate" });
  const positions = new Map(model.getWorksheetsProperties().map((p, i) => [p.name, i]));
  const values = cells.map(([sheet, row, col]) => {
    const at = positions.get(sheet);
    return at === undefined ? null : [model.getCellType(at, row, col), model.getCellValue(at, row, col) ?? null];
  });
  send({ result: { values, bytes: Buffer.from(model.toBytes()).toString("base64") } });
});
`;

type ChildMessage = { stage?: "load" | "evaluate"; refusal?: string; result?: { values: ([number, unknown] | null)[]; bytes: string } };
type ChildResult = NonNullable<ChildMessage["result"]>;

/** The addon's entry file, resolved from the app's root as tokens.ts resolves the wasm file (a traced deployment keeps node_modules there). */
function addonPath(): string {
  try {
    return createRequire(join(process.cwd(), "package.json")).resolve("@ironcalc/nodejs");
  } catch {
    return join(process.cwd(), "node_modules", "@ironcalc", "nodejs");
  }
}

const removeQuietly = (path: string) => {
  try {
    unlinkSync(path);
  } catch {
    // never written, or already gone
  }
};

function runChild(path: string, cells: [string, number, number][], opts: NodeEngineOptions): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const child: ChildProcessByStdio<Writable, Readable, null> = spawn(process.execPath, ["--input-type=commonjs", "-e", CHILD_SOURCE, addonPath(), path, LOCALE, TIME_ZONE, LANGUAGE], {
      env: CHILD_ENV,
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });
    let result: ChildResult | null = null;
    let failure: XlsxRefusal | null = null;
    const fail = (refusal: XlsxRefusal) => {
      failure ??= refusal;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => fail(new XlsxRefusal("too_complex")), opts.timeoutMs ?? ENGINE_MAX_MS);

    const handle = (line: string) => {
      const message = JSON.parse(line) as ChildMessage;
      if (message.stage === "load") removeQuietly(path); // the engine holds the workbook in memory now
      if (message.stage) opts.checkpoint?.(message.stage);
      if (message.refusal) fail(new XlsxRefusal(message.refusal === "data_tables" ? "data_tables" : "engine_failed"));
      if (message.result) result = message.result;
    };
    const pending: string[] = [];
    let received = 0;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (failure) return;
      received += chunk.length;
      if (received > MAX_CHILD_OUTPUT) return fail(new XlsxRefusal("model_too_large"));
      let from = 0;
      for (let nl = chunk.indexOf("\n"); nl >= 0 && !failure; nl = chunk.indexOf("\n", from)) {
        pending.push(chunk.slice(from, nl));
        from = nl + 1;
        const line = pending.join("");
        pending.length = 0;
        try {
          handle(line);
        } catch (error) {
          fail(error instanceof XlsxRefusal ? error : new XlsxRefusal("engine_failed"));
        }
      }
      pending.push(chunk.slice(from));
    });
    child.on("error", () => fail(new XlsxRefusal("engine_failed")));
    child.on("close", () => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (result) resolve(result);
      else reject(new XlsxRefusal("engine_failed")); // the process died (a panic, out of memory) without an answer
    });
    child.stdin.on("error", () => {
      // the child ended before reading its input; "close" reports it
    });
    child.stdin.end(JSON.stringify(cells));
  });
}

function toValue([type, value]: [number, unknown]): EngineValue {
  if (type === TYPE_ERROR) {
    const text = String(value ?? "");
    return { kind: "e", error: errorKind(text), text };
  }
  if (typeof value === "number") return { kind: "n", v: value };
  if (typeof value === "string") return { kind: "s", v: value };
  if (typeof value === "boolean") return { kind: "b", v: value };
  return { kind: "empty" };
}

/** Recalculates the workbook in a child process killed at the deadline; the temp file is deleted before this settles, whatever happens. */
export async function runNodeEngine(bytes: Uint8Array, index: SheetIndex, opts: NodeEngineOptions = {}): Promise<NodeEngineResult> {
  const keys: string[] = [];
  const cells: [string, number, number][] = [];
  const values = new Map<string, EngineValue>();
  for (const sheet of index.sheets) {
    for (const [addr, f] of sheet.cells) {
      if (f === null) continue;
      const key = `${sheet.name}!${addr}`;
      const pos = parseAddr(addr);
      values.set(key, { kind: "empty" });
      if (!pos) continue;
      keys.push(key);
      cells.push([sheet.name, pos.row, pos.col]);
    }
  }

  const path = join(opts.tmpDir ?? tmpdir(), `desk-xlsx-${randomUUID()}.xlsx`);
  opts.onTempFile?.(path);
  let reply: ChildResult;
  try {
    try {
      // "wx": never follow or reuse a file that is already there.
      writeFileSync(path, bytes, { mode: 0o600, flag: "wx" });
    } catch {
      throw new XlsxRefusal("engine_failed");
    }
    reply = await runChild(path, cells, opts);
  } finally {
    removeQuietly(path);
  }
  if (!Array.isArray(reply.values) || reply.values.length !== keys.length) throw new XlsxRefusal("engine_failed");
  reply.values.forEach((raw, i) => {
    if (raw) values.set(keys[i], toValue(raw));
  });
  const engineBytes = new Uint8Array(Buffer.from(reply.bytes, "base64"));
  opts.checkpoint?.("read");
  return { values, engineBytes, version: ENGINE_VERSIONS.ironcalcNode };
}

const FUNCTION_NAME = /^[A-Z][A-Z0-9._]{0,39}$/;

/** The most function names one read asks the engine about: the report names them, and a real model uses a few dozen at most. */
export const MAX_PROBED_FUNCTIONS = 200;

/**
 * The names (of those given) that the engine cannot compute: unknown to it (#NAME?) or known and not implemented (#N/IMPL). Asked of a
 * scratch workbook with each name called with no arguments; a name that is not a plain function name is never put into a formula. At most
 * MAX_PROBED_FUNCTIONS names are asked about (a hostile workbook can use a million distinct made-up names).
 */
export function probeFunctions(names: string[]): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    if (candidates.length >= MAX_PROBED_FUNCTIONS) break;
    if (!seen.has(n) && FUNCTION_NAME.test(n)) candidates.push(n);
    seen.add(n);
  }
  if (candidates.length === 0) return [];
  const model = new Model("probe", LOCALE, "UTC", LANGUAGE);
  const refused = new Set<string>();
  candidates.forEach((name, i) => {
    try {
      model.setUserInput(0, i + 1, 1, `=${name}()`);
    } catch {
      // a name the parser refuses is not one the engine computes
      refused.add(name);
    }
  });
  model.evaluate();
  return candidates.filter((name, i) => {
    if (refused.has(name)) return true;
    if (model.getCellType(0, i + 1, 1) !== TYPE_ERROR) return false;
    const kind = errorKind(String(model.getCellValue(0, i + 1, 1) ?? ""));
    return kind === "NAME" || kind === "NIMPL";
  });
}
