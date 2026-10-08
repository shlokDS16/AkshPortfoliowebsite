import { describe, expect, it } from "vitest";
import { DOCUMENT_ERROR_TEXT } from "@/modules/documents";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import type { QueueRepo } from "./queue-repo";
import { FIRST_STEP, runFinishUpload, runStartUpload } from "./upload-flow";

// Voice notes through the upload flow (Plan 2b Task 4, ruling R12): refused while the switch is off, then an ingest_audio
// job whose first step is `transcribe` on page 1, carrying the length the browser measured.

const ID = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const BYTES = 3_000_000;
const note = { kind: "audio" as const, fileName: "dealer call.m4a", bytes: BYTES, mime: "audio/x-m4a", sha256: "d".repeat(64), companyId: null, filedOn: null, sourceUrl: null, seconds: 184 };

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
  expect(await runStartUpload(docs, note, () => ID, { voiceOn: true })).toMatchObject({ ok: true, path: `${ID}.m4a` });
  docs.objects.set(`${ID}.m4a`, { size: BYTES, mimetype: "audio/x-m4a" });
  return docs;
}

describe("runStartUpload for a voice note", () => {
  it("is refused with the fixed voice-off sentence while the switch is off, and nothing is stored", async () => {
    const docs = createMemoryDocumentsRepo();
    const expected = { ok: false, code: "voice-off", message: DOCUMENT_ERROR_TEXT["voice-off"] };
    expect(await runStartUpload(docs, note, () => ID)).toEqual(expected);
    expect(await runStartUpload(docs, note, () => ID, { voiceOn: false })).toEqual(expected);
    expect(docs.docs.size).toBe(0);
    expect(DOCUMENT_ERROR_TEXT["voice-off"]).toBe("Voice notes are not switched on yet.");
  });

  it("refuses a recording over the hour allowance and a file over 25 MB with their own sentences", async () => {
    const docs = createMemoryDocumentsRepo();
    expect(await runStartUpload(docs, { ...note, seconds: 5_401 }, () => ID, { voiceOn: true })).toMatchObject({ ok: false, code: "voice-too-long" });
    expect(await runStartUpload(docs, { ...note, bytes: 25_000_001 }, () => ID, { voiceOn: true })).toMatchObject({ ok: false, code: "voice-too-large" });
    expect(docs.docs.size).toBe(0);
  });
});

describe("runFinishUpload for a voice note", () => {
  it("creates an ingest_audio job whose first step is transcribe on page 1 with the measured length", async () => {
    const docs = await uploaded();
    const { queue, jobs } = fakeQueue();
    expect(await runFinishUpload(docs, queue, ID, 183.4)).toEqual({ ok: true });
    expect(docs.docs.get(ID)?.status).toBe("active");
    expect(jobs).toEqual([{ documentId: ID, kind: "ingest_audio", first: { kind: "transcribe", pageNo: 1, args: { seconds: 184 } } }]);
    expect(FIRST_STEP.audio?.step).toEqual({ kind: "transcribe", pageNo: 1 });
  });

  it.each([undefined, null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY, 2_000_000, "90" as unknown as number])("keeps no length when the claim is %s", async (claimed) => {
    const docs = await uploaded();
    const { queue, jobs } = fakeQueue();
    await runFinishUpload(docs, queue, ID, claimed);
    expect(jobs[0]?.first).toEqual({ kind: "transcribe", pageNo: 1 });
  });

  it("a PDF never carries a length, whatever the browser says", async () => {
    const docs = createMemoryDocumentsRepo();
    const pdf = { kind: "pdf" as const, fileName: "a.pdf", bytes: 1000, mime: "application/pdf", sha256: "e".repeat(64), companyId: null, filedOn: null, sourceUrl: null };
    await runStartUpload(docs, pdf, () => ID);
    docs.objects.set(`${ID}.pdf`, { size: 1000, mimetype: "application/pdf" });
    const { queue, jobs } = fakeQueue();
    await runFinishUpload(docs, queue, ID, 99);
    expect(jobs[0]?.first).toEqual({ kind: "pdf_text", pageNo: 1 });
  });
});
