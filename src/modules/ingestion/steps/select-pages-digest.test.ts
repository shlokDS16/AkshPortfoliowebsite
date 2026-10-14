import { describe, expect, it, vi } from "vitest";
import type { LlmPort } from "@/lib/providers/llm";
import { createMemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { machineDocuments, type StepDeps } from "../deps";
import { PAGE_STEP_KINDS, stepsForPage } from "../page-steps";
import type { StepContext } from "../types";
import { selectPagesStep } from "./select-pages";

// Commentary pages (Plan 2b Task 7): a selected management-discussion page is digested, not read for figures.

const DOC = "11111111-1111-4111-8111-111111111111";
const T0 = Date.parse("2026-10-07T10:00:00Z");
const fakeLlm = { name: "fixture", complete: vi.fn() } as unknown as LlmPort;
const PL = "Consolidated Statement of Profit and Loss for the year ended March 31, 2026\nRevenue from operations 1,284.00 1,102.00\nFinance costs 41.20";
const MDNA = "Management Discussion and Analysis\nWe expect the Kaveri Pumps capacity expansion to be commissioned in the second half of FY27.";

function run(pages: string[]) {
  const repo = createMemoryDocumentsRepo();
  repo.docs.set(DOC, {
    id: DOC, companyId: null, title: "Report", kind: "pdf", storagePath: `${DOC}.pdf`, sha256: "a".repeat(64), bytes: 10, pageCount: pages.length,
    status: "active", llmPageBudget: 20, basis: "consolidated", sourceType: "Annual report", filedOn: null, sourceUrl: null, originalDeletedAt: null, transcriptStatus: null,
    createdAt: new Date(T0).toISOString(),
  });
  pages.forEach((text, i) => void repo.insertPages(DOC, [{ pageNo: i + 1, text }]));
  const deps: StepDeps = {
    llm: fakeLlm, ocr: null, models: { text: "m", vision: "v", classify: "c", whisper: "w" }, transcriber: null,
    repos: { documents: machineDocuments(repo), usage: createMemoryUsageRepo(), proposals: createMemoryProposalsRepo(), research: createMemoryResearch(), digests: createMemoryDigestsRepo() },
    now: () => new Date(T0), clock: () => T0,
  };
  const step = { id: "s", jobId: "j", kind: "select_pages", pageNo: null, args: {}, status: "running", schemaFailures: 0, providerFailures: 0, leaseExpiries: 0, notBefore: "", leaseOwner: "o", lastError: null } as const;
  return selectPagesStep({ step, documentId: DOC, deadline: T0 + 240_000, deps } as StepContext);
}

describe("stepsForPage: commentary", () => {
  it("sends a management-discussion page to the digest, a scan to the scan reader first, and a statement to the figure reader", () => {
    expect(stepsForPage({ pageNo: 9, isScan: false, kind: "mdna" })).toEqual({ kind: "digest_page", pageNo: 9 });
    expect(stepsForPage({ pageNo: 9, isScan: true, kind: "mdna" })).toEqual({ kind: "ocr_page", pageNo: 9 });
    expect(stepsForPage({ pageNo: 9, isScan: false, kind: "notes" })).toEqual({ kind: "extract_page", pageNo: 9 });
  });

  it("counts the digest as a page step in the trays, the ETA and Needs you", () => {
    expect(PAGE_STEP_KINDS).toContain("digest_page");
  });
});

describe("select_pages on a report with commentary", () => {
  it("queues digest_page for the commentary page and extract_page for the statement page", async () => {
    const out = await run(["Contents", MDNA, PL]);
    expect(out).toMatchObject({ kind: "done", result: { selected: 2 } });
    expect(out.kind === "done" ? out.enqueue : null).toEqual([{ kind: "digest_page", pageNo: 2 }, { kind: "extract_page", pageNo: 3 }]);
  });
});
