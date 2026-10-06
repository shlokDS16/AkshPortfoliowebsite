"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { ItemNotFoundError } from "./errors";
import { doneTo, failTo } from "./redirects";
import { createSupabaseResearchRepo } from "./repo";
import { addRevisionInput, createItemInput, isItemId, updateItemMetaInput } from "./schema";
import { addRevision, createItem, updateItemMeta } from "./service";

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
  if (!parsed.success) failTo("/desk/items", parsed.error);
  let itemId: string;
  try {
    itemId = (await createItem(await repo(), parsed.data)).item.id;
  } catch (error) {
    failTo("/desk/items", error);
  }
  revalidatePath("/desk/items");
  redirect(`/desk/items/${itemId}`);
}

export async function updateItemMetaAction(itemId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isItemId(itemId)) failTo("/desk/items", new ItemNotFoundError(String(itemId)));
  const back = `/desk/items/${itemId}`;
  const parsed = updateItemMetaInput.safeParse({
    title: field(formData, "title") ?? "",
    learningObjective: field(formData, "learningObjective"),
    dataAsOf: field(formData, "dataAsOf"),
    holdsPosition: field(formData, "holdsPosition"),
  });
  if (!parsed.success) failTo(back, parsed.error);
  try {
    await updateItemMeta(await repo(), itemId, parsed.data);
  } catch (error) {
    failTo(back, error);
  }
  revalidatePath(back);
  doneTo(back, "details-saved");
}

export async function addRevisionAction(itemId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isItemId(itemId)) failTo("/desk/items", new ItemNotFoundError(String(itemId)));
  const back = `/desk/items/${itemId}`;
  const body = formData.get("bodyMd");
  const parsed = addRevisionInput.safeParse({
    itemId,
    bodyMd: typeof body === "string" ? body : "",
    changeReason: field(formData, "changeReason"),
  });
  if (!parsed.success) failTo(back, parsed.error);
  let pendingGate: boolean;
  try {
    pendingGate = (await addRevision(await repo(), parsed.data)).pendingGate;
  } catch (error) {
    failTo(back, error);
  }
  revalidatePath(back);
  doneTo(back, pendingGate ? "revision-pending-gate" : "revision-saved");
}
