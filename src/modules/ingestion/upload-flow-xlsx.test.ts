import { describe, expect, it } from "vitest";
import { DOCUMENT_ERROR_TEXT, XLSX_MIME } from "@/modules/documents";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import type { QueueRepo } from "./queue-repo";
import { FIRST_STEP, runFinishUpload, runStartUpload } from "./upload-flow";

// A valuation workbook through the upload flow (Plan 2.7 Task 2): refused without a company, then a valuation version is recorded and an
// ingest_xlsx job is created whose first step is xlsx_read on page 1 (job_steps wants a page number on every step but select_pages).

const ID = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const COMPANY = "6f1d2c3b-4a59-4e8d-b7c6-a1b2c3d4e5f6";
const BYTES = 2_000_000;
const book = { kind: "xlsx" as const, fileName: "Kaveri DCF.xlsx", bytes: BYTES, mime: XLSX_MIME, sha256: "e".repeat(64), companyId: COMPANY, filedOn: null, sourceUrl: null };

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

async function uploaded() {
  const docs = createMemoryDocumentsRepo();
  expect(await runStartUpload(docs, book, () => ID)).toMatchObject({ ok: true, path: `${ID}.xlsx` });
  docs.objects.set(`${ID}.xlsx`, { size: BYTES, mimetype: XLSX_MIME });
  return docs;
}

describe("runStartUpload for a workbook", () => {
  it("is refused with the fixed company sentence when no company is chosen, and nothing is stored", async () => {
    const docs = createMemoryDocumentsRepo();
    expect(await runStartUpload(docs, { ...book, companyId: null }, () => ID)).toEqual({
      ok: false, code: "upload-xlsx-needs-company", message: DOCUMENT_ERROR_TEXT["upload-xlsx-needs-company"],
    });
    expect(docs.docs.size).toBe(0);
  });

  it("is refused over 10 MB and as .xlsm with their own sentences", async () => {
    const docs = createMemoryDocumentsRepo();
    expect(await runStartUpload(docs, { ...book, bytes: 10 * 1024 * 1024 + 1 }, () => ID)).toMatchObject({ ok: false, code: "upload-xlsx-too-large" });
    expect(await runStartUpload(docs, { ...book, fileName: "Kaveri DCF.xlsm" }, () => ID)).toMatchObject({ ok: false, code: "upload-unsupported" });
    expect(docs.docs.size).toBe(0);
  });
});

describe("runFinishUpload for a workbook", () => {
  it("records the valuation version, activates the document and creates an ingest_xlsx job whose first step is xlsx_read on page 1", async () => {
    const docs = await uploaded();
    const { queue, jobs } = fakeQueue();
    expect(await runFinishUpload(docs, queue, ID)).toEqual({ ok: true });
    expect(docs.valuationStarts).toEqual([ID]);
    expect(docs.docs.get(ID)?.status).toBe("active");
    expect(jobs).toEqual([{ documentId: ID, kind: "ingest_xlsx", first: { kind: "xlsx_read", pageNo: 1 } }]);
    expect(FIRST_STEP.xlsx?.step).toEqual({ kind: "xlsx_read", pageNo: 1 });
  });

  it("creates no job when the version cannot be recorded, and the document stays uploading so the same finish can be retried", async () => {
    const docs = await uploaded();
    docs.failValuationStart = true;
    const { queue, jobs } = fakeQueue();
    expect(await runFinishUpload(docs, queue, ID)).toMatchObject({ ok: false });
    expect(jobs).toEqual([]);
    expect(docs.docs.get(ID)?.status).toBe("uploading");
    docs.failValuationStart = false;
    expect(await runFinishUpload(docs, queue, ID)).toEqual({ ok: true });
    expect(jobs).toHaveLength(1);
  });
});
