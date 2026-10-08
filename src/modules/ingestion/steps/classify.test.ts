import { describe, expect, it, vi } from "vitest";
import type { LlmPort, LlmRequest, LlmResult } from "@/lib/providers/llm";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryUsageRepo, type MemoryUsageRepo } from "@/test/fakes/usage-repo";
import { CLASSIFY_BATCH, CLASSIFY_MAX_COMPLETION, CLASSIFY_PAGE_CHARS } from "../caps";
import { machineDocuments, type StepDeps } from "../deps";
import { CLASSIFY_PROMPT_VERSION, type Classification } from "../prompts";
import type { Step, StepContext, StepOutcome } from "../types";
import type { UsageRepo } from "../usage-repo";
import { firstClassifyStep } from "./classify-args";
import { CHOOSING_FAILED, classifyPagesStep } from "./classify-pages";

// classify_pages (ruling R16, R2): batches of ten openings on the small model; the last batch picks what it found.

const DOC = "11111111-1111-4111-8111-111111111111";
const T0 = Date.parse("2026-10-08T10:00:00Z");
const NO_RATE = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };
const USAGE = { promptTokens: 2000, completionTokens: 300, totalTokens: 2300 };
const row = (n: number) => `Particulars ${n}00.00 ${n}10.00\nOther income ${n}1.20 ${n}8.90\nTotal ${n}25.20 ${n}40.90\nTax ${n}2.10 ${n}9.80\n`;
const OPENING = (n: number) => row(n);

type Kind = "pl" | "bs" | "cf" | "notes" | "segment" | "mdna" | "other";
const answer = (...pages: [number, Kind, number][]): Classification => ({ pages: pages.map(([page, kind, confidence]) => ({ page, kind, confidence })) });
const ok = (data: Classification): LlmResult<unknown> => ({ kind: "ok", data, usage: USAGE, rate: NO_RATE });

function setup(pageNos: number[], opts: { budget?: number; texts?: Record<number, string> } = {}) {
  const documents = createMemoryDocumentsRepo();
  documents.docs.set(DOC, {
    id: DOC, companyId: null, title: "Annual report", kind: "pdf", storagePath: `${DOC}.pdf`, sha256: "a".repeat(64), bytes: 10, pageCount: 200,
    status: "active", llmPageBudget: opts.budget ?? 20, basis: "consolidated", sourceType: "Annual report", filedOn: null, sourceUrl: null,
    originalDeletedAt: null, transcriptStatus: null, createdAt: new Date(T0).toISOString(),
  });
  for (const n of pageNos) void documents.insertPages(DOC, [{ pageNo: n, text: opts.texts?.[n] ?? OPENING(n) }]);
  return { documents, usage: createMemoryUsageRepo() };
}

function fake(...results: LlmResult<unknown>[]) {
  const complete = vi.fn<(req: LlmRequest<unknown>) => Promise<LlmResult<unknown>>>(async () => results.shift() ?? ok({ pages: [] }));
  return { llm: { name: "fixture", complete } as unknown as LlmPort, complete };
}

function ctx(s: { documents: MemoryDocumentsRepo; usage: MemoryUsageRepo | UsageRepo }, llm: LlmPort | null, step: Partial<Step>, opts: { clock?: () => number } = {}): StepContext {
  const deps: StepDeps = {
    llm, ocr: null, transcriber: null, models: { text: "test-text", vision: "test-vision", classify: "test-classify", whisper: "test-whisper" },
    repos: { documents: machineDocuments(s.documents), usage: s.usage, proposals: createMemoryProposalsRepo(), research: createMemoryResearch(), digests: createMemoryDigestsRepo() },
    now: () => new Date(T0), clock: opts.clock ?? (() => T0),
  };
  const full: Step = {
    id: "step-1", jobId: "job-1", kind: "classify_pages", pageNo: 1, pass: 1, args: { pages: [1], accepted: [] }, status: "running", schemaFailures: 0, providerFailures: 0,
    leaseExpiries: 0, notBefore: new Date(T0).toISOString(), leaseOwner: "owner", lastError: null, ...step,
  };
  return { step: full, documentId: DOC, deadline: T0 + 240_000, deps };
}

