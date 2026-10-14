// The size of a list window from the address (`?open=100`), shared by the Ledger and Journal pages. Pure.

/** The largest window a page will honour; anything above it falls back to the base. */
export const WINDOW_MAX = 5000;

/** A list window from the address: a whole number from the base up to WINDOW_MAX, otherwise the base. Never throws. */
export function windowOf(raw: string | string[] | undefined, base: number): number {
  if (typeof raw !== "string" || !/^\d{1,5}$/.test(raw)) return base;
  const n = Number(raw);
  return n >= base && n <= WINDOW_MAX ? n : base;
}
