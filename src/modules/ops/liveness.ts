import type { Db } from "@/lib/supabase/types";
import { createSupabaseHeartbeatRepo } from "./heartbeat";
import { describeQueue, describeStale, getHealthReport, readQueueAge, type HealthReport } from "./health";

/** `late` names the late clocks (maybe none) and, apart from them, a queue that has not moved (its own clause, so the strip says "safe" once). */
export type LivenessState = { status: "ok" } | { status: "late"; problems: string[]; queue?: string } | { status: "unreachable" };

/**
 * The same per-clock and queue rules as /api/health (health.ts), in describeStale's and describeQueue's words. A stuck
 * queue with fresh clocks is not "Background jobs are late" over an empty list: the queue clause stands alone.
 */
export function livenessFromReport(report: HealthReport): LivenessState {
  const problems = describeStale(report);
  const queue = describeQueue(report);
  if (problems.length === 0 && queue === null) return { status: "ok" };
  return queue === null ? { status: "late", problems } : { status: "late", problems, queue };
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
