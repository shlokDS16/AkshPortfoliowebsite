import { beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { errorCode, errorText } from "@/lib/messages";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryInbox, type MemoryInbox } from "@/test/fakes/inbox-repo";
import { INBOX_ERROR_TEXT, InboxError, type InboxErrorCode } from "./errors";
import { readSelected, retryAttention, setBudget, setPageSelected, skipAttention, skipDocument, type InboxPorts } from "./inbox-ops";

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const SHA = "a".repeat(64);

let docs: MemoryDocumentsRepo;
let inbox: MemoryInbox;
let ports: InboxPorts;
let job: string;

function pages(selected: number[], count = 12) {
  for (let n = 1; n <= count; n++) inbox.pages.set(`${DOC}:${n}`, { selected: selected.includes(n), selectedBy: selected.includes(n) ? "rule" : null });
}

beforeEach(async () => {
  docs = createMemoryDocumentsRepo();
  inbox = createMemoryInbox();
  ports = { docs, inbox, queue: inbox.queue };
  await docs.insertUploading({ id: DOC, title: "AR", storagePath: `${DOC}.pdf`, sha256: SHA, bytes: 10, companyId: null, filedOn: null, sourceUrl: null });
  await docs.update(DOC, { status: "active", llmPageBudget: 3 });
  job = await inbox.queue.createJob(DOC, { kind: "pdf_text", pageNo: 1 });
});

const code = async (promise: Promise<unknown>): Promise<string> => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(InboxError);
  return (error as InboxError).code;
};
const extractSteps = () => inbox.steps.filter((s) => s.kind === "extract_page").map((s) => [s.pageNo, s.status]);

describe("setPageSelected", () => {
  it("ticks a page as Aksh's choice and, with AI on, queues its extract step", async () => {
    pages([4, 5]);
    await setPageSelected(ports, DOC, 7, true, true);
    expect(inbox.pages.get(`${DOC}:7`)).toEqual({ selected: true, selectedBy: "aksh" });
    expect(extractSteps()).toEqual([[7, "queued"]]);
  });

  it("with AI off the page is ticked and no step is made", async () => {
    pages([4]);
    await setPageSelected(ports, DOC, 7, true, false);
    expect(inbox.pages.get(`${DOC}:7`)?.selected).toBe(true);
    expect(extractSteps()).toEqual([]);
  });

  it("refuses to pass the page budget, and leaves the page unticked", async () => {
    pages([4, 5, 6]);
    expect(await code(setPageSelected(ports, DOC, 7, true, true))).toBe("page-budget-reached");
    expect(inbox.pages.get(`${DOC}:7`)?.selected).toBe(false);
  });

  it("ticking a page that is already ticked changes nothing, even at the budget", async () => {
    pages([4, 5, 6]);
    await setPageSelected(ports, DOC, 5, true, true);
    expect(extractSteps()).toEqual([]);
  });

  it("unticking skips a queued step and keeps a finished one", async () => {
    pages([4, 5]);
    await inbox.queue.enqueue(job, [
      { kind: "extract_page", pageNo: 4 },
      { kind: "extract_page", pageNo: 5 },
    ]);
    inbox.steps.find((s) => s.pageNo === 5)!.status = "done";
    await setPageSelected(ports, DOC, 4, false, true);
    await setPageSelected(ports, DOC, 5, false, true);
    expect(extractSteps()).toEqual([
      [4, "skipped"],
      [5, "done"],
    ]);
    expect(inbox.pages.get(`${DOC}:4`)).toEqual({ selected: false, selectedBy: "aksh" });
  });

  it("ticking again after an untick revives the skipped step instead of leaving the page unread", async () => {
    pages([4]);
    await inbox.queue.enqueue(job, [{ kind: "extract_page", pageNo: 4 }]);
    await setPageSelected(ports, DOC, 4, false, true);
    await setPageSelected(ports, DOC, 4, true, true);
    expect(extractSteps()).toEqual([[4, "queued"]]);
  });

  it("refuses a page the document does not have, a bad id, and a document that is not active", async () => {
    pages([4]);
    await expect(setPageSelected(ports, DOC, 99, true, true)).rejects.toBeInstanceOf(InvalidInputError);
    await expect(setPageSelected(ports, DOC, 0, true, true)).rejects.toBeInstanceOf(InvalidInputError);
    await expect(setPageSelected(ports, "not-a-uuid", 4, true, true)).rejects.toBeInstanceOf(InvalidInputError);
    await docs.update(DOC, { status: "skipped" });
    await expect(setPageSelected(ports, DOC, 7, true, true)).rejects.toBeInstanceOf(InvalidInputError);
  });
});

