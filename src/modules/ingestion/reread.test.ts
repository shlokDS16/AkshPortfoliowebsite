import { beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { errorText } from "@/lib/messages";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryInbox, type MemoryInbox } from "@/test/fakes/inbox-repo";
import { GROQ_CAPS, MAX_PASSES, PAGE_CHAR_LIMIT, REREAD_MAX_COMPLETION } from "./caps";
import { estimateTokens } from "./governor";
import { SYSTEM_PROMPT, userPrompt } from "./prompts";
import { INBOX_ERROR_TEXT, InboxError } from "./errors";
import type { InboxPorts } from "./inbox-ops";
import { previewReread, rereadCost, rereadPage } from "./reread";

// Re-read this page (Plan 2b Task 8, rulings R2 and R3, Shlok's Q21): only an open document with a live job and a page whose first reading
// is done; the cost is shown before anything is spent and comes from the constants; Aksh's click rejects the page's unchecked figures,
// then a new pass of the page's step is queued with the re-read flag.

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const PAGE_TEXT = "Consolidated Statement of Profit and Loss\nRevenue from operations 1,284.00 1,102.00";
let docs: MemoryDocumentsRepo;
let inbox: MemoryInbox;
let ports: InboxPorts;
let job: string;

beforeEach(async () => {
  docs = createMemoryDocumentsRepo();
  inbox = createMemoryInbox();
  ports = { docs, inbox, queue: inbox.queue };
  await docs.insertUploading({ id: DOC, title: "AR", kind: "pdf", storagePath: `${DOC}.pdf`, sha256: "a".repeat(64), bytes: 10, companyId: null, filedOn: null, sourceUrl: null });
  await docs.update(DOC, { status: "active", llmPageBudget: 5 });
  job = await inbox.queue.createJob(DOC, "ingest_pdf", { kind: "pdf_text", pageNo: 1 });
  inbox.steps.push({ jobId: job, kind: "extract_page", pageNo: 4, pass: 1, status: "done", failures: 0, lastError: null });
  docs.pages.set(`${DOC}:4`, { documentId: DOC, pageNo: 4, text: PAGE_TEXT, charCount: PAGE_TEXT.length, isScan: false, kind: "pl", basis: "consolidated", score: 9, selected: true, selectedBy: "rule", ocr: false });
  inbox.log.length = 0;
});

const code = async (promise: Promise<unknown>) => {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(InboxError);
  return (error as InboxError).code;
};
const extractSteps = () => inbox.steps.filter((s) => s.kind === "extract_page").map((s) => [s.pageNo, s.pass, s.status]);

describe("rereadCost: the price is what the call will reserve", () => {
  const PAGE = "Revenue from operations 1,284.00 1,102.00\n".repeat(20);

  it("is the prompt, this page and the re-read's completion room, rounded up to the hundred, out of the day's allowance", () => {
    const cost = rereadCost(4, PAGE);
    const reserved = estimateTokens(SYSTEM_PROMPT, userPrompt(4, PAGE), REREAD_MAX_COMPLETION);
    expect(cost.tokens).toBe(Math.ceil(reserved / 100) * 100);
    expect(cost.tokens).toBeGreaterThanOrEqual(reserved);
    expect(cost.tokens).toBeGreaterThan(REREAD_MAX_COMPLETION);
    expect(cost.dayCap).toBe(GROQ_CAPS.tpd);
    expect(cost.text).toBe(
      `This uses about ${cost.tokens.toLocaleString("en-US")} of today's ${GROQ_CAPS.tpd.toLocaleString("en-US")} AI tokens. Figures from this page that you have not checked yet are replaced by the new reading.`,
    );
  });

  it("is more than the low-effort page cost (a medium reading is not the usual one), and grows with the page up to the character cap", () => {
    expect(rereadCost(4, PAGE).tokens).toBeGreaterThan(rereadCost(4, "x").tokens);
    expect(rereadCost(4, "x".repeat(PAGE_CHAR_LIMIT)).tokens).toBe(rereadCost(4, "x".repeat(PAGE_CHAR_LIMIT * 3)).tokens);
    expect(rereadCost(4, "x".repeat(PAGE_CHAR_LIMIT)).tokens).toBeLessThanOrEqual(GROQ_CAPS.tpm);
  });
});

