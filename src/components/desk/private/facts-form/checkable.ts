import type { CaseFile } from "@/modules/casefile/client";
import type { Draft } from "./draft";

/** What the document pane needs of a fact to look for its quote: the text as typed, and the source's document name. */
export type CheckableFact = { id: string; label: string; doc: string; locator: string; quote: string; value: string };

/** From the form's working copy: every cell as typed, so a half-filled row is still checked. */
export function checkableFromDraft(d: Draft): CheckableFact[] {
  return d.facts.map((f) => ({
    id: f.id, label: f.label, doc: d.sources.find((s) => s.id === f.sourceId)?.doc ?? "", locator: f.locator, quote: f.quote, value: f.value,
  }));
}

/** From a sheet that parsed (Text sheet mode). */
export function checkableFromCaseFile(cf: CaseFile): CheckableFact[] {
  return cf.facts.map((f) => {
    const source = cf.sources.find((s) => s.id === f.sourceId);
    return { id: f.id, label: f.label, doc: source?.doc ?? "", locator: f.locator, quote: source?.quote[f.id] ?? "", value: String(f.value) };
  });
}
