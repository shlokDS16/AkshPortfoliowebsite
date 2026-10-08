import { describe, expect, it, vi } from "vitest";
import { createFixtureLlm } from "@/lib/providers/fixture-llm";
import type { LlmPort, LlmRequest, LlmResult } from "@/lib/providers/llm";
import type { OcrPort } from "@/lib/providers/ocr";
import { createMemoryDigestsRepo, type MemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch, type MemoryProposalsRepo } from "@/test/fakes/proposals-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { DIGEST_MAX_CLAIMS } from "../caps";
import { machineDocuments, type StepDeps } from "../deps";
import { OCR_NOTHING_READ } from "../ocr-copy";
import { DIGEST_PROMPT_VERSION, DIGEST_SYSTEM_PROMPT, type Digest } from "../prompts";
import type { Step, StepContext } from "../types";
import { digestPage, digestRows, NO_SECTION } from "./digest-page";
import { PAGE_NOT_STORED } from "./extraction-shared";

const DOC = "11111111-1111-4111-8111-111111111111";
const T0 = Date.parse("2026-10-07T10:00:00Z");
const CAPACITY = "We expect the Kaveri Pumps capacity expansion to be commissioned in the second half of FY27.";
const STEEL = "Rising steel prices may reduce our operating margin by up to two percentage points in FY27, as we flagged to the board.";
const PAGE = [
  "Management Discussion and Analysis", "Outlook", CAPACITY, "Risks", "Rising steel prices may reduce our operating margin",
  "by up to two percentage points in FY27,", "as we flagged to the board.",
].join("\n");
const NO_RATE = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };
const USAGE = { promptTokens: 800, completionTokens: 200, totalTokens: 1000 };

const DIGEST: Digest = {
  claims: [
    { section: "Outlook", claim: "Management plans to add pump capacity at the Kaveri plant.", line: CAPACITY },
    { section: "Risks", claim: "Steel prices could squeeze margins.", line: STEEL },
    { section: "Risks", claim: "Management guides to 30% growth.", line: "We guide to thirty percent revenue growth in FY27." },
  ],
};

type Setup = { documents: MemoryDocumentsRepo; proposals: MemoryProposalsRepo; digests: MemoryDigestsRepo; usage: ReturnType<typeof createMemoryUsageRepo> };

function setup(pageText = PAGE, opts: { isScan?: boolean; kind?: "pdf" | "audio" } = {}): Setup {
  const documents = createMemoryDocumentsRepo();
  documents.docs.set(DOC, {
    id: DOC, companyId: null, title: "Kaveri annual report", kind: opts.kind ?? "pdf", storagePath: `${DOC}.pdf`,
    sha256: "a".repeat(64), bytes: 10, pageCount: 6, status: "active", llmPageBudget: 20, basis: "consolidated", sourceType: "Annual report",
    filedOn: null, sourceUrl: null, originalDeletedAt: null, transcriptStatus: null, createdAt: new Date(T0).toISOString(),
  });
  documents.pages.set(`${DOC}:4`, {
    documentId: DOC, pageNo: 4, text: pageText, charCount: pageText.length, isScan: opts.isScan ?? false, kind: "mdna", basis: "consolidated",
    score: 30, selected: true, selectedBy: "rule", ocr: false,
  });
  return { documents, proposals: createMemoryProposalsRepo(), digests: createMemoryDigestsRepo(), usage: createMemoryUsageRepo() };
}

function ctx(s: Setup, llm: LlmPort | null, step: Partial<Step> = {}, ocr: OcrPort | null = null): StepContext {
  const deps: StepDeps = {
    llm, ocr, transcriber: null,
    models: { text: "test-model", vision: "test-vision", classify: "test-classify", whisper: "test-whisper" },
    repos: { documents: machineDocuments(s.documents), usage: s.usage, proposals: s.proposals, research: createMemoryResearch(), digests: s.digests },
    now: () => new Date(T0),
    clock: () => T0,
  };
  const full: Step = {
    id: "step-1", jobId: "job-1", kind: "digest_page", pageNo: 4, args: {}, status: "running", schemaFailures: 0, providerFailures: 0,
    leaseExpiries: 0, notBefore: new Date(T0).toISOString(), leaseOwner: "owner", lastError: null, ...step,
  };
  return { step: full, documentId: DOC, deadline: T0 + 240_000, deps };
}

function fake(result: LlmResult<unknown>) {
  const complete = vi.fn<(req: LlmRequest<unknown>) => Promise<LlmResult<unknown>>>(async () => result);
  return { llm: { name: "fixture", complete } as unknown as LlmPort, complete };
}
const ok = (data: unknown): LlmResult<unknown> => ({ kind: "ok", data, usage: USAGE, rate: NO_RATE });

