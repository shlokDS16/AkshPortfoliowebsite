"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { ItemNotFoundError, errorShape } from "@/lib/errors";
import { doneTo, failTo } from "@/lib/redirects";
import { errorCode, errorText, userWasTold } from "@/lib/messages";
import { createSupabaseResearchRepo } from "./repo";
import { createItemInput, isItemId, updateItemMetaInput } from "./schema";
import { createItem, updateItemMeta } from "./service";
import { createFileLookup, startFile } from "./start-file";

function field(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

async function repo() {
  return createSupabaseResearchRepo(await createSupabaseServerClient());
}

export async function createItemAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = createItemInput.safeParse({ kind: field(formData, "kind"), title: field(formData, "title") ?? "" });
  if (!parsed.success) failTo("/desk/items", parsed.error, "research");
  let itemId: string;
  try {
    itemId = (await createItem(await repo(), parsed.data)).item.id;
  } catch (error) {
    failTo("/desk/items", error, "research");
  }
  revalidatePath("/desk/items");
  redirect(`/desk/items/${itemId}`);
}

export async function updateItemMetaAction(itemId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isItemId(itemId)) failTo("/desk/items", new ItemNotFoundError(String(itemId)), "research");
  const back = `/desk/items/${itemId}`;
  const parsed = updateItemMetaInput.safeParse({
    title: field(formData, "title") ?? "",
    learningObjective: field(formData, "learningObjective"),
    dataAsOf: field(formData, "dataAsOf"),
    holdsPosition: field(formData, "holdsPosition"),
  });
  if (!parsed.success) failTo(back, parsed.error, "research");
  try {
    await updateItemMeta(await repo(), itemId, parsed.data);
  } catch (error) {
    failTo(back, error, "research");
  }
  revalidatePath(back);
  doneTo(back, "details-saved");
}

/**
 * Aksh's click on "Start a file for X" in the review screen: the company's file (the one it has, or a new private thesis
 * titled with its name, empty body and facts). Returns the item for the screen to file under; never redirects.
 */
export async function startFileAction(companyId: string): Promise<{ ok: true; itemId: string } | { ok: false; message: string }> {
  await requireAdmin();
  try {
    const db = await createSupabaseServerClient();
    const { itemId } = await startFile(createSupabaseResearchRepo(db), createFileLookup(db), companyId);
    revalidatePath("/desk/items");
    return { ok: true, itemId };
  } catch (error) {
    if (!userWasTold(error)) console.error("research action failed", errorShape(error));
    return { ok: false, message: errorText(errorCode(error)) ?? "" };
  }
}
