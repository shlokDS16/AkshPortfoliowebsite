import { z } from "zod";
import { MAX_PAGE_NO, normaliseText } from "@/modules/documents/client";
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
  unit: z.string().trim().min(1).max(12),
  label: z.string().trim().min(1).max(80),
  period: z.string().trim().min(1).max(10),
  valueText: z.string().trim().min(1).max(60),
  quote: z.string().trim().max(600),
  page: z.number().int().min(1).max(MAX_PAGE_NO),
});
export type MachineReading = z.infer<typeof machineReadingSchema>;

/** The part of a test the match needs: its metric (null when Aksh has not chosen one) and its unit. */
export type ReadingTest = { id: string; metric: string | null; unit: string };
export type NewReading = { testId: string; machine: MachineReading };

const sameUnit = (a: string | null, b: string) => a !== null && normaliseText(a) !== "" && normaliseText(a) === normaliseText(b);

/**
 * One reading per test for this page: the first figure (they arrive best first) whose label is the test's metric, whose unit is the
 * test's unit, that carries no flag and whose date the headings gave. A flagged figure is Aksh's to resolve first; it proposes no reading.
 */
export function buildReadings(built: NewProposal[], tests: ReadingTest[]): NewReading[] {
  const out: NewReading[] = [];
  for (const test of tests) {
    if (!test.metric) continue;
    const metric = normaliseLabel(test.metric);
    const hit = built.find((p) => {
      const f = p.machineValue;
      return p.flags.length === 0 && f.asOf !== null && f.period !== null && normaliseLabel(f.label) === metric && sameUnit(f.unit, test.unit);
    });
    if (!hit) continue;
    const f = hit.machineValue;
    const machine: MachineReading = {
      current: f.value, readingAsOf: f.asOf as string, prior: f.prior?.value ?? null, unit: (f.unit as string).trim(),
      label: f.label, period: f.period as string, valueText: f.valueText, quote: f.quote, page: f.page,
    };
    if (machineReadingSchema.safeParse(machine).success) out.push({ testId: test.id, machine });
  }
  return out;
}
