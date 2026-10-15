"use server";

import { revalidatePath } from "next/cache";
import { InvalidInputError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { doneTo, failTo } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setThemePublic, updateConceptDescription } from "@/modules/catalog";
import { requireAdmin } from "@/modules/identity";
import { isItemId, MAX_CONCEPTS } from "@/modules/research";
import { createSupabaseKnowledgeDeps } from "./repo";
import { linkConcepts, saveItemConcepts, unlinkConcepts } from "./service";

// Every action checks the admin first (the proxy is only a session refresher), then works on the admin's cookie client.

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Where the admin returns to. A slug that is not a plain slug (a crafted value) sends them to the index instead of anywhere else. */
const conceptPath = (slug: string): string => (SLUG.test(slug) ? `/desk/concepts/${slug}` : "/desk/concepts");

async function deps() {
  return createSupabaseKnowledgeDeps(await createSupabaseServerClient());
}

/** "Link" on a concept page: his edge between two concepts. A double tap makes one row. */
export async function linkConceptsAction(conceptA: string, conceptB: string, slug: string): Promise<void> {
  await requireAdmin();
  const back = conceptPath(slug);
  try {
    if (!isUuid(conceptA) || !isUuid(conceptB)) throw new InvalidInputError();
    await linkConcepts(await deps(), conceptA, conceptB);
  } catch (error) {
    failTo(back, error, "knowledge");
  }
  revalidatePath(back);
  doneTo(back, "concept-linked");
}

export async function unlinkConceptsAction(conceptA: string, conceptB: string, slug: string): Promise<void> {
  await requireAdmin();
  const back = conceptPath(slug);
  try {
    if (!isUuid(conceptA) || !isUuid(conceptB)) throw new InvalidInputError();
    await unlinkConcepts(await deps(), conceptA, conceptB);
  } catch (error) {
    failTo(back, error, "knowledge");
  }
  revalidatePath(back);
  doneTo(back, "concept-unlinked");
}

/** "Save concepts" on the item page: one new revision. On a public item it waits for the publishing gate. */
export async function saveConceptsAction(itemId: string, conceptIds: string[]): Promise<void> {
  await requireAdmin();
  const back = isItemId(itemId) ? `/desk/items/${itemId}` : "/desk/items";
  let pending: boolean;
  try {
    if (!isItemId(itemId) || !Array.isArray(conceptIds) || conceptIds.length > MAX_CONCEPTS || !conceptIds.every((id) => isUuid(id))) throw new InvalidInputError();
    pending = (await saveItemConcepts(await deps(), itemId, conceptIds)).pendingGate;
  } catch (error) {
    failTo(back, error, "knowledge");
  }
  revalidatePath(back);
  revalidatePath("/desk/concepts", "layout");
  doneTo(back, pending ? "revision-pending-gate" : "concepts-saved");
}

/** "In your words": his own text about the concept, private. The catalog trims it, stores blank as none and refuses over 2,000. */
export async function saveDescriptionAction(conceptId: string, slug: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const back = conceptPath(slug);
  const text = formData.get("description");
  try {
    if (!isUuid(conceptId) || typeof text !== "string") throw new InvalidInputError();
    await updateConceptDescription(await createSupabaseServerClient(), conceptId, text);
  } catch (error) {
    failTo(back, error, "knowledge");
  }
  revalidatePath(back);
  doneTo(back, "concept-description-saved");
}

/** "Make public" on a concept page. Screened concepts only; it exposes nothing until a published note or file uses it. */
export async function makePublicAction(conceptId: string, slug: string): Promise<void> {
  await requireAdmin();
  const back = conceptPath(slug);
  try {
    if (!isUuid(conceptId)) throw new InvalidInputError();
    await setThemePublic(await createSupabaseServerClient(), conceptId);
  } catch (error) {
    failTo(back, error, "knowledge");
  }
  revalidatePath(back);
  doneTo(back, "concept-public");
}
