import "server-only";
import { istDate } from "@/lib/dates";
import { serverEnv } from "@/lib/env.server";
import { createAnchorPort, createMarketDataPort } from "@/lib/providers";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { HeartbeatRepo } from "./heartbeat";
import { createJobHeartbeatRepo } from "./job-deps";
import { publishAnchors, type AnchorJobDeps } from "./ledger-anchor";
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

/** The anchor step's deps, built when it runs; the public-copy port is built inside the step, so a bad setting fails only this step. */
export function buildAnchorDeps(): AnchorJobDeps {
  return {
    db: createSupabaseServiceClient(),
    anchor: () => createAnchorPort(serverEnv()),
    clock: Date.now,
    now: () => new Date(),
  };
}

/** `ledger:prices` (25 s), `ledger:score` (5 s), then `ledger:anchor` (15 s): 45 s in all, before the ingestion sweep. */
export function ledgerDailySteps(make: () => LedgerJobDeps = buildLedgerDeps, makeAnchor: () => AnchorJobDeps = buildAnchorDeps): Step[] {
  return [
    { job: "ledger:prices", run: () => fetchCloses(make()) },
    { job: "ledger:score", run: () => scoreIdeas(make()) },
    { job: "ledger:anchor", run: () => publishAnchors(makeAnchor()) },
  ];
}

export const LEDGER_DAILY_STEPS: readonly Step[] = ledgerDailySteps();

/** The same steps for the admin's "Fetch closes now" button: each writes its own heartbeat, like the cron does. */
export function runLedgerNow(repo: HeartbeatRepo = createJobHeartbeatRepo()): Promise<StepResult[]> {
  return runSteps(LEDGER_DAILY_STEPS, (beat) => repo.record(beat));
}
