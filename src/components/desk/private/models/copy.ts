import { formatDate } from "@/lib/format";
import type { BlockReason, Report, VersionStatus } from "@/modules/valuation/client";

// The model page's words (Plan 2.7 Task 3, spec s7 and s8). Plain words, second person; none of the words of spec s7.3 that would read
// as advice (copy.test.ts scans this folder). Machine text (a sheet's label, a function's name) is passed in as data and shown as the
// sheet's; Aksh's own labels are shown as he typed them. Wording the spec did not fix is pending Shlok's approval (Task 3 report).

export const RULE9_LINE = "Private. Scenario outputs from your workbook; never published (rule 9).";
export const CALCULATOR_FAILED = "The calculator did not load. Check the connection and reload. Your saved scenarios are safe.";
export const CALCULATOR_LOADING = "Loading the calculator. The workbook values are shown meanwhile.";
export const FIX_INPUTS_FIRST = "Fix the inputs marked above first.";
export const UPLOAD_FIXED = "Upload a fixed workbook";
export const READING_NOTE = "Reading the workbook. This page shows the model once the read has finished.";

export const HEAD = { workbook: "Workbook value", scenario: "Scenario output", change: "Change" } as const;
export const WORKBOOK_VALUES = "Workbook values";
export const UNSAVED = "Unsaved changes";
export const THIS_SCENARIO = "this scenario";
export const SHEET_MARK = "sheet";
export const NOT_AVAILABLE = "Not available";

const n = (count: number) => count.toLocaleString("en-US");
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;
const notMatching = (r: Report) => r.counts.differs + r.counts.unsupported + r.counts.cycle + r.counts.no_cache + r.counts.random + r.counts.dated;

/** "Model version 3, read 14 Oct 2026 from Kaveri DCF". */
export function versionLine(versionNo: number, readAt: string | null, fileTitle: string | null): string {
  return `Model version ${versionNo}${readAt ? `, read ${formatDate(readAt)}` : ""}${fileTitle ? ` from ${fileTitle}` : ""}`;
}

/** The header's chip: how the desk's recalculation compares with Excel. */
export function reportChip(report: Report): string {
  const off = notMatching(report);
  return off === 0 ? "All formulas match Excel" : `${plural(off, "formula")} ${off === 1 ? "differs" : "differ"} from Excel`;
}

/** Spec s7.2 step 1: "All 1,204 formulas give Excel's answers" or "12 formulas give a different answer from Excel; 3 results depend on them and cannot be chosen". */
export function reportSentence(report: Report, formulaCount: number): string {
  const off = notMatching(report);
  if (off === 0) return `All ${plural(formulaCount, "formula")} give Excel's answers.`;
  const head = `${plural(off, "formula")} ${off === 1 ? "gives" : "give"} a different answer from Excel`;
  if (report.tainted === 0) return `${head}.`;
  return `${head}; ${plural(report.tainted, "result")} ${report.tainted === 1 ? "depends" : "depend"} on ${off === 1 ? "it" : "them"} and cannot be chosen.`;
}

/** Why a cell differs from Excel, or why a result cannot be chosen, in plain words. */
export function reasonText({ cls, fn }: BlockReason): string {
  switch (cls) {
    case "differs":
      return "gives a different answer from Excel";
    case "unsupported":
      return fn ? `uses a function the desk cannot compute yet: ${fn}` : "uses a function the desk cannot compute yet";
    case "cycle":
      return "part of a loop Excel solves by repeating: the desk cannot";
    case "no_cache":
      return "Excel saved no value here, so the desk cannot check it";
    case "random":
      return "uses a random number, so it changes every time";
    case "dated":
      return "uses today's date, so it changes from day to day";
    case "depends":
      return "depends on a cell that gives a different answer from Excel";
  }
}

/** "Use 4 inputs and 2 results". */
export const confirmLabel = (inputs: number, results: number) => `Use ${plural(inputs, "input")} and ${plural(results, "result")}`;
export const usedIn = (versionNo: number) => `used in version ${versionNo}`;
export const sheetSays = (label: string) => `sheet says: ${label}`;
export const newerLine = (versionNo: number) => `Version ${versionNo} exists:`;

export const STATUS_WORD: Record<VersionStatus, string> = {
  reading: "Being read",
  ready: "Choose inputs and results",
  confirmed: "Confirmed",
  refused: "Could not be read",
};
