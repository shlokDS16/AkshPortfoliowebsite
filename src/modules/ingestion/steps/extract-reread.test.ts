import { describe, expect, it, vi } from "vitest";
import { createFixtureLlm } from "@/lib/providers/fixture-llm";
import type { LlmPort, LlmRequest, LlmResult } from "@/lib/providers/llm";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { PAGE_CHAR_LIMIT, REREAD_MAX_COMPLETION } from "../caps";
import { PROMPT_VERSION, REREAD_PROMPT_VERSION } from "../prompts";
import { machineDocuments, type StepDeps } from "../deps";
import type { Step, StepContext } from "../types";
import { extractPage } from "./extract-page";

// A re-read (Plan 2b Task 8, rulings R2 and R3): the same page again, on purpose, so the cache is skipped, the model thinks harder
// (medium), the call is still budgeted, and the new rows arrive beside the old ones under keys of their own pass.

const DOC = "11111111-1111-4111-8111-111111111111";
const T0 = Date.parse("2026-10-08T10:00:00Z");
const PL_TEXT = [
  "Consolidated Statement of Profit and Loss for the year ended March 31, 2026",
  "(Rs. in crore)",
  "Particulars Year ended March 31, 2026 Year ended March 31, 2025",
  "Revenue from operations 1,284.00 1,102.00",
  "Finance costs 41.20 38.90",
  "Profit for the year 152.60 118.30",
].join("\n");

function setup(pageText = PL_TEXT) {
  const documents = createMemoryDocumentsRepo();
  documents.docs.set(DOC, {
    id: DOC, companyId: null, title: "Kaveri annual report", kind: "pdf", storagePath: `${DOC}.pdf`, sha256: "a".repeat(64), bytes: 10, pageCount: 6,
    status: "active", llmPageBudget: 20, basis: "consolidated", sourceType: "Annual report", filedOn: null, sourceUrl: null, originalDeletedAt: null,
    transcriptStatus: null, createdAt: new Date(T0).toISOString(),
  });
  documents.pages.set(`${DOC}:4`, {
    documentId: DOC, pageNo: 4, text: pageText, charCount: pageText.length, isScan: false, kind: "pl", basis: "consolidated", score: 9, selected: true, selectedBy: "rule", ocr: false,
  });
  return { documents, proposals: createMemoryProposalsRepo(), usage: createMemoryUsageRepo() };
}

function ctx(s: ReturnType<typeof setup>, llm: LlmPort, step: Partial<Step> = {}): StepContext {
  const deps: StepDeps = {
    llm, ocr: null, transcriber: null, models: { text: "test-model", vision: "test-vision", classify: "test-classify", whisper: "test-whisper" },
    repos: { documents: machineDocuments(s.documents), usage: s.usage, proposals: s.proposals, research: createMemoryResearch(), digests: createMemoryDigestsRepo() },
    now: () => new Date(T0), clock: () => T0,
  };
  const full: Step = {
    id: "step-1", jobId: "job-1", kind: "extract_page", pageNo: 4, pass: 1, args: {}, status: "running", schemaFailures: 0, providerFailures: 0,
    leaseExpiries: 0, notBefore: new Date(T0).toISOString(), leaseOwner: "owner", lastError: null, ...step,
  };
  return { step: full, documentId: DOC, deadline: T0 + 240_000, deps };
}
const spied = (llm: LlmPort) => {
  const complete = vi.fn((req: LlmRequest<unknown>) => llm.complete(req) as Promise<LlmResult<unknown>>);
  return { llm: { name: "fixture", complete } as unknown as LlmPort, complete };
};
const REREAD = { pass: 2, args: { reread: true } };

