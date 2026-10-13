import "server-only";
import { istDate } from "@/lib/dates";
import { serverEnv } from "@/lib/env.server";
import { createMarketDataPort } from "@/lib/providers";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { HeartbeatRepo } from "./heartbeat";
import { createJobHeartbeatRepo } from "./job-deps";
import { fetchCloses, scoreIdeas, type LedgerJobDeps } from "./ledger-prices";
import { runSteps, type Step, type StepResult } from "./steps";

// Job code: the one place the ledger's daily steps get the secret-key client and the market-data port (ADR-001 s3, ADR-005).
// The ledger module itself holds neither (its graph test enforces it).

/**
 * The deps of one step, built when the step runs (never at import): a missing secret or a misconfigured port then lands in
 * that step's own heartbeat, and the steps after it still run.
 */
export function buildLedgerDeps(): LedgerJobDeps {
  return {
    db: createSupabaseServiceClient(),
    market: () => createMarketDataPort(serverEnv()),
    today: () => istDate(new Date()),
    clock: Date.now,
  };
}

/** `ledger:prices` (25 s) then `ledger:score` (5 s). Task 9 adds `ledger:anchor` (15 s): 45 s in all, before the ingestion sweep. */
export function ledgerDailySteps(make: () => LedgerJobDeps = buildLedgerDeps): Step[] {
  return [
    { job: "ledger:prices", run: () => fetchCloses(make()) },
    { job: "ledger:score", run: () => scoreIdeas(make()) },
  ];
}

export const LEDGER_DAILY_STEPS: readonly Step[] = ledgerDailySteps();

/** The same steps for the admin's "Fetch closes now" button: each writes its own heartbeat, like the cron does. */
export function runLedgerNow(repo: HeartbeatRepo = createJobHeartbeatRepo()): Promise<StepResult[]> {
  return runSteps(LEDGER_DAILY_STEPS, (beat) => repo.record(beat));
}
