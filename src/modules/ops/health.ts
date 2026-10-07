import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { HeartbeatRepo, LatestRun } from "./heartbeat";

// Public entry (@/modules/ops/health): everything here may run without the secret-key client.
// Spec s8: the pump is unhealthy after 2 h, the daily job after 36 h, and either when its latest run failed.
export const HEALTH_RULES = [
  { job: "heartbeat:pump", maxAgeSeconds: 120 * 60, label: "the 15-minute pump" },
  { job: "heartbeat:daily", maxAgeSeconds: 36 * 60 * 60, label: "the daily job" },
] as const;

type Rule = (typeof HEALTH_RULES)[number];

/** The one verdict for a clock, in whole seconds. Both the desk strip and the public monitor use it. */
export type ClockCheck = {
  job: string;
  label: string;
  /** Age of the latest run, or null when the clock has never run. */
  ageSeconds: number | null;
  ok: boolean;
  lastRunFailed: boolean;
};
export type HealthReport = { ok: boolean; checkedAt: string; checks: ClockCheck[] };

function checkClock(rule: Rule, run: { ageSeconds: number; ok: boolean } | null): ClockCheck {
  if (!run) return { job: rule.job, label: rule.label, ageSeconds: null, ok: false, lastRunFailed: false };
  const ageSeconds = Math.max(0, Math.floor(run.ageSeconds));
  return {
    job: rule.job,
    label: rule.label,
    ageSeconds,
    ok: run.ok && ageSeconds <= rule.maxAgeSeconds,
    lastRunFailed: !run.ok,
  };
}

/** Desk strip: the latest run per clock, read as the admin. */
export function evaluateHealth(latest: Record<string, LatestRun | null>, now: Date): HealthReport {
  const checks = HEALTH_RULES.map((rule) => {
    const run = latest[rule.job] ?? null;
    return checkClock(rule, run && { ageSeconds: (now.getTime() - new Date(run.ranAt).getTime()) / 1000, ok: run.ok });
  });
  return { ok: checks.every((c) => c.ok), checkedAt: now.toISOString(), checks };
}

function formatAge(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes < 120 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

export function describeStale(report: HealthReport): string[] {
  return report.checks
    .filter((c) => !c.ok)
    .map((c) => {
      if (c.ageSeconds === null) return `${c.label} has never run`;
      if (c.lastRunFailed) return `${c.label}'s last run failed ${formatAge(c.ageSeconds)} ago`;
      return `${c.label} last ran ${formatAge(c.ageSeconds)} ago`;
    });
}

export async function getHealthReport(repo: HeartbeatRepo, now: Date): Promise<HealthReport> {
  return evaluateHealth(await repo.latestRuns(HEALTH_RULES.map((rule) => rule.job)), now);
}

/** One row of public.heartbeat_ages(): the latest run per job, with no detail column. */
export type HeartbeatAgeRow = { job: string; age_seconds: number | string; ok: boolean };
/** The whole public /api/health contract: ages and outcomes only, never detail or error text. */
export type PublicCheck = { job: string; ageSeconds: number | null; ok: boolean };
export type PublicHealth = { ok: boolean; checks: PublicCheck[] };

/** Public monitor: the same per-clock verdict, trimmed to the contract (no label, no failure flag). */
export function evaluatePublicHealth(rows: readonly HeartbeatAgeRow[]): PublicHealth {
  const checks = HEALTH_RULES.map((rule): PublicCheck => {
    const row = rows.find((r) => r.job === rule.job);
    const { job, ageSeconds, ok } = checkClock(rule, row ? { ageSeconds: Number(row.age_seconds), ok: row.ok } : null);
    return { job, ageSeconds, ok };
  });
  return { ok: checks.every((c) => c.ok), checks };
}

/** Reads through public.heartbeat_ages(), the only door the anon role has to the heartbeats table. */
export async function getPublicHealth(db: Db): Promise<PublicHealth> {
  const { data, error } = await db.rpc("heartbeat_ages");
  if (error) throw dbError("ops.heartbeatAges", error);
  return evaluatePublicHealth(data ?? []);
}