describe("digestRows", () => {
  it("marks a claim on_page only when its line is printed on the page (whitespace and case do not matter)", () => {
    const rows = digestRows(DIGEST, DOC, 4, "ext-1", PAGE);
    expect(rows.map((r) => [r.ord, r.onPage])).toEqual([[0, true], [1, true], [2, false]]);
    expect(rows[1]).toMatchObject({ documentId: DOC, pageNo: 4, extractionId: "ext-1", section: "Risks" });
  });

  it("keeps the table's lengths (section 300, claim 400, line 600); a blank claim or line is dropped, a blank section gets a label", () => {
    const rows = digestRows(
      { claims: [
        { section: "S".repeat(500), claim: "c".repeat(900), line: "l".repeat(900) },
        { section: "  ", claim: "A short note", line: "A line of at least twenty characters" },
        { section: "x", claim: "  ", line: "A line of at least twenty characters" },
        { section: "x", claim: "A claim", line: "" },
      ] },
      DOC, 4, "ext-1", PAGE,
    );
    expect(rows).toHaveLength(2);
    expect([rows[0].section.length, rows[0].claim.length, rows[0].line.length]).toEqual([300, 400, 600]);
    expect(rows[1].section).toBe(NO_SECTION);
    expect(rows.map((r) => r.ord)).toEqual([0, 1]);
  });

  it("stores a line copied across a page wrap as one line of single spaces, and it is still confirmed", () => {
    const wrapped = "Rising steel prices may reduce our operating margin\nby up to two percentage points in FY27,\t as we flagged\r\nto the board.";
    const [row] = digestRows({ claims: [{ section: "Risks", claim: "Steel.", line: wrapped }] }, DOC, 4, "e", PAGE);
    expect(row.line).toBe(STEEL);
    expect(row.line).not.toMatch(/[\n\r\t]| {2}/);
    expect(row.onPage).toBe(true);
  });

  it("keeps a line with a | as the model gave it but never confirms it: the facts sheet would cut the quote at the |", () => {
    const piped = "Margins stay near 31% | 32% in FY27, as we flagged to the board.";
    const [row] = digestRows({ claims: [{ section: "Outlook", claim: "Margins.", line: piped }] }, DOC, 4, "e", `Outlook\n${piped}`);
    expect(row.line).toBe(piped);
    expect(row.onPage).toBe(false);
  });

  it("never confirms a line too short to be a quote, and stores at most 8 claims", () => {
    expect(digestRows({ claims: [{ section: "x", claim: "Growth", line: "growth" }] }, DOC, 4, "e", "Growth is strong. growth")[0].onPage).toBe(false);
    const many = { claims: Array.from({ length: 12 }, (_, i) => ({ section: "x", claim: `c${i}`, line: CAPACITY })) };
    expect(digestRows(many, DOC, 4, "e", PAGE)).toHaveLength(DIGEST_MAX_CLAIMS);
  });
});

