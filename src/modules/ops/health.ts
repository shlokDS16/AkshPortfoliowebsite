import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { QUEUE_STALE_SECONDS } from "@/modules/ingestion/client";
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
/** The job queue: age in whole seconds of the oldest runnable step, or null when nothing is runnable (plan E7). */
export type QueueCheck = { ageSeconds: number | null; ok: boolean };
export type HealthReport = { ok: boolean; checkedAt: string; checks: ClockCheck[]; queue: QueueCheck };

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

/** One rule for both paths: an empty queue is healthy; a step runnable for over 6 h is not. */
function checkQueue(ageSeconds: number | null): QueueCheck {
  if (ageSeconds === null) return { ageSeconds: null, ok: true };
  const age = Math.max(0, Math.floor(ageSeconds));
  return { ageSeconds: age, ok: age <= QUEUE_STALE_SECONDS };
}

/** Desk strip: the latest run per clock, read as the admin, and the queue age from public.queue_age(). */
export function evaluateHealth(latest: Record<string, LatestRun | null>, now: Date, queueAgeSeconds: number | null): HealthReport {
  const checks = HEALTH_RULES.map((rule) => {
    const run = latest[rule.job] ?? null;
    return checkClock(rule, run && { ageSeconds: (now.getTime() - new Date(run.ranAt).getTime()) / 1000, ok: run.ok });
  });
  const queue = checkQueue(queueAgeSeconds);
  return { ok: checks.every((c) => c.ok) && queue.ok, checkedAt: now.toISOString(), checks, queue };
}

function formatAge(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes < 120 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

/** The clocks only: the queue has its own sentence (describeQueue), so the strip never says "safe" twice (R11). */
export function describeStale(report: HealthReport): string[] {
  return report.checks
    .filter((c) => !c.ok)
    .map((c) => {
      if (c.ageSeconds === null) return `${c.label} has never run`;
      if (c.lastRunFailed) return `${c.label}'s last run failed ${formatAge(c.ageSeconds)} ago`;
      return `${c.label} last ran ${formatAge(c.ageSeconds)} ago`;
    });
}

/** The queue's own clause for the strip (rendered in Task 15), or null while documents are moving. */
export function describeQueue(report: HealthReport): string | null {
  const { ageSeconds, ok } = report.queue;
  return ok || ageSeconds === null ? null : `Documents have not moved for ${formatAge(ageSeconds)}; your uploads are safe`;
}

export async function getHealthReport(repo: HeartbeatRepo, now: Date, queueAgeSeconds: number | null): Promise<HealthReport> {
  return evaluateHealth(await repo.latestRuns(HEALTH_RULES.map((rule) => rule.job)), now, queueAgeSeconds);
}

/** public.queue_age(): a number for anon and authenticated (migration 0006); null when nothing is runnable. */
export async function readQueueAge(db: Db): Promise<number | null> {
  const { data, error } = await db.rpc("queue_age");
  if (error) throw dbError("ops.queueAge", error);
  // Typed number, but min() over no runnable step is NULL (Task 3 note).
  const age = data as number | string | null;
  return age === null || age === undefined ? null : Number(age);
}

/** One row of public.heartbeat_ages(): the latest run per job, with no detail column. */
export type HeartbeatAgeRow = { job: string; age_seconds: number | string; ok: boolean };
/** The whole public /api/health contract: ages and outcomes only, never detail or error text. */
export type PublicCheck = { job: string; ageSeconds: number | null; ok: boolean };
export type PublicHealth = { ok: boolean; checks: PublicCheck[] };

/** Public monitor: the same per-clock and queue verdicts, trimmed to the contract (no label, no failure flag). */
export function evaluatePublicHealth(rows: readonly HeartbeatAgeRow[], queueAgeSeconds: number | null): PublicHealth {
  const clocks = HEALTH_RULES.map((rule): PublicCheck => {
    const row = rows.find((r) => r.job === rule.job);
    const { job, ageSeconds, ok } = checkClock(rule, row ? { ageSeconds: Number(row.age_seconds), ok: row.ok } : null);
    return { job, ageSeconds, ok };
  });
  const checks: PublicCheck[] = [...clocks, { job: "queue", ...checkQueue(queueAgeSeconds) }];
  return { ok: checks.every((c) => c.ok), checks };
}

/** Reads through public.heartbeat_ages() and public.queue_age(), the anon role's only doors to these tables. */
export async function getPublicHealth(db: Db): Promise<PublicHealth> {
  const [ages, queueAge] = await Promise.all([db.rpc("heartbeat_ages"), readQueueAge(db)]);
  if (ages.error) throw dbError("ops.heartbeatAges", ages.error);
  return evaluatePublicHealth(ages.data ?? [], queueAge);
}
