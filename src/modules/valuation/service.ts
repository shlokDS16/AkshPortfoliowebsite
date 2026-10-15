import { cellKey } from "./addr";
import { isDateFormat } from "./format";
import { MAX_SCENARIO_VALUE } from "./limits";
import type { CellRow, ChosenCell } from "./records";
import { buildLookup } from "./suggest";
import type { ModelObject } from "./types";

// The checks the database cannot make because it cannot read the model object (spec s6, last bullet), and the scenario checks. Pure:
// the model object and Aksh's choices go in, a verdict comes out. A verdict names the code and the cell (as data); the sentence is fixed
// and never carries text from the workbook.

export const CHOICE_TEXT = {
  input_missing: "A chosen input is not a filled cell of the workbook. Choose another cell.",
  input_formula: "A chosen input holds a formula. An input has to be a plain number the formulas read.",
  input_not_number: "A chosen input is not a number. An input has to be a plain number the formulas read.",
  input_date: "A chosen input is a date. An input has to be a plain number the formulas read.",
  input_in_array: "A chosen input sits inside an array formula's range, which the desk cannot change on its own.",
  output_missing: "A chosen result is not a filled cell of the workbook. Choose another cell.",
  output_not_formula: "A chosen result is a typed-in number, not a formula. A result has to be calculated by the workbook.",
  output_tainted: "A chosen result depends on a cell the desk cannot reproduce exactly, so its answer cannot be trusted. Choose another result.",
  output_not_number: "A chosen result is not a number. A result has to be a calculated number.",
} as const;
export type ChoiceCode = keyof typeof CHOICE_TEXT;

export type ChoiceVerdict = { ok: true } | { ok: false; code: ChoiceCode; cell: string };

/** Spec s6: an input is a numeric constant, not date-formatted; an output is an untainted numeric formula. First problem, in the order given. */
export function checkChoice(model: ModelObject, chosen: ChosenCell[]): ChoiceVerdict {
  const lookup = buildLookup(model.index);
  const taint = new Set(model.taint);
  for (const c of chosen) {
    const cell = lookup.cell(c.sheet, c.addr);
    const key = cellKey(c.sheet, c.addr);
    const fail = (code: ChoiceCode): ChoiceVerdict => ({ ok: false, code, cell: key });
    if (c.role === "input") {
      if (!cell) return fail("input_missing");
      if (cell[1] !== null) return fail("input_formula");
      if (cell[3] !== "n" || typeof cell[2] !== "number" || !Number.isFinite(cell[2])) return fail("input_not_number");
      if (isDateFormat(cell[4])) return fail("input_date");
      if (lookup.inArray(c.sheet, c.addr)) return fail("input_in_array");
    } else {
      if (!cell) return fail("output_missing");
      if (cell[1] === null) return fail("output_not_formula");
      // Tainted first: a cell with no saved value is both, and "cannot be reproduced" is the true reason.
      if (taint.has(key) || lookup.inArray(c.sheet, c.addr)) return fail("output_tainted");
      if (cell[3] !== "n" || typeof cell[2] !== "number" || !Number.isFinite(cell[2])) return fail("output_not_number");
    }
  }
  return { ok: true };
}

const NAME_MAX = 80;
const NOTE_MAX = 500;

export type ScenarioVerdict =
  | { ok: true; name: string; note: string; values: Record<string, number> }
  | { ok: false; code: "scenario_name" | "scenario_values" };

/**
 * His scenario against his confirmed cells: a name of 1 to 80 characters, a note of at most 500, and 1 to 40 values, each for one of
 * his INPUT cells, a finite number no larger than 1e15 in size. (The database checks the same again.)
 */
export function checkScenario(cells: CellRow[], body: { name: unknown; note?: unknown; values: Record<string, unknown> }): ScenarioVerdict {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const note = body.note === undefined || body.note === null ? "" : typeof body.note === "string" ? body.note.trim() : null;
  if (name.length < 1 || name.length > NAME_MAX || note === null || note.length > NOTE_MAX) return { ok: false, code: "scenario_name" };
  const inputs = new Set(cells.filter((c) => c.role === "input").map((c) => c.id));
  const entries = Object.entries(body.values);
  if (entries.length < 1 || entries.length > 40) return { ok: false, code: "scenario_values" };
  const values: Record<string, number> = {};
  for (const [id, value] of entries) {
    if (!inputs.has(id) || typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > MAX_SCENARIO_VALUE) return { ok: false, code: "scenario_values" };
    values[id] = value;
  }
  return { ok: true, name, note, values };
}
