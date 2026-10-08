import { describe, expect, it, vi } from "vitest";
import type { LlmPort } from "@/lib/providers/llm";
import type { OcrPort, OcrResult } from "@/lib/providers/ocr";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryUsageRepo, type MemoryUsageRepo } from "@/test/fakes/usage-repo";
import { makePdf } from "@/test/fixtures/pdf";
import { OCR_BUCKET, OCR_CAPS } from "../caps";
import { machineDocuments, type StepDeps } from "../deps";
import { OCR_KEY_REFUSED, OCR_NOTHING_READ, OCR_PAGE_REFUSED, OCR_TOO_BIG } from "../ocr-copy";
import type { Step, StepContext } from "../types";
import { ocrPage } from "./ocr-page";
import { PAGE_NOT_STORED } from "./extract-page";
import { PDF_NOT_STORED } from "./pdf-text";

const DOC = "11111111-1111-4111-8111-111111111111";
const T0 = Date.parse("2026-10-07T10:00:00Z");
const fakeLlm = { name: "fixture", complete: vi.fn() } as unknown as LlmPort;

const PL_TEXT = [
  "Consolidated Statement of Profit and Loss for the year ended March 31, 2026",
  "(Rs. in crore)",
  "Revenue from operations 1,284.00 1,102.00",
  "Finance costs 41.20 38.90",
].join("\n");

/** A scan page is an empty one: the PDF is [cover, empty, empty, text]; pages 2 and 3 are scans. */
const PDF = makePdf([["Cover page of the annual report, with no figures on it."], [], [], ["Back page of the annual report, with no figures."]]);

function ocrWith(...answers: OcrResult[]): OcrPort & { read: ReturnType<typeof vi.fn> } {
  const queue = [...answers];
  return { name: "fixture", read: vi.fn(async () => queue.shift() ?? ({ kind: "ok", text: PL_TEXT } as OcrResult)) };
}

type Over = { selected?: boolean; selectedBy?: "rule" | "aksh" | null; budget?: number; ocr?: boolean; text?: string; stored?: boolean };

function setup(over: Over = {}): MemoryDocumentsRepo {
  const repo = createMemoryDocumentsRepo();
  repo.docs.set(DOC, {
    id: DOC, companyId: null, title: "Scanned report", kind: "pdf", storagePath: over.stored === false ? null : `${DOC}.pdf`, sha256: "a".repeat(64),
    bytes: PDF.byteLength, pageCount: 4, status: "active", llmPageBudget: over.budget ?? 20, basis: "consolidated", sourceType: "Annual report",
    filedOn: null, sourceUrl: null, originalDeletedAt: null, transcriptStatus: null, createdAt: new Date(T0).toISOString(),
  });
  repo.files.set(`${DOC}.pdf`, PDF);
  const text = [["Cover page of the annual report, with no figures on it."], [""], [""], ["Back page of the annual report, with no figures."]];
  text.forEach(([t], i) => repo.pages.set(`${DOC}:${i + 1}`, {
    documentId: DOC, pageNo: i + 1, text: t, charCount: t.length, isScan: t.trim().length < 50, kind: null, basis: null, score: 0,
    selected: i === 1 ? (over.selected ?? false) : false, selectedBy: i === 1 ? (over.selectedBy ?? null) : null, ocr: false,
  }));
  if (over.text !== undefined) {
    const p = repo.pages.get(`${DOC}:2`)!;
    repo.pages.set(`${DOC}:2`, { ...p, text: over.text, charCount: over.text.length, isScan: over.text.trim().length < 50, ocr: over.ocr ?? false });
  }
  return repo;
}

function ctx(repo: MemoryDocumentsRepo, ocr: OcrPort | null, opts: { llm?: LlmPort | null; usage?: MemoryUsageRepo; clock?: () => number; pageNo?: number } = {}): StepContext {
  const deps: StepDeps = {
    llm: opts.llm === undefined ? fakeLlm : opts.llm,
    ocr,
    transcriber: null,
    models: { text: "test-model", vision: "test-vision", classify: "test-classify", whisper: "test-whisper" },
    repos: { documents: machineDocuments(repo), usage: opts.usage ?? createMemoryUsageRepo(), proposals: createMemoryProposalsRepo(), research: createMemoryResearch(), digests: createMemoryDigestsRepo() },
    now: () => new Date(T0),
    clock: opts.clock ?? (() => T0),
  };
  const step: Step = {
    id: "step-1", jobId: "job-1", kind: "ocr_page", pageNo: opts.pageNo ?? 2, args: {}, status: "running", schemaFailures: 0, providerFailures: 0,
    leaseExpiries: 0, notBefore: new Date(T0).toISOString(), leaseOwner: "owner", lastError: null,
  };
  return { step, documentId: DOC, deadline: T0 + 240_000, deps };
}

