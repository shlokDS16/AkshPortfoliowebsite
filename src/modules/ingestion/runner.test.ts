import { describe, expect, it } from "vitest";
import { DbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { MIN_STEP_MS } from "./caps";
import { machineDocuments, type DrainDeps } from "./deps";
import type { QueueRepo } from "./queue-repo";
import { drain, PROVIDER_GAVE_UP, SCHEMA_GAVE_UP, VOICE_GAVE_UP } from "./runner";
import type { NewStep, Step, StepContext, StepHandler, StepKind, StepOutcome } from "./types";

const T0 = Date.parse("2026-10-07T10:00:00Z");

/** A fake clock the handlers can advance; `now()` follows it. */
function fakeTime() {
  let t = T0;
  return { clock: () => t, now: () => new Date(t), advance: (ms: number) => void (t += ms) };
}

function deps(time = fakeTime()): DrainDeps {
  return {
    db: {} as Db,
    llm: null,
    ocr: null,
    transcriber: null,
    models: { text: "test-model", vision: "test-vision", whisper: "test-whisper" },
    repos: {
      documents: machineDocuments(createMemoryDocumentsRepo()),
      usage: createMemoryUsageRepo(),
      proposals: createMemoryProposalsRepo(),
      research: createMemoryResearch(),
    },
    now: time.now,
    clock: time.clock,
  };
}

let seq = 0;
function step(kind: StepKind, pageNo: number | null, extra: Partial<Step> = {}): Step {
  seq += 1;
  return {
    id: `step-${seq}`, jobId: "job-1", kind, pageNo, args: {}, status: "queued", schemaFailures: 0, providerFailures: 0,
    leaseExpiries: 0, notBefore: new Date(T0).toISOString(), leaseOwner: null, lastError: null, ...extra,
  };
}

type Finish = Parameters<QueueRepo["finish"]>[2];

/** In-memory queue: claims queued steps in insertion order; finish only succeeds for the lease holder. */
function memoryRepo(initial: Step[], opts: { loseLease?: boolean } = {}) {
  const steps = [...initial];
  const finishes: { id: string; patch: Finish }[] = [];
  const repo: QueueRepo = {
    async claim(owner) {
      const next = steps.find((s) => s.status === "queued" && Date.parse(s.notBefore) <= T0);
      if (!next) return null;
      next.status = "running";
      next.leaseOwner = owner;
      return { ...next, documentId: "doc-1" };
    },
    async finish(claimed, owner, patch) {
      finishes.push({ id: claimed.id, patch });
      const row = steps.find((s) => s.id === claimed.id);
      if (opts.loseLease || !row || row.leaseOwner !== owner || row.status !== "running") return false;
      row.status = patch.status;
      row.leaseOwner = null;
      if (patch.notBefore) row.notBefore = patch.notBefore.toISOString();
      if (patch.schemaFailures !== undefined) row.schemaFailures = patch.schemaFailures;
      if (patch.providerFailures !== undefined) row.providerFailures = patch.providerFailures;
      if (patch.lastError !== undefined) row.lastError = patch.lastError;
      return true;
    },
    async enqueue(jobId, news: NewStep[]) {
      for (const n of news) {
        if (steps.some((s) => s.jobId === jobId && s.kind === n.kind && s.pageNo === n.pageNo)) continue;
        steps.push(step(n.kind, n.pageNo, { jobId, args: n.args ?? {} }));
      }
    },
    async createJob() {
      return "job-1";
    },
  };
  return { repo, steps, finishes };
}

const always =
  (outcome: StepOutcome | (() => StepOutcome)): StepHandler =>
  async () =>
    typeof outcome === "function" ? outcome() : outcome;
const handlers = (h: Partial<Record<StepKind, StepHandler>>): Record<StepKind, StepHandler> => ({
  pdf_text: h.pdf_text ?? always({ kind: "done" }),
  select_pages: h.select_pages ?? always({ kind: "done" }),
  extract_page: h.extract_page ?? always({ kind: "done" }),
  ocr_page: h.ocr_page ?? always({ kind: "done" }),
  vision_page: h.vision_page ?? always({ kind: "done" }),
  transcribe: h.transcribe ?? always({ kind: "done" }),
  text_pages: h.text_pages ?? always({ kind: "done" }),
});

describe("drain", () => {
  it("runs queued steps in order until none remain, and counts them", async () => {
    const order: string[] = [];
    const record: StepHandler = async ({ step: s }) => (order.push(s.id), { kind: "done" });
    const { repo, steps } = memoryRepo([step("pdf_text", 1), step("select_pages", null), step("extract_page", 3)]);
    const summary = await drain(deps(), repo, handlers({ pdf_text: record, select_pages: record, extract_page: record }), 240_000);
    expect(order).toEqual(steps.map((s) => s.id));
    expect(steps.map((s) => s.status)).toEqual(["done", "done", "done"]);
    expect(summary).toEqual({ ran: 3, done: 3, deferred: 0, attention: 0, leaseLost: 0 });
  });

  it("stops claiming when less than MIN_STEP_MS remains", async () => {
    const time = fakeTime();
    const slow: StepHandler = async () => (time.advance(30_000), { kind: "done" });
    const { repo, steps } = memoryRepo([step("extract_page", 1), step("extract_page", 2), step("extract_page", 3)]);
    // 100 s budget: after step 1, 70 s are left (claim); after step 2, 40 s < 45 s (stop).
    const summary = await drain(deps(time), repo, handlers({ extract_page: slow }), 100_000);
    expect(summary.ran).toBe(2);
    expect(steps[2].status).toBe("queued");

    const none = await drain(deps(fakeTime()), memoryRepo([step("pdf_text", 1)]).repo, handlers({}), MIN_STEP_MS - 1);
    expect(none.ran).toBe(0);
  });

  it("inserts the steps a done outcome enqueues, and ignores a duplicate enqueue", async () => {
    const { repo, steps } = memoryRepo([step("pdf_text", 1), step("pdf_text", 26)]);
    const pdfText: StepHandler = async () => ({ kind: "done", result: { pages: 25 }, enqueue: [{ kind: "select_pages", pageNo: null }] });
    const summary = await drain(deps(), repo, handlers({ pdf_text: pdfText }), 240_000);
    expect(steps.filter((s) => s.kind === "select_pages")).toHaveLength(1);
    expect(summary).toMatchObject({ ran: 3, done: 3 });
  });

  it("defer queues the step again with not_before and wait_reason, leaving the failure counters alone", async () => {
    const until = new Date(T0 + 60_000);
    const { repo, steps, finishes } = memoryRepo([step("extract_page", 4, { schemaFailures: 1, providerFailures: 1 })]);
    const summary = await drain(deps(), repo, handlers({ extract_page: always({ kind: "defer", notBefore: until, reason: "groq_minute" }) }), 240_000);
    expect(finishes[0].patch).toEqual({ status: "queued", notBefore: until, waitReason: "groq_minute" });
    expect(steps[0]).toMatchObject({ status: "queued", schemaFailures: 1, providerFailures: 1 });
    expect(summary).toMatchObject({ ran: 1, deferred: 1, attention: 0 });
  });

  it("a schema failure retries at once with the raw issues; the second goes to needs_attention with a plain sentence", async () => {
    const outcome = always({ kind: "retry", failure: "schema", error: "rows[0].value: expected number" });
    const { repo, steps, finishes } = memoryRepo([step("extract_page", 5)]);
    const summary = await drain(deps(), repo, handlers({ extract_page: outcome }), 240_000);
    // Queued again for now, so the same drain claims it a second time.
    expect(finishes.map((f) => [f.patch.status, f.patch.schemaFailures, f.patch.notBefore?.getTime()])).toEqual([
      ["queued", 1, T0],
      ["needs_attention", 2, T0],
    ]);
    expect(finishes[0].patch.lastError).toBe("rows[0].value: expected number"); // the retry prompt names the issues
    expect(steps[0]).toMatchObject({ status: "needs_attention", schemaFailures: 2, lastError: `${SCHEMA_GAVE_UP} (rows[0].value: expected number)` });
    expect(summary).toMatchObject({ ran: 2, attention: 1 });
  });

  it("a provider failure backs off 1 then 2 minutes; the third goes to needs_attention", async () => {
    const outcome = always({ kind: "retry", failure: "provider", error: "503" });
    const run = async (providerFailures: number) => {
      const m = memoryRepo([step("extract_page", 6, { providerFailures })]);
      await drain(deps(), m.repo, handlers({ extract_page: outcome }), 240_000);
      return m.steps[0];
    };
    expect(await run(0)).toMatchObject({ status: "queued", providerFailures: 1, notBefore: new Date(T0 + 60_000).toISOString() });
    expect(await run(1)).toMatchObject({ status: "queued", providerFailures: 2, notBefore: new Date(T0 + 120_000).toISOString() });
    expect(await run(2)).toMatchObject({ status: "needs_attention", providerFailures: 3, lastError: `${PROVIDER_GAVE_UP} (503)` });
  });

  it("a voice note that fails three times says so in its own words, not the figures sentence", async () => {
    const m = memoryRepo([step("transcribe", 1, { providerFailures: 2 })]);
    await drain(deps(), m.repo, handlers({ transcribe: always({ kind: "retry", failure: "provider", error: "HTTP 503" }) }), 240_000);
    expect(m.steps[0]).toMatchObject({ status: "needs_attention", lastError: `${VOICE_GAVE_UP} (HTTP 503)` });
    expect(VOICE_GAVE_UP).not.toMatch(/figures/);
  });

  it("after three database failures Aksh reads a plain sentence with the operation and code beside it", async () => {
    const down: StepHandler = async () => {
      throw new DbError("documents.download", undefined, "Object not found: secret/path.pdf");
    };
    const { repo, steps } = memoryRepo([step("pdf_text", 1, { providerFailures: 2 })]);
    await drain(deps(), repo, handlers({ pdf_text: down }), 240_000);
    expect(steps[0]).toMatchObject({
      status: "needs_attention",
      lastError: "This step could not finish after three tries. Try again, or enter the figures yourself. (documents.download, no code)",
    });
  });

  it("hands a handler its deps without the client (ruling R7)", async () => {
    let seen: StepContext["deps"] | null = null;
    const look: StepHandler = async (ctx) => {
      seen = ctx.deps;
      // @ts-expect-error -- StepDeps has no db: a handler reaches the database only through ctx.deps.repos.
      void ctx.deps.db;
      return { kind: "done" };
    };
    await drain(deps(), memoryRepo([step("pdf_text", 1)]).repo, handlers({ pdf_text: look }), 240_000);
    expect(seen).not.toBeNull();
    expect(Object.keys(seen!).sort()).toEqual(["clock", "llm", "models", "now", "ocr", "repos", "transcriber"]);
  });

  it("a step whose lease expired twice goes to needs_attention without running its handler", async () => {
    let called = false;
    const handler: StepHandler = async () => ((called = true), { kind: "done" });
    const { repo, steps } = memoryRepo([step("extract_page", 7, { leaseExpiries: 2 })]);
    const summary = await drain(deps(), repo, handlers({ extract_page: handler }), 240_000);
    expect(called).toBe(false);
    expect(steps[0]).toMatchObject({ status: "needs_attention", lastError: "This step stopped twice before finishing." });
    expect(summary.attention).toBe(1);
  });

  it("a handler that throws is a provider retry with the error cut to 500 characters, never a crash", async () => {
    const boom: StepHandler = async () => {
      throw new Error("x".repeat(800));
    };
    const { repo, steps } = memoryRepo([step("pdf_text", 1), step("extract_page", 2)]);
    const summary = await drain(deps(), repo, handlers({ pdf_text: boom }), 240_000);
    expect(steps[0]).toMatchObject({ status: "queued", providerFailures: 1 });
    expect(steps[0].lastError).toHaveLength(500);
    expect(steps[1].status).toBe("done");
    expect(summary).toMatchObject({ ran: 2, done: 1 });
  });

  it("a handler's database failure is stored as its operation and code, never the raw Postgres message", async () => {
    const leak: StepHandler = async () => {
      throw new DbError("documents.insertPages", "23514", "Failing row contains (secret page text)");
    };
    const { repo, steps } = memoryRepo([step("pdf_text", 1)]);
    await drain(deps(), repo, handlers({ pdf_text: leak }), 240_000);
    expect(steps[0]).toMatchObject({ status: "queued", providerFailures: 1, lastError: "documents.insertPages (23514)" });
  });

  it("counts a lost lease and drops the result", async () => {
    const { repo, steps } = memoryRepo([step("pdf_text", 1)], { loseLease: true });
    const summary = await drain(deps(), repo, handlers({ pdf_text: always({ kind: "done", result: { pages: 3 } }) }), 240_000);
    expect(summary).toEqual({ ran: 1, done: 0, deferred: 0, attention: 0, leaseLost: 1 });
    expect(steps[0].status).toBe("running");
  });
});
