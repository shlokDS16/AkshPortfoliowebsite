// Browser-safe entry point of the valuation module (the drop bar's limits, the page's formatting and copy). No server-only import, no
// node: module, no workbook library and no wasm: the engine is loaded by the calculator itself, on its own route.
export * from "./limits";
export * from "./refusal";
export * from "./versions";
export * from "./format";
export * from "./sensitivity";
export * from "./addr";
export type * from "./types";
export type { CellRole, CellRow, ScenarioRow, VersionStatus } from "./records";
// The model page (Task 3): its lists, the add-a-cell check, and the engine's result shape (a type only: the engine is in ./engine).
export { buildLookup, type Designation, type SheetLookup } from "./suggest";
export { checkChoice, CHOICE_TEXT, type ChoiceCode } from "./service";
export { VALUATION_TEXT, type ValuationErrorCode, type ValuationFailure } from "./copy";
export * from "./views";
export type { CalcEngine, ResultCell, ResultValue } from "./engine-client";
