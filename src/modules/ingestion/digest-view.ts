// Browser-safe: what the document pane shows of a page's digest (Plan 2b Task 7, rulings R20 and R6). Every line of copy here
// is also in spec s16.12, marked "pending Shlok approval".

/** One machine-read claim: the AI's short note, and the line it says carries it. `onPage` was decided in code when the row was written. */
export type DigestLine = { section: string; claim: string; line: string; onPage: boolean };

export const DIGEST_MARKER = "Machine-read";
export const DIGEST_NOTE = "The AI read this page and noted what management says. These notes are only for you. They are never published and are not your words.";
export const DIGEST_NOT_ON_PAGE = "Not found on this page";
export const DIGEST_FACT_ADDED = "It is in the Facts list as a new row. Add the label and value yourself.";
export const DIGEST_FACT_REFUSED = "The Facts list could not take it. Fix the facts sheet first, or the list may be full.";
export const DIGEST_COULD_NOT_LOAD = "The machine-read notes for this page could not be loaded.";

export const digestCount = (count: number): string => `${count === 1 ? "1 claim" : `${count} claims`} on this page`;

/** The toggle for claims whose line the page check could not find. */
export const digestToggle = (count: number, shown: boolean): string =>
  `${shown ? "Hide" : "Show"} ${count === 1 ? "1 claim" : `${count} claims`} the page check could not confirm`;

/** The rows of the newest extraction for a page (a re-read under a new model leaves older rows behind, never mixed in). Rows come newest first. */
export function latestDigest<R extends { extractionId: string }>(rows: R[]): R[] {
  const newest = rows[0]?.extractionId;
  return newest === undefined ? [] : rows.filter((r) => r.extractionId === newest);
}
