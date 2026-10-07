import type { TestCounts, TestStatus } from "./desk-types";

export function countStatuses(statuses: readonly TestStatus[]): TestCounts {
  const counts: TestCounts = { met: 0, watching: 0, not_met: 0, no_data: 0 };
  for (const s of statuses) counts[s] += 1;
  return counts;
}

/** design-dna 14: summaries carry an aria-label in the fixed order Met, Watching, Not met, No data. */
export function statusSummaryLabel(c: TestCounts): string {
  return `${c.met} met, ${c.watching} watching, ${c.not_met} not met, ${c.no_data} no data`;
}

export function totalTests(c: TestCounts): number {
  return c.met + c.watching + c.not_met + c.no_data;
}
