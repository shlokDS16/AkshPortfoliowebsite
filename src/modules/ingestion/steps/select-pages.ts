import { classifyPages, selectPages } from "@/modules/documents";
import { readsScansWhole, stepsForPage } from "../page-steps";
import type { NewStep, StepHandler } from "../types";

// select_pages (spec s6.3): classify every page, keep the verdicts of statement pages, tick the best pages within the
// document's budget as the rule's choice, and enqueue one read per page when AI reading is on. A scanned document whose
// scans fit the page budget is scanned whole (ruling R6); a larger one waits for Aksh to tick pages.

export const DOCUMENT_GONE = "This document is no longer on your desk, so its pages cannot be chosen. Choose Skip, or Try again.";

export const selectPagesStep: StepHandler = async ({ documentId, deps }) => {
  const documents = deps.repos.documents;
  const doc = await documents.get(documentId);
  if (!doc) return { kind: "attention", error: DOCUMENT_GONE };

  const pages = await documents.listPagesForSelection(documentId);
  const verdicts = classifyPages(pages);
  await documents.setVerdicts(documentId, verdicts.filter((v) => v.kind !== "other"));
  const chosen = selectPages(verdicts, { budget: doc.llmPageBudget, basis: doc.basis });
  // Pages Aksh already decided on are left alone; the rule's pages (now or from an earlier run) come back.
  const selected = await documents.setSelection(documentId, chosen, "rule");

  const scans = pages.filter((p) => p.isScan).map((p) => p.pageNo);
  const whole = readsScansWhole(scans.length, pages.length, doc.llmPageBudget);

  if (deps.llm === null) return { kind: "done", result: { selected: selected.length, aiOff: true } };
  const kindOf = new Map(verdicts.map((v) => [v.pageNo, v.kind]));
  const enqueue: NewStep[] = selected.map((pageNo) => stepsForPage({ pageNo, isScan: false, kind: kindOf.get(pageNo) ?? null }));
  // The scans of a mostly scanned document: each is read, then classifies itself and queues its figures if it is a statement page.
  if (whole) enqueue.push(...scans.map((pageNo) => stepsForPage({ pageNo, isScan: true, kind: null })));
  return { kind: "done", result: { selected: selected.length, ...(whole ? { scansQueued: scans.length } : {}) }, enqueue };
};
