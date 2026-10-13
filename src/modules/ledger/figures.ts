import { HORIZON_CHOICES } from "./constants";

// How the screens print machine figures. Pure. Returns are fractions (0.12 = 12%); the result for the call is shown in
// percentage points with one decimal. Negative numbers use the desk's minus sign (U+2212), as `formatNumber` does.

const ONE_DECIMAL = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const TWO_DECIMALS = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "+12.3" / "−5.0" / "0.0" from a fraction, before the unit. */
function signedPercent(fraction: number): string {
  // Half away from zero, so -1.25 reads -1.3 as +1.25 reads +1.3.
  const rounded = (Math.sign(fraction) * Math.round(Math.abs(fraction) * 1000)) / 10;
  if (rounded === 0) return "0.0";
  return `${rounded > 0 ? "+" : "−"}${ONE_DECIMAL.format(Math.abs(rounded))}`;
}

/** A share's or the index's move: "+12.3%". */
export const formatMove = (fraction: number): string => `${signedPercent(fraction)}%`;

/** The result for the call, in percentage points: "+4.2 pp". */
export const formatPoints = (fraction: number): string => `${signedPercent(fraction)} pp`;

/** A closing price or index level, two decimals, en-IN grouping. */
export const formatClose = (value: number): string => TWO_DECIMALS.format(value);

/** "1 year", "6 months", "3 years" for the three named horizons; otherwise the days. */
export function horizonText(days: number): string {
  const named = HORIZON_CHOICES.find((c) => c.days === days);
  return named ? named.label : `${days} days`;
}

const IST_MS = 330 * 60_000;
const HOUR_MS = 3_600_000;

/**
 * When an idea can no longer be withdrawn: the earlier of 24 hours after it was sealed and 15:00 India time (that day
 * when sealed before 15:00, the next day otherwise). This mirrors `private.idea_void_deadline` so the screen offers the
 * button only while it can work; the database stays the judge, and a late press is refused there.
 */
export function voidDeadline(sealedAt: string): Date {
  const opened = new Date(sealedAt).getTime();
  const shifted = opened + IST_MS; // UTC getters now read India time
  const midnight = shifted - (((shifted % (24 * HOUR_MS)) + 24 * HOUR_MS) % (24 * HOUR_MS));
  const cutoff = midnight + (shifted - midnight < 15 * HOUR_MS ? 15 : 39) * HOUR_MS - IST_MS;
  return new Date(Math.min(opened + 24 * HOUR_MS, cutoff));
}