/** The step select_pages would queue for these pages. */
const stepFor = (pages: number[], extra: Partial<Step> = {}): Partial<Step> => {
  const first = firstClassifyStep(pages);
  return { pageNo: first.pageNo, args: first.args, ...extra };
};
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const done = (o: StepOutcome) => {
  if (o.kind !== "done") throw new Error(`expected done, got ${o.kind}`);
  return o;
};

describe("classify_pages: batches of ten, one step each (R2)", () => {
  it("sends the first ten openings (600 characters each) in one call and queues the next batch from the eleventh page", async () => {
    const pages = range(11, 35);
    const texts = Object.fromEntries(pages.map((n) => [n, `${OPENING(n)}${"x".repeat(900)}TAIL`]));
    const s = setup(pages, { texts });
    const { llm, complete } = fake(ok(answer([11, "pl", 0.9])));
    const out = done(await classifyPagesStep(ctx(s, llm, stepFor(pages))));

    expect(complete).toHaveBeenCalledTimes(1);
    const req = complete.mock.calls[0]![0];
    expect(req).toMatchObject({ model: "test-classify", maxCompletionTokens: CLASSIFY_MAX_COMPLETION, reasoningEffort: "low", schemaName: "page_classification" });
    expect(CLASSIFY_BATCH).toBe(10);
    expect(CLASSIFY_PAGE_CHARS).toBe(600);
    expect(req.user.match(/^Page \d+:/gm)).toHaveLength(10);
    expect(req.user).toContain("Page 20:");
    expect(req.user).not.toContain("Page 21:");
    expect(req.user).not.toContain("TAIL");
    expect(req.user).toContain(texts[11]!.slice(0, 600));
    expect(req.user).not.toContain(texts[11]!.slice(0, 601));
    expect(out.result).toMatchObject({ promptVersion: CLASSIFY_PROMPT_VERSION, asked: 10, kept: 1 });
    expect(out.enqueue).toEqual([
      { kind: "classify_pages", pageNo: 21, args: { pages: range(21, 35), accepted: [{ pageNo: 11, kind: "pl", basis: null, score: 38 }] } },
    ]);
    expect(s.documents.pages.get(`${DOC}:11`)).toMatchObject({ kind: "pl", score: 38 });
    expect(s.documents.pages.get(`${DOC}:12`)?.kind).toBeNull();
    expect(s.documents.pages.get(`${DOC}:11`)?.selected).toBe(false); // only the last batch ticks
  });

  it("runs the selection itself on the last batch, carrying every batch's verdicts, best first, through the shared routing", async () => {
    const s = setup([1, 2, 3, 4], { budget: 2 });
    const { llm } = fake(ok(answer([3, "notes", 0.7])));
    const carried = [
      { pageNo: 1, kind: "cf", basis: null, score: 39 },
      { pageNo: 2, kind: "bs", basis: null, score: 33 },
    ];
    const out = done(await classifyPagesStep(ctx(s, llm, { pageNo: 3, args: { pages: [3, 4], accepted: carried } })));
    expect(out.enqueue).toEqual([{ kind: "extract_page", pageNo: 1 }, { kind: "extract_page", pageNo: 3 }]); // 39 and 34 beat 33; budget 2
    expect(out.result).toMatchObject({ selected: 2 });
    expect([...s.documents.pages.values()].filter((p) => p.selected).map((p) => [p.pageNo, p.selectedBy])).toEqual([[1, "rule"], [3, "rule"]]);
  });
});

