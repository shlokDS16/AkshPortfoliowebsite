import type { ISODate } from "@/lib/desk-types";
import { addDays } from "@/lib/dates";

/** A real calendar date written YYYY-MM-DD ("2026-02-30" is not one). Views only ever receive these. */
export function isIsoDate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertToday(today: string): void {
  if (!isIsoDate(today)) throw new RangeError("today must be a YYYY-MM-DD date");
}

/**
 * Mirrors SQL `private.is_lagged(d)` as redefined in 20261007000004_hardening.sql: `d <= (now() at time zone 'Asia/Kolkata')::date - 30`.
 * Callers pass `today = istDate(now)`. A date that cannot be read is never lagged: a figure of unknown age is not shown.
 */
export function isLagged(date: ISODate, today: ISODate): boolean {
  assertToday(today);
  return isIsoDate(date) && date <= addDays(today, -30);
}

/** Null when the figure may be shown; otherwise the date it becomes public. */
export function withheldUntil(date: ISODate, today: ISODate): ISODate | null {
  assertToday(today);
  if (!isIsoDate(date)) throw new RangeError("the figure's date must be a YYYY-MM-DD date");
  return isLagged(date, today) ? null : addDays(date, 30);
}
