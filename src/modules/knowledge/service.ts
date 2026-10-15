import { InvalidInputError, ItemNotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import type { Concept } from "@/modules/catalog";
import { getItemWithHistory, setItemConcepts, type ConceptLabel, type Item } from "@/modules/research";
import {
  countsByGroup,
  groupConceptItems,
  groupMonth,
  isMonth,
  monthBounds,
  monthOf,
  normaliseEdge,
  primaryConceptByItem,
  shiftMonth,
  suggestRelated,
  type ConceptRef,
  type ConceptStatus,
  type ItemLine,
} from "./client";
import { ConceptNotFoundError, ConceptSelfLinkError } from "./errors";
import type { ConceptIndexRow, ConceptPageView, KnowledgeDeps, MonthCounts, MonthView } from "./types";

// Desk read models (spec s7). Everything here is for the admin; nothing is read by the public side. The groupings, counts and
// suggestions are the machine's and are labelled so on screen. A title is never touched.

const statusOf = (c: Concept): ConceptStatus => (c.needsReview ? "unchecked" : c.visibility === "public" ? "public" : "private");
const refOf = (c: Concept): ConceptRef => ({ id: c.id, slug: c.slug, name: c.name, status: statusOf(c) });
const lineOf = (i: Item): ItemLine => ({ id: i.id, kind: i.kind, title: i.title, createdAt: i.createdAt, visibility: i.visibility, status: i.status });
const byName = (a: ConceptRef, b: ConceptRef): number => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id);

/** Every screened live concept with its status, counts per kind and last activity (the newest update of an item linking it), newest first. */
export async function conceptIndex(deps: KnowledgeDeps): Promise<ConceptIndexRow[]> {
  const [concepts, links] = await Promise.all([deps.concepts.listScreened(), deps.repo.allLinks()]);
  const items = new Map((await deps.repo.itemsByIds([...new Set(links.map((l) => l.itemId))])).map((i) => [i.id, i]));
  const rows = concepts.map((concept): ConceptIndexRow => {
    const linked = [...new Set(links.filter((l) => l.conceptId === concept.id).map((l) => l.itemId))].flatMap((id) => items.get(id) ?? []);
    const lastActivity = linked.reduce<string | null>((latest, i) => (latest === null || i.updatedAt > latest ? i.updatedAt : latest), null);
    return { concept: refOf(concept), counts: countsByGroup(linked.map(lineOf)), total: linked.length, lastActivity };
  });
  return rows.sort((a, b) => {
    if (a.lastActivity !== b.lastActivity) return a.lastActivity === null ? 1 : b.lastActivity === null ? -1 : a.lastActivity < b.lastActivity ? 1 : -1;
    return byName(a.concept, b.concept);
  });
}

/** One concept's page: his description, the items that link it by group, his related concepts, and the machine's suggestions. Null when there is no such live concept. */
export async function conceptPage(deps: KnowledgeDeps, slug: string): Promise<ConceptPageView | null> {
  const concept = await deps.concepts.bySlug(slug);
  if (!concept) return null;
  const [links, edges, screened, everyLink] = await Promise.all([
    deps.repo.linksForConcept(concept.id),
    deps.repo.edgesFor(concept.id),
    deps.concepts.listScreened(),
    deps.repo.allLinks(),
  ]);
  const items = await deps.repo.itemsByIds([...new Set(links.map((l) => l.itemId))]);
  const relatedIds = edges.map((e) => (e.conceptA === concept.id ? e.conceptB : e.conceptA));
  const related = (await deps.concepts.byIds(relatedIds)).map(refOf).sort(byName);
  const screenedRefs = new Map(screened.map((c) => [c.id, refOf(c)]));
  const names = new Map([...screenedRefs].map(([id, ref]) => [id, ref.name]));
  const suggestions = suggestRelated(everyLink, edges, concept.id, names).flatMap((s) => {
    const ref = screenedRefs.get(s.conceptId);
    return ref ? [{ concept: ref, shared: s.shared }] : [];
  });
  return { concept: { ...refOf(concept), descriptionMd: concept.descriptionMd }, groups: groupConceptItems(items.map(lineOf)), related, suggestions };
}