describe("setBudget", () => {
  it("accepts 1 to 40 and stores it", async () => {
    await setBudget(ports, DOC, 40);
    expect((await docs.get(DOC))?.llmPageBudget).toBe(40);
    await setBudget(ports, DOC, 1);
    expect((await docs.get(DOC))?.llmPageBudget).toBe(1);
  });

  it("refuses 0, 41, a fraction and a non-number", async () => {
    for (const bad of [0, 41, 2.5, Number.NaN, -3]) expect(await code(setBudget(ports, DOC, bad))).toBe("budget-range");
    expect((await docs.get(DOC))?.llmPageBudget).toBe(3);
  });
});

describe("retryAttention and skipAttention", () => {
  beforeEach(() => {
    inbox.steps.push(
      { jobId: job, kind: "extract_page", pageNo: 4, status: "needs_attention", failures: 3, lastError: "x" },
      { jobId: job, kind: "extract_page", pageNo: 5, status: "done", failures: 0, lastError: null },
    );
  });

  it("try again queues the stuck steps with their failures cleared and leaves the rest", async () => {
    await retryAttention(ports, DOC);
    expect(inbox.steps.filter((s) => s.kind === "extract_page")).toEqual([
      { jobId: job, kind: "extract_page", pageNo: 4, status: "queued", failures: 0, lastError: null },
      { jobId: job, kind: "extract_page", pageNo: 5, status: "done", failures: 0, lastError: null },
    ]);
  });

  it("skip sets the stuck steps to skipped", async () => {
    await skipAttention(ports, DOC);
    expect(extractSteps()).toEqual([
      [4, "skipped"],
      [5, "done"],
    ]);
  });

  it("a document with no live job has nothing to retry, and that is not an error", async () => {
    await inbox.cancelJob(DOC);
    await expect(retryAttention(ports, DOC)).resolves.toBeUndefined();
  });
});

describe("skipDocument", () => {
  it("sets the document skipped and cancels its job, so queued steps stop spending the allowance", async () => {
    await skipDocument(ports, DOC);
    expect((await docs.get(DOC))?.status).toBe("skipped");
    expect(inbox.jobs.get(job)?.cancelled).toBe(true);
  });

  it("cancels the job before it marks the document skipped, so a failed status write leaves nothing running", async () => {
    const seen: string[] = [];
    const cancel = ports.inbox.cancelJob;
    ports.inbox.cancelJob = async (id) => (seen.push("cancel"), cancel(id));
    const update = docs.update;
    docs.update = async (id, patch) => (seen.push(`status ${patch.status}`), update(id, patch));
    await skipDocument(ports, DOC);
    expect(seen).toEqual(["cancel", "status skipped"]);
  });

  it("is repeatable", async () => {
    await skipDocument(ports, DOC);
    await expect(skipDocument(ports, DOC)).resolves.toBeUndefined();
  });

  it("never skips an upload that has not finished: its hash would lock the file out", async () => {
    await docs.update(DOC, { status: "uploading" });
    await expect(skipDocument(ports, DOC)).rejects.toBeInstanceOf(InvalidInputError);
    expect((await docs.get(DOC))?.status).toBe("uploading");
  });
});

describe("readSelected", () => {
  it("queues a step for every ticked page that has none, for documents read while AI was off", async () => {
    pages([4, 5, 6]);
    await inbox.queue.enqueue(job, [{ kind: "extract_page", pageNo: 5 }]);
    await readSelected(ports, DOC, true);
    expect(extractSteps()).toEqual([
      [5, "queued"],
      [4, "queued"],
      [6, "queued"],
    ]);
  });

  it("is a no-op when run twice, and refuses while AI is off", async () => {
    pages([4]);
    await readSelected(ports, DOC, true);
    await readSelected(ports, DOC, true);
    expect(extractSteps()).toEqual([[4, "queued"]]);
    expect(await code(readSelected(ports, DOC, false))).toBe("ai-off");
  });

  it("a document without a live job has nothing to queue on", async () => {
    pages([4]);
    await inbox.cancelJob(DOC);
    await expect(readSelected(ports, DOC, true)).rejects.toBeInstanceOf(InvalidInputError);
  });
});

describe("inbox messages", () => {
  it("every InboxError code is a desk message code whose text equals the error's message", () => {
    for (const c of Object.keys(INBOX_ERROR_TEXT) as InboxErrorCode[]) {
      expect(errorCode(new InboxError(c))).toBe(c);
      expect(errorText(c)).toBe(new InboxError(c).message);
    }
  });
});
