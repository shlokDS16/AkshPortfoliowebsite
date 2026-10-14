import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { QUEUE_STALE_SECONDS } from "@/modules/ingestion/client";
import type { HeartbeatRepo, LatestRun } from "./heartbeat";
import { noRowNote } from "./ledger-detail";

// Public entry (@/modules/ops/health): everything here may run without the secret-key client.
// Spec s8: the pump is unhealthy after 2 h, the daily job after 36 h, and either when its latest run failed.
// The ledger's three steps (Plan 3a: prices, score, anchor) follow the same 36 h rule but are `optional`: a job that has never
// run is healthy (so a deploy does not turn production red before the first daily run, and an empty ledger looks like any
// other), while a failed or stale latest run is not. The public contract grows by these rows and nothing else: job, age, boolean.
// `showReason` rules also give the PRIVATE desk strip the heartbeat's own plain reason for a failed run (the admin reads the
// detail column through RLS; the public path never selects it).
type Rule = { job: string; maxAgeSeconds: number; label: string; optional?: boolean; showReason?: boolean; earlierFailure?: boolean };
export const HEALTH_RULES: readonly Rule[] = [
  { job: "heartbeat:pump", maxAgeSeconds: 120 * 60, label: "the 15-minute pump" },
  { job: "heartbeat:daily", maxAgeSeconds: 36 * 60 * 60, label: "the daily job" },
  { job: "ledger:prices", maxAgeSeconds: 36 * 60 * 60, label: "the closing prices", optional: true, showReason: true },
  { job: "ledger:score", maxAgeSeconds: 36 * 60 * 60, label: "the scores", optional: true, showReason: true },
  { job: "ledger:anchor", maxAgeSeconds: 36 * 60 * 60, label: "the public copy", optional: true, showReason: true, earlierFailure: true },
];

/** The one verdict for a clock, in whole seconds. Both the desk strip and the public monitor use it. */
export type ClockCheck = {
  job: string;
  label: string;
  /** Age of the latest run, or null when the clock has never run. */
  ageSeconds: number | null;
  ok: boolean;
  lastRunFailed: boolean;
  /** Private only: the failed run's own plain reason (a ledger step), or null. Never on the public path. */
  reason: string | null;
  /** Private only: a sentence about the latest good run that is worth a look but is not a failure, or null. */
  note: string | null;
  /** Private only: the newest FAILED run in the past 30 days of a step whose log keeps it, when the latest run is green. */
  earlierFailure: { ageSeconds: number; reason: string | null } | null;
};
/** How far back a failed run of the public-copy step is still shown after a green one. */
export const EARLIER_FAILURE_DAYS = 30;
/** The job queue: age in whole seconds of the oldest runnable step, or null when nothing is runnable (plan E7). */
export type QueueCheck = { ageSeconds: number | null; ok: boolean };
export type HealthReport = { ok: boolean; checkedAt: string; checks: ClockCheck[]; queue: QueueCheck };

const REASON_LIMIT = 200;

function earlier(failed: LatestRun, now: Date): { ageSeconds: number; reason: string | null } {
  const detail = failed.detail?.trim() ?? "";
  return { ageSeconds: Math.max(0, Math.floor((now.getTime() - new Date(failed.ranAt).getTime()) / 1000)), reason: detail ? detail.slice(0, REASON_LIMIT) : null };
}

function checkClock(rule: Rule, run: { ageSeconds: number; ok: boolean; detail?: string } | null, failed: LatestRun | null = null, now = new Date()): ClockCheck {
  if (!run) return { job: rule.job, label: rule.label, ageSeconds: null, ok: rule.optional === true, lastRunFailed: false, reason: null, note: null, earlierFailure: null };
  const ageSeconds = Math.max(0, Math.floor(run.ageSeconds));
  const ok = run.ok && ageSeconds <= rule.maxAgeSeconds;
  const detail = run.detail?.trim() ?? "";
  return {
    job: rule.job,
    label: rule.label,
    ageSeconds,
    ok,
    lastRunFailed: !run.ok,
    reason: !run.ok && rule.showReason && detail ? detail.slice(0, REASON_LIMIT) : null,
    note: ok && rule.job === "ledger:prices" ? noRowNote(run.detail) : null,
    // Only when the latest run is green: a latest run that failed already says so, with its own reason.
    earlierFailure: run.ok && rule.earlierFailure && failed ? earlier(failed, now) : null,
  };
}

