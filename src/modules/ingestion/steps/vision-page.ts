import { imageMimeOfPath } from "@/modules/documents";
import { EXTRACT_MAX_COMPLETION, IMAGE_TOKENS, MAX_PROPOSALS_PER_DOCUMENT, OCR_OFF_RETRY_MS, PAGE_CHAR_LIMIT, SHORT_WAIT_MS } from "../caps";
import { llmTimeoutMs } from "../deadline";
import { callWithinBudget, estimateTokens } from "../governor";
import { IMAGE_NOT_STORED } from "../ocr-copy";
import { extractionSchema, IMAGE_PROMPT_VERSION, IMAGE_SYSTEM_PROMPT, imageRetryPrompt, imageUserPrompt, type Extraction } from "../prompts";
import type { StepHandler, StepOutcome } from "../types";
import { ISSUES_MAX, PAGE_NOT_STORED, PAGE_TOO_BIG, rejection, saveExtraction, sha256 } from "./extraction-shared";

// vision_page (Plan 2b Task 3, ruling R14): the structure of a photo or screenshot of a table, read by the vision model,
// ONE image per call. The request carries the image and the prompt only; the page text the scan reader found is used
// afterwards, to check every value and quote exactly as for a digital page (saveExtraction). A figure the scan reader
// missed is flagged value_not_on_page, which is the honest outcome for a photo. Every write is idempotent.

/** Reading is off without a key; the step asks again later, as extract_page does. */
const AI_OFF_RETRY_MS = OCR_OFF_RETRY_MS;

export const visionPage: StepHandler = async (ctx) => {
  const { step, documentId, deadline, deps } = ctx;
  const { documents, proposals, usage } = deps.repos;
  const llm = deps.llm;
  const attention = (error: string): StepOutcome => ({ kind: "attention", error });
  if (!llm) return { kind: "defer", notBefore: new Date(deps.now().getTime() + AI_OFF_RETRY_MS), reason: "ai_off" };
  if (step.pageNo === null) return attention(PAGE_NOT_STORED);
  const pageNo = step.pageNo;

  const [doc, page] = await Promise.all([documents.get(documentId), documents.getPage(documentId, pageNo)]);
  if (!doc || !page || doc.kind !== "image") return attention(PAGE_NOT_STORED);
  const mime = doc.storagePath ? imageMimeOfPath(doc.storagePath) : null;
  if (!doc.storagePath || doc.originalDeletedAt || !mime) return attention(IMAGE_NOT_STORED);

  const have = await proposals.countForDocument(documentId);
  if (have >= MAX_PROPOSALS_PER_DOCUMENT) return { kind: "done", result: { proposals: 0, capped: true } };

  // A storage failure throws: the runner retries the step before any sentence.
  const bytes = await documents.download(doc.storagePath);
  const inputHash = sha256(bytes);
  const model = deps.models.vision;

  let extraction: Extraction;
  let tokens = 0;
  let cached = false;
  const stored = await proposals.findCachedExtraction(inputHash, model, IMAGE_PROMPT_VERSION);
  const reuse = stored ? extractionSchema.safeParse(stored.output) : null;
  if (reuse?.success) {
    extraction = reuse.data;
    cached = true;
  } else {
    const timeoutMs = llmTimeoutMs(deadline, deps.clock);
    if (timeoutMs === null) return { kind: "defer", notBefore: new Date(deps.now().getTime() + SHORT_WAIT_MS), reason: "groq_minute" };

    const system = step.schemaFailures > 0 && step.lastError ? imageRetryPrompt(step.lastError) : IMAGE_SYSTEM_PROMPT;
    const user = imageUserPrompt(pageNo);
    // The image counts as IMAGE_TOKENS input tokens whatever its size (spec s9).
    const estimate = estimateTokens(system, user, EXTRACT_MAX_COMPLETION) + IMAGE_TOKENS;
    const budget = await callWithinBudget({ usage, now: deps.now }, model, estimate, () =>
      llm.complete({
        model, system, user, image: { mime, base64: Buffer.from(bytes).toString("base64") }, schema: extractionSchema, schemaName: "page_extraction",
        maxCompletionTokens: EXTRACT_MAX_COMPLETION, timeoutMs,
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

  const saved = await saveExtraction(ctx, doc, page, {
    extraction, pageNo, pageText: page.text.slice(0, PAGE_CHAR_LIMIT), model, promptVersion: IMAGE_PROMPT_VERSION, inputHash, tokens, have,
  });
  return { kind: "done", result: { proposals: saved.built, flagged: saved.flagged, tokens, ...(cached ? { cached } : {}) } };
};
