// Browser-safe types for documents (migration 0006). No runtime code here.
import type { SourceType } from "@/lib/desk-types";

export type DocumentStatus = "uploading" | "active" | "done" | "skipped";
export type Basis = "consolidated" | "standalone";
/** A document's source type: the casefile's, less "Notes" (documents.source_type check, migration 0006). */
export type DocSourceType = Exclude<SourceType, "Notes">;

export type DocumentRow = {
  id: string;
  companyId: string | null;
  title: string;
  kind: "pdf";
  storagePath: string | null;
  sha256: string;
  bytes: number;
  pageCount: number | null;
  status: DocumentStatus;
  llmPageBudget: number;
  basis: Basis;
  sourceType: DocSourceType;
  filedOn: string | null;
  sourceUrl: string | null;
  originalDeletedAt: string | null;
  createdAt: string;
};

/** What the document pane's picker needs of a document. */
export type DocumentListItem = Pick<DocumentRow, "id" | "title" | "pageCount" | "filedOn" | "sourceUrl" | "sourceType">;

export type PageKind = "pl" | "bs" | "cf" | "notes" | "segment" | "mdna" | "other";

export type PageRow = {
  documentId: string;
  pageNo: number;
  text: string;
  charCount: number;
  isScan: boolean;
  kind: PageKind | null;
  basis: Basis | null;
  score: number;
  selected: boolean;
  selectedBy: "rule" | "aksh" | null;
};

/** One page's text as pdf_text writes it. */
export type PageText = { pageNo: number; text: string };
/** What select_pages and extract_page read of a page. */
export type PageForReading = { pageNo: number; text: string; isScan: boolean };

/** What the browser claims about a file before it uploads it. Every field is checked on the server. */
export type StartUploadInput = {
  fileName: string;
  bytes: number;
  mime: string;
  sha256: string;
  companyId: string | null;
  filedOn: string | null;
  sourceUrl: string | null;
};
