import { describe, expect, it, vi } from "vitest";
import type { LlmPort, LlmRequest, LlmResult } from "@/lib/providers/llm";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { machineDocuments, type StepDeps } from "../deps";
import type { Classification } from "../prompts";
import type { NewStep, Step, StepContext, StepOutcome } from "../types";
import { classifyPagesStep } from "./classify-pages";
import { selectPagesStep } from "./select-pages";

// select_pages hands the pages the rules could not place to the classifier (ruling R16), and the chain of batches ends in a
// selection that respects the document's budget and Aksh's own ticks.

const DOC = "11111111-1111-4111-8111-111111111111";
const T0 = Date.parse("2026-10-08T10:00:00Z");
const NO_RATE = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };
const PL = "Consolidated Statement of Profit and Loss for the year ended March 31, 2026\nRevenue from operations 1,284.00 1,102.00\nFinance costs 41.20";
const PROSE = "The directors are pleased to present the annual report together with the audited accounts for the year under review.";
const SCHEDULE = (n: number) => `Particulars ${n}00.00 ${n}10.00\nOther income ${n}1.20 ${n}8.90\nTotal ${n}25.20 ${n}40.90\nTax ${n}2.10 ${n}9.80\n`;

type Kind = Classification["pages"][number]["kind"];

function repoOf(kind: "pdf" | "text", pages: string[], budget: number): MemoryDocumentsRepo {
  const repo = createMemoryDocumentsRepo();
  repo.docs.set(DOC, {
    id: DOC, companyId: null, title: "Report", kind, storagePath: `${DOC}.pdf`, sha256: "a".repeat(64), bytes: 10, pageCount: pages.length,
    status: "active", llmPageBudget: budget, basis: "consolidated", sourceType: "Annual report", filedOn: null, sourceUrl: null, originalDeletedAt: null,
    transcriptStatus: null, createdAt: new Date(T0).toISOString(),
  });
  pages.forEach((text, i) => void repo.insertPages(DOC, [{ pageNo: i + 1, text }]));
  return repo;
}

const asked = (req: LlmRequest<unknown>) => [...req.user.matchAll(/^Page (\d+):/gm)].map((m) => Number(m[1]));

/** A model that gives every page it is shown the kind and confidence `verdict` names. */
function modelThat(verdict: (pageNo: number) => [Kind, number]) {
  const complete = vi.fn(async (req: LlmRequest<unknown>): Promise<LlmResult<unknown>> => ({
    kind: "ok",
    data: { pages: asked(req).map((page) => ({ page, kind: verdict(page)[0], confidence: verdict(page)[1] })) },
    usage: { promptTokens: 2000, completionTokens: 200, totalTokens: 2200 },
    rate: NO_RATE,
  }));
  return { llm: { name: "fixture", complete } as unknown as LlmPort, complete };
}

function ctxFor(repo: MemoryDocumentsRepo, llm: LlmPort | null, step: Partial<Step>): StepContext {
  const deps: StepDeps = {
    llm, ocr: null, transcriber: null, models: { text: "t", vision: "v", classify: "c", whisper: "w" },
    repos: { documents: machineDocuments(repo), usage: createMemoryUsageRepo(), proposals: createMemoryProposalsRepo(), research: createMemoryResearch(), digests: createMemoryDigestsRepo() },
    now: () => new Date(T0), clock: () => T0,
  };
  const base: Step = {
    id: "s", jobId: "j", kind: "select_pages", pageNo: null, pass: 1, args: {}, status: "running", schemaFailures: 0, providerFailures: 0, leaseExpiries: 0,
    notBefore: "", leaseOwner: "o", lastError: null, ...step,
  };
  return { step: base, documentId: DOC, deadline: T0 + 240_000, deps };
}

const enqueued = (o: StepOutcome): NewStep[] => (o.kind === "done" ? (o.enqueue ?? []) : []);
const hasClassify = (steps: NewStep[]) => steps.some((s) => s.kind === "classify_pages");

/** Runs select_pages, then every classify_pages step it leads to (the queue's job), and returns every step queued along the way. */
async function runChain(repo: MemoryDocumentsRepo, llm: LlmPort): Promise<NewStep[]> {
  const all: NewStep[] = [];
  let queue = enqueued(await selectPagesStep(ctxFor(repo, llm, {})));
  all.push(...queue);
  while (hasClassify(queue)) {
    const step = queue.find((s) => s.kind === "classify_pages")!;
    queue = enqueued(await classifyPagesStep(ctxFor(repo, llm, { kind: "classify_pages", pageNo: step.pageNo, args: step.args })));
    all.push(...queue);
  }
  return all;
}

