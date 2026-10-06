const IST = "Asia/Kolkata";
const istFormat = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar date (YYYY-MM-DD) in India, where Aksh lives. */
export function istDate(at: Date | string): string {
  return istFormat.format(new Date(at));
}

const istTimeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "2026-10-05 00:30 IST": a timestamp as Aksh reads it, to the minute. */
export function istDateTime(at: Date | string): string {
  return `${istDate(at)} ${istTimeFormat.format(new Date(at))} IST`;
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Decision D3 / publishing-rules rule 3: public figures need data at least this many days old. */
export const PUBLICATION_LAG_DAYS = 30;

/**
 * True when data dated `dataAsOf` is at least 30 days old on `today`, both YYYY-MM-DD India dates (pass
 * istDate(new Date()) as `today`). The SQL twin is private.is_lagged() (20261007000004), which counts on the
 * Asia/Kolkata calendar too, so the lint and the database agree at every hour.
 */
export function isPastLag(dataAsOf: string, today: string): boolean {
  return dataAsOf <= addDays(today, -PUBLICATION_LAG_DAYS);
}

/** 00:00 IST on the given date, as a UTC ISO timestamp (for "since" queries). */
export function istDayStartUtc(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00+05:30`).toISOString();
}