describe("previewReread", () => {
  it("shows the cost of this page's reading and changes nothing", async () => {
    const cost = await previewReread(ports, DOC, 4, true);
    expect(cost).toEqual(rereadCost(4, PAGE_TEXT));
    expect(inbox.log).toEqual([]);
    expect(extractSteps()).toEqual([[4, 1, "done"]]);
  });

  it("refuses for the same reasons as the click, so a button that would fail never offers a price", async () => {
    expect(await code(previewReread(ports, DOC, 4, false))).toBe("ai-off");
    expect(await code(previewReread(ports, DOC, 5, true))).toBe("reread-not-ready");
  });

  it("refuses when the page is no longer stored", async () => {
    docs.pages.clear();
    expect(await code(previewReread(ports, DOC, 4, true))).toBe("reread-not-ready");
  });
});

describe("rereadPage", () => {
  it("rejects the page's unchecked figures first, then queues the next pass of its step with the re-read flag", async () => {
    await rereadPage(ports, DOC, 4, true);
    expect(inbox.log).toEqual(["reject:4", "enqueue:extract_page:4:2"]);
    expect(inbox.rejected).toEqual([`${DOC}:4`]);
    expect(extractSteps()).toEqual([[4, 1, "done"], [4, 2, "queued"]]);
  });

  it("queues the step with args.reread true (the handler reads that flag)", async () => {
    const queued: unknown[] = [];
    const spy = { ...inbox.queue, enqueue: async (id: string, steps: unknown[]) => void queued.push(...steps) };
    await rereadPage({ ...ports, queue: spy as never }, DOC, 4, true);
    expect(queued).toEqual([{ kind: "extract_page", pageNo: 4, pass: 2, args: { reread: true } }]);
  });

  it("leaves every other page alone", async () => {
    inbox.steps.push({ jobId: job, kind: "extract_page", pageNo: 5, pass: 1, status: "done", failures: 0, lastError: null });
    await rereadPage(ports, DOC, 4, true);
    expect(extractSteps()).toEqual([[4, 1, "done"], [5, 1, "done"], [4, 2, "queued"]]);
    expect(inbox.rejected).toEqual([`${DOC}:4`]);
  });

  it("will not stack a second re-read on one that has not finished, and goes on to a third once the second is done", async () => {
    await rereadPage(ports, DOC, 4, true);
    expect(await code(rereadPage(ports, DOC, 4, true))).toBe("reread-not-ready");
    expect(extractSteps()).toEqual([[4, 1, "done"], [4, 2, "queued"]]);
    inbox.steps.find((s) => s.pass === 2)!.status = "done";
    await rereadPage(ports, DOC, 4, true);
    expect(extractSteps()).toEqual([[4, 1, "done"], [4, 2, "done"], [4, 3, "queued"]]);
  });

  it.each(["queued", "running", "needs_attention", "skipped"] as const)("refuses a page whose reading is %s", async (status) => {
    inbox.steps.find((s) => s.pageNo === 4)!.status = status;
    expect(await code(rereadPage(ports, DOC, 4, true))).toBe("reread-not-ready");
    expect(inbox.log).toEqual([]);
  });

  it("refuses a page that was never read for figures, and a document with no live job", async () => {
    expect(await code(rereadPage(ports, DOC, 9, true))).toBe("reread-not-ready");
    await inbox.cancelJob(DOC);
    expect(await code(rereadPage(ports, DOC, 4, true))).toBe("reread-not-ready");
  });

  it("refuses a closed document (Q19: it is not read again), whatever its pages say", async () => {
    for (const status of ["done", "skipped"] as const) {
      await docs.update(DOC, { status });
      expect(await code(rereadPage(ports, DOC, 4, true))).toBe("reread-closed");
    }
    expect(inbox.log).toEqual([]);
  });

  it("refuses with AI off, spending and rejecting nothing", async () => {
    expect(await code(rereadPage(ports, DOC, 4, false))).toBe("ai-off");
    expect(inbox.log).toEqual([]);
  });

  it(`stops at pass ${MAX_PASSES}, the most the queue holds`, async () => {
    inbox.steps.find((s) => s.pageNo === 4)!.pass = MAX_PASSES;
    expect(await code(rereadPage(ports, DOC, 4, true))).toBe("reread-limit");
    expect(inbox.log).toEqual([]);
  });

  it("treats a crafted id or page as no such row", async () => {
    await expect(rereadPage(ports, "not-a-uuid", 4, true)).rejects.toBeInstanceOf(InvalidInputError);
    for (const bad of [0, -1, 1.5, 5_001, Number.NaN]) await expect(rereadPage(ports, DOC, bad, true)).rejects.toBeInstanceOf(InvalidInputError);
    expect(inbox.log).toEqual([]);
  });

  it("has its three refusals worded the same in the browser's message table", () => {
    for (const c of ["reread-closed", "reread-not-ready", "reread-limit"] as const) expect(errorText(c)).toBe(INBOX_ERROR_TEXT[c]);
  });
});
