import "server-only";
import type { LlmPort } from "@/lib/providers/llm";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createSupabaseDocumentsRepo } from "@/modules/documents";
import { createQueueRepo, drain, DRAIN_MS, HANDLERS, machineDocuments, type DrainDeps, type DrainSummary } from "@/modules/ingestion";
import { DAILY_STEPS, PUMP_STEPS } from "./schedule";
import type { Step } from "./steps";

// Job code: the one place the ingestion runner gets the secret-key client (ADR-001 s3, ADR-004 s4.4).

/** Until Task 9 reads GROQ_MODEL_TEXT; the spec s9 default. */
const TEXT_MODEL = "openai/gpt-oss-120b";

/** The LLM port, or null when AI reading is off. Null until Task 9 wires createLlmPort(serverEnv()). */
function buildLlm(): LlmPort | null {
  return null;
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
    models: { text: TEXT_MODEL },
    // Built once per drain; handlers use only these (ruling R7). The documents surface has no update.
    repos: { documents: machineDocuments(createSupabaseDocumentsRepo(db)) },
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

/** Phase 1's clocks first (each its own heartbeat), then the ingestion drain. */
export const SERVER_PUMP_STEPS: readonly Step[] = [
  ...PUMP_STEPS,
  { job: "ingestion:drain", run: async () => summaryText(await drainFor(DRAIN_MS.pump)) },
];
export const SERVER_DAILY_STEPS: readonly Step[] = [
  ...DAILY_STEPS,
  { job: "ingestion:sweep", run: async () => summaryText(await drainFor(DRAIN_MS.daily)) },
];
