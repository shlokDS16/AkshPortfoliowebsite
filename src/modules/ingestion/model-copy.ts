import type { ModelSummary } from "./trays";

// The words about valuation workbooks (browser-safe: the trays show them). Spec 2026-10-14-valuation-2.7-design s8; the build chose the
// wording of the confirmed line and the give-up line, pending Shlok's approval.

/** What a workbook's tray says while it is being read. */
export const MODEL_READING = "Reading the workbook";
/** Once Aksh has chosen the cells, the card stays in Ready for you until he marks it done. */
export const MODEL_CONFIRMED = "Model confirmed. Open it to try scenarios.";
/** The sentence a read that threw three times (a storage failure, for instance) ends with; a workbook has no figures to enter by hand. */
export const WORKBOOK_GAVE_UP = "This workbook could not be read after three tries. Try again, or upload it again.";
/** The sentence for a read that stopped without storing why. */
export const WORKBOOK_NOT_READ = "This workbook could not be read.";

const n = (count: number) => count.toLocaleString("en-US");
const plural = (count: number, one: string) => `${n(count)} ${count === 1 ? one : `${one}s`}`;

/** "Model read: 4 sheets, 3,912 cells, 1,204 formulas. Choose its inputs and results." */
export function modelReadText(model: Pick<ModelSummary, "sheets" | "cells" | "formulas">): string {
  return `Model read: ${plural(model.sheets, "sheet")}, ${plural(model.cells, "cell")}, ${plural(model.formulas, "formula")}. Choose its inputs and results.`;
}
