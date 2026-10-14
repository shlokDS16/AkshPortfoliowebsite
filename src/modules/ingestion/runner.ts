import { randomUUID } from "node:crypto";
import { safeErrorText } from "@/lib/supabase/errors";
import { LEASE_EXPIRY_LIMIT, MIN_STEP_MS, PROVIDER_FAILURE_LIMIT, SCHEMA_FAILURE_LIMIT } from "./caps";
import type { DrainDeps, StepDeps } from "./deps";
import type { QueueRepo } from "./queue-repo";
import type { StepHandler, StepKind, StepOutcome } from "./types";

export type DrainSummary = { ran: number; done: number; deferred: number; attention: number; leaseLost: number };

export const STOPPED_TWICE = "This step stopped twice before finishing.";
/** Shown on the Needs-attention card when retries run out; the technical note follows in brackets. */
export const PROVIDER_GAVE_UP = "This step could not finish after three tries. Try again, or enter the figures yourself.";
export const SCHEMA_GAVE_UP = "The AI's reading of this page came back in the wrong form twice. Try again, or enter the figures yourself.";
const ERROR_MAX = 500;
// last_error is readable on the desk: a database failure is stored as its operation and code, never the raw message.
const text = (e: unknown) => safeErrorText(e).slice(0, ERROR_MAX);
/** "documents.download (no code)" reads as "(documents.download, no code)" beside the plain sentence. */
const note = (error: string) => error.replace(/^(\S+) \(([^()]*)\)$/, "$1, $2");
/** Pending Shlok approval, spec s16.9: a voice note has no figures to enter by hand. */
export const VOICE_GAVE_UP = "This voice note could not be typed out after three tries. Try again, or skip it.";
const gaveUp = (failure: "schema" | "provider", error: string, kind: StepKind) =>
  `${failure === "schema" ? SCHEMA_GAVE_UP : kind === "transcribe" ? VOICE_GAVE_UP : PROVIDER_GAVE_UP} (${note(error)})`.slice(0, ERROR_MAX);

/** What a handler gets: everything but the client (ruling R7), so a step cannot reach the database except through repos. */
const stepDeps = (deps: DrainDeps): StepDeps => ({ llm: deps.llm, ocr: deps.ocr, transcriber: deps.transcriber, models: deps.models, repos: deps.repos, now: deps.now, clock: deps.clock });

/**
 * Claims and runs steps until the budget is spent or nothing is runnable (ADR-004 s4.4). Never throws for a
 * step's failure: a throwing handler is a provider retry. A database failure in claim/finish does throw, and
 * the calling clock records it in its heartbeat.
 */
export async function drain(deps: DrainDeps, repo: QueueRepo, handlers: Record<StepKind, StepHandler>, budgetMs: number): Promise<DrainSummary> {
  const owner = randomUUID();
  const deadline = deps.clock() + budgetMs;
  const summary: DrainSummary = { ran: 0, done: 0, deferred: 0, attention: 0, leaseLost: 0 };
  const forSteps = stepDeps(deps);
  while (deadline - deps.clock() >= MIN_STEP_MS) {
    const step = await repo.claim(owner);
    if (!step) break;
    summary.ran += 1;
    let outcome: StepOutcome;
    if (step.leaseExpiries >= LEASE_EXPIRY_LIMIT) outcome = { kind: "attention", error: STOPPED_TWICE };
    else {
      try {
        outcome = await handlers[step.kind]({ step, documentId: step.documentId, deadline, deps: forSteps });
      } catch (error) {
        outcome = { kind: "retry", failure: "provider", error: text(error) };
      }
    }
    const now = deps.now();
    let ok: boolean;
    if (outcome.kind === "done") {
      // Enqueue first: a duplicate insert is a no-op (job_steps_once), so a lost lease cannot double a step.
      if (outcome.enqueue?.length) await repo.enqueue(step.jobId, outcome.enqueue);
      ok = await repo.finish(step, owner, { status: "done", result: outcome.result ?? null, lastError: null });
      summary.done += Number(ok);
    } else if (outcome.kind === "defer") {
      ok = await repo.finish(step, owner, { status: "queued", notBefore: outcome.notBefore, waitReason: outcome.reason });
      summary.deferred += Number(ok);
    } else if (outcome.kind === "attention") {
      ok = await repo.finish(step, owner, { status: "needs_attention", lastError: outcome.error.slice(0, ERROR_MAX) });
      summary.attention += Number(ok);
    } else {
      const schema = step.schemaFailures + (outcome.failure === "schema" ? 1 : 0);
      const provider = step.providerFailures + (outcome.failure === "provider" ? 1 : 0);
      const stop = schema >= SCHEMA_FAILURE_LIMIT || provider >= PROVIDER_FAILURE_LIMIT;
      // Provider back-off 1, 2 min; a schema retry runs again at once with the previous issues (ADR-004 s4.5).
      const backoffMs = outcome.failure === "provider" ? 60_000 * 2 ** (provider - 1) : 0;
      ok = await repo.finish(step, owner, {
        status: stop ? "needs_attention" : "queued",
        schemaFailures: schema,
        providerFailures: provider,
        notBefore: new Date(now.getTime() + backoffMs),
        // A retry keeps the raw issues (a schema retry sends them back to the model); a stop shows Aksh a sentence.
        lastError: stop ? gaveUp(outcome.failure, outcome.error, step.kind) : outcome.error.slice(0, ERROR_MAX),
      });
      summary.attention += Number(ok && stop);
    }
    if (!ok) summary.leaseLost += 1;
  }
  return summary;
}
