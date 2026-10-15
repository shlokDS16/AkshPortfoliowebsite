// The engine versions that read a workbook, recorded on every version row (spec s6, D13). A unit test checks each against the installed
// package, so a dependency bump cannot leave this stale. Browser-safe.
export const ENGINE_VERSIONS = { sheetjs: "0.20.3", ironcalcNode: "0.8.3", ironcalcWasm: "0.8.4" } as const;

/** The wasm file copied into public/ by scripts/copy-ironcalc-wasm.ts; the version is in the name so a new engine is a new URL. */
export const WASM_PUBLIC_PATH = "/vendor/ironcalc-0.8.4.wasm";