describe("select_pages queues the classifier", () => {
  const pages = [PL, PROSE, SCHEDULE(1), SCHEDULE(2), PROSE];
  const { llm } = modelThat(() => ["notes", 0.9]);

  it("queues one classify_pages step, keyed by the first doubtful page, with the doubtful pages in its arguments", async () => {
    const out = await selectPagesStep(ctxFor(repoOf("pdf", pages, 20), llm, {}));
    expect(out).toMatchObject({ kind: "done", result: { selected: 1, doubtful: 2 } });
    expect(enqueued(out)).toEqual([
      { kind: "extract_page", pageNo: 1 },
      { kind: "classify_pages", pageNo: 3, args: { pages: [3, 4], accepted: [] } },
    ]);
  });

  it("queues nothing for the classifier with AI off, for pasted text, with no doubtful page, or when the budget is already full", async () => {
    expect(await selectPagesStep(ctxFor(repoOf("pdf", pages, 20), null, {}))).toEqual({ kind: "done", result: { selected: 1, aiOff: true } });
    expect(hasClassify(enqueued(await selectPagesStep(ctxFor(repoOf("text", pages, 20), llm, {}))))).toBe(false);
    expect(hasClassify(enqueued(await selectPagesStep(ctxFor(repoOf("pdf", [PL, PROSE, PROSE], 20), llm, {}))))).toBe(false);
    expect(hasClassify(enqueued(await selectPagesStep(ctxFor(repoOf("pdf", pages, 1), llm, {}))))).toBe(false);
  });

  it("sends at most 30 pages, which is three batches", async () => {
    const many = [PL, PROSE, ...Array.from({ length: 45 }, (_, i) => SCHEDULE(i + 1))];
    const step = enqueued(await selectPagesStep(ctxFor(repoOf("pdf", many, 40), llm, {}))).find((s) => s.kind === "classify_pages");
    expect((step?.args as { pages: number[] }).pages).toHaveLength(30);
  });

  it("leaves a page Aksh unticked alone: it is never sent to the model, never ticked", async () => {
    const repo = repoOf("pdf", [PL, PROSE, SCHEDULE(1)], 2);
    repo.pages.set(`${DOC}:3`, { ...repo.pages.get(`${DOC}:3`)!, selected: false, selectedBy: "aksh" });
    const { llm: model, complete } = modelThat(() => ["pl", 1]);
    const steps = await runChain(repo, model);
    expect(steps.filter((s) => s.kind === "extract_page")).toEqual([{ kind: "extract_page", pageNo: 1 }]);
    expect(complete).not.toHaveBeenCalled(); // the only doubtful page is his
    expect(repo.pages.get(`${DOC}:3`)).toMatchObject({ selected: false, selectedBy: "aksh" });
  });
});

describe("the whole chain: select_pages, three batches, one selection", () => {
  it("sorts 25 doubtful pages in three calls and reads the best of them within the remaining budget, through the shared routing", async () => {
    // Page 1 is the P&L, page 2 is prose (a schedule straight after a statement would be taken as its run-on), pages 3-27 are doubtful.
    const pageList = [PL, PROSE, ...Array.from({ length: 25 }, (_, i) => SCHEDULE(i + 1))];
    const repo = repoOf("pdf", pageList, 4);
    // Page 8 is surest, then 24, then 4; page 14 is a guess under the bar.
    const sure = new Map<number, [Kind, number]>([[8, ["cf", 0.95]], [24, ["bs", 0.9]], [4, ["notes", 0.8]], [14, ["pl", 0.4]]]);
    const { llm, complete } = modelThat((n) => sure.get(n) ?? ["other", 0.9]);
    const steps = await runChain(repo, llm);

    expect(complete).toHaveBeenCalledTimes(3);
    expect(complete.mock.calls.map(([req]) => asked(req).length)).toEqual([10, 10, 5]);
    expect(steps.filter((s) => s.kind === "classify_pages").map((s) => s.pageNo)).toEqual([3, 13, 23]);
    // Budget 4: the P&L, then the three best found pages in page order; page 14 stayed under 0.6.
    expect(steps.filter((s) => s.kind === "extract_page").map((s) => s.pageNo)).toEqual([1, 4, 8, 24]);
    expect([...repo.pages.values()].filter((p) => p.selected).map((p) => p.pageNo)).toEqual([1, 4, 8, 24]);
    expect(repo.pages.get(`${DOC}:14`)?.kind).toBeNull();
    expect(repo.docs.get(DOC)?.llmPageBudget).toBe(4);
  });

  it("with room for fewer than were found, takes the surest first", async () => {
    const repo = repoOf("pdf", [PL, PROSE, SCHEDULE(1), SCHEDULE(2), SCHEDULE(3)], 3);
    const { llm } = modelThat((n) => (n === 5 ? ["bs", 0.95] : n === 4 ? ["cf", 0.7] : ["notes", 0.6]));
    const steps = await runChain(repo, llm);
    expect(steps.filter((s) => s.kind === "extract_page").map((s) => s.pageNo)).toEqual([1, 4, 5]);
  });
});
