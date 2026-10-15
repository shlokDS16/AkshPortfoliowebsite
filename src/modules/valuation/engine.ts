// The calculator's entry (Plan 2.7 Task 3, D18): the browser engine for the model page's Web Worker, and nothing else imports it (a test
// keeps it that way), so the IronCalc wasm glue is only ever in that worker's chunk. Browser-safe; the wasm file is served from public/vendor.
export { loadEngine, type CalcEngine, type InputValue, type ResultCell, type ResultValue, type WasmApi } from "./engine-client";
export { WASM_PUBLIC_PATH } from "./versions";
