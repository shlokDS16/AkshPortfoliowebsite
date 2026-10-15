import { InvalidInputError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { dbError, isUniqueViolation } from "@/lib/supabase/errors";
import { readAllPages } from "@/lib/supabase/paging";
import type { Db } from "@/lib/supabase/types";
import { getConceptBySlug, getConceptsByIds, listConcepts } from "@/modules/catalog";
import { createSupabaseResearchRepo, listItemsByIds, listItemsCreatedBetween } from "@/modules/research";
import { normaliseEdge, type ConceptLinkRow } from "./client";
import type { KnowledgeDeps, KnowledgeRepo } from "./types";

// The admin's own cookie client (RLS, admin only), never the service client. Two database objects are read here, the view
// `concept_links` and the table `concept_edges`. Concept rows come only through @/modules/catalog and items only through
// @/modules/research: no direct themes or items access (R3 row 6).

const LINK_COLUMNS = "item_id, revision_id, concept_id, position";
const ITEM_CHUNK = 100;

type LinkRow = { item_id: string | null; revision_id: string | null; concept_id: string | null; position: number | null };

/** The view's columns are nullable in the generated types; a row missing any of them is not a link. */
function toLinks(rows: readonly LinkRow[]): ConceptLinkRow[] {
  return rows.flatMap((r) => (r.item_id && r.revision_id && r.concept_id && r.position !== null ? [{ itemId: r.item_id, revisionId: r.revision_id, conceptId: r.concept_id, position: r.position }] : []));
}

export function createSupabaseKnowledgeRepo(db: Db): KnowledgeRepo {
  return {
    async linksForConcept(conceptId) {
      if (!isUuid(conceptId)) return [];
      const { data, error } = await readAllPages((from, to) =>
        db.from("concept_links").select(LINK_COLUMNS).eq("concept_id", conceptId).order("item_id", { ascending: true }).range(from, to),
      );
      if (error) throw dbError("knowledge.linksForConcept", error);
      return toLinks(data);
    },

    async allLinks() {
      const { data, error } = await readAllPages((from, to) =>
        db.from("concept_links").select(LINK_COLUMNS).order("item_id", { ascending: true }).order("concept_id", { ascending: true }).range(from, to),
      );
      if (error) throw dbError("knowledge.allLinks", error);
      return toLinks(data);
    },

    async linksForItems(itemIds) {
      const wanted = [...new Set(itemIds.filter(isUuid))];
      const out: ConceptLinkRow[] = [];
      for (let i = 0; i < wanted.length; i += ITEM_CHUNK) {
        const { data, error } = await db.from("concept_links").select(LINK_COLUMNS).in("item_id", wanted.slice(i, i + ITEM_CHUNK));
        if (error) throw dbError("knowledge.linksForItems", error);
        out.push(...toLinks(data ?? []));
      }
      return out;
    },

    async edgesFor(conceptId) {
      // The id goes into a filter string, so it is checked to be a uuid first.
      if (!isUuid(conceptId)) return [];
      const { data, error } = await db.from("concept_edges").select("concept_a, concept_b").or(`concept_a.eq.${conceptId},concept_b.eq.${conceptId}`);
      if (error) throw dbError("knowledge.edgesFor", error);
      return (data ?? []).map((e) => ({ conceptA: e.concept_a, conceptB: e.concept_b }));
    },

    async insertEdge(a, b) {
      if (!isUuid(a) || !isUuid(b)) throw new InvalidInputError();
      const [concept_a, concept_b] = normaliseEdge(a, b);
      const { error } = await db.from("concept_edges").insert({ concept_a, concept_b });
      // A second tap hits the unique key: the edge is already there, which is what was asked for.
      if (error && !isUniqueViolation(dbError("knowledge.insertEdge", error))) throw dbError("knowledge.insertEdge", error);
    },

    async deleteEdge(a, b) {
      if (!isUuid(a) || !isUuid(b)) throw new InvalidInputError();
      const [concept_a, concept_b] = normaliseEdge(a, b);
      const { error } = await db.from("concept_edges").delete().eq("concept_a", concept_a).eq("concept_b", concept_b);
      if (error) throw dbError("knowledge.deleteEdge", error);
    },

    itemsCreatedBetween: (fromIso, toIso, kinds) => listItemsCreatedBetween(db, fromIso, toIso, kinds),
    itemsByIds: (ids) => listItemsByIds(db, ids),
  };
}

/** Everything the service needs, on the admin's cookie client. */
export function createSupabaseKnowledgeDeps(db: Db): KnowledgeDeps {
  return {
    repo: createSupabaseKnowledgeRepo(db),
    concepts: { listScreened: () => listConcepts(db), bySlug: (slug) => getConceptBySlug(db, slug), byIds: (ids) => getConceptsByIds(db, ids) },
    research: createSupabaseResearchRepo(db),
  };
}
