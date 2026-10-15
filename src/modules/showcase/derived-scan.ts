// Publishing rule 11 (v1.2 addendum) and rule 10.7 (v1.1 addendum), in one scan. A derived surface (metadata, structured data, a
// share card, the feed, the sitemap, the print layout) never carries a database id and, on a ledger case study, never a figure or a
// verdict. Tests build every output from a fixture snapshot whose own text holds no figure and no id and run this over the result:
// a hit is something a builder added. It is a test helper; no page imports it.

const CHECKS: [string, RegExp][] = [
  ["uuid", /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
  ["percent", /%/],
  ["rupee sign", /₹/],
  ["Rs figure", /\bRs\.?\s?\d/i],
  ["ended ahead", /ended ahead/i],
  ["ended behind", /ended behind/i],
];

/** The names of the problems found in `text`, each once, in a fixed order. Empty means clean. */
export function derivedProblems(text: string): string[] {
  return CHECKS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}
