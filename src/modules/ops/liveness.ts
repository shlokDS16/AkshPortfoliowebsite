import type { Db } from "@/lib/supabase/types";
import { createSupabaseHeartbeatRepo } from "./heartbeat";
import { describeStale, getHealthReport, readQueueAge, type HealthReport } from "./health";

export type LivenessState = { status: "ok" } | { status: "late"; problems: string[] } | { status: "unreachable" };

/**
 * The same per-clock rule as /api/health (health.ts checkClock), in describeStale's words. A stuck queue with
 * fresh clocks is not "Background jobs are late" over an empty list: Task 15 renders describeQueue as its own clause.
 */
export function livenessFromReport(report: HealthReport): LivenessState {
  const problems = describeStale(report);
  return problems.length === 0 ? { status: "ok" } : { status: "late", problems };
}

/** Read through the session client the caller passes (RLS), never the secret-key client. */
export async function getLiveness(db: Db, now = new Date()): Promise<LivenessState> {
  try {
    const queueAge = await readQueueAge(db);
    return livenessFromReport(await getHealthReport(createSupabaseHeartbeatRepo(db), now, queueAge));
  } catch {
    return { status: "unreachable" };
  }
}
