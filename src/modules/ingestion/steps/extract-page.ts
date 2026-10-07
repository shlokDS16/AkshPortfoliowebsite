import { createHash } from "node:crypto";
import { readCaseFile } from "@/modules/casefile/client";
import { EXTRACT_MAX_COMPLETION, MAX_PROPOSALS_PER_DOCUMENT, PAGE_CHAR_LIMIT } from "../caps";
import { llmTimeoutMs } from "../deadline";
import { callWithinBudget, estimateTokens } from "../governor";
import { extractionSchema, PROMPT_VERSION, retryPrompt, SYSTEM_PROMPT, userPrompt, type Extraction } from "../prompts";
import { buildProposals } from "../proposals";
import { normaliseLabel } from "../relevance";
import type { StepContext, StepHandler, StepOutcome } from "../types";

// extract_page (spec s6.4, ADR-004 s4.4): one statement page, one call. The machine writes an extraction and pending
// proposals and nothing else; period and unit come from the printed headings in code (E3); every value and quote is
// checked against the stored page text (buildProposals). Every write is idempotent, so a duplicate step is harmless.

export const SCAN_PAGE = "This page is a scan. Scans are read in a later update; enter it manually or skip.";
export const PAGE_TOO_BIG = "This page is too big for the free AI allowance. Enter the figures yourself.";
export const PAGE_NOT_STORED = "This page is no longer stored, so it cannot be read. Skip this step, or upload the PDF again.";
export const KEY_REFUSED = "The AI service did not accept the desk's key. Check the Groq key in the settings, then try again.";
export const REQUEST_REFUSED = "The AI service refused to read this page. Enter the figures yourself.";
/** How long a step waits when AI reading is off; turning it on (a key, then a redeploy) does not need the step to be touched. */
const AI_OFF_RETRY_MS = 6 * 60 * 60 * 1000;
/** A step that finds under 20 s left tries again almost at once, in the next drain (no failure is counted). */
const SHORT_WAIT_MS = 5_000;
const ISSUES_MAX = 400;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** The labels of the company's newest file, as the relevance filter compares them (empty when there is no file). */
async function fileLabelsFor(companyId: string | null, ctx: StepContext): Promise<Set<string>> {
  if (!companyId) return new Set();
  const file = await ctx.deps.repos.research.latestFileForCompany(companyId);
  return file ? new Set(readCaseFile(file.structured).facts.map((f) => normaliseLabel(f.label))) : new Set();
}

function rejection(status: number, message: string): string {
  if (status === 401 || status === 403) return KEY_REFUSED;
  if (status === 413 || /context|too_large|too large/i.test(message)) return PAGE_TOO_BIG;
  return REQUEST_REFUSED;
}

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
  if (page.isScan || page.text.trim() === "") return attention(SCAN_PAGE);

  const have = await proposals.countForDocument(documentId);
  if (have >= MAX_PROPOSALS_PER_DOCUMENT) return { kind: "done", result: { proposals: 0, capped: true } };

  const text = page.text.slice(0, PAGE_CHAR_LIMIT);
  const truncated = page.text.length > PAGE_CHAR_LIMIT;
  const inputHash = sha256(text);
  const model = deps.models.text;
  const fileLabels = await fileLabelsFor(doc.companyId, ctx);

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

  const extractionId = await proposals.insertExtraction({ documentId, pageNo, model, promptVersion: PROMPT_VERSION, inputHash, output: extraction, tokensUsed: tokens });
  const built = buildProposals({
    extraction, pageNo, pageText: text, pageKind: page.kind ?? extraction.page_kind, pageBasis: page.basis, docBasis: doc.basis, fileLabels,
  }).slice(0, MAX_PROPOSALS_PER_DOCUMENT - have);
  await proposals.insertProposals(
    built.map((p) => ({ documentId, pageNo, extractionId, dedupeKey: p.dedupeKey, machineValue: p.machineValue, flags: p.flags, reason: p.reason })),
  );
  return {
    kind: "done",
    result: { proposals: built.length, flagged: built.filter((p) => p.flags.length > 0).length, tokens, ...(cached ? { cached } : {}), ...(truncated ? { truncated } : {}) },
  };
};
