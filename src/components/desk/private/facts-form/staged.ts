import { CASEFILE_LIMITS } from "@/modules/casefile/client";
import type { StagedRow } from "@/modules/ingestion/client";
import { blankSource, draftIds, nextId, type Draft, type FactDraft } from "./draft";

// Staged machine figures become ordinary rows of the Facts form (ADR-004 s4.7). Pure: the form opens with them
// merged once, and they are saved only by the one save action, like any row Aksh typed.

export type Merged = {
  draft: Draft;
  /** Each new fact id with the proposal it came from. */
  provenance: { factId: string; proposalId: string }[];
  /** Equal to a fact the file already has (label, period, value): not added; it stays staged. */
  skipped: number;
  /** Left out because the file is at its fact or source limit; it stays staged. */
  overflow: number;
};

const key = (s: string) => s.trim().toLowerCase();

/**
 * New `F` rows past the high-water mark of the draft, `reserved` (the ids the form loaded and the body cites) and each
 * other; the document's `S` row is reused when its title (any case) and filed-on date match one already there.
 */
export function mergeStaged(draft: Draft, staged: StagedRow[], reserved: string[]): Merged {
  const sources = [...draft.sources];
  const facts = [...draft.facts];
  const taken = [...draftIds(draft), ...reserved];
  const provenance: Merged["provenance"] = [];
  let skipped = 0;
  let overflow = 0;
  for (const { proposalId, value: v, document: doc } of staged) {
    if (facts.some((f) => key(f.label) === key(v.label) && f.period === v.period && Number(f.value) === v.value)) {
      skipped += 1;
      continue;
    }
    let source = sources.find((s) => key(s.doc) === key(doc.title) && s.filedOn === doc.filedOn);
    if (facts.length >= CASEFILE_LIMITS.facts || (!source && sources.length >= CASEFILE_LIMITS.sources)) {
      overflow += 1;
      continue;
    }
    if (!source) {
      const id = nextId("S", taken);
      taken.push(id);
      source = { ...blankSource(id), doc: doc.title, type: doc.sourceType, filedOn: doc.filedOn, url: doc.sourceUrl ?? "" };
      sources.push(source);
    }
    const id = nextId("F", taken);
    taken.push(id);
    const fact: FactDraft = {
      id, label: v.label, value: String(v.value), unit: v.unit, period: v.period, asOf: v.asOf, sourceId: source.id, locator: v.locator,
      priorLabel: v.prior?.label ?? "", priorValue: v.prior ? String(v.prior.value) : "", quote: v.quote, topic: v.topic,
    };
    facts.push(fact);
    provenance.push({ factId: id, proposalId });
  }
  return { draft: { ...draft, sources, facts }, provenance, skipped, overflow };
}
