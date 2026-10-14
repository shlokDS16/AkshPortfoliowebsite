import type { Db } from "@/lib/supabase/types";
import { createSupabaseHeartbeatRepo } from "./heartbeat";
import { describeNotes, describeQueue, describeStale, getHealthReport, readQueueAge, type HealthReport } from "./health";

/** `late` names the late clocks (maybe none) and, apart from them, a queue that has not moved (its own clause, so the strip says "safe" once). */
export type LivenessState =
  | { status: "ok"; notes?: string[] }
  | { status: "late"; problems: string[]; queue?: string; notes?: string[] }
  | { status: "unreachable" };

/**
 * The same per-clock and queue rules as /api/health (health.ts), in describeStale's and describeQueue's words. A stuck
 * queue with fresh clocks is not "Background jobs are late" over an empty list: the queue clause stands alone. `notes` are
 * things worth a look that are not failures; they ride along and never make the strip red.
 */
export function livenessFromReport(report: HealthReport): LivenessState {
  const problems = describeStale(report);
  const queue = describeQueue(report);
  const noted = describeNotes(report);
  const notes = noted.length > 0 ? { notes: noted } : {};
  if (problems.length === 0 && queue === null) return { status: "ok", ...notes };
  return queue === null ? { status: "late", problems, ...notes } : { status: "late", problems, queue, ...notes };
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
