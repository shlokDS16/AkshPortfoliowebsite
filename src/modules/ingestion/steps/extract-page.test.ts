import { describe, expect, it, vi } from "vitest";
import { createFixtureLlm } from "@/lib/providers/fixture-llm";
import type { LlmPort, LlmRequest, LlmResult } from "@/lib/providers/llm";
import { validateCaseFile } from "@/modules/casefile/client";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch, type MemoryProposalsRepo } from "@/test/fakes/proposals-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { GROQ_CAPS, MAX_PROPOSALS_PER_DOCUMENT } from "../caps";
import { machineDocuments, type StepDeps } from "../deps";
import { PROMPT_VERSION, SYSTEM_PROMPT, type Extraction } from "../prompts";
import type { UsageRepo } from "../usage-repo";
import type { Step, StepContext } from "../types";
import { extractPage, KEY_REFUSED, PAGE_NOT_STORED, PAGE_TOO_BIG, SCAN_PAGE } from "./extract-page";

const DOC = "11111111-1111-4111-8111-111111111111";
const COMPANY = "22222222-2222-4222-8222-222222222222";
const T0 = Date.parse("2026-10-07T10:00:00Z");
const PL_TEXT = [
  "Consolidated Statement of Profit and Loss for the year ended March 31, 2026",
  "(Rs. in crore)",
  "Particulars Year ended March 31, 2026 Year ended March 31, 2025",
  "Revenue from operations 1,284.00 1,102.00",
  "Finance costs 41.20 38.90",
  "Profit for the year 152.60 118.30",
].join("\n");

const EXTRACTION: Extraction = {
  page_kind: "pl", basis: "consolidated", unit_header: "(Rs. in crore)", current_header: "Year ended March 31, 2026", prior_header: "Year ended March 31, 2025",
  rows: [{ label: "Other operating income", current_text: "9.00", prior_text: "9.10", line: "Other operating income 9.00 9.10" }],
};
const NO_RATE = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };
const USAGE = { promptTokens: 2500, completionTokens: 500, totalTokens: 3000 };

type Setup = { documents: MemoryDocumentsRepo; proposals: MemoryProposalsRepo; usage: ReturnType<typeof createMemoryUsageRepo> };

function setup(pageText = PL_TEXT, opts: { isScan?: boolean; companyId?: string | null } = {}): Setup {
  const documents = createMemoryDocumentsRepo();
  documents.docs.set(DOC, {
    id: DOC, companyId: opts.companyId === undefined ? null : opts.companyId, title: "Kaveri annual report", kind: "pdf", storagePath: `${DOC}.pdf`,
    sha256: "a".repeat(64), bytes: 10, pageCount: 6, status: "active", llmPageBudget: 20, basis: "consolidated", sourceType: "Annual report",
    filedOn: null, sourceUrl: null, originalDeletedAt: null, createdAt: new Date(T0).toISOString(),
  });
  documents.pages.set(`${DOC}:4`, {
    documentId: DOC, pageNo: 4, text: pageText, charCount: pageText.length, isScan: opts.isScan ?? false, kind: "pl", basis: "consolidated",
    score: 9, selected: true, selectedBy: "rule",
  });
  return { documents, proposals: createMemoryProposalsRepo(), usage: createMemoryUsageRepo() };
}

function ctx(s: Setup, llm: LlmPort | null, step: Partial<Step> = {}, opts: { clock?: () => number; research?: ReturnType<typeof createMemoryResearch>; usage?: UsageRepo } = {}): StepContext {
  const deps: StepDeps = {
    llm,
    models: { text: "test-model" },
    repos: { documents: machineDocuments(s.documents), usage: opts.usage ?? s.usage, proposals: s.proposals, research: opts.research ?? createMemoryResearch() },
    now: () => new Date(T0),
    clock: opts.clock ?? (() => T0),
  };
  const full: Step = {
    id: "step-1", jobId: "job-1", kind: "extract_page", pageNo: 4, args: {}, status: "running", schemaFailures: 0, providerFailures: 0,
    leaseExpiries: 0, notBefore: new Date(T0).toISOString(), leaseOwner: "owner", lastError: null, ...step,
  };
  return { step: full, documentId: DOC, deadline: T0 + 240_000, deps };
}

/** A fake LLM that answers with one result and records every request. */
function fake(result: LlmResult<unknown>) {
  const complete = vi.fn<(req: LlmRequest<unknown>) => Promise<LlmResult<unknown>>>(async () => result);
  return { llm: { name: "fixture", complete } as unknown as LlmPort, complete };
}
const spied = (llm: LlmPort) => {
  const complete = vi.fn((req: LlmRequest<unknown>) => llm.complete(req));
  return { llm: { name: "fixture", complete } as unknown as LlmPort, complete };
};

