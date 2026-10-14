import { beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryInbox, type MemoryInbox } from "@/test/fakes/inbox-repo";
import type { InboxPorts } from "./inbox-ops";
import { finishTranscript } from "./voice-ops";

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const PDF = "7a1d2c3b-4a59-4e8d-b7c6-a1b2c3d4e5f6";

let docs: MemoryDocumentsRepo;
let inbox: MemoryInbox;
let ports: InboxPorts;
let job: string;

beforeEach(async () => {
  docs = createMemoryDocumentsRepo();
  inbox = createMemoryInbox();
  ports = { docs, inbox, queue: inbox.queue };
  await docs.insertUploading({ id: DOC, title: "Dealer call", kind: "audio", storagePath: `${DOC}.m4a`, sha256: "a".repeat(64), bytes: 10, companyId: null, filedOn: null, sourceUrl: null, transcriptStatus: "pending" });
  await docs.update(DOC, { status: "active" });
  docs.objects.set(`${DOC}.m4a`, { size: 10, mimetype: "audio/mp4" });
  job = await inbox.queue.createJob(DOC, "ingest_audio", { kind: "transcribe", pageNo: 1 });
});

describe("finishTranscript", () => {
  it.each(["saved", "discarded"] as const)("%s: records the decision, stops the job, deletes the recording and moves the note to Finished", async (decision) => {
    await finishTranscript(ports, DOC, decision);
    const doc = await docs.get(DOC);
    expect(doc).toMatchObject({ transcriptStatus: decision, status: "done" });
    expect(doc?.originalDeletedAt).not.toBeNull();
    expect(docs.objects.has(`${DOC}.m4a`)).toBe(false);
    expect(inbox.jobs.get(job)?.cancelled).toBe(true);
  });

  it("writes the decision before it closes the note, so a failure part-way can be pressed again", async () => {
    docs.removeObject = async () => {
      throw new Error("storage down");
    };
    await expect(finishTranscript(ports, DOC, "saved")).rejects.toThrow("storage down");
    expect(await docs.get(DOC)).toMatchObject({ transcriptStatus: "saved", status: "active" });
    docs.removeObject = createMemoryDocumentsRepo().removeObject;
    await finishTranscript(ports, DOC, "saved");
    expect(await docs.get(DOC)).toMatchObject({ transcriptStatus: "saved", status: "done" });
  });

  it("is a no-op the second time (the card's double press)", async () => {
    await finishTranscript(ports, DOC, "saved");
    await expect(finishTranscript(ports, DOC, "saved")).resolves.toBeUndefined();
    expect(await docs.get(DOC)).toMatchObject({ transcriptStatus: "saved", status: "done" });
  });

  it("does not undo a decision already made the other way", async () => {
    await finishTranscript(ports, DOC, "discarded");
    await expect(finishTranscript(ports, DOC, "saved")).rejects.toBeInstanceOf(InvalidInputError);
    expect((await docs.get(DOC))?.transcriptStatus).toBe("discarded");
  });

  it("refuses a document that is not a voice note, one that is skipped or not finished uploading, and a bad id", async () => {
    await docs.insertUploading({ id: PDF, title: "AR", kind: "pdf", storagePath: `${PDF}.pdf`, sha256: "b".repeat(64), bytes: 10, companyId: null, filedOn: null, sourceUrl: null });
    await docs.update(PDF, { status: "active" });
    await expect(finishTranscript(ports, PDF, "saved")).rejects.toBeInstanceOf(InvalidInputError);
    expect((await docs.get(PDF))?.status).toBe("active");
    await docs.update(DOC, { status: "skipped" });
    await expect(finishTranscript(ports, DOC, "saved")).rejects.toBeInstanceOf(InvalidInputError);
    await expect(finishTranscript(ports, "not-an-id", "saved")).rejects.toBeInstanceOf(InvalidInputError);
  });
});
