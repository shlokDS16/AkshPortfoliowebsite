import { EXTRACT_MAX_COMPLETION, MAX_PROPOSALS_PER_DOCUMENT, OCR_OFF_RETRY_MS, PAGE_CHAR_LIMIT, SHORT_WAIT_MS } from "../caps";
import { llmTimeoutMs } from "../deadline";
import { callWithinBudget, estimateTokens } from "../governor";
import { extractionSchema, PROMPT_VERSION, retryPrompt, SYSTEM_PROMPT, userPrompt, type Extraction } from "../prompts";
import { OCR_NOTHING_READ, SCAN_READING_OFF } from "../ocr-copy";
import { stepsForPage } from "../page-steps";
import type { StepHandler, StepOutcome } from "../types";
import { ISSUES_MAX, PAGE_NOT_STORED, PAGE_TOO_BIG, rejection, saveExtraction, sha256 } from "./extraction-shared";

// extract_page (spec s6.4, ADR-004 s4.4): one statement page, one call. The machine writes an extraction and pending
// proposals and nothing else; period and unit come from the printed headings in code (E3); every value and quote is
// checked against the stored page text (saveExtraction). Every write is idempotent, so a duplicate step is harmless.

export { KEY_REFUSED, PAGE_NOT_STORED, PAGE_TOO_BIG, REQUEST_REFUSED } from "./extraction-shared";
/** A scan with no scan reader to send it to (ruling R6: no OCRSPACE_API_KEY). With a reader the page is routed to ocr_page instead. */
export const SCAN_PAGE = SCAN_READING_OFF;
/** How long a step waits when AI reading is off; turning it on (a key, then a redeploy) does not need the step to be touched. */
const AI_OFF_RETRY_MS = OCR_OFF_RETRY_MS;

export const extractPage: StepHandler = async (ctx) => {
  const { step, documentId, deadline, deps } = ctx;
  const { documents, proposals, usage } = deps.repos;
  const llm = deps.llm;
  const attention = (error: string): StepOutcome => ({ kind: "attention", error });
  if (!llm) return { kind: "defer", notBefore: new Date(deps.now().getTime() + AI_OFF_RETRY_MS), reason: "ai_off" };
  if (step.pageNo === null) return attention(PAGE_NOT_STORED);
  const pageNo = step.pageNo;

  const [doc, page] = await Promise.all([documents.get(documentId), documents.getPage(documentId, pageNo)]);
  if (!doc || !page) return attention(PAGE_NOT_STORED);
  if (page.isScan || page.text.trim() === "") {
    // Read by the scan reader already and nothing there; or no reader; else this step was queued before the page was routed.
    if (page.ocr) return attention(OCR_NOTHING_READ);
    if (!deps.ocr) return attention(SCAN_PAGE);
    return { kind: "done", result: { scan: true }, enqueue: [stepsForPage({ pageNo, isScan: true, kind: page.kind })] };
  }

  const have = await proposals.countForDocument(documentId);
  if (have >= MAX_PROPOSALS_PER_DOCUMENT) return { kind: "done", result: { proposals: 0, capped: true } };

  const text = page.text.slice(0, PAGE_CHAR_LIMIT);
  const truncated = page.text.length > PAGE_CHAR_LIMIT;
  const inputHash = sha256(text);
  const model = deps.models.text;

  let extraction: Extraction;
  let tokens = 0;
  let cached = false;
  const stored = await proposals.findCachedExtraction(inputHash, model, PROMPT_VERSION);
  const reuse = stored ? extractionSchema.safeParse(stored.output) : null;
  if (reuse?.success) {
    extraction = reuse.data;
    cached = true;
  } else {
    const timeoutMs = llmTimeoutMs(deadline, deps.clock);
    if (timeoutMs === null) return { kind: "defer", notBefore: new Date(deps.now().getTime() + SHORT_WAIT_MS), reason: "groq_minute" };

    // A second attempt names what was wrong with the first (ADR-004 s4.5).
    const system = step.schemaFailures > 0 && step.lastError ? retryPrompt(step.lastError) : SYSTEM_PROMPT;
    const user = userPrompt(pageNo, text);
    const budget = await callWithinBudget({ usage, now: deps.now }, model, estimateTokens(system, user, EXTRACT_MAX_COMPLETION), () =>
      llm.complete({
        model, system, user, schema: extractionSchema, schemaName: "page_extraction",
        maxCompletionTokens: EXTRACT_MAX_COMPLETION, reasoningEffort: "low", timeoutMs,
      }),
    );
    if (budget.kind === "deferred") return { kind: "defer", notBefore: budget.notBefore, reason: budget.reason };
    if (budget.kind === "too_large") return attention(PAGE_TOO_BIG);

    const result = budget.result;
    if (result.kind === "invalid") return { kind: "retry", failure: "schema", error: result.issues.join("; ").slice(0, ISSUES_MAX) };
    if (result.kind === "provider_error") return { kind: "retry", failure: "provider", error: `${result.status ?? "network"} ${result.message}`.slice(0, ISSUES_MAX) };
    if (result.kind === "rejected") return attention(rejection(result.status, result.message));
    if (result.kind !== "ok") return { kind: "retry", failure: "provider", error: "unexpected answer" };
    extraction = result.data;
    tokens = result.usage.totalTokens;
  }

  const saved = await saveExtraction(ctx, doc, page, { extraction, pageNo, pageText: text, model, promptVersion: PROMPT_VERSION, inputHash, tokens, have });
  return {
    kind: "done",
    result: { proposals: saved.built, flagged: saved.flagged, tokens, ...(cached ? { cached } : {}), ...(truncated ? { truncated } : {}) },
  };
};
