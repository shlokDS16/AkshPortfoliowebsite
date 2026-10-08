import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { LlmPort } from "@/lib/providers/llm";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { fixturePdfBytes, fixtureWithBrokenPage2, makePdf } from "@/test/fixtures/pdf";
import { PDF_TEXT_MS } from "../caps";
import { machineDocuments, type StepDeps } from "../deps";
import type { Step, StepContext } from "../types";
import { PAGE_NOT_STORED } from "./extract-page";
import { pdfText, PDF_NOT_OPENED, PDF_NOT_STORED, PDF_TOO_LONG, PDF_WRONG_FILE } from "./pdf-text";
import { DOCUMENT_GONE, selectPagesStep } from "./select-pages";

const DOC = "11111111-1111-4111-8111-111111111111";
const PATH = `${DOC}.pdf`;
const T0 = Date.parse("2026-10-07T10:00:00Z");
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fakeLlm = { name: "fixture", complete: vi.fn() } as unknown as LlmPort;

/** A documents repo holding one active document whose stored object is `bytes`. */
function repoWith(bytes: Uint8Array, opts: { sha256?: string; pageCount?: number | null; budget?: number } = {}): MemoryDocumentsRepo {
  const repo = createMemoryDocumentsRepo();
  repo.docs.set(DOC, {
    id: DOC, companyId: null, title: "Kaveri annual report", kind: "pdf", storagePath: PATH, sha256: opts.sha256 ?? sha(bytes),
    bytes: bytes.byteLength, pageCount: opts.pageCount ?? null, status: "active", llmPageBudget: opts.budget ?? 20,
    basis: "consolidated", sourceType: "Annual report", filedOn: null, sourceUrl: null, originalDeletedAt: null, transcriptStatus: null,
    createdAt: new Date(T0).toISOString(),
  });
  repo.files.set(PATH, bytes);
  return repo;
}

function ctx(repo: MemoryDocumentsRepo, step: Partial<Step>, opts: { clock?: () => number; llm?: LlmPort | null } = {}): StepContext {
  const deps: StepDeps = {
    llm: opts.llm === undefined ? null : opts.llm,
    ocr: null,
    transcriber: null,
    models: { text: "test-model", vision: "test-vision", classify: "test-classify", whisper: "test-whisper" },
    repos: {
      documents: machineDocuments(repo),
      usage: createMemoryUsageRepo(),
      proposals: createMemoryProposalsRepo(),
      research: createMemoryResearch(),
    },
    now: () => new Date(T0),
    clock: opts.clock ?? (() => T0),
  };
  const full: Step = {
    id: "step-1", jobId: "job-1", kind: "pdf_text", pageNo: 1, args: {}, status: "running", schemaFailures: 0,
    providerFailures: 0, leaseExpiries: 0, notBefore: new Date(T0).toISOString(), leaseOwner: "owner", lastError: null, ...step,
  };
  return { step: full, documentId: DOC, deadline: T0 + 240_000, deps };
}

const pageNos = (repo: MemoryDocumentsRepo) => [...repo.pages.values()].map((p) => p.pageNo).sort((a, b) => a - b);

