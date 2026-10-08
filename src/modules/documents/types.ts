// Browser-safe types for documents (migration 0006). No runtime code here.
import type { SourceType } from "@/lib/desk-types";
import type { DocumentKind, UploadKind } from "./kinds";

export type DocumentStatus = "uploading" | "active" | "done" | "skipped";
export type Basis = "consolidated" | "standalone";
/** A document's source type: the casefile's, less "Notes" (documents.source_type check, migration 0006). */
export type DocSourceType = Exclude<SourceType, "Notes">;

export type DocumentRow = {
  id: string;
  companyId: string | null;
  title: string;
  kind: DocumentKind;
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
export type DocumentListItem = Pick<DocumentRow, "id" | "title" | "pageCount" | "filedOn" | "sourceUrl" | "sourceType" | "originalDeletedAt">;

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
  /** True once the text came from OCR (migration 0008). */
  ocr: boolean;
};

/** One page's text as pdf_text writes it. */
export type PageText = { pageNo: number; text: string };
/** What select_pages and extract_page read of a page. */
export type PageForReading = { pageNo: number; text: string; isScan: boolean };
/**
 * What extract_page and ocr_page read of one page: its text, the selector's verdict (null when the rule never classed it),
 * whether the text came from OCR, and whether (and by whom) the page is ticked.
 */
export type PageForExtraction = PageForReading & {
  kind: PageKind | null;
  basis: Basis | null;
  ocr: boolean;
  selected: boolean;
  selectedBy: "rule" | "aksh" | null;
};

/** What the browser claims about a file before it uploads it. Every field is checked on the server. */
export type StartUploadInput = {
  /** What the file is: a PDF, or a photo the browser has already shrunk. */
  kind: UploadKind;
  fileName: string;
  bytes: number;
  mime: string;
  sha256: string;
  companyId: string | null;
  filedOn: string | null;
  sourceUrl: string | null;
};
