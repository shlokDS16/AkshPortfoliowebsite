import { loadEngine, WASM_PUBLIC_PATH } from "@/modules/valuation/engine";
import { createHost } from "./engine-host";
import type { FromWorker, ToWorker } from "./engine-protocol";
import { engineBytes, fetchModel } from "./fetch-model";

// The calculator's Web Worker (D18): it fetches the model object through the signed link, starts the IronCalc wasm from
// /vendor/ironcalc-0.8.4.wasm, loads the server's engine bytes, and answers one request at a time (engine-host.ts). The main thread only
// posts inputs and receives results. Nothing here logs: a failure is a "failed" message, and the page shows the spec s8 sentence.

type Scope = { onmessage: ((e: MessageEvent<ToWorker>) => void) | null; postMessage(message: FromWorker): void };
const scope = globalThis as unknown as Scope;

const host = createHost({
  fetchModel,
  engineBytes,
  loadEngine: (bytes) => loadEngine(bytes, (wasm) => wasm.default({ module_or_path: WASM_PUBLIC_PATH })),
});
scope.onmessage = (e) => host.receive(e.data, (r) => scope.postMessage(r));
