"use server";

import { revalidatePath } from "next/cache";
import { ItemNotFoundError } from "@/lib/errors";
import { doneTo, failTo } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { addRevision, createSupabaseResearchRepo, getItemWithHistory, isItemId, updateItemMeta } from "@/modules/research";
import { FactsSheetError, NoFigureDateError } from "./errors";
import { latestFigureDate } from "./figure-dates";
import { parseFactsSheet } from "./sheet";

/** Aksh's words (bodyMd) and the facts (structured, parsed from the facts sheet) as one append-only revision; they never share a field. A note has no sheet: its structured data carries over. */
export async function saveCaseFileRevisionAction(itemId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isItemId(itemId)) failTo("/desk/items", new ItemNotFoundError(String(itemId)), "casefile");
  const back = `/desk/items/${itemId}`;
  const body = formData.get("bodyMd");
  const reason = formData.get("changeReason");
  const sheet = formData.get("factsSheet");
  let pendingGate: boolean;
  try {
    const repo = createSupabaseResearchRepo(await createSupabaseServerClient());
    let structured: Record<string, unknown>;
    if (typeof sheet === "string") {
      const { caseFile, errors } = parseFactsSheet(sheet);
      if (errors.length > 0) throw new FactsSheetError();
      structured = caseFile;
    } else {
      structured = (await getItemWithHistory(repo, itemId))?.revisions[0]?.structured ?? {};
    }
    pendingGate = (
      await addRevision(repo, {
        itemId,
        bodyMd: typeof body === "string" ? body : "",
        structured,
        changeReason: typeof reason === "string" && reason.trim() !== "" ? reason.trim() : null,
      })
    ).pendingGate;
  } catch (error) {
    failTo(back, error, "casefile");
  }
  revalidatePath(back);
  doneTo(back, pendingGate ? "revision-pending-gate" : "revision-saved");
}

/**
 * Sets the item's "Figures to" (data_as_of) to the latest figure date of its newest saved revision, computed
 * here from the stored facts (rule 3a asks for a date at least that late). The date is never taken from the request.
 */
export async function setFiguresToAction(itemId: string): Promise<void> {
  await requireAdmin();
  if (!isItemId(itemId)) failTo("/desk/items", new ItemNotFoundError(String(itemId)), "casefile");
  const back = `/desk/items/${itemId}`;
  try {
    const repo = createSupabaseResearchRepo(await createSupabaseServerClient());
    const history = await getItemWithHistory(repo, itemId);
    if (!history) throw new ItemNotFoundError(itemId);
    const date = latestFigureDate(history.revisions[0]?.structured ?? null);
    if (!date) throw new NoFigureDateError();
    await updateItemMeta(repo, itemId, { dataAsOf: date });
  } catch (error) {
    failTo(back, error, "casefile");
  }
  revalidatePath(back);
  doneTo(back, "figures-to-set", "#gate");
}
