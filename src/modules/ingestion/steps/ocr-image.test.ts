import { describe, expect, it, vi } from "vitest";
import type { LlmPort } from "@/lib/providers/llm";
import type { OcrPort, OcrResult } from "@/lib/providers/ocr";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { OCR_BUCKET, OCR_MAX_BYTES } from "../caps";
import { machineDocuments, type StepDeps } from "../deps";
import { IMAGE_NOT_STORED, OCR_KEY_REFUSED, OCR_TOO_BIG } from "../ocr-copy";
import type { Step, StepContext } from "../types";
import { ocrPage } from "./ocr-page";

// ocr_page on a photo (Plan 2b Task 3): the one page is made here, read by the scan reader, and handed to vision_page.

const DOC = "44444444-4444-4444-8444-444444444444";
const T0 = Date.parse("2026-10-08T10:00:00Z");
const fakeLlm = { name: "fixture", complete: vi.fn() } as unknown as LlmPort;
const TEXT = "Consolidated Statement of Profit and Loss\nRevenue from operations 1,284.00 1,102.00\nFinance costs 41.20 38.90";

function ocrWith(...answers: OcrResult[]): OcrPort & { read: ReturnType<typeof vi.fn> } {
  const queue = [...answers];
  return { name: "fixture", read: vi.fn(async () => queue.shift() ?? ({ kind: "ok", text: TEXT } as OcrResult)) };
}

function setup(over: { path?: string | null; deleted?: boolean; bytes?: number } = {}): MemoryDocumentsRepo {
  const repo = createMemoryDocumentsRepo();
  const path = over.path === undefined ? `${DOC}.jpg` : over.path;
  repo.docs.set(DOC, {
    id: DOC, companyId: null, title: "Q2 table", kind: "image", storagePath: path, sha256: "e".repeat(64), bytes: 10, pageCount: null,
    status: "active", llmPageBudget: 20, basis: "consolidated", sourceType: "Annual report", filedOn: null, sourceUrl: null,
    originalDeletedAt: over.deleted ? new Date(T0).toISOString() : null, createdAt: new Date(T0).toISOString(),
  });
  if (path) repo.files.set(path, new Uint8Array(over.bytes ?? 64).fill(7));
  return repo;
}

function ctx(repo: MemoryDocumentsRepo, ocr: OcrPort | null, opts: { llm?: LlmPort | null; usage?: ReturnType<typeof createMemoryUsageRepo> } = {}): StepContext {
  const deps: StepDeps = {
    llm: opts.llm === undefined ? fakeLlm : opts.llm,
    ocr,
    models: { text: "test-model", vision: "test-vision" },
    repos: { documents: machineDocuments(repo), usage: opts.usage ?? createMemoryUsageRepo(), proposals: createMemoryProposalsRepo(), research: createMemoryResearch() },
    now: () => new Date(T0),
    clock: () => T0,
  };
  const step: Step = {
    id: "step-1", jobId: "job-1", kind: "ocr_page", pageNo: 1, args: {}, status: "running", schemaFailures: 0, providerFailures: 0,
    leaseExpiries: 0, notBefore: new Date(T0).toISOString(), leaseOwner: "owner", lastError: null,
  };
  return { step, documentId: DOC, deadline: T0 + 240_000, deps };
}

