import { PDFDocument } from "@cantoo/pdf-lib";

// One page of a PDF as a PDF of its own (Plan 2b Task 2): OCR.space's free tier takes 1 MB and 3 pages a request, so a
// scanned report goes through one page at a time. @cantoo/pdf-lib is the maintained fork of pdf-lib (spec s9 / task report).

/** The bytes are not a PDF this library can open (damaged or encrypted), or the page is not in it. */
export class PdfSplitError extends Error {
  constructor() {
    super("The PDF page could not be split out.");
    this.name = "PdfSplitError";
  }
}

export async function splitPdfPage(bytes: Uint8Array, pageNo: number): Promise<Uint8Array> {
  try {
    const source = await PDFDocument.load(bytes, { updateMetadata: false });
    if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > source.getPageCount()) throw new PdfSplitError();
    const target = await PDFDocument.create();
    const [page] = await target.copyPages(source, [pageNo - 1]);
    target.addPage(page);
    return await target.save({ useObjectStreams: false });
  } catch (error) {
    throw error instanceof PdfSplitError ? error : new PdfSplitError();
  }
}
