import { describe, expect, it, vi } from "vitest";
import type { LlmPort } from "@/lib/providers/llm";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { machineDocuments, type StepDeps } from "../deps";
import type { StepContext } from "../types";
import { selectPagesStep } from "./select-pages";

// select_pages on pasted text and fetched web pages (ruling R15): a table is read without a statement heading, a short page is
// never taken for a scan, and a PDF is still chosen by headings alone.

const DOC = "33333333-3333-4333-8333-333333333333";
const T0 = Date.parse("2026-10-08T10:00:00Z");
const fakeLlm = { name: "fixture", complete: vi.fn() } as unknown as LlmPort;
const TABLE = "Quarterly results\nRevenue from operations 1,284.00 1,102.00\nFinance costs 41.20 38.90\nProfit for the year 152.60 118.30";
const PROSE = "Management spoke to analysts about demand in the quarter and said the order book looks healthy for the year ahead overall.";

function repoOf(kind: "text" | "url" | "pdf", pages: string[]): MemoryDocumentsRepo {
  const repo = createMemoryDocumentsRepo();
  repo.docs.set(DOC, {
    id: DOC, companyId: null, title: "Pasted", kind, storagePath: `${DOC}.txt`, sha256: "a".repeat(64), bytes: 10, pageCount: pages.length,
    status: "active", llmPageBudget: 20, basis: "consolidated", sourceType: "Annual report", filedOn: null, sourceUrl: null, originalDeletedAt: null,
    transcriptStatus: null, createdAt: new Date(T0).toISOString(),
  });
  pages.forEach((text, i) => {
    void repo.insertPages(DOC, [{ pageNo: i + 1, text }]);
  });
  return repo;
}

function run(repo: MemoryDocumentsRepo, llm: LlmPort | null = fakeLlm) {
  const deps: StepDeps = {
    llm, ocr: null, models: { text: "m", vision: "v", classify: "c", whisper: "w" }, transcriber: null,
    repos: { documents: machineDocuments(repo), usage: createMemoryUsageRepo(), proposals: createMemoryProposalsRepo(), research: createMemoryResearch(), digests: createMemoryDigestsRepo() },
    now: () => new Date(T0), clock: () => T0,
  };
  const step = { id: "s", jobId: "j", kind: "select_pages", pageNo: null, args: {}, status: "running", schemaFailures: 0, providerFailures: 0, leaseExpiries: 0, notBefore: "", leaseOwner: "o", lastError: null } as const;
  return selectPagesStep({ step, documentId: DOC, deadline: T0 + 240_000, deps } as StepContext);
}

describe("select_pages for text and url documents", () => {
  it.each(["text", "url"] as const)("selects a pasted table with no heading (%s) and reads it for figures", async (kind) => {
    const repo = repoOf(kind, [PROSE, TABLE]);
    const outcome = await run(repo);
    expect(outcome).toMatchObject({ kind: "done", result: { selected: 1 }, enqueue: [{ kind: "extract_page", pageNo: 2 }] });
    expect(repo.pages.get(`${DOC}:2`)).toMatchObject({ selected: true, selectedBy: "rule" });
    expect(repo.pages.get(`${DOC}:1`)?.selected).toBe(false);
  });

  it("a text page under 50 characters is not a scan and is never sent to OCR", async () => {
    const repo = repoOf("text", ["1,284.00 1,102.00 41.20"]);
    const outcome = await run(repo);
    expect(outcome).toMatchObject({ kind: "done", enqueue: [{ kind: "extract_page", pageNo: 1 }] });
    expect(outcome.kind === "done" && outcome.enqueue?.some((s) => s.kind === "ocr_page")).toBe(false);
  });

  it("selects nothing from plain prose, and says AI is off without a reader", async () => {
    expect(await run(repoOf("text", [PROSE]))).toMatchObject({ kind: "done", result: { selected: 0 }, enqueue: [] });
    expect(await run(repoOf("text", [TABLE]), null)).toEqual({ kind: "done", result: { selected: 1, aiOff: true } });
  });

  it("leaves a PDF to the headings rule: the same dense table without a heading is not selected", async () => {
    const outcome = await run(repoOf("pdf", [TABLE]));
    expect(outcome).toMatchObject({ kind: "done", result: { selected: 0 } });
  });
});
