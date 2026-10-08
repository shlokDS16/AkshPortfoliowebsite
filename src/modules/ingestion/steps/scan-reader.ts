import type { OcrFiletype } from "@/lib/providers/ocr";
import { OCR_BLOCK_FALLBACK_MS, OCR_BUCKET, OCR_CAPS, OCR_KEY_REFUSALS, OCR_TIMEOUT_MS, SHORT_WAIT_MS } from "../caps";
import { llmTimeoutMs } from "../deadline";
import { callWithinUnits } from "../governor";
import { OCR_KEY_REFUSED, OCR_PAGE_REFUSED, OCR_TOO_BIG } from "../ocr-copy";
import type { StepContext, StepOutcome } from "../types";

// One request to the scan reader, for a scanned PDF page (ocr_page) and a photo alike: reserve one unit in the ledger,
// read, settle. A refusal is a wait or a sentence for Aksh, never a failure count (ruling R9).

const NO_RATE = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };

/** How long the scan reader may be waited on, or the short wait for a step that finds too little time left. */
export function scanTimeout(ctx: StepContext): { timeoutMs: number } | { outcome: StepOutcome } {
  const left = llmTimeoutMs(ctx.deadline, ctx.deps.clock);
  if (left === null) return { outcome: { kind: "defer", notBefore: new Date(ctx.deps.now().getTime() + SHORT_WAIT_MS), reason: "groq_minute" } };
  return { timeoutMs: Math.min(OCR_TIMEOUT_MS, left) };
}

/** The scan reader said the daily allowance is spent (or its IP is): hold the bucket, or read it as a key problem on the third time. */
async function dayRefusal(ctx: StepContext): Promise<StepOutcome> {
  const { usage } = ctx.deps.repos;
  const now = ctx.deps.now();
  const [totals, refusals] = await Promise.all([usage.totals(OCR_BUCKET), usage.refusalsSinceUse(OCR_BUCKET)]);
  // The answer cannot always tell a quota from a bad key. Our own ledger under its cap, and the third refusal in a row: say the key.
  if (totals.today < OCR_CAPS.day && refusals + 1 >= OCR_KEY_REFUSALS) return { kind: "attention", error: OCR_KEY_REFUSED };
  const reset = await usage.earliestReset(OCR_BUCKET);
  const notBefore = reset && reset.getTime() > now.getTime() ? reset : new Date(now.getTime() + OCR_BLOCK_FALLBACK_MS);
  await usage.block(OCR_BUCKET, "rate_limited", notBefore, "ocr_day", NO_RATE);
  return { kind: "defer", notBefore, reason: "ocr_day" };
}

/** The text the scan reader read, or the outcome the step ends with (a wait, a retry or a sentence). */
export async function readWithScanReader(
  ctx: StepContext,
  file: { bytes: Uint8Array; filetype: OcrFiletype },
  timeoutMs: number,
): Promise<{ text: string } | { outcome: StepOutcome }> {
  const { deps } = ctx;
  const ocr = deps.ocr;
  if (!ocr) throw new Error("readWithScanReader needs a scan reader");
  const budget = await callWithinUnits({ usage: deps.repos.usage, now: deps.now }, OCR_BUCKET, 1, { day: OCR_CAPS.day }, async () => {
    const result = await ocr.read(file, { table: true, timeoutMs });
    return { result, spent: result.kind === "ok" };
  });
  if (budget.kind === "deferred") return { outcome: { kind: "defer", notBefore: budget.notBefore, reason: budget.reason } };

  const read = budget.result;
  if (read.kind === "ok") return { text: read.text };
  if (read.kind === "provider_error") return { outcome: { kind: "retry", failure: "provider", error: read.message.slice(0, 400) } };
  if (read.reason === "size") return { outcome: { kind: "attention", error: OCR_TOO_BIG } };
  if (read.reason === "pages") return { outcome: { kind: "attention", error: OCR_PAGE_REFUSED } };
  if (read.reason === "key") return { outcome: { kind: "attention", error: OCR_KEY_REFUSED } };
  return { outcome: await dayRefusal(ctx) };
}
