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

/**
 * The change reason of a concept change: a fixed template filled with his concept names, never worded by the machine.
 * Past the reason limit the names give way to counts, so a long list never refuses the save.
 */
export function conceptChangeReason(added: readonly string[], removed: readonly string[]): string {
  const parts: string[] = [];
  if (added.length > 0) parts.push(`added ${added.join(", ")}`);
  if (removed.length > 0) parts.push(`removed ${removed.join(", ")}`);
  if (parts.length === 0) return "Concepts: order changed.";
  const text = `Concepts: ${parts.join("; ")}.`;
  if (text.length <= REASON_MAX) return text;
  const counts = [added.length > 0 ? `added ${added.length}` : null, removed.length > 0 ? `removed ${removed.length}` : null];
  return `Concepts: ${counts.filter(Boolean).join("; ")}.`;
}
