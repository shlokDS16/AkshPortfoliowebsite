import { onPage } from "@/modules/documents/client";
import {
  DIGEST_CLAIM_MAX, DIGEST_LINE_MAX, DIGEST_MAX_CLAIMS, DIGEST_MAX_COMPLETION, DIGEST_MIN_LINE_CHARS, DIGEST_SECTION_MAX, OCR_OFF_RETRY_MS, PAGE_CHAR_LIMIT, SHORT_WAIT_MS,
} from "../caps";
import { llmTimeoutMs } from "../deadline";
import type { DigestRow } from "../digests-repo";
import { callWithinBudget, estimateTokens } from "../governor";
import { OCR_NOTHING_READ } from "../ocr-copy";
import { stepsForPage } from "../page-steps";
import {
  DIGEST_PROMPT_VERSION, DIGEST_SYSTEM_PROMPT, digestRetryPrompt, digestSchema, digestUserPrompt, type Digest,
} from "../prompts";
import type { StepHandler, StepOutcome } from "../types";
import { ISSUES_MAX, PAGE_NOT_STORED, PAGE_TOO_BIG, rejection, sha256 } from "./extraction-shared";
import { SCAN_PAGE } from "./extract-page";

// digest_page (Plan 2b Task 7, rulings R6 and R20): a management-discussion page, claim by claim. The machine writes one
// extractions row and document_digests rows and nothing else: no proposal, no capture, no revision. Each claim keeps the line
// the model says carries it, and the code decides whether that line is printed on the page (on_page). A rerun or a lost lease
// finds the extraction it wrote and reuses its id, so the same rows are never added twice.

/** The heading a claim gets when the model gave none: the table needs a section of 1-300 characters. */
export const NO_SECTION = "No heading";

/** A claim ready to store: trimmed, cut to the table's lengths, empty ones dropped, the line checked against the page. */
export function digestRows(digest: Digest, documentId: string, pageNo: number, extractionId: string, pageText: string): DigestRow[] {
  const rows: DigestRow[] = [];
  for (const c of digest.claims) {
    const claim = c.claim.trim().slice(0, DIGEST_CLAIM_MAX).trim();
    // One line of plain words: a line copied across a PDF line wrap keeps no newline or tab, so it can sit in one cell of the facts sheet.
    const line = c.line.replace(/\s+/g, " ").trim().slice(0, DIGEST_LINE_MAX).trim();
    if (claim === "" || line === "") continue;
    const section = c.section.trim().slice(0, DIGEST_SECTION_MAX).trim() || NO_SECTION;
    // A line too short to be a quote is on almost any page: it is kept, but never counted as confirmed.
    // A line with a | is never confirmed: the facts sheet splits a row on it, so "Use as a fact" would cut the quote short. The line is
    // kept as the model gave it and stays under "could not confirm" (replacing the | would make it no longer a copy of the page).
    const confirmed = line.length >= DIGEST_MIN_LINE_CHARS && !line.includes("|") && onPage(line, pageText);
    rows.push({ documentId, pageNo, extractionId, ord: rows.length, section, claim, line, onPage: confirmed });
    if (rows.length >= DIGEST_MAX_CLAIMS) break;
  }
  return rows;
}

export const digestPage: StepHandler = async (ctx) => {
  const { step, documentId, deadline, deps } = ctx;
  const { documents, proposals, usage, digests } = deps.repos;
  const llm = deps.llm;
  const attention = (error: string): StepOutcome => ({ kind: "attention", error });
  if (!llm) return { kind: "defer", notBefore: new Date(deps.now().getTime() + OCR_OFF_RETRY_MS), reason: "ai_off" };
  if (step.pageNo === null) return attention(PAGE_NOT_STORED);
  const pageNo = step.pageNo;

  const [doc, page] = await Promise.all([documents.get(documentId), documents.getPage(documentId, pageNo)]);
  if (!doc || !page) return attention(PAGE_NOT_STORED);
  // A voice note's words are Aksh's own, never digested (Task 4).
  if (doc.kind === "audio") return { kind: "done", result: { skipped: "audio" } };
  if (page.isScan || page.text.trim() === "") {
    if (page.ocr) return attention(OCR_NOTHING_READ);
    if (!deps.ocr) return attention(SCAN_PAGE);
    return { kind: "done", result: { scan: true }, enqueue: [stepsForPage({ pageNo, isScan: true, kind: page.kind })] };
  }

  const text = page.text.slice(0, PAGE_CHAR_LIMIT);
  const inputHash = sha256(text);
  const model = deps.models.text;

  let digest: Digest;
  let extractionId: string;
  let tokens = 0;
  let cached = false;
  // The extraction this page already has under this prompt version (an earlier try, or a lost lease): its id is reused (ruling R20).
  const stored = await proposals.findExtractionFor(documentId, pageNo, inputHash, model, DIGEST_PROMPT_VERSION);
  const reuse = stored ? digestSchema.safeParse(stored.output) : null;
  if (stored && reuse?.success) {
    digest = reuse.data;
    extractionId = stored.id;
    cached = true;
  } else {
    const timeoutMs = llmTimeoutMs(deadline, deps.clock);
    if (timeoutMs === null) return { kind: "defer", notBefore: new Date(deps.now().getTime() + SHORT_WAIT_MS), reason: "groq_minute" };

    const system = step.schemaFailures > 0 && step.lastError ? digestRetryPrompt(step.lastError) : DIGEST_SYSTEM_PROMPT;
    const user = digestUserPrompt(pageNo, text);
    const budget = await callWithinBudget({ usage, now: deps.now }, model, estimateTokens(system, user, DIGEST_MAX_COMPLETION), () =>
      llm.complete({
        model, system, user, schema: digestSchema, schemaName: "page_digest",
        maxCompletionTokens: DIGEST_MAX_COMPLETION, reasoningEffort: "low", timeoutMs,
      }),
    );
    if (budget.kind === "deferred") return { kind: "defer", notBefore: budget.notBefore, reason: budget.reason };
    if (budget.kind === "too_large") return attention(PAGE_TOO_BIG);

    const result = budget.result;
    if (result.kind === "invalid") return { kind: "retry", failure: "schema", error: result.issues.join("; ").slice(0, ISSUES_MAX) };
    if (result.kind === "provider_error") return { kind: "retry", failure: "provider", error: `${result.status ?? "network"} ${result.message}`.slice(0, ISSUES_MAX) };
    if (result.kind === "rejected") return attention(rejection(result.status, result.message));
    if (result.kind !== "ok") return { kind: "retry", failure: "provider", error: "unexpected answer" };
    digest = result.data;
    tokens = result.usage.totalTokens;
    extractionId = await proposals.insertExtraction({ documentId, pageNo, model, promptVersion: DIGEST_PROMPT_VERSION, inputHash, output: digest, tokensUsed: tokens });
  }

  const rows = digestRows(digest, documentId, pageNo, extractionId, page.text);
  await digests.insert(rows);
  const confirmed = rows.filter((r) => r.onPage).length;
  return { kind: "done", result: { claims: rows.length, onPage: confirmed, tokens, ...(cached ? { cached } : {}) } };
};
