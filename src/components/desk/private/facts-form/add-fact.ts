import { CASEFILE_LIMITS } from "@/modules/casefile/client";
import type { AddFactDetail, AddSourceDetail } from "../add-source-event";
import { blankFact, blankSource, nextId, type Draft } from "./draft";

// What the document pane adds to the Facts form: a source row (reused when the same document and date are listed) and, for
// "Use as a fact", a new fact row holding only the verified quote and its locator. Pure: the form decides what to do with the result.

const same = (detail: AddSourceDetail) => (s: { doc: string; filedOn: string }) =>
  s.doc.trim().toLowerCase() === detail.doc.trim().toLowerCase() && s.filedOn === detail.filedOn;

/** The draft with the document's source row in it, and that row's id. `loaded` holds every id the form has ever shown. */
export function withSource(base: Draft, detail: AddSourceDetail, loaded: string[]): { draft: Draft; sourceId: string } {
  const existing = base.sources.find(same(detail));
  if (existing) return { draft: base, sourceId: existing.id };
  const sourceId = nextId("S", [...base.sources.map((x) => x.id), ...loaded]);
  return { draft: { ...base, sources: [...base.sources, { ...blankSource(sourceId), ...detail }] }, sourceId };
}

/** The draft with a new fact row: source, quote and locator set, label and value empty. Null when the file is at its fact or source limit. */
export function withFact(base: Draft, add: AddFactDetail, loaded: string[]): { draft: Draft; factId: string; sourceId: string } | null {
  const hasSource = base.sources.some(same(add.source));
  if (base.facts.length >= CASEFILE_LIMITS.facts || (!hasSource && base.sources.length >= CASEFILE_LIMITS.sources)) return null;
  const { draft, sourceId } = withSource(base, add.source, loaded);
  const factId = nextId("F", [...draft.facts.map((f) => f.id), ...loaded]);
  const fact = { ...blankFact(factId, sourceId), quote: add.quote, locator: add.locator };
  return { draft: { ...draft, facts: [...draft.facts, fact] }, factId, sourceId };
}
