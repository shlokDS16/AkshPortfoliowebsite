"use server";

import { revalidatePath } from "next/cache";
import { istDate } from "@/lib/dates";
import { doneTo, failState } from "@/lib/redirects";
import { type ErrorCode } from "@/lib/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { LedgerError } from "./errors";
import { corporateActionFromForm, enterCloseFromForm, eventFromForm, openIdeaFromForm } from "./form-input";
import { createSupabaseLedgerRepo } from "./repo";
import { isLedgerId } from "./schema";
import { addCorporateAction, addIdeaEvent, enterClose, openIdea, rescoreLedger } from "./service";
import type { LedgerRepo } from "./types";

// The two writes of the Ledger screens. Each starts with requireAdmin(), reads the form into the shape the schema checks
// (form-input.ts), and hands it to the service, which validates before the database is reached. A refusal comes back as
// a fixed code in the form's state (never a raw message), so the form stays where it is with what was typed in it. A
// success ends in a redirect to the idea. There is no date field in either form, no edit and no delete: the database
// sets every date and an entry, once sealed, is not touched again.

export type FormState = { error: ErrorCode | null };

export async function openIdeaAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  let ideaId: string;
  try {
    ideaId = await openIdea(createSupabaseLedgerRepo(await createSupabaseServerClient()), openIdeaFromForm(formData));
  } catch (error) {
    return failState(error, "ledger");
  }
  revalidatePath("/desk/ledger");
  return doneTo(`/desk/ledger/${ideaId}`, "idea-recorded");
}

export async function addIdeaEventAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const ideaId = formData.get("ideaId");
  try {
    if (typeof ideaId !== "string" || !isLedgerId(ideaId)) return { error: "ledger-not-found" };
    await addIdeaEvent(createSupabaseLedgerRepo(await createSupabaseServerClient()), ideaId, eventFromForm(formData));
  } catch (error) {
    return failState(error, "ledger");
  }
  revalidatePath("/desk/ledger", "layout");
  return doneTo(`/desk/ledger/${ideaId}`, "entry-added", "#entries");
}

/** Recomputes the scores after a close or an action was stored. The write already stands; if the refresh fails, the daily run scores it. */
async function refreshScores(repo: LedgerRepo): Promise<void> {
  try {
    await rescoreLedger(repo);
  } catch (error) {
    console.error("ledger: scores were not refreshed after a write", error instanceof Error ? error.name : typeof error);
  }
}

// The Closes page's two writes (Task 11). Each starts with requireAdmin(). The source of a typed close is never a field: the
// database writes `manual`. A corporate action is appended to the log (the admin's own insert, column-granted), and a correction
// is a new row that names the one it replaces; there is no edit and no remove.

export async function enterCloseAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    const repo = createSupabaseLedgerRepo(await createSupabaseServerClient());
    if (!(await enterClose(repo, enterCloseFromForm(formData), istDate(new Date())))) throw new LedgerError("ledger-close-not-stored");
    await refreshScores(repo);
  } catch (error) {
    return failState(error, "ledger");
  }
  revalidatePath("/desk/ledger", "layout");
  return doneTo("/desk/ledger/closes", "close-entered", "#typed");
}

export async function addCorporateActionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    const repo = createSupabaseLedgerRepo(await createSupabaseServerClient());
    await addCorporateAction(repo, corporateActionFromForm(formData), istDate(new Date()));
    await refreshScores(repo);
  } catch (error) {
    return failState(error, "ledger");
  }
  revalidatePath("/desk/ledger", "layout");
  return doneTo("/desk/ledger/closes", "action-added", "#actions");
}
