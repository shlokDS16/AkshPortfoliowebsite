import { describe, expect, it } from "vitest";
import { fixturePdfBytes } from "@/test/fixtures/pdf";
import { closePdf, openPdf, pageText } from "./pages";
import { PdfSplitError, splitPdfPage } from "./split";

async function textsOf(bytes: Uint8Array): Promise<string[]> {
  const pdf = await openPdf(bytes);
  try {
    const out: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) out.push(await pageText(pdf, n));
    return out;
  } finally {
    await closePdf(pdf);
  }
}

describe("splitPdfPage", () => {
  it("returns the one page as its own PDF, with that page's text", async () => {
    const one = await splitPdfPage(fixturePdfBytes(), 4);
    expect(Buffer.from(one.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    const texts = await textsOf(one);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("Revenue from operations 1,284.00 1,102.00");
  });

  it("does not touch the bytes it is given", async () => {
    const source = fixturePdfBytes();
    const copy = source.slice();
    await splitPdfPage(source, 1);
    expect(source).toEqual(copy);
  });

  it("refuses a page that is not in the document", async () => {
    await expect(splitPdfPage(fixturePdfBytes(), 7)).rejects.toBeInstanceOf(PdfSplitError);
    await expect(splitPdfPage(fixturePdfBytes(), 0)).rejects.toBeInstanceOf(PdfSplitError);
  });

  it("refuses bytes that are not a PDF", async () => {
    await expect(splitPdfPage(new TextEncoder().encode("not a pdf"), 1)).rejects.toBeInstanceOf(PdfSplitError);
  });
});
