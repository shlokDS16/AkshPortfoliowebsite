// Server-side entry. Client code imports limits, types and hashFile from "./client" instead.
import "server-only";

export type { Basis, DocSourceType, DocumentListItem, DocumentRow, DocumentStatus, PageForExtraction, PageForReading, PageKind, PageRow, PageText, StartUploadInput, TranscriptStatus } from "./types";
export * from "./limits";
export * from "./kinds";
export { DOCUMENT_ERROR_TEXT, DocumentError, type DocumentErrorCode } from "./errors";
export { createSupabaseDocumentsRepo, type DocumentPatch, type DocumentsRepo } from "./repo";
export { finishUpload, startUpload, startUploadInputSchema, titleFromFileName, type StartUploadOptions } from "./upload";
export { storeDocument, type StoreInput } from "./store";
export { safeFetch, type FetchedLink, type SafeFetchDeps } from "./safe-fetch";
export { createLinkFetchDeps, type LinkFetchEnv } from "./fixture-link";
export { htmlToText } from "./html-text";
export { closePdf, openPdf, pageText, PdfOpenError, type PdfDoc } from "./pages";
export { PdfSplitError, splitPdfPage } from "./split";
export { classifyPages, doubtfulPages, modelVerdict, selectPages, selectTextPages, type PageVerdict } from "./selector";
export { pageTexts } from "./read";
