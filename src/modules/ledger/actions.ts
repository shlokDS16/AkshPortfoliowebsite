"use server";

import { revalidatePath } from "next/cache";
import { doneTo, failState } from "@/lib/redirects";
import { type ErrorCode } from "@/lib/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { eventFromForm, openIdeaFromForm } from "./form-input";
import { createSupabaseLedgerRepo } from "./repo";
import { isLedgerId } from "./schema";
import { addIdeaEvent, openIdea } from "./service";

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
