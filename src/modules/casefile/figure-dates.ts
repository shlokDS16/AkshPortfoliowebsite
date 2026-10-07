import type { ISODate } from "@/lib/desk-types";
import { fiscalYearEnd } from "./figures";
import { isIsoDate } from "./lag";
import { readCaseFile, type CaseFile } from "./schema";

/**
 * Every date that dates a figure a page could show (publish rule 3a): each fact's as-of date, each test reading's date,
 * and the period end of each exhibit point that carries a value. Reuses the schema and the fiscal-period parser.
 */
export function figureDates(cf: CaseFile): ISODate[] {
  const dates: (string | null)[] = [
    ...cf.facts.map((f) => f.asOf),
    ...cf.tests.map((t) => t.readingAsOf),
    ...cf.exhibits.flatMap((x) => x.points.filter((p) => p.value !== null).map((p) => fiscalYearEnd(p.period))),
  ];
  return dates.filter(isIsoDate);
}

/** The latest figure date in stored structured data, or null when it holds none (or is not a readable case file, as on the public pages). */
export function latestFigureDate(structured: unknown): ISODate | null {
  return figureDates(readCaseFile(structured)).sort().at(-1) ?? null;
}