describe("digest_page", () => {
  it("defers with AI off and writes nothing", async () => {
    const s = setup();
    expect(await digestPage(ctx(s, null))).toMatchObject({ kind: "defer", reason: "ai_off" });
    expect(s.digests.rows).toHaveLength(0);
  });

  it("writes one extraction and the digest rows, each line checked against the page, and no proposal", async () => {
    const s = setup();
    const { llm, complete } = fake(ok(DIGEST));
    const out = await digestPage(ctx(s, llm));
    expect(out).toEqual({ kind: "done", result: { claims: 3, onPage: 2, tokens: 1000 } });
    expect(s.proposals.extractions).toHaveLength(1);
    expect(s.proposals.extractions[0]).toMatchObject({ documentId: DOC, pageNo: 4, model: "test-model", promptVersion: DIGEST_PROMPT_VERSION });
    expect(s.digests.rows.map((r) => [r.extractionId, r.ord, r.onPage])).toEqual([["ext-1", 0, true], ["ext-1", 1, true], ["ext-1", 2, false]]);
    expect(s.proposals.proposals).toHaveLength(0);
    const req = complete.mock.calls[0][0];
    expect(req).toMatchObject({ model: "test-model", system: DIGEST_SYSTEM_PROMPT, schemaName: "page_digest", reasoningEffort: "low" });
    expect(req.user).toContain("Management Discussion and Analysis");
    expect(s.usage.reservations[0].settled).toEqual({ used: 1000, status: "used" });
  });

  it("a rerun (a lost lease) reuses the extraction and adds no rows, and does not call the AI again", async () => {
    const s = setup();
    const { llm, complete } = fake(ok(DIGEST));
    await digestPage(ctx(s, llm));
    const again = await digestPage(ctx(s, llm));
    expect(again).toEqual({ kind: "done", result: { claims: 3, onPage: 2, tokens: 0, cached: true } });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(s.proposals.extractions).toHaveLength(1);
    expect(s.digests.rows).toHaveLength(3);
  });

  it("a step that died between the extraction and the rows finishes the rows on the rerun without a second extraction", async () => {
    const s = setup();
    const { llm } = fake(ok(DIGEST));
    const insert = s.digests.insert;
    s.digests.insert = async () => {
      throw new Error("lease lost");
    };
    await expect(digestPage(ctx(s, llm))).rejects.toThrow("lease lost");
    expect(s.proposals.extractions).toHaveLength(1);
    expect(s.digests.rows).toHaveLength(0);
    s.digests.insert = insert;
    await digestPage(ctx(s, llm));
    expect(s.proposals.extractions).toHaveLength(1);
    expect(s.digests.rows).toHaveLength(3);
  });

  it("rows written twice for the same extraction are kept once", async () => {
    const s = setup();
    await digestPage(ctx(s, fake(ok(DIGEST)).llm));
    await s.digests.insert(await s.digests.list(DOC, 4, "ext-1"));
    expect(s.digests.rows).toHaveLength(3);
  });

  it("answers an empty claims list with an extraction and no rows", async () => {
    const s = setup();
    const out = await digestPage(ctx(s, fake(ok({ claims: [] })).llm));
    expect(out).toMatchObject({ kind: "done", result: { claims: 0, onPage: 0 } });
    expect(s.proposals.extractions).toHaveLength(1);
    expect(s.digests.rows).toHaveLength(0);
  });

  it("runs on the fixture adapter's own digest table", async () => {
    const s = setup(`Management Discussion and Analysis\n${CAPACITY}\n${STEEL}`);
    expect(await digestPage(ctx(s, createFixtureLlm()))).toMatchObject({ kind: "done", result: { claims: 2, onPage: 2 } });
    const none = setup("Management Discussion and Analysis\nNo plans stated here.");
    expect(await digestPage(ctx(none, createFixtureLlm()))).toMatchObject({ kind: "done", result: { claims: 0 } });
  });

  it("retries a schema failure naming the issues, retries a provider failure, and stops with a sentence on a refusal", async () => {
    const bad = await digestPage(ctx(setup(), fake({ kind: "invalid", raw: "{}", issues: ["claims: Required"], usage: USAGE, rate: NO_RATE }).llm));
    expect(bad).toEqual({ kind: "retry", failure: "schema", error: "claims: Required" });
    const down = await digestPage(ctx(setup(), fake({ kind: "provider_error", status: 503, message: "busy" } as unknown as LlmResult<unknown>).llm));
    expect(down).toMatchObject({ kind: "retry", failure: "provider" });
    const refused = await digestPage(ctx(setup(), fake({ kind: "rejected", status: 401, message: "no" } as unknown as LlmResult<unknown>).llm));
    expect(refused).toMatchObject({ kind: "attention" });
  });

  it("uses the retry prompt on a second schema attempt", async () => {
    const { llm, complete } = fake(ok(DIGEST));
    await digestPage(ctx(setup(), llm, { schemaFailures: 1, lastError: "claims: Required" }));
    expect(complete.mock.calls[0][0].system).toContain("Your previous answer was rejected: claims: Required");
  });

  it("never digests a voice note", async () => {
    const s = setup(PAGE, { kind: "audio" });
    const { llm, complete } = fake(ok(DIGEST));
    expect(await digestPage(ctx(s, llm))).toEqual({ kind: "done", result: { skipped: "audio" } });
    expect(complete).not.toHaveBeenCalled();
    expect(s.digests.rows).toHaveLength(0);
  });

  it("needs attention when the page is gone; hands a scan to the scan reader", async () => {
    const { llm } = fake(ok(DIGEST));
    expect(await digestPage(ctx(setup(), llm, { pageNo: 9 }))).toEqual({ kind: "attention", error: PAGE_NOT_STORED });
    const reader = { name: "fixture", read: vi.fn() } as unknown as OcrPort;
    expect(await digestPage(ctx(setup("", { isScan: true }), llm, {}, reader))).toEqual({ kind: "done", result: { scan: true }, enqueue: [{ kind: "ocr_page", pageNo: 4 }] });
    const s = setup("x", { isScan: true });
    s.documents.pages.set(`${DOC}:4`, { ...s.documents.pages.get(`${DOC}:4`)!, ocr: true });
    expect(await digestPage(ctx(s, llm, {}, reader))).toEqual({ kind: "attention", error: OCR_NOTHING_READ });
  });
});
