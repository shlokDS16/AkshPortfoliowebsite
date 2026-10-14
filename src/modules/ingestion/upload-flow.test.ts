import { describe, expect, it, vi } from "vitest";
import { DbError } from "@/lib/supabase/errors";
import { DOCUMENT_ERROR_TEXT } from "@/modules/documents";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import type { QueueRepo } from "./queue-repo";
import { FIRST_STEP, runFinishUpload, runStartUpload } from "./upload-flow";

const ID = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const SHA = "b".repeat(64);
const BYTES = 2_000_000;
const input = { kind: "pdf" as const, fileName: "Results Q1.pdf", bytes: BYTES, mime: "application/pdf", sha256: SHA, companyId: null, filedOn: null, sourceUrl: null };

function fakeQueue() {
  const jobs: { documentId: string; kind: string; first: unknown }[] = [];
  const queue: QueueRepo = {
    claim: async () => null,
    finish: async () => true,
    enqueue: async () => undefined,
    createJob: async (documentId, kind, first) => (jobs.push({ documentId, kind, first }), "job-1"),
  };
  return { queue, jobs };
}

describe("runStartUpload", () => {
  it("returns the signed upload on success", async () => {
    const result = await runStartUpload(createMemoryDocumentsRepo(), input, () => ID);
    expect(result).toEqual({ ok: true, documentId: ID, path: `${ID}.pdf`, token: `token-for-${ID}.pdf` });
  });

  it("returns a fixed code and message for a refusal, with the earlier copy for a duplicate", async () => {
    const docs = createMemoryDocumentsRepo();
    await runStartUpload(docs, input, () => ID);
    await docs.update(ID, { status: "active" });
    const result = await runStartUpload(docs, input, () => "other");
    expect(result).toEqual({
      ok: false, code: "upload-duplicate", message: DOCUMENT_ERROR_TEXT["upload-duplicate"],
      earlier: { id: ID, createdAt: docs.docs.get(ID)!.createdAt },
    });
    expect(await runStartUpload(docs, { ...input, mime: "text/plain" }, () => "x")).toMatchObject({ ok: false, code: "upload-unsupported" });
  });

  it("never returns or logs a database message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const docs = createMemoryDocumentsRepo();
    docs.usage = async () => {
      throw new DbError("documents.usage", "08006", "password=hunter2 connection refused");
    };
    const result = await runStartUpload(docs, input, () => ID);
    expect(result).toMatchObject({ ok: false, code: "save-failed" });
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(JSON.stringify(error.mock.calls)).not.toContain("hunter2");
  });
});

describe("runFinishUpload", () => {
  async function uploaded() {
    const docs = createMemoryDocumentsRepo();
    await runStartUpload(docs, input, () => ID);
    docs.objects.set(`${ID}.pdf`, { size: BYTES, mimetype: "application/pdf" });
    return docs;
  }

  it("activates the document and creates its job with the first pdf_text step", async () => {
    const docs = await uploaded();
    const { queue, jobs } = fakeQueue();
    expect(await runFinishUpload(docs, queue, ID)).toEqual({ ok: true });
    expect(docs.docs.get(ID)?.status).toBe("active");
    expect(jobs).toEqual([{ documentId: ID, kind: "ingest_pdf", first: { kind: "pdf_text", pageNo: 1 } }]);
  });

  it("a photo's job is an image job whose first step is the scan reader on its one page", async () => {
    const docs = createMemoryDocumentsRepo();
    const photo = { ...input, kind: "image" as const, fileName: "table.jpg", mime: "image/jpeg", bytes: 900_000, sha256: "c".repeat(64) };
    expect(await runStartUpload(docs, photo, () => ID)).toMatchObject({ ok: true, path: `${ID}.jpg` });
    docs.objects.set(`${ID}.jpg`, { size: 900_000, mimetype: "image/jpeg" });
    const { queue, jobs } = fakeQueue();
    expect(await runFinishUpload(docs, queue, ID)).toEqual({ ok: true });
    expect(jobs).toEqual([{ documentId: ID, kind: "ingest_image", first: { kind: "ocr_page", pageNo: 1 } }]);
    expect(FIRST_STEP.image?.step).toEqual({ kind: "ocr_page", pageNo: 1 });
  });

  it("creates no job when the upload did not arrive", async () => {
    const docs = createMemoryDocumentsRepo();
    await runStartUpload(docs, input, () => ID);
    const { queue, jobs } = fakeQueue();
    expect(await runFinishUpload(docs, queue, ID)).toMatchObject({ ok: false, code: "upload-missing" });
    expect(jobs).toEqual([]);
  });

  it("never restarts a document Aksh marked done or skipped", async () => {
    const docs = await uploaded();
    await docs.update(ID, { status: "skipped" });
    const { queue, jobs } = fakeQueue();
    expect(await runFinishUpload(docs, queue, ID)).toEqual({ ok: true });
    expect(jobs).toEqual([]);
  });
});
