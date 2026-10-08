import { InvalidInputError } from "@/lib/errors";
import { MAX_PAGE_NO } from "@/modules/documents";
import { GROQ_CAPS, MAX_PASSES, TOKENS_PER_PAGE_DEFAULT } from "./caps";
import { InboxError } from "./errors";
import { documentOf, type InboxPorts } from "./inbox-ops";

// "Re-read this page" (Plan 2b Task 8, rulings R2 and R3, Shlok's Q21). Aksh asks for one page to be read again, harder: the cost is
// shown first and comes from the constants; his click rejects the page's figures he has not checked (so the new reading replaces them)
// and queues the next pass of the page's extract_page step with args.reread, which skips the cache and thinks at medium effort.
// Only an open document with a live job and a page whose reading is done. Nothing here is job code: it never claims a step.

export type RereadCost = { tokens: number; dayCap: number; text: string };

const grouped = (n: number) => n.toLocaleString("en-US");

/**
 * What one more reading of a page costs out of the day's allowance. The measured median of recent calls counts when it is higher than
 * the default (a medium-effort reading is not cheaper than the usual one); it is rounded to the hundred, as the meter says it.
 */
export function rereadCost(median: number | null): RereadCost {
  const measured = median !== null && Number.isFinite(median) ? Math.round(median / 100) * 100 : 0;
  const tokens = Math.max(TOKENS_PER_PAGE_DEFAULT, measured);
  return {
    tokens,
    dayCap: GROQ_CAPS.tpd,
    text: `This uses about ${grouped(tokens)} of today's ${grouped(GROQ_CAPS.tpd)} AI tokens. Figures from this page that you have not checked yet are replaced by the new reading.`,
  };
}

/** Everything that must hold before a re-read: the same checks for the price and for the click. Returns the live job and the next pass. */
async function check(p: InboxPorts, documentId: string, pageNo: number, aiOn: boolean): Promise<{ job: string; next: number }> {
  const doc = await documentOf(p, documentId, ["active", "done", "skipped"]);
  if (doc.status !== "active") throw new InboxError("reread-closed");
  if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > MAX_PAGE_NO) throw new InvalidInputError();
  if (!aiOn) throw new InboxError("ai-off");
  const job = await p.inbox.liveJob(doc.id);
  const latest = job ? await p.inbox.latestExtract(job, pageNo) : null;
  if (!job || !latest || latest.status !== "done") throw new InboxError("reread-not-ready");
  if (latest.pass >= MAX_PASSES) throw new InboxError("reread-limit");
  return { job, next: latest.pass + 1 };
}

/** The price of re-reading this page, after the checks the click would make. Changes nothing. */
export async function previewReread(p: InboxPorts, documentId: string, pageNo: number, aiOn: boolean, median: number | null): Promise<RereadCost> {
  await check(p, documentId, pageNo, aiOn);
  return rereadCost(median);
}

/**
 * Aksh confirmed. His still-pending figures and test readings on this page become rejected (a decision of his; accepted, edited and
 * filed ones are never touched), then the next pass of the page's step is queued. The rejection comes first so the new pass cannot be
 * rejected with them; if the queue then fails, pressing the button again finishes the job.
 */
export async function rereadPage(p: InboxPorts, documentId: string, pageNo: number, aiOn: boolean): Promise<void> {
  const { job, next } = await check(p, documentId, pageNo, aiOn);
  await p.inbox.rejectPendingOn(documentId, pageNo);
  await p.queue.enqueue(job, [{ kind: "extract_page", pageNo, pass: next, args: { reread: true } }]);
}
