import { modelVerdict, selectPages, type PageVerdict } from "@/modules/documents";
import {
  CLASSIFY_BATCH, CLASSIFY_MAX_COMPLETION, CLASSIFY_MIN_CONFIDENCE, CLASSIFY_PAGE_CHARS, OCR_OFF_RETRY_MS, PROVIDER_FAILURE_LIMIT, SCHEMA_FAILURE_LIMIT, SHORT_WAIT_MS,
} from "../caps";
import { llmTimeoutMs } from "../deadline";
import { callWithinBudget, estimateTokens } from "../governor";
import { stepsForPage } from "../page-steps";
import { CHOOSING_FAILED } from "../trays";
import {
  CLASSIFY_PROMPT_VERSION, CLASSIFY_SYSTEM_PROMPT, classifyRetryPrompt, classifySchema, classifyUserPrompt, type Classification,
} from "../prompts";
import type { NewStep, StepContext, StepHandler, StepOutcome } from "../types";
import { classifyArgsSchema, nextClassifyStep } from "./classify-args";
import { ISSUES_MAX } from "./extraction-shared";
import { DOCUMENT_GONE } from "./select-pages";

// classify_pages (Plan 2b Task 6, rulings R2 and R16): the pages the rules could not place, ten openings a call, on the small
// model. One batch is one step keyed by its first page; it queues the next batch, and the LAST batch picks the pages it
// found, within the document's remaining page budget, and queues them through the shared page routing. A verdict is a kind
// and a rank, never a figure; a verdict under CLASSIFY_MIN_CONFIDENCE changes nothing; a page Aksh ticked or unticked is
// not sent to the model and is never ticked or unticked here. The call is budgeted in the classify model's own bucket and
// never touches the document's page budget. A batch the model cannot answer is let go, not failed: the rules' choice stands.

export { CHOOSING_FAILED };

const attention = (error: string): StepOutcome => ({ kind: "attention", error });
type Documents = StepContext["deps"]["repos"]["documents"];
type Doc = NonNullable<Awaited<ReturnType<Documents["get"]>>>;
type Page = NonNullable<Awaited<ReturnType<Documents["getPage"]>>>;

/** The verdicts worth keeping from one answer: a page of this batch, once, a statement-like kind, sure enough. */
function keep(answer: Classification, asked: Page[]): PageVerdict[] {
  const byNo = new Map(asked.map((p) => [p.pageNo, p]));
  const seen = new Set<number>();
  const out: PageVerdict[] = [];
  for (const v of answer.pages) {
    const page = byNo.get(v.page);
    if (!page || seen.has(v.page)) continue;
    seen.add(v.page);
    if (v.kind === "other" || !Number.isFinite(v.confidence) || v.confidence < CLASSIFY_MIN_CONFIDENCE || v.confidence > 1) continue;
    out.push(modelVerdict(page, v.kind, v.confidence));
  }
  return out;
}

/**
 * The last batch: tick what the model found, best first, within the budget that is left, and queue its reading through the
 * shared routing. Pages Aksh decided on are left alone. A page this step ticked on an earlier try is queued again
 * (the queue ignores a duplicate), so a step that stopped between the tick and its result loses nothing.
 */
async function selectFound(ctx: StepContext, doc: Doc, found: PageVerdict[]): Promise<{ selected: number; enqueue: NewStep[] }> {
  const { documents } = ctx.deps.repos;
  const pages = (await Promise.all(found.map((v) => documents.getPage(doc.id, v.pageNo)))).filter((p): p is Page => p !== null);
  const byNo = new Map(pages.map((p) => [p.pageNo, p]));
  const open = found.filter((v) => byNo.has(v.pageNo) && byNo.get(v.pageNo)?.selectedBy !== "aksh");
  const mine = open.filter((v) => byNo.get(v.pageNo)?.selected);
  const fresh = open.filter((v) => !byNo.get(v.pageNo)?.selected);
  const room = Math.max(0, doc.llmPageBudget - (await documents.countSelected(doc.id)));
  const chosen = [...mine.map((v) => v.pageNo), ...selectPages(fresh, { budget: room, basis: doc.basis })];
  if (chosen.length === 0) return { selected: 0, enqueue: [] };
  const taken = await documents.setSelection(doc.id, chosen, "rule");
  const enqueue = taken.map((pageNo) => stepsForPage({ pageNo, isScan: byNo.get(pageNo)?.isScan ?? false, kind: found.find((v) => v.pageNo === pageNo)?.kind ?? null }));
  return { selected: fresh.filter((v) => taken.includes(v.pageNo)).length, enqueue };
}

