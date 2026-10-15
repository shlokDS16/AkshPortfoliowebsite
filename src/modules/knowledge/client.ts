// Pure and browser-safe: the desk read models of the learning graph and the helpers that build them. Nothing here reads the
// database. Dates, counts, groupings and suggestions are the machine's and are labelled so on screen; a title is never touched.
import { istDate, istDayStartUtc } from "@/lib/dates";

export type ConceptStatus = "private" | "public" | "unchecked";

/** A concept as a chip or a link shows it. `status` is "unchecked" while the name is still waiting on the Names tab. */
export type ConceptRef = { id: string; slug: string; name: string; status: ConceptStatus };

/** One item as a list line shows it. `title` is his, byte for byte. */
export type ItemLine = { id: string; kind: string; title: string; createdAt: string; visibility: string; status: string };

/** One row of the admin view `concept_links`: an item's latest revision links a concept. `position` can have gaps. */
export type ConceptLinkRow = { itemId: string; revisionId: string; conceptId: string; position: number };

/** One of his links between two concepts, stored once as (a < b). */
export type EdgeRow = { conceptA: string; conceptB: string };

export type Suggestion = { conceptId: string; shared: number };

// ---- Kind headings (spec s7) ----

export const ITEM_GROUPS = ["learning", "file", "process", "read", "note"] as const;
export type ItemGroup = (typeof ITEM_GROUPS)[number];

/** Heading texts (spec s14, pending Shlok's approval). */
export const ITEM_GROUP_LABELS: Record<ItemGroup, string> = {
  learning: "Learnings",
  file: "Files and case studies",
  process: "Process",
  read: "Reads",
  note: "Notes",
};

/** The count noun of each group, singular then plural, for a line like "1 learning · 2 reads" (pending Shlok's approval). */
const GROUP_COUNT_NOUNS: Record<ItemGroup, readonly [string, string]> = {
  learning: ["learning", "learnings"],
  file: ["file or case study", "files and case studies"],
  process: ["process note", "process notes"],
  read: ["read", "reads"],
  note: ["note", "notes"],
};

/** "1 learning", "2 reads": the number and the noun that agrees with it. */
export function groupCountText(group: ItemGroup, n: number): string {
  const [one, many] = GROUP_COUNT_NOUNS[group];
  return `${n} ${n === 1 ? one : many}`;
}

export function groupOfKind(kind: string): ItemGroup {
  switch (kind) {
    case "learning":
      return "learning";
    case "thesis":
    case "case_study":
      return "file";
    case "process":
      return "process";
    case "reading_note":
      return "read";
    default:
      return "note";
  }
}

const newestFirst = (a: ItemLine, b: ItemLine): number => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? 1 : -1);
const oldestFirst = (a: ItemLine, b: ItemLine): number => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? -1 : 1);

/** The concept page's groups: spec order, newest first inside each, empty groups left out. */
export function groupConceptItems(items: readonly ItemLine[]): { group: ItemGroup; items: ItemLine[] }[] {
  return ITEM_GROUPS.map((group) => ({ group, items: items.filter((i) => groupOfKind(i.kind) === group).sort(newestFirst) })).filter((g) => g.items.length > 0);
}

export function countsByGroup(items: readonly ItemLine[]): Record<ItemGroup, number> {
  const counts: Record<ItemGroup, number> = { learning: 0, file: 0, process: 0, read: 0, note: 0 };
  for (const item of items) counts[groupOfKind(item.kind)] += 1;
  return counts;
}

// ---- India months ----

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH.test(value);
}

