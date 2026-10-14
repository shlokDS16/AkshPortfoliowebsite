import { z } from "zod";
import { MAX_PAGE_NO, normaliseText, type Basis } from "@/modules/documents/client";
import { READING_LIMITS } from "./caps";
import type { NewProposal } from "./proposals";
import { normaliseLabel } from "./relevance";

// Reading proposals (Plan 2b Task 8, ruling R4): when a figure the page printed carries the label a test watches ("Metric to watch"),
// in the unit the test uses, the machine also proposes that test's reading. A reading sets only the test's current value, its date and
// its prior; it is never a status, a threshold or a word of Aksh's. Browser-safe and pure; the table is reading_proposals.

const num = z.number().finite();

/** What the machine read for a test. `label`, `period`, `valueText`, `quote` and `page` are there so Aksh can check it against the page. */
export const machineReadingSchema = z.strictObject({
  current: num,
  readingAsOf: z.iso.date(),
  prior: num.nullable(),
  unit: z.string().trim().min(1).max(READING_LIMITS.unit),
  label: z.string().trim().min(1).max(READING_LIMITS.label),
  period: z.string().trim().min(1).max(READING_LIMITS.period),
  valueText: z.string().trim().min(1).max(READING_LIMITS.valueText),
  quote: z.string().trim().max(READING_LIMITS.quote),
  page: z.number().int().min(1).max(MAX_PAGE_NO),
  /** Consolidated or standalone as the page printed it: a standalone repeat of a consolidated line is not listed (review-readings.ts). */
  basis: z.enum(["consolidated", "standalone"]).nullable().default(null),
});
export type MachineReading = z.infer<typeof machineReadingSchema>;

/** The part of a test the match needs: its metric (null when Aksh has not chosen one) and its unit. */
export type ReadingTest = { id: string; metric: string | null; unit: string };
export type NewReading = { testId: string; machine: MachineReading };

const sameUnit = (a: string | null, b: string) => a !== null && normaliseText(a) !== "" && normaliseText(a) === normaliseText(b);

/**
 * One reading per test for this page: the first figure (they arrive best first) whose label is the test's metric, whose unit is the
 * test's unit, that carries no flag and whose date the headings gave. A flagged figure is Aksh's to resolve first; it proposes no reading.
 * A figure on the document's preferred basis wins over a standalone repeat of the same line, as the figures list prefers it.
 */
export function buildReadings(built: NewProposal[], tests: ReadingTest[], preferred: Basis): NewReading[] {
  const out: NewReading[] = [];
  for (const test of tests) {
    if (!test.metric) continue;
    const metric = normaliseLabel(test.metric);
    const matches = built.filter((p) => {
      const f = p.machineValue;
      return p.flags.length === 0 && f.asOf !== null && f.period !== null && normaliseLabel(f.label) === metric && sameUnit(f.unit, test.unit);
    });
    const hit = matches.find((p) => p.machineValue.basis === preferred) ?? matches.find((p) => p.machineValue.basis === null) ?? matches[0];
    if (!hit) continue;
    const f = hit.machineValue;
    const machine: MachineReading = {
      current: f.value, readingAsOf: f.asOf as string, prior: f.prior?.value ?? null, unit: (f.unit as string).trim(),
      label: f.label, period: f.period as string, valueText: f.valueText, quote: f.quote, page: f.page, basis: f.basis,
    };
    if (machineReadingSchema.safeParse(machine).success) out.push({ testId: test.id, machine });
  }
  return out;
}
