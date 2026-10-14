import type { JobRun } from "@/components/desk/private/ledger/ledger-status";
import type { Db } from "@/lib/supabase/types";
import { createSupabaseHeartbeatRepo } from "@/modules/ops";

type Job = JobRun["job"];

/** The last runs of daily ledger steps, from the heartbeat table (the admin's session may read it). A failure to read is no row, not a crash. */
export async function readRuns<const J extends readonly Job[]>(db: Db, jobs: J): Promise<JobRun[] | null> {
  try {
    const latest = await createSupabaseHeartbeatRepo(db).latestRuns(jobs);
    return jobs.map((job) => ({ job, ranAt: latest[job]?.ranAt ?? null, ok: latest[job]?.ok ?? null, detail: latest[job]?.detail }));
  } catch (error) {
    console.error("ledger page: could not read the daily steps", error instanceof Error ? error.name : typeof error);
    return null;
  }
}

