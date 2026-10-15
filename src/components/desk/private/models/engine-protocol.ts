import type { ResultValue } from "@/modules/valuation/client";

// What the calculator asks of the engine, and the messages to and from its Web Worker (D18: an evaluate is 160-260 ms on a laptop and a
// 5 x 5 grid is about 5 s, so the engine never runs on the main thread). Cells are named by sheet and address; the worker turns the sheet
// name into the engine's sheet index. Browser-safe; no engine code here.

export type EngineCell = { sheet: string; addr: string };
export type EngineInput = EngineCell & { value: number };

export interface Engine {
  /** Sets every input to the value given and returns the result cells (named at connect), in order. */
  evaluate(inputs: EngineInput[]): Promise<ResultValue[]>;
  /** For each point: the base inputs with `a` and `b` replaced, evaluated; the one `result` cell's value per point, in order. */
  grid(base: EngineInput[], a: EngineCell, b: EngineCell, points: { a: number; b: number }[], result: EngineCell): Promise<ResultValue[]>;
  dispose(): void;
}

/**
 * Opens the engine on the model at `url` (the signed link). Rejects when the chunk, the wasm or the model cannot be loaded, when the
 * load takes more than 60 seconds, or when `signal` is aborted (which also ends the worker).
 */
export type Connect = (url: string, results: EngineCell[], options?: { signal?: AbortSignal }) => Promise<Engine>;

export type ToWorker =
  | { type: "load"; id: number; url: string; results: EngineCell[] }
  | { type: "evaluate"; id: number; inputs: EngineInput[] }
  | { type: "grid"; id: number; base: EngineInput[]; a: EngineCell; b: EngineCell; points: { a: number; b: number }[]; result: EngineCell };

export type FromWorker = { type: "done"; id: number; values: ResultValue[] } | { type: "failed"; id: number };
