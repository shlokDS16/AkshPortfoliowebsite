// Server-side entry. Browser code imports limits, types and the pure helpers from "./client"; the writes are the server actions in "./actions".
import "server-only";
import type { BuildOptions } from "./build-model";
import type { ModelObject } from "./types";

export * from "./client";
export { VALUATION_TEXT, type ValuationErrorCode, type ValuationFailure } from "./copy";
export type { BuildOptions, BuildStage } from "./build-model";
export { createSupabaseValuationRepo, machineValuation, type MachineValuationRepo, type ValuationRepo } from "./repo";
export { checkChoice, checkScenario, CHOICE_TEXT, type ChoiceCode, type ChoiceVerdict, type ScenarioVerdict } from "./service";
export type { CellRole, CellRow, ChosenCell, MachineRead, ScenarioRow, VersionRow, VersionStatus } from "./records";

/**
 * Reads a workbook whole (spec s5.1-s5.6). Loaded on first use: build-model pulls in the native engine, which the job drain and the pages
 * that import this entry have no use for until a workbook is actually read.
 */
export async function buildModel(bytes: Uint8Array, opts?: BuildOptions): Promise<ModelObject> {
  return (await import("./build-model")).buildModel(bytes, opts);
}
