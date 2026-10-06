import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { HeartbeatRepo } from "./heartbeat";

// Public entry (@/modules/ops/health): everything here may run without the secret-key client.
// Spec s8: the pump is unhealthy after 2 h, the daily job after 36 h.
export const HEALTH_RULES = [
  { job: "heartbeat:pump", maxAgeMinutes: 120, label: "the 15-minute pump" },
  { job: "heartbeat:daily", maxAgeMinutes: 36 * 60, label: "the daily job" },
] as const;

export type HealthCheck = {
  job: string;
  label: string;
  lastOkAt: string | null;
  ageMinutes: number | null;
  maxAgeMinutes: number;
  stale: boolean;
};
export type HealthReport = { ok: boolean; checkedAt: string; checks: HealthCheck[] };

/** Desk strip: age of the latest successful run per clock, read as the admin. */
export function evaluateHealth(latest: Record<string, string | null>, now: Date): HealthReport {
  const checks = HEALTH_RULES.map((rule): HealthCheck => {
    const lastOkAt = latest[rule.job] ?? null;
    const ageMinutes = lastOkAt === null ? null : Math.floor((now.getTime() - new Date(lastOkAt).getTime()) / 60_000);
    return {
      job: rule.job,
      label: rule.label,
      lastOkAt,
      ageMinutes,
      maxAgeMinutes: rule.maxAgeMinutes,
      stale: ageMinutes === null || ageMinutes > rule.maxAgeMinutes,
    };
  });
  return { ok: checks.every((c) => !c.stale), checkedAt: now.toISOString(), checks };
}

const formatAge = (minutes: number) => (minutes < 120 ? `${minutes} min` : `${Math.round(minutes / 60)} h`);

export function describeStale(report: HealthReport): string[] {
  return report.checks
    .filter((c) => c.stale)
    .map((c) => (c.ageMinutes === null ? `${c.label} has never run` : `${c.label} last ran ${formatAge(c.ageMinutes)} ago`));
}

export async function getHealthReport(repo: HeartbeatRepo, now: Date): Promise<HealthReport> {
  return evaluateHealth(await repo.latestOk(HEALTH_RULES.map((rule) => rule.job)), now);
}

/** One row of public.heartbeat_ages(): the latest run per job, with no detail column. */
export type HeartbeatAgeRow = { job: string; age_seconds: number | string; ok: boolean };
/** The whole public /api/health contract: ages and outcomes only, never detail or error text. */
export type PublicCheck = { job: string; ageSeconds: number | null; ok: boolean };
export type PublicHealth = { ok: boolean; checks: PublicCheck[] };

/** Public monitor: the latest run per clock must have succeeded and be inside its window. */
export function evaluatePublicHealth(rows: readonly HeartbeatAgeRow[]): PublicHealth {
  const checks = HEALTH_RULES.map((rule): PublicCheck => {
    const row = rows.find((r) => r.job === rule.job);
    if (!row) return { job: rule.job, ageSeconds: null, ok: false };
    const ageSeconds = Math.max(0, Math.floor(Number(row.age_seconds)));
    return { job: rule.job, ageSeconds, ok: row.ok && ageSeconds <= rule.maxAgeMinutes * 60 };
  });
  return { ok: checks.every((c) => c.ok), checks };
}

/** Reads through public.heartbeat_ages(), the only door the anon role has to the heartbeats table. */
export async function getPublicHealth(db: Db): Promise<PublicHealth> {
  const { data, error } = await db.rpc("heartbeat_ages");
  if (error) throw dbError("ops.heartbeatAges", error);
  return evaluatePublicHealth(data ?? []);
}
