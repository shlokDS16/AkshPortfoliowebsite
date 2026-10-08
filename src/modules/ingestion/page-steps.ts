import type { PageKind } from "@/modules/documents/client";
import { OCR_WHOLE_SHARE } from "./caps";
import type { NewStep, StepKind } from "./types";

// Which step reads a page (ruling R6). One pure function, used by select_pages, Aksh's tick, "Read the ticked pages" and the
// page that ocr_page has just filled, so a scan never reaches extract_page and no path forgets scans. No clock, no I/O.

/**
 * The steps that belong to one page of a document: the trays, the ETA and the Needs-attention page list count these
 * (ruling R13). digest_page (Task 7) joins when it exists.
 */
export const PAGE_STEP_KINDS: readonly StepKind[] = ["extract_page", "ocr_page", "vision_page"];

export type PageFacts = { pageNo: number; isScan: boolean; kind: PageKind | null };

/** A scan goes to the scan reader first; every other page is read for figures (Task 7 sends management-discussion pages to a digest). */
export function stepsForPage(page: PageFacts): NewStep {
  if (page.isScan) return { kind: "ocr_page", pageNo: page.pageNo };
  return { kind: "extract_page", pageNo: page.pageNo };
}

/** A scanned document: at least this share of its pages are scans, and the tray says how many (ticking is offered for any scan page). */
export const isScanHeavy = (scans: number, total: number | null): boolean => scans > 0 && total !== null && total > 0 && scans / total >= OCR_WHOLE_SHARE;

/**
 * A document where at least 80% of the pages are scans, and the scans fit the document's AI page budget, is scanned whole
 * (ruling R6; Shlok's threshold: the budget). A larger scanned document waits for Aksh to tick the pages.
 */
export function readsScansWhole(scans: number, total: number, budget: number): boolean {
  return scans > 0 && total > 0 && scans / total >= OCR_WHOLE_SHARE && scans <= budget;
}
