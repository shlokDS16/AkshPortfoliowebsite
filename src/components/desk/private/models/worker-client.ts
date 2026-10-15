import type { ResultValue } from "@/modules/valuation/client";
import type { Connect, Engine, FromWorker, ToWorker } from "./engine-protocol";

// Opens the calculator's Web Worker (D18) and wraps its messages as promises. A worker that cannot start, a chunk or a wasm file that
// does not load, or a model that cannot be read all reject, and the calculator shows the spec s8 sentence.

type Request = ToWorker extends infer T ? (T extends { id: number } ? Omit<T, "id"> : never) : never;

export const LOAD_TIMEOUT_MS = 60_000;

export const connectWorker: Connect = async (url, results, options) => {
  const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
  const waiting = new Map<number, { resolve: (v: ResultValue[]) => void; reject: (e: Error) => void }>();
  let seq = 0;
  let stopped = false;
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
      // A stopped worker drops what it is sent, so a request to it would wait for ever: refuse it here.
      if (stopped) return reject(new Error("calculator stopped"));
      seq += 1;
      waiting.set(seq, { resolve, reject });
      worker.postMessage({ ...request, id: seq } as ToWorker);
    });

  const stop = () => {
    stopped = true;
    failAll();
    worker.terminate();
  };

  const engine: Engine = {
    evaluate: (inputs) => send({ type: "evaluate", inputs }),
    grid: (base, a, b, points, result) => send({ type: "grid", base, a: { sheet: a.sheet, addr: a.addr }, b: { sheet: b.sheet, addr: b.addr }, points, result: { sheet: result.sheet, addr: result.addr } }),
    dispose: stop,
  };
  const signal = options?.signal;
  if (signal?.aborted) {
    stop();
    throw new Error("calculator stopped");
  }
  signal?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, LOAD_TIMEOUT_MS);
  try {
    await send({ type: "load", url, results });
  } catch (error) {
    stop();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
  return engine;
};
