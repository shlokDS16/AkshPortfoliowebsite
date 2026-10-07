// Browser-safe types for documents (migration 0006). No runtime code here.

export type DocumentStatus = "uploading" | "active" | "done" | "skipped";
export type Basis = "consolidated" | "standalone";
export type DocSourceType = "Annual report" | "Presentation" | "Filing" | "Transcript" | "Other";

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
