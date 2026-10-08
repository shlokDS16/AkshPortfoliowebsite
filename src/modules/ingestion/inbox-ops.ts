import { InvalidInputError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { MAX_PAGE_BUDGET, type DocumentRow, type DocumentsRepo } from "@/modules/documents";
import { MAX_PDF_PAGES } from "./caps";
import { InboxError } from "./errors";
import type { InboxRepo } from "./inbox-repo";
import { stepsForPage } from "./page-steps";
import type { QueueRepo } from "./queue-repo";

// What the inbox buttons do (spec s6.3, s7). Each takes the repos it needs, so tests run on fakes and the actions
// run on the admin's cookie session. Nothing here is job code: it never claims or finishes a step.

export type InboxPorts = { docs: DocumentsRepo; inbox: InboxRepo; queue: QueueRepo };

/** A well-formed id of a document that exists; anything else is "no such row" (a crafted POST). */
export async function documentOf(p: InboxPorts, documentId: string, statuses: DocumentRow["status"][]): Promise<DocumentRow> {
  if (!isUuid(documentId)) throw new InvalidInputError();
  const doc = await p.docs.get(documentId);
  if (!doc || !statuses.includes(doc.status)) throw new InvalidInputError();
  return doc;
}

/**
 * Ticks or unticks a page as Aksh's own choice. Ticking past the document's page budget is refused (raise the budget
 * first); with AI on, a ticked page gets its extract step and an unticked one loses a step that has not started.
 */
export async function setPageSelected(p: InboxPorts, documentId: string, pageNo: number, selected: boolean, aiOn: boolean): Promise<void> {
  const doc = await documentOf(p, documentId, ["active"]);
  if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > MAX_PDF_PAGES) throw new InvalidInputError();
  const page = await p.inbox.page(doc.id, pageNo);
  if (!page) throw new InvalidInputError();
  if (!selected && !page.selected) return;
  // A page the rule already ticked is within the budget and needs no write, but it still needs its extract step:
  // select_pages does not queue pages that were ticked before it ran again (Task 6 carry).
  if (!(selected && page.selected)) {
    if (selected && (await p.inbox.selectedPages(doc.id)).length >= doc.llmPageBudget) throw new InboxError("page-budget-reached");
    await p.inbox.setPageSelected(doc.id, pageNo, selected);
  }
  const job = await p.inbox.liveJob(doc.id);
  if (!job) return;
  if (!selected) return p.inbox.skipQueuedStep(job, pageNo);
  if (!aiOn) return;
  // A scan goes to the scan reader first (ruling R6). job_steps_once makes the insert a no-op when the page was ticked
  // before, so a skipped step is revived instead.
  const step = stepsForPage({ pageNo, isScan: page.isScan, kind: page.kind });
  await p.queue.enqueue(job, [step]);
  await p.inbox.reviveStep(job, pageNo, step.kind);
}

/** The most pages the AI reads of one document: 1 to 40 (documents.llm_page_budget check). */
export async function setBudget(p: InboxPorts, documentId: string, budget: number): Promise<void> {
  const doc = await documentOf(p, documentId, ["active"]);
  if (!Number.isInteger(budget) || budget < 1 || budget > MAX_PAGE_BUDGET) throw new InboxError("budget-range");
  await p.docs.update(doc.id, { llmPageBudget: budget });
}

/** Try again: the document's stuck steps run again from a clean count. */
export async function retryAttention(p: InboxPorts, documentId: string): Promise<void> {
  const doc = await documentOf(p, documentId, ["active"]);
  const job = await p.inbox.liveJob(doc.id);
  if (job) await p.inbox.retryAttention(job);
}

/** Skip: the document's stuck steps are set aside; the pages already read stay searchable. */
export async function skipAttention(p: InboxPorts, documentId: string): Promise<void> {
  const doc = await documentOf(p, documentId, ["active"]);
  // A voice note that cannot be typed out has nothing left to read: skipping it closes it and deletes the recording.
  if (doc.kind === "audio") return skipDocument(p, documentId);
  const job = await p.inbox.liveJob(doc.id);
  if (job) await p.inbox.skipAttention(job);
}

/**
 * Skip the whole document: it moves to Finished and its job is cancelled, so queued steps stop spending the allowance.
 * An upload that has not finished cannot be skipped: its hash would then refuse the same file for ever.
 */
export async function skipDocument(p: InboxPorts, documentId: string): Promise<void> {
  const doc = await documentOf(p, documentId, ["active", "skipped"]);
  // The job stops first: if the status write then fails, Skip can be pressed again, and nothing keeps spending the allowance.
  await p.inbox.cancelJob(doc.id);
  // Aksh's voice is not kept once he has said he does not want the note (a PDF's original stays, as before): the recording goes, then the status.
  const recording = doc.kind === "audio" && doc.storagePath && !doc.originalDeletedAt ? doc.storagePath : null;
  if (recording) await p.docs.removeObject(recording);
  if (doc.status === "active" || recording) await p.docs.update(doc.id, { status: "skipped", ...(recording ? { originalDeletedAt: new Date().toISOString() } : {}) });
}

/**
 * Done with this document (ADR-004 s4.8): its job stops, the stored PDF is deleted to save space, and the document moves
 * to Finished. Its page text, its source link and any figures already filed stay; figures still waiting stay hidden.
 */
export async function markDone(p: InboxPorts, documentId: string): Promise<void> {
  const doc = await documentOf(p, documentId, ["active", "done"]);
  // The job stops first, then the file goes, then the status: each step is safe to repeat if a later one fails.
  await p.inbox.cancelJob(doc.id);
  if (doc.storagePath && !doc.originalDeletedAt) await p.docs.removeObject(doc.storagePath);
  if (doc.status === "active" || !doc.originalDeletedAt) await p.docs.update(doc.id, { status: "done", originalDeletedAt: doc.originalDeletedAt ?? new Date().toISOString() });
}

/** Documents read while AI was off: queue the reading step of every ticked page that has none (a scan gets the scan reader). */
export async function readSelected(p: InboxPorts, documentId: string, aiOn: boolean): Promise<void> {
  const doc = await documentOf(p, documentId, ["active"]);
  if (!aiOn) throw new InboxError("ai-off");
  const job = await p.inbox.liveJob(doc.id);
  if (!job) throw new InvalidInputError();
  // Kind-aware (ruling R6): a scan whose ocr_page is done still needs its extract_page, so "any step" is not enough.
  const have = new Set((await p.inbox.pageSteps(job)).map((s) => `${s.kind}:${s.pageNo}`));
  const wanted = (await p.inbox.selectedPageInfo(doc.id)).map(stepsForPage);
  await p.queue.enqueue(job, wanted.filter((s) => !have.has(`${s.kind}:${s.pageNo}`)));
}
