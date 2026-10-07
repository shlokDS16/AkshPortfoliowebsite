import { createHash } from "node:crypto";
import { closePdf, openPdf, pageText, PdfOpenError, type PageText, type PdfDoc } from "@/modules/documents";
import { MAX_PDF_PAGES, PDF_TEXT_BATCH, PDF_TEXT_MS } from "../caps";
import type { StepHandler, StepOutcome } from "../types";

// pdf_text (spec s6.3, ADR-004 s4.4): one download, pages read one by one until 180 s, then the step enqueues itself
// from the next page. Every write is idempotent, so a duplicate or reclaimed step is harmless.

export const PDF_NOT_OPENED = "This PDF could not be opened (it may be password-protected or damaged).";
export const PDF_WRONG_FILE = "The stored file is not the PDF that was uploaded. Upload it again.";
export const PDF_TOO_LONG = "This PDF has more than 5,000 pages. Upload the financial statements section on its own.";
export const PDF_NOT_STORED = "The original PDF is no longer stored, so its pages cannot be read. Upload it again, or skip this document.";

/** Kept free before the drain deadline for the batch write and the step's finish. */
const WRITE_MARGIN_MS = 20_000;
const PDF_MAGIC = "%PDF-";

const attention = (error: string): StepOutcome => ({ kind: "attention", error });
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const startsLikePdf = (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, PDF_MAGIC.length)).toString("latin1") === PDF_MAGIC;

/** A page pdf.js cannot read is stored empty (a scan page, for OCR in Plan 2b) instead of halting the document. */
async function readPage(pdf: PdfDoc, pageNo: number): Promise<string> {
  try {
    return await pageText(pdf, pageNo);
  } catch {
    return "";
  }
}

export const pdfText: StepHandler = async ({ step, documentId, deadline, deps }) => {
  const documents = deps.repos.documents;
  const start = deps.clock();
  const doc = await documents.get(documentId);
  // "Done with this document" deletes the original but keeps storage_path, so original_deleted_at is checked too.
  if (!doc?.storagePath || doc.originalDeletedAt) return attention(PDF_NOT_STORED);

  let bytes: Uint8Array;
  try {
    bytes = await documents.download(doc.storagePath);
  } catch {
    return attention(PDF_NOT_STORED); // a plain sentence on the card, never "documents.download (no code)"
  }
  // The server never saw the upload's bytes: the hash and type the browser claimed are checked here, before parsing.
  if (sha256(bytes) !== doc.sha256 || !startsLikePdf(bytes)) return attention(PDF_WRONG_FILE);

  let pdf: PdfDoc;
  try {
    pdf = await openPdf(bytes);
  } catch (error) {
    if (error instanceof PdfOpenError) return attention(PDF_NOT_OPENED);
    throw error;
  }
  try {
    const total = pdf.numPages;
    if (total > MAX_PDF_PAGES) return attention(PDF_TOO_LONG);
    if (doc.pageCount !== total) await documents.setPageCount(documentId, total);

    const from = step.pageNo ?? 1;
    if (from > total) return { kind: "done", result: { from, through: total }, enqueue: [{ kind: "select_pages", pageNo: null }] };
    const stopAt = Math.min(deadline - WRITE_MARGIN_MS, start + PDF_TEXT_MS);
    let batch: PageText[] = [];
    let next = from;
    // At least one page per step, so the step it enqueues is always a later page (job_steps_once would drop a repeat).
    do {
      batch.push({ pageNo: next, text: await readPage(pdf, next) });
      next += 1;
      if (batch.length === PDF_TEXT_BATCH) {
        await documents.insertPages(documentId, batch);
        batch = [];
      }
    } while (next <= total && deps.clock() < stopAt);
    await documents.insertPages(documentId, batch);

    const result = { from, through: next - 1 };
    if (next <= total) return { kind: "done", result, enqueue: [{ kind: "pdf_text", pageNo: next }] };
    return { kind: "done", result, enqueue: [{ kind: "select_pages", pageNo: null }] };
  } finally {
    await closePdf(pdf);
  }
};
