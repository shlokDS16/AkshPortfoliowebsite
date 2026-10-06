const IST = "Asia/Kolkata";
const istFormat = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar date (YYYY-MM-DD) in India, where Aksh lives. */
export function istDate(at: Date | string): string {
  return istFormat.format(new Date(at));
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 00:00 IST on the given date, as a UTC ISO timestamp (for "since" queries). */
export function istDayStartUtc(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00+05:30`).toISOString();
}
