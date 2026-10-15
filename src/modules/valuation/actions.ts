"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import type { ValuationFailure } from "./copy";
import { runConfirm, runDeleteScenario, runModelUrl, runSaveScenario, type ConfirmResult, type ModelUrlResult, type SaveScenarioResult } from "./flows";
import { createSupabaseValuationRepo } from "./repo";

// The valuation page's writes. Every action checks the admin first and runs on his own cookie session, so RLS and the bucket policies apply;
// the database functions check the admin again. The arguments are untrusted (a browser sent them): flows.ts validates every one.

async function repo() {
  await requireAdmin();
  return createSupabaseValuationRepo(await createSupabaseServerClient());
}

/** Confirms the inputs and results he chose, once. Nothing is trusted before this call. */
export async function confirmValuationAction(input: unknown): Promise<ConfirmResult> {
  const result = await runConfirm(await repo(), input);
  if (result.ok) revalidatePath("/desk/models", "layout");
  return result;
}

/** Saves the input values he tried, under his name. The workbook and the version are never overwritten. */
export async function saveValuationScenarioAction(input: unknown): Promise<SaveScenarioResult> {
  const result = await runSaveScenario(await repo(), input);
  if (result.ok) revalidatePath("/desk/models", "layout");
  return result;
}

export async function deleteValuationScenarioAction(scenarioId: unknown): Promise<{ ok: true } | ValuationFailure> {
  const result = await runDeleteScenario(await repo(), scenarioId);
  if (result.ok) revalidatePath("/desk/models", "layout");
  return result;
}

/** A 10-minute link to the version's model object, for the calculator in his tab. */
export async function modelUrlAction(versionId: unknown): Promise<ModelUrlResult> {
  return runModelUrl(await repo(), versionId);
}
