import { loadEngine, WASM_PUBLIC_PATH, type CalcEngine, type ResultCell } from "@/modules/valuation/engine";
import type { EngineCell, EngineInput, FromWorker, ToWorker } from "./engine-protocol";
import { engineBytes, fetchModel } from "./fetch-model";

// The calculator's Web Worker (D18): it fetches the model object through the signed link, starts the IronCalc wasm from
// /vendor/ironcalc-0.8.4.wasm, loads the server's engine bytes, and answers one request at a time. The main thread only posts inputs
// and receives results. Nothing here logs: a failure is a "failed" message, and the page shows the spec s8 sentence.

type Scope = { onmessage: ((e: MessageEvent<ToWorker>) => void) | null; postMessage(message: FromWorker): void };
const scope = globalThis as unknown as Scope;

let engine: CalcEngine | null = null;
let sheets: string[] = [];
let results: ResultCell[] = [];

/** The engine's sheet index follows the workbook's order, which is the stored index's order. */
function at(cell: EngineCell): ResultCell {
  const sheet = sheets.indexOf(cell.sheet);
  if (sheet < 0) throw new RangeError("no such sheet");
  return { sheet, addr: cell.addr };
}
const set = (inputs: EngineInput[]) => engine!.setInputs(inputs.map((i) => ({ ...at(i), value: i.value })));

async function handle(m: ToWorker): Promise<FromWorker> {
  if (m.type === "load") {
    const model = await fetchModel(m.url);
    sheets = model.index.sheets.map((s) => s.name);
    results = m.results.map(at);
    engine?.dispose();
    engine = await loadEngine(engineBytes(model), (wasm) => wasm.default({ module_or_path: WASM_PUBLIC_PATH }), results);
    return { type: "done", id: m.id, values: engine.readResults(results) };
  }
  if (!engine) throw new Error("not loaded");
  if (m.type === "evaluate") {
    set(m.inputs);
    engine.evaluate();
    return { type: "done", id: m.id, values: engine.readResults(results) };
  }
  const target = [at(m.result)];
  const values = m.points.map((p) => {
    set(m.base.map((i) => (i.sheet === m.a.sheet && i.addr === m.a.addr ? { ...i, value: p.a } : i.sheet === m.b.sheet && i.addr === m.b.addr ? { ...i, value: p.b } : i)));
    engine!.evaluate();
    return engine!.readResults(target)[0];
  });
  return { type: "done", id: m.id, values };
}

// Requests are answered in the order they came: each waits for the one before it.
let queue: Promise<unknown> = Promise.resolve();
scope.onmessage = (e) => {
  const m = e.data;
  queue = queue.then(async () => {
    try {
      scope.postMessage(await handle(m));
    } catch {
      scope.postMessage({ type: "failed", id: m.id });
    }
  });
};
