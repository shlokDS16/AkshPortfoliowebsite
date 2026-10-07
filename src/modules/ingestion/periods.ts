import { fiscalYearEnd } from "@/modules/casefile/client";

// Period and unit come from the printed column headings, in code, never from the model (E3). Pure.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
// 31st March, 2026 | 31 Mar 2026
const DAY_FIRST = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?[\s,.-]*${MONTH}\.?[\s,.-]*(\d{4})\b`, "g");
// March 31, 2026
const MONTH_FIRST = new RegExp(String.raw`\b${MONTH}\.?\s*(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b`, "g");
// 31.03.2026 | 31-03-2026 | 31/03/2026
const NUMERIC = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g;

type Ymd = { y: number; m: number; d: number; at: number };

const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100;
const monthNo = (name: string) => MONTHS.indexOf(name.slice(0, 3)) + 1;
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function lastDate(header: string): Ymd | null {
  const found: Ymd[] = [];
  for (const x of header.matchAll(DAY_FIRST)) found.push({ y: +x[3], m: monthNo(x[2]), d: +x[1], at: x.index });
  for (const x of header.matchAll(MONTH_FIRST)) found.push({ y: +x[3], m: monthNo(x[1]), d: +x[2], at: x.index });
  for (const x of header.matchAll(NUMERIC)) found.push({ y: +x[3], m: +x[2], d: +x[1], at: x.index });
  return found.filter((f) => valid(f.y, f.m, f.d)).sort((a, b) => a.at - b.at).at(-1) ?? null;
}

/** Indian fiscal quarter of a calendar month: Apr-Jun is Q1 of the next FY. */
function quarterLabel(y: number, m: number): string {
  const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4;
  const fy = m >= 4 ? y + 1 : y;
  return `Q${q} FY${String(fy % 100).padStart(2, "0")}`;
}

export function periodFromHeader(header: string | null): { period: string; asOf: string } | null {
  if (!header) return null;
  const text = header.toLowerCase();
  const date = lastDate(text);
  if (date) {
    if (/quarter|three months|3 months/.test(text)) {
      const period = quarterLabel(date.y, date.m);
      const asOf = fiscalYearEnd(period);
      return asOf ? { period, asOf } : null;
    }
    const period = `FY${String(date.y % 100).padStart(2, "0")}`;
    // A March year end is the standard fiscal year; any other end (a calendar-year company) keeps its own date.
    return { period, asOf: date.m === 3 ? (fiscalYearEnd(period) ?? iso(date.y, date.m, date.d)) : iso(date.y, date.m, date.d) };
  }
  const quarter = /\bq([1-4])\s*fy\s*'?(?:20)?(\d{2})\b/.exec(text);
  if (quarter) {
    const period = `Q${quarter[1]} FY${quarter[2]}`;
    const asOf = fiscalYearEnd(period);
    return asOf ? { period, asOf } : null;
  }
  const span = /\b(?:fy\s*)?(20\d{2})\s*[-/]\s*(\d{2})\b/.exec(text);
  if (span && (+span[1] + 1) % 100 === +span[2]) {
    const period = `FY${span[2]}`;
    const asOf = fiscalYearEnd(period);
    return asOf ? { period, asOf } : null;
  }
  return null;
}

/** The printed unit line as a unit label the facts form accepts, or null (thousands and foreign currencies are not guessed). */
export function unitFromHeader(header: string | null): string | null {
  if (!header) return null;
  const text = header.toLowerCase();
  if (/\$|\busd\b|dollar|\beur\b|thousand|'000|\bmn\b.*\b(?:usd|eur)\b/.test(text)) return null;
  const rupee = /₹|\brs\b|\binr\b|rupee/.test(text);
  if (/\bcrores?\b|\bcr\b/.test(text)) return "₹ cr";
  if (/\blakhs?\b|\blacs?\b/.test(text)) return "₹ lakh";
  if (/\bmillions?\b|\bmn\b|\bmln\b/.test(text)) return "₹ mn";
  if (/\bbillions?\b|\bbn\b/.test(text)) return "₹ bn";
  return rupee ? "₹" : null;
}