describe("classify_pages: what the model's answer is worth", () => {
  it("ignores a verdict under 0.6 confidence (the rule's 'other' stands), 'other', a page not asked, a repeat, and a bad confidence; keeps 0.6", async () => {
    const s = setup([1, 2, 3, 4, 5, 6]);
    const { llm } = fake(ok(answer([1, "pl", 0.59], [2, "other", 0.99], [3, "bs", 0.6], [99, "cf", 0.95], [4, "cf", 0.8], [4, "pl", 0.99], [5, "notes", Number.NaN], [6, "pl", 1.4])));
    const out = done(await classifyPagesStep(ctx(s, llm, stepFor([1, 2, 3, 4, 5, 6]))));
    expect(out.result).toMatchObject({ asked: 6, kept: 2, selected: 2 });
    const kinds = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [n, s.documents.pages.get(`${DOC}:${n}`)?.kind ?? null]));
    expect(kinds).toEqual({ 1: null, 2: null, 3: "bs", 4: "cf", 5: null, 6: null });
    expect(s.documents.pages.get(`${DOC}:3`)?.score).toBeCloseTo(32);
    expect(out.enqueue).toEqual([{ kind: "extract_page", pageNo: 3 }, { kind: "extract_page", pageNo: 4 }]);
    expect(s.documents.pages.get(`${DOC}:1`)?.selected).toBe(false);
  });

  it("ranks a model verdict (20 + 20 x confidence) below a heading page that already fills the budget", async () => {
    const s = setup([1, 2], { budget: 1 });
    s.documents.pages.set(`${DOC}:1`, { ...s.documents.pages.get(`${DOC}:1`)!, kind: "pl", score: 120, selected: true, selectedBy: "rule" });
    const { llm } = fake(ok(answer([2, "pl", 1])));
    const out = done(await classifyPagesStep(ctx(s, llm, stepFor([2]))));
    expect(out.enqueue).toEqual([]);
    expect(s.documents.pages.get(`${DOC}:2`)).toMatchObject({ kind: "pl", selected: false }); // sorted, so Aksh sees it, but there is no room
  });
});

describe("classify_pages: Aksh's own ticks stand", () => {
  it("does not send a page Aksh ticked or unticked, never changes it, and counts his ticks against the budget", async () => {
    const s = setup([1, 2, 3, 4], { budget: 2 });
    s.documents.pages.set(`${DOC}:1`, { ...s.documents.pages.get(`${DOC}:1`)!, selected: true, selectedBy: "aksh" });
    s.documents.pages.set(`${DOC}:2`, { ...s.documents.pages.get(`${DOC}:2`)!, selected: false, selectedBy: "aksh" });
    const { llm, complete } = fake(ok(answer([1, "pl", 1], [2, "pl", 1], [3, "bs", 0.9], [4, "cf", 0.8])));
    const out = done(await classifyPagesStep(ctx(s, llm, stepFor([1, 2, 3, 4]))));
    expect(complete.mock.calls[0]![0].user).not.toMatch(/^Page [12]:/m);
    expect(s.documents.pages.get(`${DOC}:1`)).toMatchObject({ kind: null, selected: true, selectedBy: "aksh" });
    expect(s.documents.pages.get(`${DOC}:2`)).toMatchObject({ kind: null, selected: false, selectedBy: "aksh" });
    expect(out.enqueue).toEqual([{ kind: "extract_page", pageNo: 3 }]); // Aksh's tick takes one of the two places
  });

  it("drops a carried verdict for a page Aksh has since decided on, and asks nothing when every page of the batch is his", async () => {
    const s = setup([1, 2]);
    s.documents.pages.set(`${DOC}:1`, { ...s.documents.pages.get(`${DOC}:1`)!, selected: false, selectedBy: "aksh" });
    s.documents.pages.set(`${DOC}:2`, { ...s.documents.pages.get(`${DOC}:2`)!, selected: true, selectedBy: "aksh" });
    const { llm, complete } = fake();
    const out = done(await classifyPagesStep(ctx(s, llm, { pageNo: 1, args: { pages: [1, 2], accepted: [{ pageNo: 1, kind: "pl", basis: null, score: 40 }] } })));
    expect(complete).not.toHaveBeenCalled();
    expect(out).toMatchObject({ result: { asked: 0, selected: 0 }, enqueue: [] });
    expect(s.documents.pages.get(`${DOC}:1`)).toMatchObject({ selected: false, selectedBy: "aksh" });
  });

  it("queues a page it ticked on an earlier try again (the queue ignores a duplicate) and ticks nothing new past the budget", async () => {
    const s = setup([1, 2], { budget: 1 });
    s.documents.pages.set(`${DOC}:1`, { ...s.documents.pages.get(`${DOC}:1`)!, kind: "pl", score: 40, selected: true, selectedBy: "rule" });
    const { llm } = fake(ok(answer([2, "bs", 0.9])));
    const out = done(await classifyPagesStep(ctx(s, llm, { pageNo: 2, args: { pages: [2], accepted: [{ pageNo: 1, kind: "pl", basis: null, score: 40 }] } })));
    expect(out.enqueue).toEqual([{ kind: "extract_page", pageNo: 1 }]);
    expect(s.documents.pages.get(`${DOC}:2`)?.selected).toBe(false);
  });
});

