import { istDate } from "@/lib/dates";
import { formatFileNo } from "@/lib/format";
import { caseHref, ledgerCases } from "./case-study";
import { revisionsOf, servedFiles } from "./site";
import type { ConceptItem, ConceptSummary, ConceptView, ItemConcept, PublicConceptRow, PublicItemRow, PublicSnapshot } from "./types";

// Plan 4 Task 5 (spec s8). Everything public about a concept is built from the two optional loads, `public_themes` and
// `public_concept_links`, never from `theme_id`: a theme can be public with no linked item. An id the snapshot does not know is never
// rendered (an older passed revision can carry the bare uuid of a concept made private later). An item's concepts are those of its
// CURRENT revision only; `position` has gaps, so order is by value and the primary concept is the lowest present.

export const conceptHref = (slug: string) => `/concepts/${slug}`;

type Placed = { group: "notes" | "applied"; label: string | null; fileNo: string | null; href: string | null };

/** Every public item a visitor can actually open (or, for a plain note, read about), and where it is listed. */
function placements(s: PublicSnapshot): Map<string, Placed> {
  const out = new Map<string, Placed>();
  for (const { item, record } of ledgerCases(s)) out.set(item.id, { group: "applied", label: record.company, fileNo: null, href: caseHref(item.slug) });
  for (const { item, company } of servedFiles(s)) out.set(item.id, { group: "applied", label: company.name, fileNo: formatFileNo(item.fileNo), href: `/companies/${company.slug}` });
  for (const item of s.items) {
    if (item.kind === "learning") out.set(item.id, { group: "notes", label: null, fileNo: null, href: `/notes/${item.slug}` });
    else if (item.kind === "process") out.set(item.id, { group: "notes", label: null, fileNo: null, href: `/process/${item.slug}` });
    else if (item.kind === "note") out.set(item.id, { group: "notes", label: null, fileNo: null, href: null });
  }
  return out;
}

/** The public concepts of an item's current revision, in position order, each once, known ones only. */
function currentConcepts(s: PublicSnapshot, item: Pick<PublicItemRow, "id" | "revisionId">): PublicConceptRow[] {
  const known = new Map((s.concepts ?? []).map((c) => [c.id, c]));
  const seen = new Set<string>();
  return (s.conceptLinks ?? [])
    .filter((l) => l.itemId === item.id && l.revisionId === item.revisionId)
    .sort((a, b) => a.position - b.position)
    .flatMap((l) => {
      const concept = known.get(l.conceptId);
      if (!concept || seen.has(concept.id)) return [];
      seen.add(concept.id);
      return [concept];
    });
}

export function itemConcepts(s: PublicSnapshot, itemId: string): ItemConcept[] {
  const item = s.items.find((i) => i.id === itemId);
  return item ? currentConcepts(s, item).map((c) => ({ slug: c.slug, name: c.name, href: conceptHref(c.slug) })) : [];
}

/** D25's rule: the item's first gated revision that listed the concept. */
function sinceOf(s: PublicSnapshot, item: PublicItemRow, conceptId: string): string {
  const linking = new Set((s.conceptLinks ?? []).filter((l) => l.itemId === item.id && l.conceptId === conceptId).map((l) => l.revisionId));
  const first = revisionsOf(s, item.id).find((r) => linking.has(r.id));
  return istDate(first ? first.createdAt : item.revisedAt);
}

type Use = { concept: PublicConceptRow; item: PublicItemRow; placed: Placed };

/** Every (concept, item) pair the public can see: the item's current revision lists the concept and the item has a place on the site. */
function uses(s: PublicSnapshot): Use[] {
  if ((s.concepts ?? []).length === 0) return [];
  const where = placements(s);
  return s.items.flatMap((item) => {
    const placed = where.get(item.id);
    return placed ? currentConcepts(s, item).map((concept) => ({ concept, item, placed })) : [];
  });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Machine's line: counts only. A kind with none is left out. */
function countLine(notes: number, files: number): string {
  return [notes > 0 ? plural(notes, "note", "notes") : null, files > 0 ? plural(files, "file", "files") : null].filter(Boolean).join(" · ");
}

/** Public concepts that at least one visible item uses, A to Z. */
export function listConceptSummaries(s: PublicSnapshot): ConceptSummary[] {
  const byConcept = new Map<string, { concept: PublicConceptRow; notes: number; files: number }>();
  for (const { concept, placed } of uses(s)) {
    const row = byConcept.get(concept.id) ?? { concept, notes: 0, files: 0 };
    if (placed.group === "notes") row.notes += 1;
    else row.files += 1;
    byConcept.set(concept.id, row);
  }
  return [...byConcept.values()]
    .sort((a, b) => a.concept.name.localeCompare(b.concept.name, "en") || a.concept.slug.localeCompare(b.concept.slug))
    .map(({ concept, notes, files }) => ({ slug: concept.slug, name: concept.name, href: conceptHref(concept.slug), notes, files, countLine: countLine(notes, files) }));
}

const newestFirst = (a: ConceptItem, b: ConceptItem) => b.since.localeCompare(a.since) || a.title.localeCompare(b.title, "en");

export function buildConceptView(s: PublicSnapshot, slug: string): ConceptView | null {
  const mine = uses(s).filter((u) => u.concept.slug === slug);
  if (mine.length === 0) return null;
  const name = mine[0].concept.name;
  const toItem = ({ concept, item, placed }: Use): ConceptItem => ({
    title: item.title, label: placed.label, fileNo: placed.fileNo, href: placed.href, learningObjective: item.learningObjective ?? "", since: sinceOf(s, item, concept.id),
  });
  const pick = (group: Placed["group"]) => mine.filter((u) => u.placed.group === group).map(toItem).sort(newestFirst);
  return { slug, name, standfirst: `Notes and case files by Aksh Agrawal that use ${name}, newest first.`, notes: pick("notes"), applied: pick("applied") };
}
