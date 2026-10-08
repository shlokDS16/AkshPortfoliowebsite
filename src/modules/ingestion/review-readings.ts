import { machineReadingSchema } from "./readings";
import type { ReadingRecord } from "./review-repo";
import type { ReadingView } from "./review-types";

// Which test readings the review screen lists and which filing puts under the file (Plan 2b Task 8, ruling R4). Pure, server side.
// A reading is Aksh's to tick; ticking it never touches a test's status. A reading a re-read replaced is not listed.

/** A reading as the screen shows it; null for a row whose stored value is not a machine reading (the machine validates before it writes). */
export function toReadingView(rec: ReadingRecord): ReadingView | null {
  const parsed = machineReadingSchema.safeParse(rec.machine);
  if (!parsed.success || (rec.status !== "pending" && rec.status !== "accepted" && rec.status !== "rejected")) return null;
  const m = parsed.data;
  return {
    id: rec.id, page: rec.pageNo, testId: rec.testId, label: m.label, valueText: m.valueText, unit: m.unit, period: m.period, asOf: m.readingAsOf,
    prior: m.prior, quote: m.quote, status: rec.status,
  };
}

/**
 * The readings still in play: not filed, and not a rejected one whose page and test a later pass proposed again (a re-read rejects
 * the page's unchecked rows, then adds its own). A rejected reading Aksh dropped himself stays listed, unticked, so he can change his mind.
 */
export function currentReadings(recs: ReadingRecord[]): ReadingRecord[] {
  const newest = new Map<string, number>();
  for (const r of recs) newest.set(`${r.pageNo}:${r.testId}`, Math.max(newest.get(`${r.pageNo}:${r.testId}`) ?? 1, r.pass));
  return recs.filter((r) => r.status !== "filed" && !(r.status === "rejected" && r.pass < (newest.get(`${r.pageNo}:${r.testId}`) ?? 1)));
}

/** What filing puts under the file: the accepted readings the list shows. */
export const filableReadingIds = (recs: ReadingRecord[]): string[] => currentReadings(recs).filter((r) => r.status === "accepted").map((r) => r.id);

/** The listed readings as views, in page then test order. */
export const readingViews = (recs: ReadingRecord[]): ReadingView[] =>
  currentReadings(recs)
    .flatMap((r) => toReadingView(r) ?? [])
    .sort((a, b) => a.page - b.page || a.testId.localeCompare(b.testId, "en", { numeric: true }));