describe("pdf_text", () => {
  it("reads all six pages of the fixture, records the page count and enqueues select_pages", async () => {
    const repo = repoWith(fixturePdfBytes());
    const outcome = await pdfText(ctx(repo, {}));
    expect(outcome).toEqual({ kind: "done", result: { from: 1, through: 6 }, enqueue: [{ kind: "select_pages", pageNo: null }] });
    expect(pageNos(repo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(repo.docs.get(DOC)?.pageCount).toBe(6);
    expect(repo.pages.get(`${DOC}:4`)?.text).toContain("Consolidated Statement of Profit and Loss");
    expect(repo.pages.get(`${DOC}:4`)?.text).toContain("Revenue from operations 1,284.00 1,102.00");
  });

  it("stops when PDF_TEXT_MS has passed, keeps the pages read so far and enqueues itself from the next page", async () => {
    const repo = repoWith(fixturePdfBytes());
    let calls = 0;
    // The start and the check after p. 1 see T0; the check after p. 2 sees the time used up.
    const clock = () => (++calls <= 2 ? T0 : T0 + PDF_TEXT_MS);
    const outcome = await pdfText(ctx(repo, {}, { clock }));
    expect(outcome).toEqual({ kind: "done", result: { from: 1, through: 2 }, enqueue: [{ kind: "pdf_text", pageNo: 3 }] });
    expect(pageNos(repo)).toEqual([1, 2]);
  });

  it("carries on from its page, reads at least one page even when out of time, and never enqueues its own page again", async () => {
    const repo = repoWith(fixturePdfBytes(), { pageCount: 6 });
    // 230 s into a 240 s drain: inside the 20 s kept for writing, so no second page.
    const outcome = await pdfText(ctx(repo, { pageNo: 3 }, { clock: () => T0 + 230_000 }));
    expect(outcome).toEqual({ kind: "done", result: { from: 3, through: 3 }, enqueue: [{ kind: "pdf_text", pageNo: 4 }] });
    expect(pageNos(repo)).toEqual([3]);
  });

  it("enqueues select_pages without reading when its page is past the end", async () => {
    const repo = repoWith(fixturePdfBytes(), { pageCount: 6 });
    const outcome = await pdfText(ctx(repo, { pageNo: 7 }));
    expect(outcome).toEqual({ kind: "done", result: { from: 7, through: 6 }, enqueue: [{ kind: "select_pages", pageNo: null }] });
    expect(repo.pages.size).toBe(0);
  });

  it("is idempotent: a second run over the same pages writes nothing new", async () => {
    const repo = repoWith(fixturePdfBytes());
    await pdfText(ctx(repo, {}));
    const first = repo.pages.get(`${DOC}:1`);
    await pdfText(ctx(repo, {}));
    expect(pageNos(repo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(repo.pages.get(`${DOC}:1`)).toBe(first);
  });

  it("sends a PDF it cannot open to needs attention with the plain message", async () => {
    const garbage = new Uint8Array(Buffer.from("%PDF-1.4\nthis is not really a pdf at all", "latin1"));
    const repo = repoWith(garbage);
    expect(await pdfText(ctx(repo, {}))).toEqual({ kind: "attention", error: PDF_NOT_OPENED });
    expect(PDF_NOT_OPENED).toBe("This PDF could not be opened (it may be password-protected or damaged).");
    expect(repo.pages.size).toBe(0);
  });

  it("never parses a stored file whose SHA-256 differs from the one recorded at upload", async () => {
    const repo = repoWith(fixturePdfBytes(), { sha256: "0".repeat(64) });
    expect(await pdfText(ctx(repo, {}))).toEqual({ kind: "attention", error: PDF_WRONG_FILE });
    expect(repo.pages.size).toBe(0);
    expect(repo.docs.get(DOC)?.pageCount).toBeNull();
  });

  it("never parses a stored file that does not start with %PDF-, even when its hash matches", async () => {
    const html = new Uint8Array(Buffer.from("<html>not a pdf</html>", "latin1"));
    const repo = repoWith(html);
    expect(await pdfText(ctx(repo, {}))).toEqual({ kind: "attention", error: PDF_WRONG_FILE });
    expect(repo.pages.size).toBe(0);
  });

  it("refuses a PDF of more than 5,000 pages before reading any", async () => {
    const repo = repoWith(makePdf(Array.from({ length: 5001 }, () => ["x"])));
    expect(await pdfText(ctx(repo, {}))).toEqual({ kind: "attention", error: PDF_TOO_LONG });
    expect(repo.pages.size).toBe(0);
  });

  it("needs attention when the original is no longer stored", async () => {
    const repo = repoWith(fixturePdfBytes());
    repo.docs.set(DOC, { ...repo.docs.get(DOC)!, storagePath: null });
    expect(await pdfText(ctx(repo, {}))).toEqual({ kind: "attention", error: PDF_NOT_STORED });
  });

  it("needs attention, without downloading, when Aksh finished the document and its original was deleted", async () => {
    const repo = repoWith(fixturePdfBytes());
    repo.docs.set(DOC, { ...repo.docs.get(DOC)!, originalDeletedAt: new Date(T0).toISOString() });
    const download = vi.spyOn(repo, "download");
    expect(await pdfText(ctx(repo, {}))).toEqual({ kind: "attention", error: PDF_NOT_STORED });
    expect(download).not.toHaveBeenCalled();
  });

  it("lets a storage download failure throw, so the runner retries the step before anything reaches the card", async () => {
    const repo = repoWith(fixturePdfBytes());
    repo.files.clear(); // the fake throws a DbError like the real repo
    await expect(pdfText(ctx(repo, {}))).rejects.toThrow();
  });

  it("never tells Aksh to upload again: a document keeps its hash, so the same PDF is refused as a duplicate", () => {
    for (const text of [PDF_NOT_STORED, PDF_WRONG_FILE, PAGE_NOT_STORED, DOCUMENT_GONE]) {
      expect(text).not.toMatch(/upload (it|the pdf) again/i);
      expect(text).toMatch(/Try again|Skip/);
    }
  });

  it("stores a page pdf.js cannot read as empty text (a scan page) and carries on with the document", async () => {
    const repo = repoWith(fixtureWithBrokenPage2());
    const outcome = await pdfText(ctx(repo, {}));
    expect(outcome).toEqual({ kind: "done", result: { from: 1, through: 2 }, enqueue: [{ kind: "select_pages", pageNo: null }] });
    expect(repo.pages.get(`${DOC}:1`)?.text).toContain("Kaveri Fixtures Limited");
    expect(repo.pages.get(`${DOC}:2`)).toMatchObject({ text: "", isScan: true });
  });

  it("writes page text in batches of 25, so a long PDF keeps what it read if the function dies", async () => {
    const repo = repoWith(makePdf(Array.from({ length: 30 }, (_, i) => [`Page ${i + 1} of a long report`])));
    const insert = vi.spyOn(repo, "insertPages");
    await pdfText(ctx(repo, {}));
    expect(insert.mock.calls.map(([, rows]) => rows.length)).toEqual([25, 5]);
    expect(repo.pages.get(`${DOC}:30`)?.text).toBe("Page 30 of a long report");
  });
});

describe("select_pages", () => {
  async function readFixture(repo: MemoryDocumentsRepo) {
    await pdfText(ctx(repo, {}));
  }

  it("marks the statement pages selected by the rule and enqueues one extract_page per page when AI reading is on", async () => {
    const repo = repoWith(fixturePdfBytes(), { budget: 2 });
    await readFixture(repo);
    const outcome = await selectPagesStep(ctx(repo, { kind: "select_pages", pageNo: null }, { llm: fakeLlm }));
    expect(outcome).toEqual({
      kind: "done",
      result: { selected: 2 },
      enqueue: [
        { kind: "extract_page", pageNo: 4 },
        { kind: "extract_page", pageNo: 5 },
      ],
    });
    const selected = [...repo.pages.values()].filter((p) => p.selected).map((p) => [p.pageNo, p.selectedBy]);
    expect(selected).toEqual([
      [4, "rule"],
      [5, "rule"],
    ]);
    expect(repo.pages.get(`${DOC}:4`)).toMatchObject({ kind: "pl", basis: "consolidated" });
    expect(repo.pages.get(`${DOC}:1`)?.kind).toBeNull(); // 'other' pages are not written
  });

  it("selects the pages but enqueues no AI step when AI reading is off", async () => {
    const repo = repoWith(fixturePdfBytes(), { budget: 2 });
    await readFixture(repo);
    const outcome = await selectPagesStep(ctx(repo, { kind: "select_pages", pageNo: null }, { llm: null }));
    expect(outcome).toEqual({ kind: "done", result: { selected: 2, aiOff: true } });
    expect([...repo.pages.values()].filter((p) => p.selected)).toHaveLength(2);
  });

  it("never overrides a page Aksh has already decided on", async () => {
    const repo = repoWith(fixturePdfBytes(), { budget: 2 });
    await readFixture(repo);
    const p5 = repo.pages.get(`${DOC}:5`)!;
    repo.pages.set(`${DOC}:5`, { ...p5, selected: false, selectedBy: "aksh" });
    const outcome = await selectPagesStep(ctx(repo, { kind: "select_pages", pageNo: null }, { llm: fakeLlm }));
    expect(outcome).toMatchObject({ result: { selected: 1 }, enqueue: [{ kind: "extract_page", pageNo: 4 }] });
    expect(repo.pages.get(`${DOC}:5`)).toMatchObject({ selected: false, selectedBy: "aksh" });
  });

  it("needs attention when the document is gone", async () => {
    const repo = createMemoryDocumentsRepo();
    expect(await selectPagesStep(ctx(repo, { kind: "select_pages", pageNo: null }))).toMatchObject({ kind: "attention" });
  });
});
