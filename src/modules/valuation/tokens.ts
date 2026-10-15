import "server-only";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { MarkedToken } from "@ironcalc/wasm";

// The formula tokenizer, server side: the IronCalc wasm module run in Node (initSync from the package's own file) only for its
// `getTokens(formula)`, so the references the reference graph follows come from the same grammar the engine evaluates with. This file and
// engine-client.ts are the only places that import @ironcalc/wasm. A formula it cannot tokenize is reported as `dynamic` (its
// precedents unknown), never guessed at.

export type CellRef = { sheet: string | null; row: number; col: number };
export type RangeRef = { sheet: string | null; row1: number; col1: number; row2: number; col2: number };
export type FormulaRefs = {
  cells: CellRef[];
  ranges: RangeRef[];
  /** Identifiers that are not function names: defined names (or LET variables). */
  names: string[];
  /** Upper-cased function names, once per use. */
  functions: string[];
  /** True when the cell's precedents cannot be listed: OFFSET, INDIRECT, a 3D or structured reference, a spill reference, a parse failure. */
  dynamic: boolean;
};
export type Tokenizer = { parse(formula: string): FormulaRefs };

const DYNAMIC_FUNCTIONS = new Set(["OFFSET", "INDIRECT"]);

type Anything = Record<string, unknown>;
const asObject = (token: unknown): Anything | null => (typeof token === "object" && token !== null ? (token as Anything) : null);

function parseTokens(tokens: MarkedToken[]): FormulaRefs {
  const out: FormulaRefs = { cells: [], ranges: [], names: [], functions: [], dynamic: false };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].token;
    if (token === "Spill") out.dynamic = true;
    const o = asObject(token);
    if (!o) continue;
    if ("Illegal" in o || "StructuredReference" in o) out.dynamic = true;
    else if ("Reference" in o) {
      const ref = o.Reference as { sheet?: string | null; row: number; column: number };
      out.cells.push({ sheet: ref.sheet ?? null, row: ref.row, col: ref.column });
    } else if ("Range" in o) {
      const range = o.Range as { sheet?: string | null; left: { row: number; column: number }; right: { row: number; column: number } };
      const [row1, row2] = [Math.min(range.left.row, range.right.row), Math.max(range.left.row, range.right.row)];
      const [col1, col2] = [Math.min(range.left.column, range.right.column), Math.max(range.left.column, range.right.column)];
      out.ranges.push({ sheet: range.sheet ?? null, row1, col1, row2, col2 });
    } else if ("Ident" in o) {
      const ident = String(o.Ident);
      const next = tokens[i + 1]?.token;
      if (next === "LeftParenthesis") {
        const fn = ident.toUpperCase();
        out.functions.push(fn);
        if (DYNAMIC_FUNCTIONS.has(fn)) out.dynamic = true;
      } else if (next !== "Bang") out.names.push(ident);
    }
  }
  return out;
}

/** The package's wasm file: next to the module that exports it. Tried through Node's resolver first, then from the working directory (a traced deployment). */
async function wasmBytes(): Promise<Uint8Array> {
  const candidates: string[] = [];
  try {
    candidates.push(createRequire(join(process.cwd(), "package.json")).resolve("@ironcalc/wasm/wasm_bg.wasm"));
  } catch {
    // fall through to the fixed path
  }
  candidates.push(join(process.cwd(), "node_modules", "@ironcalc", "wasm", "wasm_bg.wasm"));
  let last: unknown;
  for (const path of candidates) {
    try {
      return await readFile(path);
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("the IronCalc wasm file was not found");
}

let loading: Promise<Tokenizer> | null = null;

/** Loads the wasm module once per process and returns the synchronous parser. */
export function loadTokenizer(): Promise<Tokenizer> {
  loading ??= (async () => {
    const wasm = await import("@ironcalc/wasm");
    wasm.initSync({ module: await wasmBytes() });
    return {
      parse(formula: string): FormulaRefs {
        try {
          return parseTokens(wasm.getTokens(formula));
        } catch {
          return { cells: [], ranges: [], names: [], functions: [], dynamic: true };
        }
      },
    };
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
