import type { Basis } from "@/modules/documents/client";
import { machineReadingSchema } from "./readings";
import type { ReadingRecord } from "./review-repo";
import type { ReadingView } from "./review-types";
import { currentRows } from "./supersede";

// Which test readings the review screen lists and which filing puts under the file (Plan 2b Task 8, ruling R4). Pure, server side.
// A reading is Aksh's to tick; ticking it never touches a test's status. A reading a re-read replaced is not listed.

/** A reading as the screen shows it; null for a row whose stored value is not a machine reading (the machine validates before it writes). */
export function toReadingView(rec: ReadingRecord): ReadingView | null {
  const parsed = machineReadingSchema.safeParse(rec.machine);
  if (!parsed.success || (rec.status !== "pending" && rec.status !== "accepted" && rec.status !== "rejected")) return null;
  const m = parsed.data;
  return {
    id: rec.id, page: rec.pageNo, testId: rec.testId, label: m.label, valueText: m.valueText, unit: m.unit, period: m.period, asOf: m.readingAsOf,
    prior: m.prior, quote: m.quote, status: rec.status, basis: m.basis,
  };
}

/**
 * The readings still in play: not filed, not one the re-read replaced, and not a later pass's proposal of a page and test whose earlier
 * reading Aksh dropped himself (his drop stays, unticked, so he can change his mind).
 */
export function currentReadings(recs: ReadingRecord[]): ReadingRecord[] {
  return currentRows(
    recs.filter((r) => r.status !== "filed"),
    (r) => ({ key: `${r.pageNo}:${r.testId}`, pass: r.pass, status: r.status, superseded: r.superseded }),
  );
}

/**
 * The readings the list shows and filing files: the same basis rule as the figures (review-values.ts basisRepeats). A reading printed on
 * the other basis from the document's is a repeat, and left out, when the preferred basis has a reading of the same test and period.
 */
function listed(recs: ReadingRecord[], preferred: Basis): ReadingRecord[] {
  const current = currentReadings(recs);
  const basisOf = (r: ReadingRecord) => {
    const m = machineReadingSchema.safeParse(r.machine);
    return m.success ? { basis: m.data.basis, period: m.data.period } : null;
  };
  const onPreferred = current.flatMap((r) => {
    const b = basisOf(r);
    return b && b.basis === preferred ? [`${r.testId}|${b.period}`] : [];
  });
  return current.filter((r) => {
    const b = basisOf(r);
    return !(b && b.basis !== null && b.basis !== preferred && onPreferred.includes(`${r.testId}|${b.period}`));
  });
}

/** What filing puts under the file: the accepted readings the list shows. */
export const filableReadingIds = (recs: ReadingRecord[], preferred: Basis): string[] => listed(recs, preferred).filter((r) => r.status === "accepted").map((r) => r.id);

/** The listed readings as views, in page then test order. */
export const readingViews = (recs: ReadingRecord[], preferred: Basis): ReadingView[] =>
  listed(recs, preferred)
    .flatMap((r) => toReadingView(r) ?? [])
    .sort((a, b) => a.page - b.page || a.testId.localeCompare(b.testId, "en", { numeric: true }));
