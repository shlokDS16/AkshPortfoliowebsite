import { InvalidInputError } from "@/lib/errors";
import { MAX_PAGE_NO } from "@/modules/documents";
import { GROQ_CAPS, MAX_PASSES, PAGE_CHAR_LIMIT, REREAD_MAX_COMPLETION } from "./caps";
import { InboxError } from "./errors";
import { estimateTokens } from "./governor";
import { documentOf, type InboxPorts } from "./inbox-ops";
import { SYSTEM_PROMPT, userPrompt } from "./prompts";

// "Re-read this page" (Plan 2b Task 8, rulings R2 and R3, Shlok's Q21). Aksh asks for one page to be read again, harder: the cost is
// shown first and comes from the constants; his click rejects the page's figures he has not checked (so the new reading replaces them)
// and queues the next pass of the page's extract_page step with args.reread, which skips the cache and thinks at medium effort.
// Only an open document with a live job and a page whose reading is done. Nothing here is job code: it never claims a step.

export type RereadCost = { tokens: number; dayCap: number; text: string };

const grouped = (n: number) => n.toLocaleString("en-US");

/**
 * What one more reading of this page costs out of the day's allowance: what the call will reserve (the prompt, this page up to the
 * character cap, and the re-read's completion room, which includes the medium-effort reasoning), rounded up to the hundred. The usual
 * per-page cost is the low-effort one and would understate a re-read.
 */
export function rereadCost(pageNo: number, pageText: string): RereadCost {
  const tokens = Math.ceil(estimateTokens(SYSTEM_PROMPT, userPrompt(pageNo, pageText.slice(0, PAGE_CHAR_LIMIT)), REREAD_MAX_COMPLETION) / 100) * 100;
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
export async function previewReread(p: InboxPorts, documentId: string, pageNo: number, aiOn: boolean): Promise<RereadCost> {
  await check(p, documentId, pageNo, aiOn);
  const page = await p.docs.getPage(documentId, pageNo);
  if (!page) throw new InboxError("reread-not-ready");
  return rereadCost(pageNo, page.text);
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
