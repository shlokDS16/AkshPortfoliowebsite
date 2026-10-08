import { classifyPages, PdfSplitError, splitPdfPage } from "@/modules/documents";
import { OCR_BLOCK_FALLBACK_MS, OCR_BUCKET, OCR_CAPS, OCR_KEY_REFUSALS, OCR_MAX_BYTES, OCR_TIMEOUT_MS } from "../caps";
import { llmTimeoutMs } from "../deadline";
import { callWithinUnits } from "../governor";
import { OCR_KEY_REFUSED, OCR_NOTHING_READ, OCR_PAGE_REFUSED, OCR_TOO_BIG } from "../ocr-copy";
import { stepsForPage } from "../page-steps";
import type { StepContext, StepHandler, StepOutcome } from "../types";
import { PAGE_NOT_STORED } from "./extract-page";
import { PDF_NOT_STORED } from "./pdf-text";

// ocr_page (spec s6.3 / ruling R6, Plan 2b Task 2): one scanned PDF page. It reserves one OCR request in the unit ledger,
// splits the page out of the stored PDF, reads it with the scan reader and writes the text over the scan page (the database
// allows that once, while the page has under 50 characters). The page then flows on like a digital one: it classifies
// itself and, when it was ticked or is a statement page with room in the budget, queues its figure reading.
// A refusal is a wait or a sentence for Aksh, never a failure count. Every write is idempotent.

/** How long a step waits when scan reading is off; a key and a redeploy do not need the step to be touched. */
const OCR_OFF_RETRY_MS = 6 * 60 * 60 * 1000;
/** A step that finds under 20 s left tries again almost at once (no failure is counted); groq_minute reads as a short wait. */
const SHORT_WAIT_MS = 5_000;
const NO_RATE = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };
const READABLE_CHARS = 50; // document_pages.is_scan: under 50 characters is a scan
const attention = (error: string): StepOutcome => ({ kind: "attention", error });

type Docs = StepContext["deps"]["repos"]["documents"];
type Doc = NonNullable<Awaited<ReturnType<Docs["get"]>>>;
type PageNow = NonNullable<Awaited<ReturnType<Docs["getPage"]>>>;

/** The scan reader said the daily allowance is spent (or its IP is): hold the bucket, or read it as a key problem on the third time. */
async function dayRefusal(ctx: StepContext): Promise<StepOutcome> {
  const { usage } = ctx.deps.repos;
  const now = ctx.deps.now();
  const [totals, refusals] = await Promise.all([usage.totals(OCR_BUCKET), usage.refusalsSinceUse(OCR_BUCKET)]);
  // The answer cannot always tell a quota from a bad key. Our own ledger under its cap, and the third refusal in a row: say the key.
  if (totals.today < OCR_CAPS.day && refusals + 1 >= OCR_KEY_REFUSALS) return attention(OCR_KEY_REFUSED);
  const reset = await usage.earliestReset(OCR_BUCKET);
  const notBefore = reset && reset.getTime() > now.getTime() ? reset : new Date(now.getTime() + OCR_BLOCK_FALLBACK_MS);
  await usage.block(OCR_BUCKET, "rate_limited", notBefore, "ocr_day", NO_RATE);
  return { kind: "defer", notBefore, reason: "ocr_day" };
}

