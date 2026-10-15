import { z } from "zod";
import { isUuid } from "@/lib/ids";
import { DbError } from "@/lib/supabase/errors";
import { failure, type ValuationFailure } from "./copy";
import { MAX_LABEL_CHARS, MAX_SHEET_NAME_CHARS } from "./limits";
import type { ChosenCell } from "./records";
import type { ValuationRepo } from "./repo";
import { checkChoice, checkScenario } from "./service";
import type { ModelObject } from "./types";

// What the four actions do once the admin is known (actions.ts checks that): validate the browser's claim, check the version's state, check
// the choice against the model object, call the repo. Every refusal is a fixed sentence; an unexpected failure is logged by class name only.

export const MODEL_URL_SECONDS = 600;
const MAX_INPUTS = 40;
const MAX_OUTPUTS = 20;

const confirmClaim = z.strictObject({
  versionId: z.guid(),
  cells: z
    .array(
      z.strictObject({
        sheet: z.string().min(1).max(MAX_SHEET_NAME_CHARS),
        addr: z.string().regex(/^[A-Z]{1,3}[0-9]{1,7}$/),
        role: z.enum(["input", "output"]),
        label: z.string().max(400).nullable().optional(),
      }),
    )
    .max(MAX_INPUTS + MAX_OUTPUTS),
});

const scenarioClaim = z.strictObject({ versionId: z.guid(), name: z.unknown(), note: z.unknown().optional(), values: z.record(z.string(), z.unknown()) });

/** True for a stored object that is a model this code can read (modelVersion 1, the parts the checks use). */
export function isModelObject(x: unknown): x is ModelObject {
  const m = x as Partial<ModelObject> | null;
  return typeof m === "object" && m !== null && m.modelVersion === 1 && Array.isArray(m.index?.sheets) && Array.isArray(m.taint) && typeof m.engineBytes === "string";
}

function unexpected(error: unknown): ValuationFailure {
  // The class name only: a message can quote a cell, a label or a value.
  console.error("valuation action failed", error instanceof Error ? error.name : "unknown");
  return failure("save_failed");
}

const code = (error: unknown): string | undefined => (error instanceof DbError ? error.code : undefined);

export type ConfirmResult = { ok: true } | ValuationFailure;

export async function runConfirm(repo: ValuationRepo, input: unknown): Promise<ConfirmResult> {
  const claim = confirmClaim.safeParse(input);
  if (!claim.success) return failure("bad_request");
  // His label is his words, trimmed; a blank one is none. A sheet label is never put here.
  const cells: ChosenCell[] = claim.data.cells.map((c) => ({ sheet: c.sheet, addr: c.addr, role: c.role, label: c.label?.trim() ? c.label.trim() : null }));
  const inputs = cells.filter((c) => c.role === "input").length;
  const outputs = cells.length - inputs;
  const unique = new Set(cells.map((c) => `${c.sheet}!${c.addr}`)).size === cells.length;
  if (inputs < 1 || inputs > MAX_INPUTS || outputs < 1 || outputs > MAX_OUTPUTS || !unique || cells.some((c) => (c.label?.length ?? 0) > MAX_LABEL_CHARS)) return failure("bad_request");

  try {
    const version = await repo.getVersion(claim.data.versionId);
    if (!version) return failure("not_found");
    if (version.status === "confirmed") return failure("already_confirmed");
    if (version.status !== "ready" || !version.modelPath) return failure("not_ready");

    let model: unknown;
    try {
      model = JSON.parse(new TextDecoder().decode(await repo.getModel(version.modelPath)));
    } catch {
      return failure("model_unreadable");
    }
    if (!isModelObject(model)) return failure("model_unreadable");

    const verdict = checkChoice(model, cells);
    if (!verdict.ok) return failure(verdict.code, verdict.cell);
    await repo.confirm(version.id, cells);
    return { ok: true };
  } catch (error) {
    const c = code(error);
    if (c === "55000") return failure("already_confirmed");
    if (c === "P0002") return failure("not_found");
    if (c === "22023" || c === "23505") return failure("bad_request");
    return unexpected(error);
  }
}

export type SaveScenarioResult = { ok: true; id: string } | ValuationFailure;

export async function runSaveScenario(repo: ValuationRepo, input: unknown): Promise<SaveScenarioResult> {
  const claim = scenarioClaim.safeParse(input);
  if (!claim.success) return failure("bad_request");
  try {
    const version = await repo.getVersion(claim.data.versionId);
    if (!version) return failure("not_found");
    if (version.status !== "confirmed") return failure("not_confirmed");
    const verdict = checkScenario(await repo.listCells(version.id), claim.data);
    if (!verdict.ok) return failure(verdict.code);
    return { ok: true, id: await repo.saveScenario(version.id, verdict.name, verdict.note, verdict.values) };
  } catch (error) {
    const c = code(error);
    if (c === "23505") return failure("name_taken");
    if (c === "55000") return failure("not_confirmed");
    if (c === "P0002") return failure("not_found");
    if (c === "22023") return failure("scenario_values");
    return unexpected(error);
  }
}

export async function runDeleteScenario(repo: ValuationRepo, scenarioId: unknown): Promise<{ ok: true } | ValuationFailure> {
  if (!isUuid(scenarioId)) return failure("bad_request");
  try {
    await repo.deleteScenario(scenarioId);
    return { ok: true };
  } catch (error) {
    return unexpected(error);
  }
}

export type ModelUrlResult = { ok: true; url: string; expiresInSeconds: number } | ValuationFailure;

/** A 10-minute link to the model object, for the calculator in Aksh's tab (spec s7.4). Only a version that has been read. */
export async function runModelUrl(repo: ValuationRepo, versionId: unknown): Promise<ModelUrlResult> {
  if (!isUuid(versionId)) return failure("bad_request");
  try {
    const version = await repo.getVersion(versionId);
    if (!version) return failure("not_found");
    if ((version.status !== "ready" && version.status !== "confirmed") || !version.modelPath) return failure("not_ready");
    return { ok: true, url: await repo.signModel(version.modelPath, MODEL_URL_SECONDS), expiresInSeconds: MODEL_URL_SECONDS };
  } catch (error) {
    return unexpected(error);
  }
}
