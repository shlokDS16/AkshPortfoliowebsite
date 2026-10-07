import { getDocumentProxy } from "unpdf";

// Page text from a PDF with unpdf (pdf.js, serverless build; text only, no canvas). Spec s6.3, ADR-004 s4.4.

export type PdfDoc = Awaited<ReturnType<typeof getDocumentProxy>>;

/** The PDF is encrypted, damaged or not a PDF at all. */
export class PdfOpenError extends Error {
  constructor() {
    super("The PDF could not be opened.");
    this.name = "PdfOpenError";
  }
}

/** Opens a PDF. pdf.js takes ownership of the buffer it is given, so it gets a copy and the caller's bytes stay usable. */
export async function openPdf(bytes: Uint8Array): Promise<PdfDoc> {
  try {
    return await getDocumentProxy(bytes.slice(), { verbosity: 0 });
  } catch {
    throw new PdfOpenError();
  }
}

/** Releases what pdf.js holds for the document. Never throws: a failed clean-up must not fail the step. */
export async function closePdf(pdf: PdfDoc): Promise<void> {
  await pdf.loadingTask.destroy().catch(() => undefined);
}

/**
 * One page's text: items joined with a line break where pdf.js marks one, else a space. NUL is removed (Postgres text
 * cannot hold it), runs of spaces collapse, lines are trimmed and blank runs shortened.
 */
export async function pageText(pdf: PdfDoc, pageNo: number): Promise<string> {
  const page = await pdf.getPage(pageNo);
  try {
    const content = await page.getTextContent();
    const joined = content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join("");
    return joined
      .replace(/\u0000/g, "")
      .replace(/[^\S\n]+/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } finally {
    page.cleanup();
  }
}
