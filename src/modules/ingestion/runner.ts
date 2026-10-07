import { randomUUID } from "node:crypto";
import { LEASE_EXPIRY_LIMIT, MIN_STEP_MS, PROVIDER_FAILURE_LIMIT, SCHEMA_FAILURE_LIMIT } from "./caps";
import type { DrainDeps } from "./deps";
import type { QueueRepo } from "./queue-repo";
import type { StepHandler, StepKind, StepOutcome } from "./types";

export type DrainSummary = { ran: number; done: number; deferred: number; attention: number; leaseLost: number };

export const STOPPED_TWICE = "This step stopped twice before finishing.";
const ERROR_MAX = 500;
const text = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, ERROR_MAX);

/**
 * Claims and runs steps until the budget is spent or nothing is runnable (ADR-004 s4.4). Never throws for a
 * step's failure: a throwing handler is a provider retry. A database failure in claim/finish does throw, and
 * the calling clock records it in its heartbeat.
 */
export async function drain(deps: DrainDeps, repo: QueueRepo, handlers: Record<StepKind, StepHandler>, budgetMs: number): Promise<DrainSummary> {
  const owner = randomUUID();
  const deadline = deps.clock() + budgetMs;
  const summary: DrainSummary = { ran: 0, done: 0, deferred: 0, attention: 0, leaseLost: 0 };
  while (deadline - deps.clock() >= MIN_STEP_MS) {
    const step = await repo.claim(owner);
    if (!step) break;
    summary.ran += 1;
    let outcome: StepOutcome;
    if (step.leaseExpiries >= LEASE_EXPIRY_LIMIT) outcome = { kind: "attention", error: STOPPED_TWICE };
    else {
      try {
        outcome = await handlers[step.kind]({ step, documentId: step.documentId, deadline, deps });
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
        lastError: outcome.error.slice(0, ERROR_MAX),
      });
      summary.attention += Number(ok && stop);
    }
    if (!ok) summary.leaseLost += 1;
  }
  return summary;
}