/** The text is in the page now: classify it, and queue the figure reading when the page is wanted. */
async function afterRead(ctx: StepContext, doc: Doc, page: PageNow, text: string): Promise<StepOutcome> {
  const { documents } = ctx.deps.repos;
  const pageNo = page.pageNo;
  const chars = text.trim().length;
  if (chars < READABLE_CHARS) {
    // Aksh asked for this page, so silence would be wrong; a blank page of an automatic read is simply done.
    return page.selected ? attention(OCR_NOTHING_READ) : { kind: "done", result: { chars, empty: true } };
  }
  const before = pageNo > 1 ? await documents.getPage(doc.id, pageNo - 1) : null;
  const run = [...(before ? [{ pageNo: before.pageNo, text: before.text, isScan: before.isScan }] : []), { pageNo, text, isScan: false }];
  const verdict = classifyPages(run).find((v) => v.pageNo === pageNo);
  if (verdict && verdict.kind !== "other") await documents.setVerdicts(doc.id, [verdict]);

  const result = { chars, ocr: true as const };
  if (ctx.deps.llm === null) return { kind: "done", result: { ...result, aiOff: true } };
  const next = stepsForPage({ pageNo, isScan: false, kind: verdict?.kind ?? null });
  if (page.selected) return { kind: "done", result, enqueue: [next] };

  // A statement page that Aksh did not tick is taken only when the document's page budget has room (and never one he unticked).
  if (verdict && verdict.kind !== "other" && verdict.score > 0 && (await documents.countSelected(doc.id)) < doc.llmPageBudget) {
    const taken = await documents.setSelection(doc.id, [pageNo], "rule");
    if (taken.includes(pageNo)) return { kind: "done", result: { ...result, selected: true }, enqueue: [next] };
  }
  return { kind: "done", result };
}

export const ocrPage: StepHandler = async (ctx) => {
  const { step, documentId, deadline, deps } = ctx;
  const { documents, usage } = deps.repos;
  const ocr = deps.ocr;
  if (!ocr) return { kind: "defer", notBefore: new Date(deps.now().getTime() + OCR_OFF_RETRY_MS), reason: "ocr_off" };
  if (step.pageNo === null) return attention(PAGE_NOT_STORED);
  const pageNo = step.pageNo;

  const [doc, page] = await Promise.all([documents.get(documentId), documents.getPage(documentId, pageNo)]);
  if (!doc || !page) return attention(PAGE_NOT_STORED);

  // Read before (a rerun), never a scan, or read and still nothing there: no request is made.
  if (!page.isScan || page.ocr) return afterRead(ctx, doc, page, page.text);
  if (!doc.storagePath || doc.originalDeletedAt) return attention(PDF_NOT_STORED);

  const left = llmTimeoutMs(deadline, deps.clock);
  if (left === null) return { kind: "defer", notBefore: new Date(deps.now().getTime() + SHORT_WAIT_MS), reason: "groq_minute" };
  const timeoutMs = Math.min(OCR_TIMEOUT_MS, left);

  // A storage failure throws: the runner retries the step (1 and 2 minutes) before any sentence.
  const original = await documents.download(doc.storagePath);
  let one: Uint8Array;
  try {
    one = await splitPdfPage(original, pageNo);
  } catch (error) {
    if (error instanceof PdfSplitError) return attention(OCR_PAGE_REFUSED);
    throw error;
  }
  // Over the free reader's limit: nothing is reserved, nothing is sent.
  if (one.byteLength > OCR_MAX_BYTES) return attention(OCR_TOO_BIG);

  const budget = await callWithinUnits({ usage, now: deps.now }, OCR_BUCKET, 1, { day: OCR_CAPS.day }, async () => {
    const result = await ocr.read({ bytes: one, filetype: "PDF" }, { table: true, timeoutMs });
    return { result, spent: result.kind === "ok" };
  });
  if (budget.kind === "deferred") return { kind: "defer", notBefore: budget.notBefore, reason: budget.reason };

  const read = budget.result;
  if (read.kind === "provider_error") return { kind: "retry", failure: "provider", error: read.message.slice(0, 400) };
  if (read.kind === "refused") {
    if (read.reason === "size") return attention(OCR_TOO_BIG);
    if (read.reason === "pages") return attention(OCR_PAGE_REFUSED);
    if (read.reason === "key") return attention(OCR_KEY_REFUSED);
    return dayRefusal(ctx);
  }
  await documents.fillScanPage(documentId, pageNo, read.text);
  return afterRead(ctx, doc, { ...page, text: read.text, isScan: read.text.trim().length < READABLE_CHARS, ocr: true }, read.text);
};
