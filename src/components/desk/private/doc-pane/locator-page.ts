/** The page a fact's locator names ("p. 4", "pp. 4-5", "Page 4", "4"), else null. */
export function locatorPage(locator: string): number | null {
  const m = /\b(?:p|pp|pg|page)\.?\s*(\d{1,4})\b/i.exec(locator) ?? /^\s*(\d{1,4})\s*$/.exec(locator);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 ? n : null;
}