export const classifyPagesStep: StepHandler = async (ctx) => {
  const { step, documentId, deadline, deps } = ctx;
  const { documents, usage } = deps.repos;
  const llm = deps.llm;
  if (!llm) return { kind: "defer", notBefore: new Date(deps.now().getTime() + OCR_OFF_RETRY_MS), reason: "ai_off" };
  const args = classifyArgsSchema.safeParse(step.args);
  if (!args.success) return attention(CHOOSING_FAILED);
  const doc = await documents.get(documentId);
  if (!doc) return attention(DOCUMENT_GONE);

  const batch = args.data.pages.slice(0, CLASSIFY_BATCH);
  const rest = args.data.pages.slice(CLASSIFY_BATCH);
  // Aksh's own ticks and unticks stand: those pages are not even sent. A page sorted before (a rerun) is not asked again.
  const loaded = (await Promise.all(batch.map((n) => documents.getPage(documentId, n)))).filter((p): p is Page => p !== null);
  const asked = loaded.filter((p) => !p.isScan && p.text.trim() !== "" && p.selectedBy !== "aksh" && (p.kind === null || p.kind === "other"));
  // Every page of a batch was 'other' to the rules, so one that now has a kind got it from the model on an earlier try that stopped
  // after storing the verdicts and before it finished: it still counts as found (Plan 2b Task 8 carry d).
  const sortedBefore = loaded.flatMap((p): PageVerdict[] =>
    p.selectedBy !== "aksh" && p.kind !== null && p.kind !== "other" ? [{ pageNo: p.pageNo, kind: p.kind, basis: p.basis, score: p.score }] : [],
  );

  let kept: PageVerdict[] = [];
  let tokens = 0;
  let letGo: string | null = null;
  if (asked.length > 0) {
    const timeoutMs = llmTimeoutMs(deadline, deps.clock);
    if (timeoutMs === null) return { kind: "defer", notBefore: new Date(deps.now().getTime() + SHORT_WAIT_MS), reason: "groq_minute" };

    const system = step.schemaFailures > 0 && step.lastError ? classifyRetryPrompt(step.lastError) : CLASSIFY_SYSTEM_PROMPT;
    const user = classifyUserPrompt(asked.map((p) => ({ pageNo: p.pageNo, text: p.text.slice(0, CLASSIFY_PAGE_CHARS) })));
    const model = deps.models.classify;
    const budget = await callWithinBudget({ usage, now: deps.now }, model, estimateTokens(system, user, CLASSIFY_MAX_COMPLETION), () =>
      llm.complete({
        model, system, user, schema: classifySchema, schemaName: "page_classification",
        maxCompletionTokens: CLASSIFY_MAX_COMPLETION, reasoningEffort: "low", timeoutMs,
      }),
    );
    if (budget.kind === "deferred") return { kind: "defer", notBefore: budget.notBefore, reason: budget.reason };
    if (budget.kind === "too_large") letGo = "too_large";
    else {
      const result = budget.result;
      if (result.kind === "ok") {
        kept = keep(result.data, asked);
        tokens = result.usage.totalTokens;
      } else if (result.kind === "invalid") {
        if (step.schemaFailures + 1 < SCHEMA_FAILURE_LIMIT) return { kind: "retry", failure: "schema", error: result.issues.join("; ").slice(0, ISSUES_MAX) };
        letGo = "schema";
      } else if (result.kind === "provider_error") {
        if (step.providerFailures + 1 < PROVIDER_FAILURE_LIMIT) return { kind: "retry", failure: "provider", error: `${result.status ?? "network"} ${result.message}`.slice(0, ISSUES_MAX) };
        letGo = "provider";
      } else letGo = "refused";
    }
    if (kept.length > 0) await documents.setVerdicts(documentId, kept);
  }

  const found = [...args.data.accepted, ...sortedBefore, ...kept];
  const result = { promptVersion: CLASSIFY_PROMPT_VERSION, asked: asked.length, kept: kept.length, tokens, ...(letGo ? { letGo } : {}) };
  if (rest.length > 0) return { kind: "done", result, enqueue: [nextClassifyStep(rest, found)] };
  const picked = await selectFound(ctx, doc, found);
  return { kind: "done", result: { ...result, selected: picked.selected }, enqueue: picked.enqueue };
};
