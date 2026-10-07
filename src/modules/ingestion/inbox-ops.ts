import { InvalidInputError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { MAX_PAGE_BUDGET, type DocumentRow, type DocumentsRepo } from "@/modules/documents";
import { MAX_PDF_PAGES } from "./caps";
import { InboxError } from "./errors";
import type { InboxRepo } from "./inbox-repo";
import type { QueueRepo } from "./queue-repo";

// What the inbox buttons do (spec s6.3, s7). Each takes the repos it needs, so tests run on fakes and the actions
// run on the admin's cookie session. Nothing here is job code: it never claims or finishes a step.

export type InboxPorts = { docs: DocumentsRepo; inbox: InboxRepo; queue: QueueRepo };

/** A well-formed id of a document that exists; anything else is "no such row" (a crafted POST). */
async function documentOf(p: InboxPorts, documentId: string, statuses: DocumentRow["status"][]): Promise<DocumentRow> {
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
  if (page.selected === selected) return;
  if (selected && (await p.inbox.selectedPages(doc.id)).length >= doc.llmPageBudget) throw new InboxError("page-budget-reached");

  await p.inbox.setPageSelected(doc.id, pageNo, selected);
  const job = await p.inbox.liveJob(doc.id);
  if (!job) return;
  if (!selected) return p.inbox.skipQueuedStep(job, pageNo);
  if (!aiOn) return;
  // job_steps_once makes the insert a no-op when the page was ticked before, so a skipped step is revived instead.
  await p.queue.enqueue(job, [{ kind: "extract_page", pageNo }]);
  await p.inbox.reviveStep(job, pageNo);
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
  if (doc.status === "active") await p.docs.update(doc.id, { status: "skipped" });
}

/** Documents read while AI was off: queue an extract step for every ticked page that has none. */
export async function readSelected(p: InboxPorts, documentId: string, aiOn: boolean): Promise<void> {
  const doc = await documentOf(p, documentId, ["active"]);
  if (!aiOn) throw new InboxError("ai-off");
  const job = await p.inbox.liveJob(doc.id);
  if (!job) throw new InvalidInputError();
  const have = new Set(await p.inbox.extractPages(job));
  const missing = (await p.inbox.selectedPages(doc.id)).filter((pageNo) => !have.has(pageNo));
  await p.queue.enqueue(job, missing.map((pageNo) => ({ kind: "extract_page", pageNo })));
}
