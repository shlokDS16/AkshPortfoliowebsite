import { DOUBTFUL_DENSITY_MIN, DOUBTFUL_MAX_PAGES, TEXT_DENSITY_MIN } from "./limits";
import type { Basis, PageKind } from "./types";

// Which pages the AI reads (spec s6.3): statement headings at the top of the page, number density, the document's
// basis preferred, scans excluded in 2a (Plan 2b OCRs them). Pure: no I/O.

export type PageVerdict = { pageNo: number; kind: PageKind; basis: Basis | null; score: number };
const HEAD = 400; // statement headings sit at the top of the page
// The P&L outranks the balance sheet and cash flow at equal density: with a budget of one page it is the one to read.
const HEADINGS: [Exclude<PageKind, "other">, RegExp, number][] = [
  ["pl", /statement\s+of\s+profit\s+(?:and|&)\s+loss/i, 110],
  ["bs", /balance\s+sheet\s+as\s+at/i, 100],
  ["cf", /cash\s+flows?\s+statement|statement\s+of\s+cash\s+flows?/i, 100],
  ["segment", /segment\s+(?:information|reporting|revenue)/i, 70],
  ["notes", /notes?\s+(?:forming\s+part|to\s+the\s+(?:consolidated\s+|standalone\s+)?financial\s+statements)/i, 40],
  ["mdna", /management(?:'s|’s)?\s+discussion\s+(?:and|&)\s+analysis/i, 30],
];
const numberDensity = (text: string): number => {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  return tokens.filter((t) => /^\(?-?[\d,]+(?:\.\d+)?\)?$/.test(t)).length / tokens.length;
};
const headingHits = (text: string): number => HEADINGS.filter(([, re]) => re.test(text)).length;
const basisOf = (head: string): Basis | null =>
  /\bconsolidated\b/i.test(head) ? "consolidated" : /\bstandalone\b/i.test(head) ? "standalone" : null;

export function classifyPages(pages: { pageNo: number; text: string; isScan: boolean }[]): PageVerdict[] {
  const out: PageVerdict[] = [];
  for (const p of pages) {
    const head = p.text.slice(0, HEAD);
    const density = numberDensity(p.text);
    const hits = headingHits(p.text);
    const top = HEADINGS.find(([, re]) => re.test(head));
    const prev = out[out.length - 1];
    let verdict: PageVerdict = { pageNo: p.pageNo, kind: "other", basis: basisOf(head), score: 0 };
    if (p.isScan || hits >= 3) {
      // scans wait for Plan 2b; a contents page names every statement
    } else if (top) {
      verdict = { ...verdict, kind: top[0], score: top[2] + density * 50 };
    } else if (prev && ["pl", "bs", "cf"].includes(prev.kind) && prev.pageNo === p.pageNo - 1 && density > 0.25) {
      verdict = { pageNo: p.pageNo, kind: prev.kind, basis: prev.basis, score: prev.score - 10 }; // the statement runs on
    }
    out.push(verdict);
  }
  return out;
}

/** The pages to read within the budget, best first by rank, returned in ascending page order. */
export function selectPages(verdicts: PageVerdict[], opts: { budget: number; basis: Basis }): number[] {
  return verdicts
    .filter((v) => v.kind !== "other" && v.score > 0)
    .map((v) => ({ ...v, rank: v.score + (v.basis === opts.basis ? 20 : v.basis === null ? 5 : -40) }))
    .sort((a, b) => b.rank - a.rank || a.pageNo - b.pageNo)
    .slice(0, Math.max(0, opts.budget))
    .map((v) => v.pageNo)
    .sort((a, b) => a - b);
}

/**
 * The pages to read of a pasted text or a web page (ruling R15). Aksh chose this text, so besides the statement pages the
 * rule picks every page where more than TEXT_DENSITY_MIN of the words are numbers, best first within the budget, in page order.
 * A page that is only dense (no heading) has no stored verdict; the caller passes the pages with isScan false.
 */
export function selectTextPages(pages: { pageNo: number; text: string }[], verdicts: PageVerdict[], opts: { budget: number; basis: Basis }): number[] {
  const verdictOf = new Map(verdicts.map((v) => [v.pageNo, v]));
  return pages
    .flatMap((p) => {
      const v = verdictOf.get(p.pageNo);
      if (v && v.kind !== "other" && v.score > 0) return [{ pageNo: p.pageNo, rank: v.score + (v.basis === opts.basis ? 20 : v.basis === null ? 5 : -40) }];
      const density = numberDensity(p.text);
      return density > TEXT_DENSITY_MIN ? [{ pageNo: p.pageNo, rank: density * 50 }] : [];
    })
    .sort((a, b) => b.rank - a.rank || a.pageNo - b.pageNo)
    .slice(0, Math.max(0, opts.budget))
    .map((r) => r.pageNo)
    .sort((a, b) => a - b);
}

/**
 * The pages the rules could not place and the small model may (ruling R16): the rules said 'other', the page is not a scan,
 * it is not a contents page (fewer than 3 statement headings) and more than DOUBTFUL_DENSITY_MIN of its words are numbers.
 * At most DOUBTFUL_MAX_PAGES, the densest first, returned in page order.
 */
export function doubtfulPages(pages: { pageNo: number; text: string; isScan: boolean }[], verdicts: PageVerdict[]): number[] {
  const kindOf = new Map(verdicts.map((v) => [v.pageNo, v.kind]));
  return pages
    .filter((p) => !p.isScan && kindOf.get(p.pageNo) === "other" && headingHits(p.text) < 3)
    .map((p) => ({ pageNo: p.pageNo, density: numberDensity(p.text) }))
    .filter((p) => p.density > DOUBTFUL_DENSITY_MIN)
    .sort((a, b) => b.density - a.density || a.pageNo - b.pageNo)
    .slice(0, DOUBTFUL_MAX_PAGES)
    .map((p) => p.pageNo)
    .sort((a, b) => a - b);
}

/** A model verdict worth keeping (confidence already checked): 20 + 20 x confidence, below any heading page's 40 plus its density. */
export function modelVerdict(page: { pageNo: number; text: string }, kind: Exclude<PageKind, "other">, confidence: number): PageVerdict {
  return { pageNo: page.pageNo, kind, basis: basisOf(page.text.slice(0, HEAD)), score: 20 + 20 * confidence };
}