/** One rule for both paths: an empty queue is healthy; a step runnable for over 6 h is not. */
function checkQueue(ageSeconds: number | null): QueueCheck {
  if (ageSeconds === null) return { ageSeconds: null, ok: true };
  const age = Math.max(0, Math.floor(ageSeconds));
  return { ageSeconds: age, ok: age <= QUEUE_STALE_SECONDS };
}

/** Desk strip: the latest run per clock, read as the admin, and the queue age from public.queue_age(). */
export function evaluateHealth(
  latest: Record<string, LatestRun | null>,
  now: Date,
  queueAgeSeconds: number | null,
  lastFailed: Record<string, LatestRun | null> = {},
): HealthReport {
  const checks = HEALTH_RULES.map((rule) => {
    const run = latest[rule.job] ?? null;
    return checkClock(rule, run && { ageSeconds: (now.getTime() - new Date(run.ranAt).getTime()) / 1000, ok: run.ok, detail: run.detail }, lastFailed[rule.job] ?? null, now);
  });
  const queue = checkQueue(queueAgeSeconds);
  return { ok: checks.every((c) => c.ok) && queue.ok, checkedAt: now.toISOString(), checks, queue };
}

function formatAge(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes < 120 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

/** An age for a failure that may be weeks old: hours up to two days, then whole days. */
function formatLongAge(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  return hours < 48 ? formatAge(seconds) : `${Math.floor(hours / 24)} days`;
}

/** The clocks only: the queue has its own sentence (describeQueue), so the strip never says "safe" twice (R11). */
export function describeStale(report: HealthReport): string[] {
  return report.checks
    .filter((c) => !c.ok)
    .map((c) => {
      if (c.ageSeconds === null) return `${c.label} has never run`;
      if (c.lastRunFailed) {
        const failed = `${c.label}${c.label.endsWith("s") ? "'" : "'s"} last run failed ${formatAge(c.ageSeconds)} ago`;
        return c.reason ? `${failed}: ${c.reason}` : failed;
      }
      return `${c.label} last ran ${formatAge(c.ageSeconds)} ago`;
    });
}

/** Things worth a look that are not failures (a tracked company with no row in a good file). Private; shown quietly on the strip. */
export function describeNotes(report: HealthReport): string[] {
  return report.checks.flatMap((c) => [
    ...(c.note ? [c.note] : []),
    // The log is insert-only, so a failed run stays on record after a green one; the strip keeps saying so for 30 days, quietly.
    ...(c.earlierFailure
      ? [`${c.label}${c.label.endsWith("s") ? "'" : "'s"} last failed run was ${formatLongAge(c.earlierFailure.ageSeconds)} ago${c.earlierFailure.reason ? `: ${c.earlierFailure.reason}` : ""}`]
      : []),
  ]);
}

/** The queue's own clause for the strip (rendered in Task 15), or null while documents are moving. */
export function describeQueue(report: HealthReport): string | null {
  const { ageSeconds, ok } = report.queue;
  return ok || ageSeconds === null ? null : `Documents have not moved for ${formatAge(ageSeconds)}; your uploads are safe`;
}

export async function getHealthReport(repo: HeartbeatRepo, now: Date, queueAgeSeconds: number | null): Promise<HealthReport> {
  const since = new Date(now.getTime() - EARLIER_FAILURE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [latest, failed] = await Promise.all([
    repo.latestRuns(HEALTH_RULES.map((rule) => rule.job)),
    // A failure to read the earlier failures must never hide the clocks: it reads as "none on record".
    repo.lastFailedRuns ? repo.lastFailedRuns(HEALTH_RULES.filter((r) => r.earlierFailure).map((r) => r.job), since).catch(() => ({})) : Promise.resolve({}),
  ]);
  return evaluateHealth(latest, now, queueAgeSeconds, failed);
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