describe("extract_page: a re-read", () => {
  it("skips the cache that the first read filled, thinks at medium, and is budgeted like any call", async () => {
    const s = setup();
    await extractPage(ctx(s, createFixtureLlm()));
    const { llm, complete } = spied(createFixtureLlm());
    const out = await extractPage(ctx(s, llm, REREAD));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]![0]).toMatchObject({ reasoningEffort: "medium", maxCompletionTokens: REREAD_MAX_COMPLETION, model: "test-model" });
    expect(out).toMatchObject({ kind: "done", result: { tokens: 1000, reread: true } });
    expect(out.kind === "done" && out.result).not.toHaveProperty("cached");
    expect(s.usage.reservations).toHaveLength(2);
    expect(s.usage.reservations[1]!.settled).toEqual({ used: 1000, status: "used" });
    expect(s.proposals.extractions).toHaveLength(2);
  });

  it("sends the page whole, up to the character cap, and says so when it had to cut", async () => {
    const s = setup(`${PL_TEXT}\n${"x".repeat(PAGE_CHAR_LIMIT)}`);
    const { llm, complete } = spied(createFixtureLlm());
    const out = await extractPage(ctx(s, llm, REREAD));
    expect(complete.mock.calls[0]![0].user).toContain("x".repeat(PAGE_CHAR_LIMIT - PL_TEXT.length - 10));
    expect(complete.mock.calls[0]![0].user.length).toBeLessThan(PAGE_CHAR_LIMIT + 200);
    expect(out).toMatchObject({ result: { truncated: true } });
  });

  it("files its rows under keys of its own pass, so they sit beside the first pass's rows instead of being dropped", async () => {
    const s = setup();
    await extractPage(ctx(s, createFixtureLlm()));
    const first = s.proposals.proposals.map((p) => p.dedupeKey);
    expect(first.every((k) => !k.includes("|r"))).toBe(true);
    await extractPage(ctx(s, createFixtureLlm(), REREAD));
    const keys = s.proposals.proposals.map((p) => p.dedupeKey);
    expect(keys).toHaveLength(first.length * 2);
    expect(keys.slice(first.length).every((k) => k.endsWith("|r2"))).toBe(true);
    // The same pass run twice (a duplicate step) still adds nothing.
    await extractPage(ctx(s, createFixtureLlm(), REREAD));
    expect(s.proposals.proposals).toHaveLength(first.length * 2);
  });

  it("does not ask for more than the free tier's minute can hold", async () => {
    const s = setup(`${PL_TEXT}\n${"x".repeat(PAGE_CHAR_LIMIT)}`);
    const { llm } = spied(createFixtureLlm());
    await extractPage(ctx(s, llm, REREAD));
    expect(s.usage.reservations[0]!.tokens).toBeLessThanOrEqual(6_000);
  });

  it("leaves a first read exactly as it was: cache on, low reasoning, plain keys", async () => {
    const s = setup();
    const { llm, complete } = spied(createFixtureLlm());
    await extractPage(ctx(s, llm));
    expect(complete.mock.calls[0]![0]).toMatchObject({ reasoningEffort: "low", maxCompletionTokens: 1500 });
    const again = spied(createFixtureLlm());
    const out = await extractPage(ctx(s, again.llm));
    expect(again.complete).not.toHaveBeenCalled();
    expect(out).toMatchObject({ result: { cached: true } });
  });

  it("keeps its answer under a prompt version of its own, so the harder reading never becomes the cached answer of a first read", async () => {
    const s = setup();
    await extractPage(ctx(s, createFixtureLlm(), REREAD));
    expect(s.proposals.extractions.map((e) => e.promptVersion)).toEqual([REREAD_PROMPT_VERSION]);
    expect(REREAD_PROMPT_VERSION).not.toBe(PROMPT_VERSION);
    expect(REREAD_PROMPT_VERSION.length).toBeLessThanOrEqual(40);
    const first = spied(createFixtureLlm());
    const out = await extractPage(ctx(s, first.llm));
    expect(first.complete).toHaveBeenCalledTimes(1); // a miss: nothing stored under the first-read version
    expect(first.complete.mock.calls[0]![0].reasoningEffort).toBe("low");
    expect(out).toMatchObject({ result: { tokens: 1000 } });
    expect(s.proposals.extractions.map((e) => e.promptVersion)).toEqual([REREAD_PROMPT_VERSION, PROMPT_VERSION]);
  });

  it("does nothing special for a malformed re-read flag: only the literal true counts", async () => {
    const s = setup();
    await extractPage(ctx(s, createFixtureLlm()));
    const { llm, complete } = spied(createFixtureLlm());
    await extractPage(ctx(s, llm, { pass: 2, args: { reread: "yes" } }));
    expect(complete).not.toHaveBeenCalled();
  });
});
