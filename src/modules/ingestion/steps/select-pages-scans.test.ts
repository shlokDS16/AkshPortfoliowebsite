import { describe, expect, it, vi } from "vitest";
import type { LlmPort } from "@/lib/providers/llm";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { machineDocuments, type StepDeps } from "../deps";
import { readsScansWhole, stepsForPage } from "../page-steps";
import type { StepContext } from "../types";
import { selectPagesStep } from "./select-pages";

// select_pages on scanned documents (ruling R6): a document that is mostly scans and fits its page budget is scanned whole;
// a larger one waits for Aksh's ticks; and a digital page still goes to extract_page.

const DOC = "11111111-1111-4111-8111-111111111111";
const T0 = Date.parse("2026-10-07T10:00:00Z");
const fakeLlm = { name: "fixture", complete: vi.fn() } as unknown as LlmPort;
const PL = "Consolidated Statement of Profit and Loss for the year ended March 31, 2026\nRevenue from operations 1,284.00 1,102.00\nFinance costs 41.20";

function repoOf(pages: string[], budget: number): MemoryDocumentsRepo {
  const repo = createMemoryDocumentsRepo();
  repo.docs.set(DOC, {
    id: DOC, companyId: null, title: "Scanned report", kind: "pdf", storagePath: `${DOC}.pdf`, sha256: "a".repeat(64), bytes: 10, pageCount: pages.length,
    status: "active", llmPageBudget: budget, basis: "consolidated", sourceType: "Annual report", filedOn: null, sourceUrl: null, originalDeletedAt: null, transcriptStatus: null,
    createdAt: new Date(T0).toISOString(),
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

describe("stepsForPage (ruling R6): the one place that routes a page", () => {
  it("sends a scan to the scan reader and any other page to the figure reader", () => {
    expect(stepsForPage({ pageNo: 7, isScan: true, kind: null })).toEqual({ kind: "ocr_page", pageNo: 7 });
    expect(stepsForPage({ pageNo: 7, isScan: false, kind: "pl" })).toEqual({ kind: "extract_page", pageNo: 7 });
  });
});

describe("readsScansWhole", () => {
  it("needs 80% scans and the scans to fit the page budget", () => {
    expect(readsScansWhole(8, 10, 20)).toBe(true);
    expect(readsScansWhole(7, 10, 20)).toBe(false); // 70%
    expect(readsScansWhole(25, 25, 20)).toBe(false); // over the budget
    expect(readsScansWhole(20, 25, 20)).toBe(true); // at the budget
    expect(readsScansWhole(0, 10, 20)).toBe(false);
  });
});

describe("select_pages on scanned documents", () => {
  it("scans a mostly scanned document whole: one ocr_page per scan, none ticked, and the digital statement page read as before", async () => {
    const repo = repoOf(["", "", "", PL, "", "", "", "", "", ""], 20);
    const out = await run(repo);
    expect(out).toEqual({
      kind: "done",
      result: { selected: 1, scansQueued: 9 },
      enqueue: [
        { kind: "extract_page", pageNo: 4 },
        ...[1, 2, 3, 5, 6, 7, 8, 9, 10].map((pageNo) => ({ kind: "ocr_page", pageNo })),
      ],
    });
    expect([...repo.pages.values()].filter((p) => p.selected).map((p) => p.pageNo)).toEqual([4]); // the scans are not ticked
  });

  it("leaves a scanned document larger than its budget for Aksh's ticks and says how many are scans", async () => {
    const repo = repoOf(Array.from({ length: 30 }, () => ""), 20);
    const out = await run(repo);
    expect(out).toEqual({ kind: "done", result: { selected: 0 }, enqueue: [] });
  });

  it("a document with a few scans among digital pages is not scanned whole", async () => {
    const repo = repoOf([PL, "", "Directors' report text that is longer than fifty characters in total.", "More ordinary page text, longer than fifty characters."], 20);
    const out = await run(repo);
    expect(out).toMatchObject({ result: { selected: 1 }, enqueue: [{ kind: "extract_page", pageNo: 1 }] });
  });

  it("with AI reading off nothing is queued, scans included", async () => {
    const out = await run(repoOf(["", "", ""], 20), null);
    expect(out).toEqual({ kind: "done", result: { selected: 0, aiOff: true } });
  });
});
