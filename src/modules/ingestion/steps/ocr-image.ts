import { imageMimeOfPath, type DocumentRow, type ImageMime } from "@/modules/documents";
import type { OcrFiletype } from "@/lib/providers/ocr";
import { OCR_MAX_BYTES } from "../caps";
import { IMAGE_NOT_STORED, OCR_TOO_BIG } from "../ocr-copy";
import type { StepContext, StepOutcome } from "../types";
import { readWithScanReader, scanTimeout } from "./scan-reader";

// ocr_page for a photo or screenshot (Plan 2b Task 3). The photo is one page that does not exist until this step makes it:
// an empty page 1, then the scan reader's text over it. The text is for search and for the check of what the vision step
// reads; it is the honest limit of a photo that the reader may miss figures the vision step sees (they are then flagged
// "value not on the page"). Then vision_page follows, whatever the text says.

const FILETYPE: Record<ImageMime, OcrFiletype> = { "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WEBP" };
const PAGE = 1;
const attention = (error: string): StepOutcome => ({ kind: "attention", error });

export async function ocrImagePage(ctx: StepContext, doc: DocumentRow): Promise<StepOutcome> {
  const { documents } = ctx.deps.repos;
  const mime = doc.storagePath ? imageMimeOfPath(doc.storagePath) : null;
  if (!doc.storagePath || doc.originalDeletedAt || !mime) return attention(IMAGE_NOT_STORED);

  // Both writes are idempotent (insert ... on conflict do nothing; the same count), so a rerun after a lost lease is harmless.
  let page = await documents.getPage(doc.id, PAGE);
  if (!page) {
    await documents.insertPages(doc.id, [{ pageNo: PAGE, text: "" }]);
    await documents.setPageCount(doc.id, 1);
    page = await documents.getPage(doc.id, PAGE);
    if (!page) return attention(IMAGE_NOT_STORED);
  }

  let chars = page.text.trim().length;
  if (!page.ocr) {
    const timeout = scanTimeout(ctx);
    if ("outcome" in timeout) return timeout.outcome;
    // A storage failure throws: the runner retries the step before any sentence.
    const bytes = await documents.download(doc.storagePath);
    if (bytes.byteLength > OCR_MAX_BYTES) return attention(OCR_TOO_BIG);
    const read = await readWithScanReader(ctx, { bytes, filetype: FILETYPE[mime] }, timeout.timeoutMs);
    if ("outcome" in read) return read.outcome;
    await documents.fillScanPage(doc.id, PAGE, read.text);
    chars = read.text.trim().length;
  }

  const result = { chars, ocr: true as const };
  if (ctx.deps.llm === null) return { kind: "done", result: { ...result, aiOff: true } };
  return { kind: "done", result, enqueue: [{ kind: "vision_page", pageNo: PAGE }] };
}
