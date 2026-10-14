// Pure and browser-safe (ADR-004 s4.6): the same test runs in the document pane and, later, on extracted quotes.

const DASHES = /[‐-―−]/g;

/** Lower-case, NFKC, one space between words, straight quotes and a plain hyphen for every dash. */
export function normaliseText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/ /g, " ")
    .replace(DASHES, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const ungroup = (s: string) => s.replace(/(\d),(?=\d)/g, "$1");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * True when `needle` is printed on the page. A bare figure must stand alone (1284.00 is not 1284, 41.7 is not 41.70),
 * and thousands separators of any grouping are ignored on both sides.
 */
export function onPage(needle: string, pageText: string): boolean {
  const n = ungroup(normaliseText(needle));
  const p = ungroup(normaliseText(pageText));
  if (n === "") return false;
  if (/^\(?-?\d[\d.]*\)?$/.test(n)) return new RegExp(`(?<![\\d.])${escapeRe(n)}(?!\\d|\\.\\d)`).test(p);
  return p.includes(n);
}

/** A printed figure as a number: "1,28,400" 128400, "(1,234.50)" -1234.5; a dash or "Nil" is no figure. */
export function parsePrinted(text: string): number | null {
  const t = normaliseText(text).replace(/₹|\brs\.?|\binr\b/g, "").replace(/,/g, "").replace(/\s+/g, "");
  if (t === "" || t === "-" || t === "nil") return null;
  const negative = /^\(.*\)$/.test(t);
  const n = Number(t.replace(/^\(|\)$/g, ""));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * True when the value Aksh typed is a figure printed on the page: as written, or as the same number in other print
 * (1284 against "1,284.00", 12.5 against "(12.50)" only when the signs agree).
 */
export function valueOnPage(valueText: string, pageText: string): boolean {
  if (onPage(valueText, pageText)) return true;
  const want = parsePrinted(valueText);
  if (want === null) return false;
  const tokens = normaliseText(pageText).match(/\(?-?\d[\d,]*(?:\.\d+)?\)?/g) ?? [];
  return tokens.some((t) => parsePrinted(t) === want);
}

/** The words of a web-style query that can be looked for in text (operators, quotes and negated words dropped). */
export function queryWords(query: string): string[] {
  return query
    .replace(/"/g, " ")
    .split(/\s+/)
    .filter((w) => w !== "" && !w.startsWith("-") && w.toLowerCase() !== "or")
    .map((w) => w.toLowerCase());
}
