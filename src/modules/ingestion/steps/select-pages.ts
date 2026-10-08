import { classifyPages, selectPages } from "@/modules/documents";
import type { StepHandler } from "../types";

// select_pages (spec s6.3): classify every page, keep the verdicts of statement pages, tick the best pages within the
// document's budget as the rule's choice, and enqueue one extract_page per page when AI reading is on.

export const DOCUMENT_GONE = "This document is no longer on your desk, so its pages cannot be chosen. Choose Skip, or Try again.";

export const selectPagesStep: StepHandler = async ({ documentId, deps }) => {
  const documents = deps.repos.documents;
  const doc = await documents.get(documentId);
  if (!doc) return { kind: "attention", error: DOCUMENT_GONE };

  const verdicts = classifyPages(await documents.listPagesForSelection(documentId));
  await documents.setVerdicts(documentId, verdicts.filter((v) => v.kind !== "other"));
  const chosen = selectPages(verdicts, { budget: doc.llmPageBudget, basis: doc.basis });
  // Pages Aksh already decided on are left alone; the rule's pages (now or from an earlier run) come back.
  const selected = await documents.setSelection(documentId, chosen, "rule");

  if (deps.llm === null) return { kind: "done", result: { selected: selected.length, aiOff: true } };
  return {
    kind: "done",
    result: { selected: selected.length },
    enqueue: selected.map((pageNo) => ({ kind: "extract_page", pageNo })),
  };
};
