import type { Db } from "@/lib/supabase/types";
import { createSupabaseHeartbeatRepo } from "./heartbeat";
import { describeStale, getHealthReport, type HealthReport } from "./health";

export type LivenessState = { status: "ok" } | { status: "late"; problems: string[] } | { status: "unreachable" };

/** The same per-clock rule as /api/health (health.ts checkClock), in describeStale's words. */
export function livenessFromReport(report: HealthReport): LivenessState {
  return report.ok ? { status: "ok" } : { status: "late", problems: describeStale(report) };
}

/** Read through the session client the caller passes (RLS), never the secret-key client. */
export async function getLiveness(db: Db, now = new Date()): Promise<LivenessState> {
  try {
    return livenessFromReport(await getHealthReport(createSupabaseHeartbeatRepo(db), now));
  } catch {
    return { status: "unreachable" };
  }
}