describe("extract_page: before the call", () => {
  it("defers 6 hours with AI off (the step is not failed, and never reads the page)", async () => {
    const s = setup();
    const out = await extractPage(ctx(s, null));
    expect(out).toEqual({ kind: "defer", notBefore: new Date(T0 + 6 * 3_600_000), reason: "ai_off" });
  });

  it("sends a scan page to Needs attention with the plain sentence, without calling the AI", async () => {
    const { llm, complete } = fake({ kind: "ok", data: EXTRACTION, usage: USAGE, rate: NO_RATE });
    const out = await extractPage(ctx(setup("", { isScan: true }), llm));
    expect(out).toEqual({ kind: "attention", error: "This page is a scan. Scans are read in a later update; enter it manually or skip." });
    expect(SCAN_PAGE).toBe("This page is a scan. Scans are read in a later update; enter it manually or skip.");
    expect(complete).not.toHaveBeenCalled();
  });

  it("needs attention when the page or document is gone", async () => {
    const { llm } = fake({ kind: "ok", data: EXTRACTION, usage: USAGE, rate: NO_RATE });
    const s = setup();
    expect(await extractPage(ctx(s, llm, { pageNo: 9 }))).toEqual({ kind: "attention", error: PAGE_NOT_STORED });
    s.documents.docs.clear();
    expect(await extractPage(ctx(s, llm))).toEqual({ kind: "attention", error: PAGE_NOT_STORED });
  });

  it("defers, counting no failure, when under 20 s remain before the drain deadline", async () => {
    const { llm, complete } = fake({ kind: "ok", data: EXTRACTION, usage: USAGE, rate: NO_RATE });
    const out = await extractPage(ctx(setup(), llm, {}, { clock: () => T0 + 225_000 }));
    expect(out).toMatchObject({ kind: "defer", reason: "groq_minute" });
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("extract_page: reading the page", () => {
  it("files the extraction and five-style proposals from the fixture answer, flagging the misread", async () => {
    const s = setup();
    const { llm, complete } = spied(createFixtureLlm());
    const out = await extractPage(ctx(s, llm));
    expect(out).toEqual({ kind: "done", result: { proposals: 3, flagged: 1, tokens: 1000 } });
    expect(s.proposals.extractions).toHaveLength(1);
    expect(s.proposals.extractions[0]).toMatchObject({ documentId: DOC, pageNo: 4, model: "test-model", promptVersion: PROMPT_VERSION, tokensUsed: 1000 });
    expect(s.proposals.proposals.map((p) => [p.machineValue.label, p.flags, p.reason])).toEqual([
      ["Revenue from operations", [], "core"],
      ["Finance costs", ["value_not_on_page"], "core"],
      ["Profit for the year", [], "core"],
    ]);
    expect(s.proposals.proposals.every((p) => p.extractionId === "ext-1" && p.documentId === DOC && p.pageNo === 4)).toBe(true);
    const req = complete.mock.calls[0][0];
    expect(req).toMatchObject({ model: "test-model", system: SYSTEM_PROMPT, reasoningEffort: "low", maxCompletionTokens: 1500, timeoutMs: 90_000 });
    expect(req.user).toContain("Revenue from operations 1,284.00 1,102.00");
    expect(s.usage.reservations[0].settled).toEqual({ used: 1000, status: "used" });
  });

  it("gives the call at most the time left less 10 s", async () => {
    const { llm, complete } = spied(createFixtureLlm());
    await extractPage(ctx(setup(), llm, {}, { clock: () => T0 + 190_000 }));
    expect(complete.mock.calls[0][0].timeoutMs).toBe(40_000);
  });

  it("records an empty answer as an extraction with no proposals", async () => {
    const s = setup("Notice of Annual General Meeting");
    const out = await extractPage(ctx(s, createFixtureLlm()));
    expect(out).toEqual({ kind: "done", result: { proposals: 0, flagged: 0, tokens: 1000 } });
    expect(s.proposals.extractions).toHaveLength(1);
    expect(s.proposals.proposals).toHaveLength(0);
  });

  it("copies a cached extraction (same text, model and prompt version) at 0 tokens and never calls the AI", async () => {
    const s = setup();
    const first = spied(createFixtureLlm());
    await extractPage(ctx(s, first.llm));
    s.proposals.proposals.length = 0;
    const second = spied(createFixtureLlm());
    const out = await extractPage(ctx(s, second.llm));
    expect(second.complete).not.toHaveBeenCalled();
    expect(out).toEqual({ kind: "done", result: { proposals: 3, flagged: 1, tokens: 0, cached: true } });
    expect(s.proposals.extractions.map((e) => e.tokensUsed)).toEqual([1000, 0]);
    expect(s.usage.reservations).toHaveLength(1); // the cached read reserved nothing
  });

  it("does not reuse a cached answer from another model or prompt version, or one that no longer fits the schema", async () => {
    const s = setup();
    await extractPage(ctx(s, createFixtureLlm()));
    const other = spied(createFixtureLlm());
    const c = ctx(s, other.llm);
    await extractPage({ ...c, deps: { ...c.deps, models: { text: "other-model" } } });
    expect(other.complete).toHaveBeenCalledTimes(1);
    s.proposals.extractions.forEach((e) => void (e.output = { not: "an extraction" }));
    const again = spied(createFixtureLlm());
    await extractPage(ctx(s, again.llm));
    expect(again.complete).toHaveBeenCalledTimes(1);
  });

  it("records truncated when the page is cut to the character limit", async () => {
    const s = setup(`${PL_TEXT}\n${"x".repeat(13_000)}`);
    const out = await extractPage(ctx(s, createFixtureLlm()));
    expect(out).toMatchObject({ kind: "done", result: { truncated: true } });
  });

  it("is idempotent: a second run over the same page adds no proposal", async () => {
    const s = setup();
    await extractPage(ctx(s, createFixtureLlm()));
    await extractPage(ctx(s, createFixtureLlm()));
    expect(s.proposals.proposals).toHaveLength(3);
  });

  it("stops at 60 proposals per document: the 60th is the last, and a full document reads nothing", async () => {
    const s = setup();
    const filler = (n: number) => Array.from({ length: n }, (_, i) => ({ documentId: DOC, pageNo: 1, extractionId: "x", dedupeKey: `k${i}`, machineValue: {} as never, flags: [], reason: "core" as const }));
    await s.proposals.insertProposals(filler(MAX_PROPOSALS_PER_DOCUMENT - 2));
    const out = await extractPage(ctx(s, createFixtureLlm()));
    expect(out).toMatchObject({ kind: "done", result: { proposals: 2 } });
    expect(await s.proposals.countForDocument(DOC)).toBe(MAX_PROPOSALS_PER_DOCUMENT);
    const { llm, complete } = spied(createFixtureLlm());
    expect(await extractPage(ctx(s, llm))).toEqual({ kind: "done", result: { proposals: 0, capped: true } });
    expect(complete).not.toHaveBeenCalled();
  });

  it("keeps a non-core line the file already tracks (a label match), and reads the file through the research repo", async () => {
    const file = {
      schema: "casefile/1", oneLiner: null,
      sources: [{ id: "S1", doc: "Annual report", type: "Annual report", filedOn: "2026-05-01", url: null, quote: {} }],
      facts: [{ id: "F1", label: "Other operating income", value: 9, unit: "₹ cr", period: "FY26", asOf: "2026-03-31", sourceId: "S1", locator: "p. 4", prior: null, topic: null }],
      tests: [], exhibits: [], readFirst: [], scenario: null,
    };
    expect(validateCaseFile(file).ok).toBe(true);
    const research = createMemoryResearch({ [COMPANY]: { itemId: "i1", title: "Kaveri", structured: file } });
    const { llm } = fake({ kind: "ok", data: EXTRACTION, usage: USAGE, rate: NO_RATE });
    const s = setup(`${PL_TEXT}\nOther operating income 9.00 9.10`, { companyId: COMPANY });
    await extractPage(ctx(s, llm, {}, { research }));
    expect(research.asked).toEqual([COMPANY]);
    expect(s.proposals.proposals.map((p) => [p.machineValue.label, p.reason])).toEqual([["Other operating income", "label_match"]]);

    const none = setup(`${PL_TEXT}\nOther operating income 9.00 9.10`, { companyId: COMPANY });
    await extractPage(ctx(none, llm));
    expect(none.proposals.proposals).toHaveLength(0);
  });
});

describe("extract_page: when the call does not give an answer", () => {
  const usageRefusing = (reason: "groq_minute" | "groq_day"): UsageRepo => ({
    ...createMemoryUsageRepo(),
    reserve: vi.fn(async () => ({ ok: false as const, notBefore: new Date(T0 + 42_000), reason })),
  });

  it("defers with the governor's time and reason when the budget is spent, never calling the AI", async () => {
    const { llm, complete } = fake({ kind: "ok", data: EXTRACTION, usage: USAGE, rate: NO_RATE });
    const out = await extractPage(ctx(setup(), llm, {}, { usage: usageRefusing("groq_day") }));
    expect(out).toEqual({ kind: "defer", notBefore: new Date(T0 + 42_000), reason: "groq_day" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("defers when Groq itself says rate limited", async () => {
    const { llm } = fake({ kind: "rate_limited", rate: { ...NO_RATE, retryAfterSeconds: 7 } });
    expect(await extractPage(ctx(setup(), llm))).toEqual({ kind: "defer", notBefore: new Date(T0 + 7_000), reason: "groq_minute" });
  });

  it("retries as a schema failure with the issues when the answer is invalid", async () => {
    const { llm } = fake({ kind: "invalid", raw: "{}", issues: ["rows.0.label: Required", "basis: Invalid option"], usage: USAGE, rate: NO_RATE });
    const s = setup();
    expect(await extractPage(ctx(s, llm))).toEqual({ kind: "retry", failure: "schema", error: "rows.0.label: Required; basis: Invalid option" });
    expect(s.proposals.extractions).toHaveLength(0);
  });

  it("names the previous issues in the second attempt's system prompt", async () => {
    const { llm, complete } = fake({ kind: "invalid", raw: "{}", issues: ["basis: Invalid option"], usage: USAGE, rate: NO_RATE });
    await extractPage(ctx(setup(), llm, { schemaFailures: 1, lastError: "rows.0.label: Required" }));
    const system = complete.mock.calls[0][0].system;
    expect(system.startsWith(SYSTEM_PROMPT)).toBe(true);
    expect(system.endsWith("Your previous answer was rejected: rows.0.label: Required. Follow the schema exactly.")).toBe(true);
  });

  it("keeps the plain prompt after a provider failure (only a schema failure adds the issues)", async () => {
    const { llm, complete } = fake({ kind: "ok", data: EXTRACTION, usage: USAGE, rate: NO_RATE });
    await extractPage(ctx(setup(), llm, { providerFailures: 1, lastError: "503 overloaded" }));
    expect(complete.mock.calls[0][0].system).toBe(SYSTEM_PROMPT);
  });

  it("retries as a provider failure on a provider error, carrying the status and code only", async () => {
    const { llm } = fake({ kind: "provider_error", status: 503, message: "service_unavailable", rate: NO_RATE });
    expect(await extractPage(ctx(setup(), llm))).toEqual({ kind: "retry", failure: "provider", error: "503 service_unavailable" });
    const timeout = fake({ kind: "provider_error", status: null, message: "TimeoutError", rate: NO_RATE });
    expect(await extractPage(ctx(setup(), timeout.llm))).toEqual({ kind: "retry", failure: "provider", error: "network TimeoutError" });
  });

  it("sends an unrecoverable 4xx to Needs attention in plain words, with no retry", async () => {
    const key = fake({ kind: "rejected", status: 401, message: "invalid_api_key", rate: NO_RATE });
    expect(await extractPage(ctx(setup(), key.llm))).toEqual({ kind: "attention", error: KEY_REFUSED });
    const big = fake({ kind: "rejected", status: 413, message: "request_too_large", rate: NO_RATE });
    expect(await extractPage(ctx(setup(), big.llm))).toEqual({ kind: "attention", error: PAGE_TOO_BIG });
    const context = fake({ kind: "rejected", status: 400, message: "context_length_exceeded", rate: NO_RATE });
    expect(await extractPage(ctx(setup(), context.llm))).toEqual({ kind: "attention", error: PAGE_TOO_BIG });
    expect(PAGE_TOO_BIG).toBe("This page is too big for the free AI allowance. Enter the figures yourself.");
  });

  it("sends a call that can never fit the allowance to Needs attention, without touching the ledger", async () => {
    const { llm, complete } = fake({ kind: "ok", data: EXTRACTION, usage: USAGE, rate: NO_RATE });
    const s = setup();
    // The previous issues are cut to 500 characters by the runner; a huge one shows the mapping.
    const out = await extractPage(ctx(s, llm, { schemaFailures: 1, lastError: "x".repeat(GROQ_CAPS.tpm * 4) }));
    expect(out).toEqual({ kind: "attention", error: PAGE_TOO_BIG });
    expect(complete).not.toHaveBeenCalled();
    expect(s.usage.reservations).toHaveLength(0);
  });
});
