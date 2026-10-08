import { beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { errorCode, errorText } from "@/lib/messages";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryInbox, type MemoryInbox } from "@/test/fakes/inbox-repo";
import { INBOX_ERROR_TEXT, InboxError, type InboxErrorCode } from "./errors";
import { markDone, readSelected, retryAttention, setBudget, setPageSelected, skipAttention, skipDocument, type InboxPorts } from "./inbox-ops";

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
  await docs.insertUploading({ id: DOC, title: "AR", kind: "pdf", storagePath: `${DOC}.pdf`, sha256: SHA, bytes: 10, companyId: null, filedOn: null, sourceUrl: null });
  await docs.update(DOC, { status: "active", llmPageBudget: 3 });
  job = await inbox.queue.createJob(DOC, "ingest_pdf", { kind: "pdf_text", pageNo: 1 });
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

  it("ticking a page the rule already ticked queues its read, even at the budget, and leaves the tick as the rule's", async () => {
    pages([4, 5, 6]);
    await setPageSelected(ports, DOC, 5, true, true);
    expect(extractSteps()).toEqual([[5, "queued"]]);
    expect(inbox.pages.get(`${DOC}:5`)).toEqual({ selected: true, selectedBy: "rule" });
  });

  it("ticking an already ticked page again is harmless: one step, and a finished read stays finished", async () => {
    pages([4, 5]);
    await setPageSelected(ports, DOC, 4, true, true);
    await setPageSelected(ports, DOC, 4, true, true);
    expect(extractSteps()).toEqual([[4, "queued"]]);
    inbox.steps.find((s) => s.pageNo === 4)!.status = "done";
    await setPageSelected(ports, DOC, 4, true, true);
    expect(extractSteps()).toEqual([[4, "done"]]);
  });

  it("with AI off, ticking an already ticked page makes no step", async () => {
    pages([4, 5, 6]);
    await setPageSelected(ports, DOC, 5, true, false);
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

describe("skipping a voice note deletes the recording", () => {
  const VOICE = "6f1d2c3b-4a59-4e8d-b7c6-a1b2c3d4e5f6";
  let voiceJob: string;
  beforeEach(async () => {
    await docs.insertUploading({ id: VOICE, title: "Call", kind: "audio", storagePath: `${VOICE}.m4a`, sha256: "c".repeat(64), bytes: 10, companyId: null, filedOn: null, sourceUrl: null, transcriptStatus: "pending" });
    await docs.update(VOICE, { status: "active" });
    docs.objects.set(`${VOICE}.m4a`, { size: 10, mimetype: "audio/mp4" });
    voiceJob = await inbox.queue.createJob(VOICE, "ingest_audio", { kind: "transcribe", pageNo: 1 });
  });

  it("Skip this document: the job stops, the recording goes, the time it went is kept and the note is skipped", async () => {
    await skipDocument(ports, VOICE);
    const doc = await docs.get(VOICE);
    expect(doc?.status).toBe("skipped");
    expect(doc?.originalDeletedAt).not.toBeNull();
    expect(docs.objects.has(`${VOICE}.m4a`)).toBe(false);
    expect(inbox.jobs.get(voiceJob)?.cancelled).toBe(true);
  });

  it("Skip on a note that could not be typed out does the same", async () => {
    await skipAttention(ports, VOICE);
    expect(await docs.get(VOICE)).toMatchObject({ status: "skipped" });
    expect(docs.objects.has(`${VOICE}.m4a`)).toBe(false);
  });

  it("can be pressed again after a failure part-way, and after it worked", async () => {
    const remove = docs.removeObject;
    docs.removeObject = async () => {
      throw new Error("storage down");
    };
    await expect(skipDocument(ports, VOICE)).rejects.toThrow("storage down");
    expect((await docs.get(VOICE))?.status).toBe("active");
    docs.removeObject = remove;
    await skipDocument(ports, VOICE);
    await expect(skipDocument(ports, VOICE)).resolves.toBeUndefined();
    expect(await docs.get(VOICE)).toMatchObject({ status: "skipped" });
  });

  it("a PDF keeps its original when skipped (as before)", async () => {
    docs.objects.set(`${DOC}.pdf`, { size: 10, mimetype: "application/pdf" });
    await skipDocument(ports, DOC);
    expect(docs.objects.has(`${DOC}.pdf`)).toBe(true);
    expect((await docs.get(DOC))?.originalDeletedAt).toBeNull();
  });
});

describe("markDone", () => {
  it("cancels the job, deletes the stored PDF and marks the document done with the time the original went", async () => {
    docs.objects.set(`${DOC}.pdf`, { size: 10, mimetype: "application/pdf" });
    await markDone(ports, DOC);
    const doc = await docs.get(DOC);
    expect(doc?.status).toBe("done");
    expect(doc?.originalDeletedAt).not.toBeNull();
    expect(docs.objects.has(`${DOC}.pdf`)).toBe(false);
    expect(inbox.jobs.get(job)?.cancelled).toBe(true);
  });

  it("stops the job first, then deletes the file, then writes the status", async () => {
    const seen: string[] = [];
    const cancel = ports.inbox.cancelJob;
    ports.inbox.cancelJob = async (id) => (seen.push("cancel"), cancel(id));
    const remove = docs.removeObject;
    docs.removeObject = async (path) => (seen.push("remove"), remove(path));
    const update = docs.update;
    docs.update = async (id, patch) => (seen.push(`status ${patch.status}`), update(id, patch));
    await markDone(ports, DOC);
    expect(seen).toEqual(["cancel", "remove", "status done"]);
  });

  it("can be pressed again after a failure part-way, and again after it worked", async () => {
    docs.removeObject = async () => {
      throw new Error("storage down");
    };
    await expect(markDone(ports, DOC)).rejects.toThrow("storage down");
    expect((await docs.get(DOC))?.status).toBe("active");
    docs.removeObject = createMemoryDocumentsRepo().removeObject;
    await markDone(ports, DOC);
    await expect(markDone(ports, DOC)).resolves.toBeUndefined();
    expect((await docs.get(DOC))?.status).toBe("done");
  });

  it("never touches an upload that has not finished, a skipped document, or one that does not exist", async () => {
    await docs.update(DOC, { status: "uploading" });
    await expect(markDone(ports, DOC)).rejects.toBeInstanceOf(InvalidInputError);
    await docs.update(DOC, { status: "skipped" });
    await expect(markDone(ports, DOC)).rejects.toBeInstanceOf(InvalidInputError);
    await expect(markDone(ports, "not-an-id")).rejects.toBeInstanceOf(InvalidInputError);
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

describe("scanned pages (ruling R6): the tick and the keep-reading button route a scan to the scan reader", () => {
  const stepsOf = () => inbox.steps.filter((s) => s.kind !== "pdf_text").map((s) => [s.kind, s.pageNo, s.status]);
  const scan = (pageNo: number, selected = false) => inbox.pages.set(`${DOC}:${pageNo}`, { selected, selectedBy: selected ? "rule" : null, isScan: true });

  it("ticking a scan page queues ocr_page, not extract_page", async () => {
    pages([]);
    scan(7);
    await setPageSelected(ports, DOC, 7, true, true);
    expect(stepsOf()).toEqual([["ocr_page", 7, "queued"]]);
    expect(inbox.pages.get(`${DOC}:7`)).toMatchObject({ selected: true, selectedBy: "aksh", isScan: true });
  });

  it("unticking a scan page skips its queued scan read, and ticking it again revives that step", async () => {
    pages([]);
    scan(7);
    await setPageSelected(ports, DOC, 7, true, true);
    await setPageSelected(ports, DOC, 7, false, true);
    expect(stepsOf()).toEqual([["ocr_page", 7, "skipped"]]);
    await setPageSelected(ports, DOC, 7, true, true);
    expect(stepsOf()).toEqual([["ocr_page", 7, "queued"]]);
  });

  it("a scan page counts against the page budget like any other", async () => {
    pages([4, 5, 6]);
    scan(7);
    expect(await code(setPageSelected(ports, DOC, 7, true, true))).toBe("page-budget-reached");
  });

  it("readSelected queues the scan reader for a ticked scan and the figure reader for a ticked digital page", async () => {
    pages([4]);
    scan(7, true);
    await readSelected(ports, DOC, true);
    expect(stepsOf()).toEqual([
      ["extract_page", 4, "queued"],
      ["ocr_page", 7, "queued"],
    ]);
  });

  it("readSelected checks the step the page needs: a scan read earlier (now text) gets its extract step, and nothing is queued twice", async () => {
    pages([]);
    inbox.pages.set(`${DOC}:7`, { selected: true, selectedBy: "aksh", isScan: false }); // the scan reader has filled it
    await inbox.queue.enqueue(job, [{ kind: "ocr_page", pageNo: 7 }]);
    inbox.steps.find((s) => s.kind === "ocr_page")!.status = "done";
    await readSelected(ports, DOC, true);
    await readSelected(ports, DOC, true);
    expect(stepsOf()).toEqual([
      ["ocr_page", 7, "done"],
      ["extract_page", 7, "queued"],
    ]);
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
