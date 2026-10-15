import { InvalidInputError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { ConceptDescriptionTooLongError, NameNotScreenedError } from "./errors";

/** A concept is a `themes` row (D45). Admin-side shape: `descriptionMd` is private, his words only, and never read by the public site. */
export type Concept = {
  id: string;
  slug: string;
  name: string;
  visibility: string;
  needsReview: boolean;
  descriptionMd: string | null;
  createdAt: string;
};

/** UTF-16 units, like the other text limits; the concept page's "In your words" box. */
export const CONCEPT_DESCRIPTION_MAX = 2000;

const CONCEPT_COLUMNS = "id, slug, name, visibility, needs_review, description_md, created_at";
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type ConceptRow = { id: string; slug: string; name: string; visibility: string; needs_review: boolean; description_md: string | null; created_at: string };

const toConcept = (r: ConceptRow): Concept => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  visibility: r.visibility,
  needsReview: r.needs_review,
  descriptionMd: r.description_md,
  createdAt: r.created_at,
});

/**
 * A theme row exposes nothing on its own: public_themes lists it only once a public item's current revision links it. An
 * unscreened or archived stub is refused (NameNotScreenedError); a name must be screened first. Mirrors setCompanyPublic.
 */
export async function setThemePublic(db: Db, id: string): Promise<void> {
  const { data, error } = await db.from("themes").update({ visibility: "public" }).eq("id", id).eq("needs_review", false).is("archived_at", null).select("id");
  if (error) throw dbError("catalog.setThemePublic", error);
  if (!data || data.length === 0) throw new NameNotScreenedError();
}

/** His words about the concept: trimmed, blank becomes null, at most 2,000 UTF-16 units. Stays private (anon cannot read the column). */
export async function updateConceptDescription(db: Db, id: string, text: string | null): Promise<void> {
  const value = text === null ? "" : text.trim();
  if (value.length > CONCEPT_DESCRIPTION_MAX) throw new ConceptDescriptionTooLongError();
  const { data, error } = await db
    .from("themes")
    .update({ description_md: value === "" ? null : value })
    .eq("id", id)
    .is("archived_at", null)
    .select("id");
  if (error) throw dbError("catalog.updateConceptDescription", error);
  if (!data || data.length === 0) throw new InvalidInputError();
}

/** The screened, live concepts (needs_review false, not archived), by name. The desk's picker and index read these. */
export async function listConcepts(db: Db): Promise<Concept[]> {
  const { data, error } = await db
    .from("themes")
    .select(CONCEPT_COLUMNS)
    .eq("needs_review", false)
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw dbError("catalog.listConcepts", error);
  return (data ?? []).map(toConcept);
}

/** One live concept by slug. A stub is included on purpose: its page says "Not checked yet". An archived row is not found. */
export async function getConceptBySlug(db: Db, slug: string): Promise<Concept | null> {
  if (!SLUG.test(slug)) return null;
  const { data, error } = await db.from("themes").select(CONCEPT_COLUMNS).eq("slug", slug).is("archived_at", null).maybeSingle();
  if (error) throw dbError("catalog.getConceptBySlug", error);
  return data ? toConcept(data) : null;
}

const ID_CHUNK = 100;

/** The live concepts with these ids, a stub included, an archived row never. Anything that is not a uuid is dropped. Order is not promised. */
export async function getConceptsByIds(db: Db, ids: readonly string[]): Promise<Concept[]> {
  const wanted = [...new Set(ids.filter(isUuid))];
  const out: Concept[] = [];
  for (let i = 0; i < wanted.length; i += ID_CHUNK) {
    const { data, error } = await db.from("themes").select(CONCEPT_COLUMNS).in("id", wanted.slice(i, i + ID_CHUNK)).is("archived_at", null);
    if (error) throw dbError("catalog.getConceptsByIds", error);
    out.push(...(data ?? []).map(toConcept));
  }
  return out;
}
