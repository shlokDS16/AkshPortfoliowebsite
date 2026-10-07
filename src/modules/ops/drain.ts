import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createLlmPort, type LlmPort } from "@/lib/providers";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createSupabaseDocumentsRepo } from "@/modules/documents";
import { createProposalsRepo, createQueueRepo, createUsageRepo, drain, DRAIN_MS, HANDLERS, machineDocuments, pruneUsage, type DrainDeps, type DrainSummary } from "@/modules/ingestion";
import { latestFileForCompany } from "@/modules/research";
import { DAILY_STEPS, PUMP_STEPS } from "./schedule";
import type { Step } from "./steps";

// Job code: the one place the ingestion runner gets the secret-key client (ADR-001 s3, ADR-004 s4.4).

/** The LLM port, or null when AI reading is off (no GROQ_API_KEY, and no LLM_ADAPTER=fixture off Vercel). */
function buildLlm(): LlmPort | null {
  return createLlmPort(serverEnv());
}

/** True when steps that need the LLM can run; the inbox says "AI reading is off" otherwise. */
export function aiReadingOn(): boolean {
  return buildLlm() !== null;
}

function buildDeps(): DrainDeps {
  const db = createSupabaseServiceClient();
  return {
    db,
    llm: buildLlm(),
    models: { text: serverEnv().GROQ_MODEL_TEXT },
    // Built once per drain; handlers use only these (ruling R7). The documents surface has no update.
    repos: {
      documents: machineDocuments(createSupabaseDocumentsRepo(db)),
      usage: createUsageRepo(db),
      proposals: createProposalsRepo(db),
      research: { latestFileForCompany: (companyId) => latestFileForCompany(db, companyId) },
    },
    now: () => new Date(),
    clock: Date.now,
  };
}

/** Drains the queue for at most `budgetMs` on the secret-key client. */
export async function drainFor(budgetMs: number): Promise<DrainSummary> {
  const deps = buildDeps();
  return drain(deps, createQueueRepo(deps.db), HANDLERS, budgetMs);
}

/** The heartbeat detail: counts only, never document text or error text (the row is readable on the desk). */
export function summaryText(s: DrainSummary): string {
  if (s.ran === 0) return "nothing to run";
  const parts: [string, number][] = [
    ["ran", s.ran],
    ["done", s.done],
    ["deferred", s.deferred],
    ["needs attention", s.attention],
    ["lease lost", s.leaseLost],
  ];
  return parts
    .filter(([label, n]) => label === "ran" || n > 0)
    .map(([label, n]) => `${label} ${n}`)
    .join(", ");
}

/** The sweep's heartbeat detail: the drain's counts, then how many ledger rows the prune removed (nothing when none). */
export function sweepText(s: DrainSummary, pruned: number): string {
  return pruned > 0 ? `${summaryText(s)}, pruned ${pruned}` : summaryText(s);
}

/** The daily sweep: drain, then keep the provider ledger to two days (the governor looks back 24 h). */
async function sweep(): Promise<string> {
  const summary = await drainFor(DRAIN_MS.daily);
  return sweepText(summary, await pruneUsage(createSupabaseServiceClient()));
}

/** Phase 1's clocks first (each its own heartbeat), then the ingestion drain. */
export const SERVER_PUMP_STEPS: readonly Step[] = [
  ...PUMP_STEPS,
  { job: "ingestion:drain", run: async () => summaryText(await drainFor(DRAIN_MS.pump)) },
];
export const SERVER_DAILY_STEPS: readonly Step[] = [
  ...DAILY_STEPS,
  { job: "ingestion:sweep", run: sweep },
];
