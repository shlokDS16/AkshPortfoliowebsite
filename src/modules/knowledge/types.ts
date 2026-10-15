import type { Concept } from "@/modules/catalog";
import type { Item, ResearchRepo } from "@/modules/research";
import type { ConceptLinkRow, ConceptRef, EdgeRow, ItemGroup, ItemLine, MonthGroup } from "./client";

/**
 * Links and edges (the admin view `concept_links` and the table `concept_edges`) plus the items they point at, read through
 * the research module. The admin's cookie client implements it (repo.ts); tests use a fake. Never the secret-key client.
 */
export interface KnowledgeRepo {
  /** Items whose LATEST revision links this concept, one row per item (concept_links). */
  linksForConcept(conceptId: string): Promise<ConceptLinkRow[]>;
  allLinks(): Promise<ConceptLinkRow[]>;
  /** Every concept link of these items' latest revisions. */
  linksForItems(itemIds: readonly string[]): Promise<ConceptLinkRow[]>;
  /** His edges that have this concept at either end. */
  edgesFor(conceptId: string): Promise<EdgeRow[]>;
  /** Stored once as (a < b); a second tap changes nothing. */
  insertEdge(a: string, b: string): Promise<void>;
  deleteEdge(a: string, b: string): Promise<void>;
  /** Items first written in [fromIso, toIso) of these kinds (research). */
  itemsCreatedBetween(fromIso: string, toIso: string, kinds: readonly Item["kind"][]): Promise<Item[]>;
  itemsByIds(ids: readonly string[]): Promise<Item[]>;
}

/** Concept rows come only from the catalog module. */
export interface ConceptSource {
  /** Screened, live concepts, by name. */
  listScreened(): Promise<Concept[]>;
  /** A live concept by slug, a stub included. */
  bySlug(slug: string): Promise<Concept | null>;
  /** Live concepts by id, a stub included, an archived one never. */
  byIds(ids: readonly string[]): Promise<Concept[]>;
}

export type KnowledgeDeps = { repo: KnowledgeRepo; concepts: ConceptSource; research: ResearchRepo };

// ---- The desk read models (machine-built; his words appear only in `title` and `descriptionMd`) ----

export type ConceptIndexRow = { concept: ConceptRef; counts: Record<ItemGroup, number>; total: number; lastActivity: string | null };

export type ConceptPageView = {
  concept: ConceptRef & { descriptionMd: string | null };
  groups: { group: ItemGroup; items: ItemLine[] }[];
  /** His own links, by name. */
  related: ConceptRef[];
  /** The machine's: concepts that share at least 2 items with this one and are not linked yet. */
  suggestions: { concept: ConceptRef; shared: number }[];
};

export type MonthView = {
  month: string;
  /** The month before, always; the month after only while it is not later than this India month. */
  prevMonth: string;
  nextMonth: string | null;
  learningCount: number;
  readCount: number;
  groups: MonthGroup[];
  reads: ItemLine[];
};

export type MonthCounts = { learnings: number; reads: number };
