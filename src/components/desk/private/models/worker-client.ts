import type { ResultValue } from "@/modules/valuation/client";
import type { Connect, Engine, FromWorker, ToWorker } from "./engine-protocol";

// Opens the calculator's Web Worker (D18) and wraps its messages as promises. A worker that cannot start, a chunk or a wasm file that
// does not load, or a model that cannot be read all reject, and the calculator shows the spec s8 sentence.

type Request = ToWorker extends infer T ? (T extends { id: number } ? Omit<T, "id"> : never) : never;

export const connectWorker: Connect = async (url, results) => {
  const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
  const waiting = new Map<number, { resolve: (v: ResultValue[]) => void; reject: (e: Error) => void }>();
  let seq = 0;
  const failAll = () => {
    for (const w of waiting.values()) w.reject(new Error("calculator stopped"));
    waiting.clear();
  };
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const w = waiting.get(e.data.id);
    if (!w) return;
    waiting.delete(e.data.id);
    if (e.data.type === "done") w.resolve(e.data.values);
    else w.reject(new Error("calculator failed"));
  };
  worker.onerror = failAll;
  worker.onmessageerror = failAll;
  const send = (request: Request) =>
    new Promise<ResultValue[]>((resolve, reject) => {
      seq += 1;
      waiting.set(seq, { resolve, reject });
      worker.postMessage({ ...request, id: seq } as ToWorker);
    });

  const engine: Engine = {
    evaluate: (inputs) => send({ type: "evaluate", inputs }),
    grid: (base, a, b, points, result) => send({ type: "grid", base, a: { sheet: a.sheet, addr: a.addr }, b: { sheet: b.sheet, addr: b.addr }, points, result: { sheet: result.sheet, addr: result.addr } }),
    dispose: () => {
      failAll();
      worker.terminate();
    },
  };
  try {
    await send({ type: "load", url, results });
  } catch (error) {
    engine.dispose();
    throw error;
  }
  return engine;
};
