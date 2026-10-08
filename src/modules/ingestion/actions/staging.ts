"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseDocumentsRepo } from "@/modules/documents";
import { requireAdmin } from "@/modules/identity";
import { markDone } from "../inbox-ops";
import { runInbox } from "../inbox-run";
import { unstage } from "../review";
import { createReviewRepo } from "../review-repo";
import { actionFailure, type ActionResult } from "../upload-flow";

// Staging's two buttons (ADR-004 s4.7-s4.8). Both check the admin first and run on the admin's own cookie session.
// Neither writes a revision: staged figures are saved only by the case file's save action.

/** Send back to review: this document's staged figures leave the item's editor and return to its review screen. */
export async function unstageAction(itemId: string, documentId: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    const db = await createSupabaseServerClient();
    await unstage({ docs: createSupabaseDocumentsRepo(db), review: createReviewRepo(db) }, documentId, itemId);
  } catch (error) {
    return actionFailure(error);
  }
  revalidatePath(`/desk/items/${itemId}`);
  revalidatePath(`/desk/inbox/${documentId}/review`);
  revalidatePath("/desk/inbox");
  return { ok: true };
}

/** Done with this document: its job stops and the stored PDF is deleted; page text, link and filed figures stay. */
export async function markDoneAction(documentId: string): Promise<ActionResult> {
  await requireAdmin();
  const result = await runInbox((ports) => markDone(ports, documentId));
  if (result.ok) revalidatePath(`/desk/inbox/${documentId}/review`);
  return result;
}