/** "What I learned in {month}": his learnings first written in the India month under their first live concept, then his reads by date. */
export async function monthPage(deps: KnowledgeDeps, month: string, now: Date = new Date()): Promise<MonthView> {
  if (!isMonth(month)) throw new InvalidInputError();
  const { fromIso, toIso } = monthBounds(month);
  const items = await deps.repo.itemsCreatedBetween(fromIso, toIso, ["learning", "reading_note"]);
  const learnings = items.filter((i) => i.kind === "learning").map(lineOf);
  const reads = items.filter((i) => i.kind === "reading_note").map(lineOf).sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? -1 : 1));
  const links = learnings.length > 0 ? await deps.repo.linksForItems(learnings.map((l) => l.id)) : [];
  const live = new Map((await deps.concepts.byIds([...new Set(links.map((l) => l.conceptId))])).map((c) => [c.id, refOf(c)]));
  const first = new Map<string, ConceptRef>();
  for (const [itemId, conceptId] of primaryConceptByItem(links, new Set(live.keys()))) {
    const ref = live.get(conceptId);
    if (ref) first.set(itemId, ref);
  }
  const later = shiftMonth(month, 1);
  return {
    month,
    prevMonth: shiftMonth(month, -1),
    nextMonth: later <= monthOf(now.toISOString()) ? later : null,
    learningCount: learnings.length,
    readCount: reads.length,
    groups: groupMonth(learnings, first),
    reads,
  };
}

/** The desk home line: "This month: {n} learnings, {m} reads". */
export async function monthCounts(deps: KnowledgeDeps, month: string): Promise<MonthCounts> {
  if (!isMonth(month)) throw new InvalidInputError();
  const { fromIso, toIso } = monthBounds(month);
  const items = await deps.repo.itemsCreatedBetween(fromIso, toIso, ["learning", "reading_note"]);
  return { learnings: items.filter((i) => i.kind === "learning").length, reads: items.filter((i) => i.kind === "reading_note").length };
}

/**
 * His tap: link two concepts. Stored once with a < b, so the order of the tap and a double tap change nothing. Both must be
 * live and checked (the picker offers no others); a concept is never linked to itself.
 */
export async function linkConcepts(deps: KnowledgeDeps, a: string, b: string): Promise<void> {
  if (!isUuid(a) || !isUuid(b)) throw new InvalidInputError();
  const [x, y] = normaliseEdge(a, b);
  if (x === y) throw new ConceptSelfLinkError();
  const found = await deps.concepts.byIds([x, y]);
  if (found.length !== 2 || found.some((c) => c.needsReview)) throw new ConceptNotFoundError();
  await deps.repo.insertEdge(x, y);
}

/** Removes his link, whichever way round it was made; removing a link that is not there is fine. */
export async function unlinkConcepts(deps: KnowledgeDeps, a: string, b: string): Promise<void> {
  if (!isUuid(a) || !isUuid(b)) throw new InvalidInputError();
  const [x, y] = normaliseEdge(a, b);
  if (x === y) throw new ConceptSelfLinkError();
  await deps.repo.deleteEdge(x, y);
}

/**
 * The item page's concept picker. Concepts newly added must be live and checked; one he already has stays even if it is still a
 * stub. The change reason names only concepts that are public now (research: setItemConcepts), because it publishes with the
 * revision on a public item. Refused while a revision waits for the gate (ConceptChangePendingError).
 */
export async function saveItemConcepts(deps: KnowledgeDeps, itemId: string, conceptIds: readonly string[]) {
  const history = await getItemWithHistory(deps.research, itemId);
  const latest = history?.revisions[0];
  if (!history || !latest) throw new ItemNotFoundError(itemId);
  const before = latest.conceptIds ?? (history.item.themeId ? [history.item.themeId] : []);
  const wanted = [...new Set(conceptIds)];
  const known = new Map((await deps.concepts.byIds([...new Set([...before, ...wanted])])).map((c) => [c.id, c]));
  for (const id of wanted) {
    const concept = known.get(id);
    if (!before.includes(id) && (!concept || concept.needsReview)) throw new InvalidInputError();
  }
  const labels: Record<string, ConceptLabel> = {};
  for (const id of new Set([...before, ...wanted])) {
    const concept = known.get(id);
    // Not found means archived since: never named (isPublic false), the placeholder is never shown.
    labels[id] = concept ? { name: concept.name, isPublic: concept.visibility === "public" && !concept.needsReview } : { name: "archived concept", isPublic: false };
  }
  return setItemConcepts(deps.research, itemId, wanted, labels);
}