describe("classify_pages: the governor, like extraction", () => {
  const refusing = (reason: "groq_minute" | "groq_day"): UsageRepo => ({
    ...createMemoryUsageRepo(),
    reserve: vi.fn(async () => ({ ok: false as const, notBefore: new Date(T0 + 42_000), reason })),
  });

  it("defers with the governor's time and reason when the classify bucket is spent, never calling the model", async () => {
    const s = setup([1, 2]);
    const { llm, complete } = fake(ok(answer([1, "pl", 1])));
    const out = await classifyPagesStep(ctx({ ...s, usage: refusing("groq_day") }, llm, stepFor([1, 2])));
    expect(out).toEqual({ kind: "defer", notBefore: new Date(T0 + 42_000), reason: "groq_day" });
    expect(complete).not.toHaveBeenCalled();
    expect(s.documents.pages.get(`${DOC}:1`)?.kind).toBeNull();
  });

  it("defers when Groq itself says rate limited", async () => {
    const { llm } = fake({ kind: "rate_limited", rate: { ...NO_RATE, retryAfterSeconds: 7 } });
    expect(await classifyPagesStep(ctx(setup([1]), llm, stepFor([1])))).toEqual({ kind: "defer", notBefore: new Date(T0 + 7_000), reason: "groq_minute" });
  });

  it("defers six hours with AI off, and briefly when under 20 s remain, calling nothing", async () => {
    const { llm, complete } = fake();
    expect(await classifyPagesStep(ctx(setup([1]), null, stepFor([1])))).toEqual({ kind: "defer", notBefore: new Date(T0 + 6 * 3_600_000), reason: "ai_off" });
    expect(await classifyPagesStep(ctx(setup([1]), llm, stepFor([1]), { clock: () => T0 + 225_000 }))).toMatchObject({ kind: "defer", reason: "groq_minute" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("reserves in the classify model's own bucket, settles the tokens used, and never touches the document's page budget", async () => {
    const s = setup([1, 2], { budget: 1 });
    const { llm } = fake(ok(answer([1, "pl", 0.9])));
    await classifyPagesStep(ctx(s, llm, stepFor([1, 2])));
    expect(s.usage.reservations).toHaveLength(1);
    expect(s.usage.reservations[0]).toMatchObject({ bucket: "test-classify", settled: { used: USAGE.totalTokens, status: "used" } });
    expect(s.usage.reservations[0]!.tokens).toBeLessThan(3_000); // about 2,000 in, 400 out
    expect(s.documents.docs.get(DOC)?.llmPageBudget).toBe(1);
  });
});

describe("classify_pages: an answer that does not come", () => {
  it("retries as a schema failure with the issues first, then lets the batch go and carries on (the rules' choice stands)", async () => {
    const invalid: LlmResult<unknown> = { kind: "invalid", raw: "{}", issues: ["pages.0.kind: Invalid option"], usage: USAGE, rate: NO_RATE };
    const s = setup([1, 2, 3], { budget: 5 });
    const { llm, complete } = fake(invalid, invalid);
    expect(await classifyPagesStep(ctx(s, llm, stepFor([1, 2, 3])))).toEqual({ kind: "retry", failure: "schema", error: "pages.0.kind: Invalid option" });
    const second = done(await classifyPagesStep(ctx(s, llm, stepFor([1, 2, 3], { schemaFailures: 1, lastError: "pages.0.kind: Invalid option" }))));
    expect(complete.mock.calls[1]![0].system).toContain("Your previous answer was rejected: pages.0.kind: Invalid option");
    expect(second).toMatchObject({ result: { kept: 0, letGo: "schema" }, enqueue: [] });
  });

  it("retries a provider error twice, lets the batch go on the third, and queues the next batch when there is one", async () => {
    const down: LlmResult<unknown> = { kind: "provider_error", status: 503, message: "busy", rate: NO_RATE };
    const s = setup(range(1, 12));
    const { llm } = fake(down, down);
    const pages = range(1, 12);
    expect(await classifyPagesStep(ctx(s, llm, stepFor(pages)))).toEqual({ kind: "retry", failure: "provider", error: "503 busy" });
    const last = done(await classifyPagesStep(ctx(s, llm, stepFor(pages, { providerFailures: 2 }))));
    expect(last.result).toMatchObject({ letGo: "provider" });
    expect(last.enqueue).toEqual([{ kind: "classify_pages", pageNo: 11, args: { pages: [11, 12], accepted: [] } }]);
  });

  it("lets a refused request go (a bad key shows on the reading itself) without failing the document", async () => {
    const { llm } = fake({ kind: "rejected", status: 401, message: "bad key", rate: NO_RATE });
    expect(await classifyPagesStep(ctx(setup([1]), llm, stepFor([1])))).toMatchObject({ kind: "done", result: { letGo: "refused" } });
  });

  it("needs attention with the plain sentence when its arguments are not readable, and when the document is gone", async () => {
    const { llm } = fake();
    expect(await classifyPagesStep(ctx(setup([1]), llm, { args: { pages: "1" } }))).toEqual({ kind: "attention", error: CHOOSING_FAILED });
    const s = setup([1]);
    s.documents.docs.clear();
    expect(await classifyPagesStep(ctx(s, llm, stepFor([1])))).toMatchObject({ kind: "attention" });
  });
});

describe("classify_pages: a rerun after the verdicts were stored (Plan 2b Task 8 carry d)", () => {
  it("counts a page that already holds a model verdict as found and does not ask about it again", async () => {
    const s = setup([1, 2, 3], { budget: 5 });
    // The first try stored page 3's verdict and died before it returned: the page already has a kind and a score.
    s.documents.pages.set(`${DOC}:3`, { ...s.documents.pages.get(`${DOC}:3`)!, kind: "bs", score: 38 });
    const { llm, complete } = fake();
    const out = done(await classifyPagesStep(ctx(s, llm, stepFor([1, 2, 3]))));
    expect(complete).toHaveBeenCalledTimes(1); // pages 1 and 2 are still unsorted and are asked
    expect(complete.mock.calls[0]![0].user).not.toMatch(/^Page 3:/m);
    expect(out.enqueue).toEqual([{ kind: "extract_page", pageNo: 3 }]);
    expect(s.documents.pages.get(`${DOC}:3`)).toMatchObject({ selected: true, selectedBy: "rule" });
  });

  it("makes no call at all when every page of the batch was sorted before", async () => {
    const s = setup([3], { budget: 5 });
    s.documents.pages.set(`${DOC}:3`, { ...s.documents.pages.get(`${DOC}:3`)!, kind: "pl", score: 36 });
    const { llm, complete } = fake();
    const out = done(await classifyPagesStep(ctx(s, llm, stepFor([3]))));
    expect(complete).not.toHaveBeenCalled();
    expect(out.enqueue).toEqual([{ kind: "extract_page", pageNo: 3 }]);
  });

  it("does not take a page for a model verdict when Aksh ticked or unticked it", async () => {
    const s = setup([3], { budget: 5 });
    s.documents.pages.set(`${DOC}:3`, { ...s.documents.pages.get(`${DOC}:3`)!, kind: "pl", score: 36, selectedBy: "aksh", selected: false });
    const { llm } = fake();
    const out = done(await classifyPagesStep(ctx(s, llm, stepFor([3]))));
    expect(out.enqueue).toEqual([]);
  });
});