describe("ocr_page on a photo", () => {
  it("makes page 1, reads the picture with one reserved request, writes the text over it and queues the vision read", async () => {
    const repo = setup();
    const ocr = ocrWith();
    const usage = createMemoryUsageRepo();
    const out = await ocrPage(ctx(repo, ocr, { usage }));
    expect(out).toEqual({ kind: "done", result: { chars: TEXT.length, ocr: true }, enqueue: [{ kind: "vision_page", pageNo: 1 }] });
    expect(ocr.read).toHaveBeenCalledTimes(1);
    const [file, opts] = ocr.read.mock.calls[0] as [{ bytes: Uint8Array; filetype: string }, { table: boolean }];
    expect(file.filetype).toBe("JPG");
    expect(file.bytes.byteLength).toBe(64);
    expect(opts.table).toBe(true);
    expect(usage.reservations).toEqual([{ id: "res-1", bucket: OCR_BUCKET, tokens: 1, settled: { used: 1, status: "used" } }]);
    expect(repo.pages.get(`${DOC}:1`)).toMatchObject({ text: TEXT, ocr: true, isScan: false });
    expect(repo.docs.get(DOC)?.pageCount).toBe(1);
  });

  it("names the file type to the reader by the stored extension", async () => {
    for (const [ext, type] of [["png", "PNG"], ["webp", "WEBP"]] as const) {
      const ocr = ocrWith();
      await ocrPage(ctx(setup({ path: `${DOC}.${ext}` }), ocr));
      expect((ocr.read.mock.calls[0] as [{ filetype: string }])[0].filetype).toBe(type);
    }
  });

  it("goes on to the vision read even when the reader found nothing: the figures are then flagged, not lost", async () => {
    const repo = setup();
    const out = await ocrPage(ctx(repo, ocrWith({ kind: "ok", text: "" })));
    expect(out).toEqual({ kind: "done", result: { chars: 0, ocr: true }, enqueue: [{ kind: "vision_page", pageNo: 1 }] });
    expect(repo.pages.get(`${DOC}:1`)).toMatchObject({ text: "", ocr: true });
  });

  it("a rerun after the text was written makes no second request, and still queues the vision read", async () => {
    const repo = setup();
    await ocrPage(ctx(repo, ocrWith()));
    const ocr = ocrWith();
    const out = await ocrPage(ctx(repo, ocr));
    expect(ocr.read).not.toHaveBeenCalled();
    expect(out).toMatchObject({ kind: "done", enqueue: [{ kind: "vision_page", pageNo: 1 }] });
  });

  it("with AI reading off the text is kept and no vision step is queued", async () => {
    const out = await ocrPage(ctx(setup(), ocrWith(), { llm: null }));
    expect(out).toEqual({ kind: "done", result: { chars: TEXT.length, ocr: true, aiOff: true } });
  });

  it("waits, as every scan does, when scan reading is off", async () => {
    expect(await ocrPage(ctx(setup(), null))).toEqual({ kind: "defer", notBefore: new Date(T0 + 6 * 3_600_000), reason: "ocr_off" });
  });

  it("needs attention when the photo is gone, and sends nothing", async () => {
    const ocr = ocrWith();
    expect(await ocrPage(ctx(setup({ deleted: true }), ocr))).toEqual({ kind: "attention", error: IMAGE_NOT_STORED });
    expect(await ocrPage(ctx(setup({ path: null }), ocr))).toEqual({ kind: "attention", error: IMAGE_NOT_STORED });
    expect(ocr.read).not.toHaveBeenCalled();
  });

  it("a stored picture over the reader's 1 MB is not sent and reserves nothing", async () => {
    const ocr = ocrWith();
    const usage = createMemoryUsageRepo();
    expect(await ocrPage(ctx(setup({ bytes: OCR_MAX_BYTES + 1 }), ocr, { usage }))).toEqual({ kind: "attention", error: OCR_TOO_BIG });
    expect(ocr.read).not.toHaveBeenCalled();
    expect(usage.reservations).toEqual([]);
  });

  it("a quota answer holds the scan bucket for the day and a key refusal is a sentence; neither counts as a failure", async () => {
    const quota = await ocrPage(ctx(setup(), ocrWith({ kind: "refused", reason: "day", message: "HTTP 403" })));
    expect(quota).toMatchObject({ kind: "defer", reason: "ocr_day" });
    expect(await ocrPage(ctx(setup(), ocrWith({ kind: "refused", reason: "key", message: "HTTP 401" })))).toEqual({ kind: "attention", error: OCR_KEY_REFUSED });
  });

  it("a provider error retries the step as a provider failure and writes nothing", async () => {
    const repo = setup();
    const out = await ocrPage(ctx(repo, ocrWith({ kind: "provider_error", message: "HTTP 500" })));
    expect(out).toEqual({ kind: "retry", failure: "provider", error: "HTTP 500" });
    expect(repo.pages.get(`${DOC}:1`)).toMatchObject({ text: "", ocr: false });
  });
});
