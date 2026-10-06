import type { FileNo, HoldsPosition, ISODate } from "./desk-types";
import { istDate, istTime } from "./dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NUMBER = new Map<number, Intl.NumberFormat>();

function isoDay(value: string): ISODate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : istDate(value);
}

/** "2 Sep 2026": no comma, no weekday (design-dna 3.4). */
export function formatDate(value: string): string {
  const [y, m, d] = isoDay(value).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatTime(value: string): string {
  return istTime(value);
}

/** en-IN grouping ("1,28,400") and U+2212 for negatives. */
export function formatNumber(value: number, maximumFractionDigits = 1): string {
  let format = NUMBER.get(maximumFractionDigits);
  if (!format) {
    format = new Intl.NumberFormat("en-IN", { maximumFractionDigits });
    NUMBER.set(maximumFractionDigits, format);
  }
  return format.format(value).replace("-", "−");
}

export function formatFileNo(n: number): FileNo {
  return String(n).padStart(2, "0");
}

export function formatCount(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** The strip's {position} (design-dna 13.2). Null renders as not disclosed. */
export function positionText(h: HoldsPosition | null): string {
  if (h === "yes") return "Aksh holds a position";
  if (h === "no") return "Aksh holds no position";
  return "Position not disclosed";
}

/** The disclosure block's {holds_position} (publishing-rules, standard disclosure). */
export function positionWord(h: HoldsPosition): "Yes" | "No" | "Not disclosed" {
  return h === "yes" ? "Yes" : h === "no" ? "No" : "Not disclosed";
}

/** Rule 3: a figure younger than 30 days is replaced, never dropped silently. */
export function withheldText(availableOn: ISODate): string {
  return `[withheld until ${formatDate(availableOn)}]`;
}