const page2 = (repo: MemoryDocumentsRepo) => repo.pages.get(`${DOC}:2`)!;

describe("ocr_page: reading a scan page", () => {
  it("splits the page out, reserves one request, writes the text over the scan and marks it OCR", async () => {
    const repo = setup({ selected: true, selectedBy: "aksh" });
    const ocr = ocrWith({ kind: "ok", text: PL_TEXT });
    const usage = createMemoryUsageRepo();
    const out = await ocrPage(ctx(repo, ocr, { usage }));
    expect(ocr.read).toHaveBeenCalledTimes(1);
    const [file, opts] = ocr.read.mock.calls[0] as [{ bytes: Uint8Array; filetype: string }, { table: boolean }];
    expect(file.filetype).toBe("PDF");
    expect(Buffer.from(file.bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(file.bytes.byteLength).toBeLessThan(PDF.byteLength); // one page, not the report
    expect(opts.table).toBe(true);
    expect(usage.reservations).toEqual([{ id: "res-1", bucket: OCR_BUCKET, tokens: 1, settled: { used: 1, status: "used" } }]);
    expect(page2(repo)).toMatchObject({ text: PL_TEXT, ocr: true, isScan: false, kind: "pl" });
    expect(out.kind).toBe("done");
  });

  it("OCR text over 50 characters makes the page a readable one: Aksh's tick queues its figure reading", async () => {
    const repo = setup({ selected: true, selectedBy: "aksh" });
    const out = await ocrPage(ctx(repo, ocrWith()));
    expect(out).toEqual({ kind: "done", result: { chars: PL_TEXT.length, ocr: true }, enqueue: [{ kind: "extract_page", pageNo: 2 }] });
  });

  it("a statement page nobody ticked is taken as the rule's when the budget has room", async () => {
    const repo = setup({ budget: 3 });
    const out = await ocrPage(ctx(repo, ocrWith()));
    expect(out).toMatchObject({ kind: "done", result: { selected: true }, enqueue: [{ kind: "extract_page", pageNo: 2 }] });
    expect(page2(repo)).toMatchObject({ selected: true, selectedBy: "rule" });
  });

  it("... and left alone when the budget is full, so a whole scanned report does not read past its allowance", async () => {
    const repo = setup({ budget: 1 });
    repo.pages.set(`${DOC}:1`, { ...repo.pages.get(`${DOC}:1`)!, selected: true, selectedBy: "rule" });
    const out = await ocrPage(ctx(repo, ocrWith()));
    expect(out).toEqual({ kind: "done", result: { chars: PL_TEXT.length, ocr: true } });
    expect(page2(repo).selected).toBe(false);
    expect(page2(repo).text).toBe(PL_TEXT); // still searchable
  });

  it("never takes a page Aksh unticked, and a page that is not a statement queues nothing", async () => {
    const unticked = setup({ budget: 5, selectedBy: "aksh" }); // selected false, selected_by aksh
    expect(await ocrPage(ctx(unticked, ocrWith()))).toEqual({ kind: "done", result: { chars: PL_TEXT.length, ocr: true } });
    const prose = setup({ budget: 5 });
    const text = "The directors thank the shareholders, the employees and the bankers for their continued support this year.";
    expect(await ocrPage(ctx(prose, ocrWith({ kind: "ok", text })))).toEqual({ kind: "done", result: { chars: text.length, ocr: true } });
    expect(page2(prose).selected).toBe(false);
  });

  it("with AI reading off the page is filled and classified but nothing is queued", async () => {
    const repo = setup({ selected: true, selectedBy: "aksh" });
    const out = await ocrPage(ctx(repo, ocrWith(), { llm: null }));
    expect(out).toEqual({ kind: "done", result: { chars: PL_TEXT.length, ocr: true, aiOff: true } });
    expect(page2(repo)).toMatchObject({ ocr: true, kind: "pl" });
  });

  it("a page with almost nothing on it is attention when Aksh ticked it and done when it was an automatic read", async () => {
    const ticked = setup({ selected: true, selectedBy: "aksh" });
    expect(await ocrPage(ctx(ticked, ocrWith({ kind: "ok", text: "Page 7" })))).toEqual({ kind: "attention", error: OCR_NOTHING_READ });
    expect(page2(ticked)).toMatchObject({ text: "Page 7", ocr: true, isScan: true });
    const auto = setup();
    expect(await ocrPage(ctx(auto, ocrWith({ kind: "ok", text: "" })))).toEqual({ kind: "done", result: { chars: 0, empty: true } });
  });

  it("a rerun does not spend a second request: a page that already has OCR text goes straight on", async () => {
    const repo = setup({ selected: true, selectedBy: "aksh", text: PL_TEXT, ocr: true });
    const ocr = ocrWith();
    const out = await ocrPage(ctx(repo, ocr));
    expect(ocr.read).not.toHaveBeenCalled();
    expect(out).toMatchObject({ kind: "done", enqueue: [{ kind: "extract_page", pageNo: 2 }] });
    // ... and a scan that was read and found empty is not read again
    const empty = setup({ selected: true, selectedBy: "aksh", text: "x", ocr: true });
    expect(await ocrPage(ctx(empty, ocr))).toEqual({ kind: "attention", error: OCR_NOTHING_READ });
    expect(ocr.read).not.toHaveBeenCalled();
  });

  it("a page that is not a scan is not sent to the reader at all", async () => {
    const repo = setup();
    const ocr = ocrWith();
    const out = await ocrPage(ctx(repo, ocr, { pageNo: 1 }));
    expect(ocr.read).not.toHaveBeenCalled();
    expect(out.kind).toBe("done");
  });
});

describe("ocr_page: waiting and refusing (never a failure count)", () => {
  it("waits on ocr_off for hours when there is no scan reader", async () => {
    const out = await ocrPage(ctx(setup(), null));
    expect(out).toEqual({ kind: "defer", notBefore: new Date(T0 + 6 * 3600_000), reason: "ocr_off" });
  });

  it("defers on ocr_day, with the ledger's time, when the ledger refuses; the reader is not called", async () => {
    const usage = createMemoryUsageRepo();
    const until = new Date(T0 + 5 * 3600_000);
    usage.reserveUnits = async () => ({ ok: false, notBefore: until, reason: "ocr_day" });
    const ocr = ocrWith();
    const out = await ocrPage(ctx(setup(), ocr, { usage }));
    expect(out).toEqual({ kind: "defer", notBefore: until, reason: "ocr_day" });
    expect(ocr.read).not.toHaveBeenCalled();
  });

  it("an OCR.space daily answer releases the request, blocks the bucket until the ledger's earliest reset and defers on ocr_day", async () => {
    const usage = createMemoryUsageRepo();
    const reset = new Date(T0 + 7 * 3600_000);
    usage.earliestReset = async () => reset;
    const ocr = ocrWith({ kind: "refused", reason: "day", message: "HTTP 403" });
    const out = await ocrPage(ctx(setup(), ocr, { usage }));
    expect(out).toEqual({ kind: "defer", notBefore: reset, reason: "ocr_day" });
    expect(usage.reservations[0].settled).toEqual({ used: 0, status: "released" });
    expect(usage.blocks).toEqual([{ bucket: OCR_BUCKET, kind: "rate_limited", until: reset, reason: "ocr_day" }]);
  });

  it("with nothing in the ledger the block lasts an hour", async () => {
    const usage = createMemoryUsageRepo();
    const out = await ocrPage(ctx(setup(), ocrWith({ kind: "refused", reason: "day", message: "x" }), { usage }));
    expect(out).toEqual({ kind: "defer", notBefore: new Date(T0 + 3600_000), reason: "ocr_day" });
  });

  it("the third refusal in a row while the ledger is under its cap reads as the key, not the quota", async () => {
    const usage = createMemoryUsageRepo();
    usage.refusalsSinceUse = async () => 2;
    const out = await ocrPage(ctx(setup(), ocrWith({ kind: "refused", reason: "day", message: "x" }), { usage }));
    expect(out).toEqual({ kind: "attention", error: OCR_KEY_REFUSED });
    expect(usage.blocks).toEqual([]);
    // ... but not when our own ledger says the day is spent
    const spent = createMemoryUsageRepo();
    spent.refusalsSinceUse = async () => 2;
    spent.totals = async () => ({ lastMinute: 0, today: OCR_CAPS.day, medianPerCall: 1 });
    expect((await ocrPage(ctx(setup(), ocrWith({ kind: "refused", reason: "day", message: "x" }), { usage: spent }))).kind).toBe("defer");
  });

  it("a key the reader names as bad is attention at once, never a daily defer", async () => {
    const usage = createMemoryUsageRepo();
    const out = await ocrPage(ctx(setup(), ocrWith({ kind: "refused", reason: "key", message: "Invalid API key" }), { usage }));
    expect(out).toEqual({ kind: "attention", error: OCR_KEY_REFUSED });
    expect(usage.blocks).toEqual([]);
    expect(usage.reservations[0].settled).toEqual({ used: 0, status: "released" });
  });

  it("a size or page refusal from the reader is a sentence for Aksh", async () => {
    expect(await ocrPage(ctx(setup(), ocrWith({ kind: "refused", reason: "size", message: "x" })))).toEqual({ kind: "attention", error: OCR_TOO_BIG });
    expect(await ocrPage(ctx(setup(), ocrWith({ kind: "refused", reason: "pages", message: "x" })))).toEqual({ kind: "attention", error: OCR_PAGE_REFUSED });
  });

  it("a page over 1 MB is refused before anything is reserved or sent", async () => {
    const repo = setup();
    const heavy = "x".repeat(900);
    const lines = Array.from({ length: 1400 }, () => heavy);
    repo.files.set(`${DOC}.pdf`, makePdf([["Cover"], lines]));
    const usage = createMemoryUsageRepo();
    const ocr = ocrWith();
    const out = await ocrPage(ctx(repo, ocr, { usage }));
    expect(out).toEqual({ kind: "attention", error: OCR_TOO_BIG });
    expect(usage.reservations).toEqual([]);
    expect(ocr.read).not.toHaveBeenCalled();
  });

  it("a network or server error is a provider retry (1 and 2 minutes), and the request is released", async () => {
    const usage = createMemoryUsageRepo();
    const out = await ocrPage(ctx(setup(), ocrWith({ kind: "provider_error", message: "HTTP 500" }), { usage }));
    expect(out).toEqual({ kind: "retry", failure: "provider", error: "HTTP 500" });
    expect(usage.reservations[0].settled).toEqual({ used: 0, status: "released" });
  });

  it("a reader that throws releases the request and lets the runner count a provider retry", async () => {
    const usage = createMemoryUsageRepo();
    const ocr: OcrPort = { name: "fixture", read: async () => { throw new Error("boom"); } };
    await expect(ocrPage(ctx(setup(), ocr, { usage }))).rejects.toThrow("boom");
    expect(usage.reservations[0].settled).toEqual({ used: 0, status: "released" });
  });

  it("defers briefly, without a failure, when the drain is nearly out of time", async () => {
    const out = await ocrPage(ctx(setup(), ocrWith(), { clock: () => T0 + 230_000 }));
    expect(out).toMatchObject({ kind: "defer", reason: "groq_minute" });
  });

  it("says plainly when the original is gone, or the page is not stored", async () => {
    expect(await ocrPage(ctx(setup({ stored: false }), ocrWith()))).toEqual({ kind: "attention", error: PDF_NOT_STORED });
    expect(await ocrPage(ctx(setup(), ocrWith(), { pageNo: 9 }))).toEqual({ kind: "attention", error: PAGE_NOT_STORED });
  });

  it("a stored file that is not a PDF is a sentence, not a crash", async () => {
    const repo = setup();
    repo.files.set(`${DOC}.pdf`, new TextEncoder().encode("not a pdf"));
    expect(await ocrPage(ctx(repo, ocrWith()))).toEqual({ kind: "attention", error: OCR_PAGE_REFUSED });
  });
});
