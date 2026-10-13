import { addDays } from "@/lib/dates";

// Which weekdays still need the official closes, and how far behind the stored closes are. Pure: the caller reads
// market_days and passes today's India date. No holiday list lives here: a day is a holiday only when the daily job has
// decided so from NSE's own answer (spec s8, s18).

/** One row of `market_days`. `source` is the strongest source that decided the date. */
export type MarketDayRow = { tradeDate: string; status: "open" | "shut"; source: string };

/** The daily fetch looks back this many days (spec s5.4; `mark_market_day_shut` in migration 0011 uses the same 7). */
export const FETCH_WINDOW_DAYS = 7;

/** True for Monday to Friday of a real calendar date (YYYY-MM-DD); false for a weekend and for anything else. */
export function isWeekday(isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) return false;
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

/** Decided means the official fetch settled it, open or shut. A typed or uploaded close does not settle a date (spec s18). */
const isDecided = (row: MarketDayRow | undefined): boolean => row !== undefined && row.source === "nse_fetch";

const byDate = (days: readonly MarketDayRow[]): Map<string, MarketDayRow> => new Map(days.map((d) => [d.tradeDate, d]));

/**
 * Weekdays (India dates) from `today` minus 7 up to yesterday that the official fetch has not decided, oldest first.
 * A weekday older than the newest open day is still asked for: a holiday can only be confirmed once a later day is open.
 */
export function datesToFetch(days: readonly MarketDayRow[], today: string): string[] {
  const known = byDate(days);
  const dates: string[] = [];
  for (let d = addDays(today, -FETCH_WINDOW_DAYS); d < today; d = addDays(d, 1)) {
    if (isWeekday(d) && !isDecided(known.get(d))) dates.push(d);
  }
  return dates;
}

/** The newest open date before `today`, or null. */
export function lastOpenDate(days: readonly MarketDayRow[], today: string): string | null {
  let last: string | null = null;
  for (const day of days) {
    if (day.status === "open" && day.tradeDate < today && (last === null || day.tradeDate > last)) last = day.tradeDate;
  }
  return last;
}

/** Longest look-back for the "behind" count: an outage this long is "very behind" whatever the exact number. */
const BEHIND_HORIZON_DAYS = 120;

/**
 * Weekdays after the newest open day and before today that are not decided as shut: the "closes are N days behind"
 * number. With no open day on record it counts the weekdays of the fetch window. Today is never counted.
 */
export function weekdaysBehind(days: readonly MarketDayRow[], today: string): number {
  const known = byDate(days);
  const last = lastOpenDate(days, today);
  const horizon = addDays(today, -BEHIND_HORIZON_DAYS);
  let from = last === null ? addDays(today, -FETCH_WINDOW_DAYS) : addDays(last, 1);
  if (from < horizon) from = horizon;
  let behind = 0;
  for (let d = from; d < today; d = addDays(d, 1)) {
    if (isWeekday(d) && known.get(d)?.status !== "shut") behind += 1;
  }
  return behind;
}