/** "2026-11" for 2026-10-31T19:00:00Z: the month on the calendar in India, where Aksh lives. */
export function monthOf(iso: string): string {
  return istDate(iso).slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (mon - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** From 00:00 India on the 1st (included) to 00:00 India on the 1st of the next month (not included), as UTC timestamps. */
export function monthBounds(month: string): { fromIso: string; toIso: string } {
  return { fromIso: istDayStartUtc(`${month}-01`), toIso: istDayStartUtc(`${shiftMonth(month, 1)}-01`) };
}

export type MonthGroup = { concept: ConceptRef | null; items: ItemLine[] };

/**
 * His learnings of a month under their first live concept: groups by concept name, "No concept" (concept null) last, lines in
 * the order he wrote them. `firstConcept` is item id to concept. The lines are the same objects that came in.
 */
export function groupMonth(learnings: readonly ItemLine[], firstConcept: ReadonlyMap<string, ConceptRef>): MonthGroup[] {
  const byConcept = new Map<string, MonthGroup>();
  const none: ItemLine[] = [];
  for (const item of [...learnings].sort(oldestFirst)) {
    const concept = firstConcept.get(item.id);
    if (!concept) {
      none.push(item);
      continue;
    }
    const group = byConcept.get(concept.id) ?? { concept, items: [] };
    group.items.push(item);
    byConcept.set(concept.id, group);
  }
  const named = [...byConcept.values()].sort((a, b) => (a.concept?.name ?? "").localeCompare(b.concept?.name ?? "", "en") || (a.concept?.id ?? "").localeCompare(b.concept?.id ?? ""));
  return none.length > 0 ? [...named, { concept: null, items: none }] : named;
}

// ---- Links, edges, suggestions ----

/**
 * Each item's primary concept: the link with the lowest `position` whose concept is in `known`. Positions have gaps (an
 * archived or no longer public concept is filtered out of the views), so position 1 is never assumed. An item with no known
 * concept has no entry.
 */
export function primaryConceptByItem(links: readonly ConceptLinkRow[], known: ReadonlySet<string>): Map<string, string> {
  const best = new Map<string, { conceptId: string; position: number }>();
  for (const l of links) {
    if (!known.has(l.conceptId)) continue;
    const have = best.get(l.itemId);
    if (!have || l.position < have.position) best.set(l.itemId, { conceptId: l.conceptId, position: l.position });
  }
  return new Map([...best].map(([itemId, v]) => [itemId, v.conceptId]));
}

/** An edge is stored once, with concept_a < concept_b, as the database orders a uuid (lower-case hex). */
export function normaliseEdge(a: string, b: string): [string, string] {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  return x < y ? [x, y] : [y, x];
}

export const MAX_SUGGESTIONS = 3;
export const MIN_SHARED_ITEMS = 2;

/**
 * The concepts this one turns up with: at least 2 items shared, not itself, not already linked by him, at most 3, by shared
 * count then name. `names` is id to name for the concepts that may be suggested (screened and live); an id without a name is
 * never suggested. Computed on read and never stored: the machine's, not his.
 */
export function suggestRelated(links: readonly ConceptLinkRow[], edges: readonly EdgeRow[], conceptId: string, names: ReadonlyMap<string, string>): Suggestion[] {
  const itemsOf = new Map<string, Set<string>>();
  for (const l of links) {
    const set = itemsOf.get(l.conceptId) ?? new Set<string>();
    set.add(l.itemId);
    itemsOf.set(l.conceptId, set);
  }
  const mine = itemsOf.get(conceptId);
  if (!mine) return [];
  const related = new Set(edges.flatMap((e) => (e.conceptA === conceptId ? [e.conceptB] : e.conceptB === conceptId ? [e.conceptA] : [])));
  const out: Suggestion[] = [];
  for (const [other, items] of itemsOf) {
    const name = names.get(other);
    if (other === conceptId || related.has(other) || name === undefined) continue;
    let shared = 0;
    for (const item of items) if (mine.has(item)) shared += 1;
    if (shared >= MIN_SHARED_ITEMS) out.push({ conceptId: other, shared });
  }
  const nameOf = (id: string) => names.get(id) ?? "";
  return out.sort((a, b) => b.shared - a.shared || nameOf(a.conceptId).localeCompare(nameOf(b.conceptId), "en") || a.conceptId.localeCompare(b.conceptId)).slice(0, MAX_SUGGESTIONS);
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** "October 2026" for "2026-10". Plain table, so it never depends on the machine's locale or timezone. */
export function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  return `${MONTH_NAMES[mon - 1]} ${year}`;
}

/** At most this many concepts on one revision (a second copy for browser code; a test keeps it equal to research MAX_CONCEPTS). */
export const MAX_ITEM_CONCEPTS = 8;
