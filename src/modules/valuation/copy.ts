import { CHOICE_TEXT } from "./service";

// The sentences Aksh reads when a valuation action refuses (plain words; the banned words of spec s7.3 never appear). Each is fixed: nothing
// from the workbook goes into one (a cell is named separately, as data). Browser-safe.

export const VALUATION_TEXT = {
  ...CHOICE_TEXT,
  scenario_name: "Give the scenario a name of 1 to 80 characters. A note can be up to 500.",
  scenario_values: "Save 1 to 40 numbers, each for one of your chosen inputs and no larger than 1,000,000,000,000,000.",
  bad_request: "The desk could not use that request. Reload the page and try again.",
  not_found: "That model version was not found.",
  not_ready: "This workbook has not finished reading, or could not be read.",
  already_confirmed: "This model is already confirmed. Upload a changed workbook to choose different cells.",
  not_confirmed: "Choose this model's inputs and results first.",
  model_unreadable: "The stored model could not be read. Upload the workbook again.",
  name_taken: "You already have a scenario with that name. Use another name.",
  save_failed: "Could not save. Try again.",
} as const;

export type ValuationErrorCode = keyof typeof VALUATION_TEXT;
export type ValuationFailure = { ok: false; code: ValuationErrorCode; message: string; /** "Sheet!A1" of the cell a choice check named; data, not text. */ cell?: string };

export const failure = (code: ValuationErrorCode, cell?: string): ValuationFailure => ({ ok: false, code, message: VALUATION_TEXT[code], ...(cell ? { cell } : {}) });
