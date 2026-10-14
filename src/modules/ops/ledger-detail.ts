// The one sentence of a ledger:prices heartbeat that the private desk strip also shows (a tracked company with no row in an
// otherwise good file). Written by the step, read back by the strip; both use these two functions so the words cannot drift.
// Counts only: never a symbol, never a value. Not a public fact: /api/health never carries it.

/** "1 of 3 companies had no row" */
export function noRowDetail(missing: number, tracked: number): string {
  return `${missing} of ${tracked} ${tracked === 1 ? "company" : "companies"} had no row`;
}

/** The strip's sentence for a heartbeat detail that carries the count above, or null. */
export function noRowNote(detail: string | null | undefined): string | null {
  const m = detail ? /(\d+ of \d+ compan(?:y|ies)) had no row/.exec(detail) : null;
  return m ? `The latest closing-prices run found no row for ${m[1]} in NSE's file.` : null;
}
