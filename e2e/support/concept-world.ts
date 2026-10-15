import type { Db } from "@/lib/supabase/types";

// Test setup only (LOCAL stack, the admin's own rights): three checked concepts, two learnings and a read that link them, and one of
// his own edges, so a concept page shows every block (groups, Related concepts with a Remove, and a "Seen together" suggestion) to axe.
// Items cannot be deleted by the admin (revisions are append-only), so the rows stay; the tag keeps names unique per run.

export type ConceptWorld = { slug: string; name: string; partnerName: string; linkedName: string; learning: string; read: string };

async function insertConcept(db: Db, slug: string, name: string): Promise<string> {
  const { data, error } = await db.from("themes").insert({ slug, name, needs_review: false }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function insertItem(db: Db, kind: "learning" | "reading_note", title: string, conceptIds: string[], themeId: string): Promise<void> {
  const item = await db.from("items").insert({ kind, title, theme_id: themeId }).select("id").single();
  if (item.error) throw item.error;
  const revision = await db
    .from("item_revisions")
    .insert({ item_id: item.data.id, body_md: `${title}. A line in his own words.`, structured: {}, change_reason: "Captured", author: "aksh", concept_ids: conceptIds })
    .select("id")
    .single();
  if (revision.error) throw revision.error;
}

export async function seedConceptWorld(db: Db, tag: string): Promise<ConceptWorld> {
  const stamp = `${tag}-${Date.now().toString(36)}`;
  const main = await insertConcept(db, `a11y-main-${stamp}`, `A11y main ${stamp}`);
  const partner = await insertConcept(db, `a11y-partner-${stamp}`, `A11y partner ${stamp}`);
  const linked = await insertConcept(db, `a11y-linked-${stamp}`, `A11y linked ${stamp}`);
  const learning = `A11y learning ${stamp}`;
  const read = `A11y read ${stamp}`;
  await insertItem(db, "learning", learning, [main, partner], main);
  await insertItem(db, "learning", `A11y second learning ${stamp}`, [main, partner], main);
  await insertItem(db, "reading_note", read, [main], main);
  const [a, b] = main < linked ? [main, linked] : [linked, main];
  const edge = await db.from("concept_edges").insert({ concept_a: a, concept_b: b });
  if (edge.error) throw edge.error;
  return { slug: `a11y-main-${stamp}`, name: `A11y main ${stamp}`, partnerName: `A11y partner ${stamp}`, linkedName: `A11y linked ${stamp}`, learning, read };
}
