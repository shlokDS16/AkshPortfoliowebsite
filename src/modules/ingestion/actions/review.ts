"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseDocumentsRepo } from "@/modules/documents";
import { requireAdmin } from "@/modules/identity";
import { fileUnder, resolveFlag, saveValues, setCompany, type ReviewPorts } from "../review";
import { createReviewRepo } from "../review-repo";
import type { FileUnderResult, ResolveResult, SaveValuesResult } from "../review-types";
import { actionFailure, type ActionResult } from "../upload-flow";

// The review screen's buttons. Every action checks the admin first and runs on the admin's own cookie session
// (RLS and the column grants apply). Failures come back as a fixed code with its fixed text. The browser's input is
// `unknown` here: review-ops checks its shape.

async function ports(): Promise<ReviewPorts> {
  const db = await createSupabaseServerClient();
  return { docs: createSupabaseDocumentsRepo(db), review: createReviewRepo(db) };
}

const refresh = (documentId: string) => {
  revalidatePath(`/desk/inbox/${documentId}/review`);
  revalidatePath("/desk/inbox");
};

/** Check 1 of N: Aksh types the value from the page, or drops the figure. */
export async function resolveFlagAction(documentId: string, proposalId: string, input: unknown): Promise<ResolveResult> {
  await requireAdmin();
  try {
    const view = await resolveFlag(await ports(), documentId, proposalId, input);
    refresh(documentId);
    return { ok: true, view };
  } catch (error) {
    return actionFailure(error);
  }
}

/** Saves the values list: ticked figures accepted (with any value he typed), unticked ones dropped. */
export async function saveValuesAction(documentId: string, decisions: unknown): Promise<SaveValuesResult> {
  await requireAdmin();
  try {
    const counts = await saveValues(await ports(), documentId, decisions);
    refresh(documentId);
    return { ok: true, accepted: counts.accepted, edited: counts.edited, rejected: counts.rejected };
  } catch (error) {
    return actionFailure(error);
  }
}

/** Puts the document's accepted and edited figures under the company's file. The screen then opens the file's Facts. */
export async function fileUnderAction(documentId: string, input: unknown): Promise<FileUnderResult> {
  await requireAdmin();
  try {
    const result = await fileUnder(await ports(), documentId, input);
    refresh(documentId);
    revalidatePath(`/desk/items/${result.itemId}`);
    return { ok: true, ...result };
  } catch (error) {
    return actionFailure(error);
  }
}

/** For a document uploaded without a company: link it to an existing one so it has a file to go under. */
export async function setDocumentCompanyAction(documentId: string, companyId: unknown): Promise<ActionResult> {
  await requireAdmin();
  try {
    await setCompany(await ports(), documentId, companyId);
    refresh(documentId);
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}
