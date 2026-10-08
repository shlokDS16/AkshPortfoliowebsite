import type { LlmPort } from "@/lib/providers/llm";
import type { OcrPort } from "@/lib/providers/ocr";
import type { Db } from "@/lib/supabase/types";
import type { DocumentsRepo } from "@/modules/documents";
import type { ProposalsRepo } from "./proposals-repo";
import type { UsageRepo } from "./usage-repo";

/**
 * What job code may do to documents (ADR-004 s4.2). Never `update`: documents.status 'done' and 'skipped' are
 * Aksh's alone, and the secret-key client could otherwise set them (migration 0006 grants it the column).
 * setPageCount writes only documents.page_count.
 */
export type MachineDocumentsRepo = Pick<
  DocumentsRepo,
  "get" | "download" | "insertPages" | "setPageCount" | "listPagesForSelection" | "setVerdicts" | "setSelection" | "getPage" | "countSelected" | "fillScanPage"
>;

/** What job code may read of Aksh's research (E5): the labels of his newest file for a company, never his words. */
export type MachineResearch = {
  latestFileForCompany(companyId: string): Promise<{ itemId: string; title: string; structured: unknown } | null>;
};

/** Every repo a step handler uses, built once by src/modules/ops/drain.ts (ruling R7). Tests pass fakes. */
export type MachineRepos = { documents: MachineDocumentsRepo; usage: UsageRepo; proposals: ProposalsRepo; research: MachineResearch };

export type DrainDeps = {
  /** The secret-key client ops hands the runner; the queue repo is built on it. Handlers use `repos`. */
  db: Db;
  llm: LlmPort | null;
  /** The scan reader, or null when scan reading is off (no OCRSPACE_API_KEY): ocr_page steps then wait. */
  ocr: OcrPort | null;
  models: { text: string };
  repos: MachineRepos;
  now: () => Date;
  clock: () => number;
};

/** What a step handler gets: the drain's deps without the client (ruling R7, enforced by the compiler and the graph test). */
export type StepDeps = Omit<DrainDeps, "db">;

/** Narrows a full documents repo to the machine's surface: the methods are copied, so `update` cannot leak. */
export function machineDocuments(repo: DocumentsRepo): MachineDocumentsRepo {
  return {
    get: (id) => repo.get(id),
    download: (path) => repo.download(path),
    insertPages: (documentId, pages) => repo.insertPages(documentId, pages),
    setPageCount: (documentId, pageCount) => repo.setPageCount(documentId, pageCount),
    listPagesForSelection: (documentId) => repo.listPagesForSelection(documentId),
    setVerdicts: (documentId, verdicts) => repo.setVerdicts(documentId, verdicts),
    setSelection: (documentId, pageNos, by) => repo.setSelection(documentId, pageNos, by),
    getPage: (documentId, pageNo) => repo.getPage(documentId, pageNo),
    countSelected: (documentId) => repo.countSelected(documentId),
    fillScanPage: (documentId, pageNo, text) => repo.fillScanPage(documentId, pageNo, text),
  };
}
