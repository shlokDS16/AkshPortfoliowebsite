import type { LlmPort } from "@/lib/providers/llm";
import type { Db } from "@/lib/supabase/types";
import type { DocumentsRepo } from "@/modules/documents";
import type { UsageRepo } from "./usage-repo";

/**
 * What job code may do to documents (ADR-004 s4.2). Never `update`: documents.status 'done' and 'skipped' are
 * Aksh's alone, and the secret-key client could otherwise set them (migration 0006 grants it the column).
 * setPageCount writes only documents.page_count.
 */
export type MachineDocumentsRepo = Pick<
  DocumentsRepo,
  "get" | "download" | "insertPages" | "setPageCount" | "listPagesForSelection" | "setVerdicts" | "setSelection" | "getPage"
>;

/** Every repo a step handler uses, built once by src/modules/ops/drain.ts (ruling R7). Tests pass fakes. */
export type MachineRepos = { documents: MachineDocumentsRepo; usage: UsageRepo };

export type DrainDeps = {
  /** The secret-key client ops hands the runner; the queue repo is built on it. Handlers use `repos`. */
  db: Db;
  llm: LlmPort | null;
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
  };
}
