import type { ConceptCheck } from "@/components/desk/private/concepts/concept-check-row";
import type { Db } from "@/lib/supabase/types";
import { conceptRefs, createSupabaseKnowledgeDeps, screenedConceptRefs } from "@/modules/knowledge";
import type { ConceptRef } from "@/modules/knowledge/client";
import type { Item, Revision } from "@/modules/research";

export type ItemConcepts = { linked: ConceptRef[]; screened: ConceptRef[] };

/**
 * What the item page's Concepts row shows: the concepts of the newest version, in order (a version from before Phase 4 has none
 * stored and reads as the item's theme), and the checked concepts the picker offers. Null when it cannot be read: the row is left
 * out and the editor still works (only the error's name is logged; a database message can carry row data).
 */
export async function loadItemConcepts(db: Db, item: Item, latest: Revision | null): Promise<ItemConcepts | null> {
  try {
    const deps = createSupabaseKnowledgeDeps(db);
    const ids = latest?.conceptIds ?? (item.themeId ? [item.themeId] : []);
    const [linked, screened] = await Promise.all([conceptRefs(deps, ids), screenedConceptRefs(deps)]);
    return { linked, screened };
  } catch (error) {
    console.error("item page: could not load concepts", error instanceof Error ? error.name : typeof error);
    return null;
  }
}

/** The publish checklist's lines: each linked concept that is not public. A checked one can be made public from here; a stub waits on Names. */
export function conceptChecks(linked: readonly ConceptRef[], makePublic: (conceptId: string) => ConceptCheck["action"]): ConceptCheck[] {
  return linked
    .filter((c) => c.status !== "public")
    .map((c) => ({ id: c.id, name: c.name, unchecked: c.status === "unchecked", action: c.status === "private" ? makePublic(c.id) : null }));
}
