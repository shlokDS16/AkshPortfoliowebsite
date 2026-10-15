import { randomUUID } from "node:crypto";
import type { Concept } from "@/modules/catalog";
import type { Item } from "@/modules/research";
import { createMemoryResearchRepo } from "@/test/fakes/research-repo";
import type { ConceptLinkRow, EdgeRow } from "./client";
import type { KnowledgeDeps } from "./types";

// In-memory deps for the unit tests: the database's rules that matter here (an archived concept is not live, an edge is one row)
// are mirrored by hand, and the real ones are pinned by the pgTAP files and the repo tests.

export function makeConcept(partial: Partial<Concept> & { name: string }): Concept {
  return {
    id: randomUUID(),
    slug: partial.name.toLowerCase().replaceAll(" ", "-"),
    visibility: "private",
    needsReview: false,
    descriptionMd: null,
    createdAt: "2026-10-01T00:00:00Z",
    ...partial,
  };
}

export function makeItem(partial: Partial<Item> & { title: string }): Item {
  return {
    id: randomUUID(),
    kind: "learning",
    slug: null,
    companyId: null,
    themeId: null,
    visibility: "private",
    status: "draft",
    currentRevisionId: null,
    publishedAt: null,
    dataAsOf: null,
    learningObjective: null,
    holdsPosition: null,
    createdAt: "2026-10-05T10:00:00Z",
    updatedAt: "2026-10-05T10:00:00Z",
    ...partial,
  };
}

export type FakeWorld = {
  concepts: Concept[];
  /** Concepts the database no longer shows (archived). */
  archived: string[];
  items: Item[];
  links: ConceptLinkRow[];
  edges: EdgeRow[];
  /** What the service passed to insertEdge and deleteEdge, in order. */
  edgeCalls: { op: "insert" | "delete"; a: string; b: string }[];
};

export function fakeKnowledge(world: Partial<FakeWorld> = {}): { deps: KnowledgeDeps; world: FakeWorld } {
  const w: FakeWorld = { concepts: [], archived: [], items: [], links: [], edges: [], edgeCalls: [], ...world };
  const live = () => w.concepts.filter((c) => !w.archived.includes(c.id));
  const deps: KnowledgeDeps = {
    research: createMemoryResearchRepo(),
    concepts: {
      listScreened: async () => live().filter((c) => !c.needsReview).sort((a, b) => a.name.localeCompare(b.name)),
      bySlug: async (slug) => live().find((c) => c.slug === slug) ?? null,
      byIds: async (ids) => live().filter((c) => ids.includes(c.id)),
    },
    repo: {
      linksForConcept: async (id) => w.links.filter((l) => l.conceptId === id),
      allLinks: async () => [...w.links],
      linksForItems: async (ids) => w.links.filter((l) => ids.includes(l.itemId)),
      edgesFor: async (id) => w.edges.filter((e) => e.conceptA === id || e.conceptB === id),
      insertEdge: async (a, b) => {
        w.edgeCalls.push({ op: "insert", a, b });
        if (!(a < b)) throw new Error("check concept_a < concept_b"); // the table's check
        if (!w.edges.some((e) => e.conceptA === a && e.conceptB === b)) w.edges.push({ conceptA: a, conceptB: b });
      },
      deleteEdge: async (a, b) => {
        w.edgeCalls.push({ op: "delete", a, b });
        w.edges = w.edges.filter((e) => !(e.conceptA === a && e.conceptB === b));
      },
      itemsCreatedBetween: async (from, to, kinds) => w.items.filter((i) => i.createdAt >= from && i.createdAt < to && kinds.includes(i.kind)),
      itemsByIds: async (ids) => w.items.filter((i) => ids.includes(i.id)),
    },
  };
  return { deps, world: w };
}

/** A link of an item's latest revision to a concept. */
export const linkOf = (item: Item, concept: Concept, position = 1): ConceptLinkRow => ({ itemId: item.id, revisionId: `rev-${item.id}`, conceptId: concept.id, position });
