import { MAX_CONCEPTS } from "./schema";

// The revision reason limit (research schema changeReason .max(300)), in UTF-16 units.
const REASON_MAX = 300;

/** Previous ids first, then the new ones; repeats dropped, at most MAX_CONCEPTS (the first 8 win). */
export function unionConceptIds(previous: readonly string[], added: readonly string[]): string[] {
  return [...new Set([...previous, ...added])].slice(0, MAX_CONCEPTS);
}

/** `ids` without repeats, first occurrence kept (order is the primary-first order). */
export function dedupeIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** What the change reason may know about a concept. `isPublic` is read at save time; anything but `true` is treated as private. */
export type ConceptLabel = { name: string; isPublic: boolean };

/** "A and 2 private concepts": public names first, then the rest as a count in plain words, never as names. */
function sideText(labels: readonly ConceptLabel[]): string {
  const names = labels.filter((l) => l.isPublic === true).map((l) => l.name);
  const hidden = labels.length - names.length;
  const hiddenText = hidden === 1 ? "1 private concept" : `${hidden} private concepts`;
  if (hidden === 0) return names.join(", ");
  return names.length === 0 ? hiddenText : `${names.join(", ")} and ${hiddenText}`;
}

/**
 * The change reason of a concept change: a fixed template filled with his concept names, never worded by the machine.
 * The reason publishes with the revision, so it names only concepts that are public at save time and counts the others
 * ("and 2 private concepts"). Past the reason limit the names give way to counts, so a long list never refuses the save.
 */
export function conceptChangeReason(added: readonly ConceptLabel[], removed: readonly ConceptLabel[]): string {
  const parts: string[] = [];
  if (added.length > 0) parts.push(`added ${sideText(added)}`);
  if (removed.length > 0) parts.push(`removed ${sideText(removed)}`);
  if (parts.length === 0) return "Concepts: order changed.";
  const text = `Concepts: ${parts.join("; ")}.`;
  if (text.length <= REASON_MAX) return text;
  const counts = [added.length > 0 ? `added ${added.length}` : null, removed.length > 0 ? `removed ${removed.length}` : null];
  return `Concepts: ${counts.filter(Boolean).join("; ")}.`;
}
