import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

/** The most recent run of a job, whatever its outcome: a fresh failure is not a healthy clock. */
export type LatestRun = { ranAt: string; ok: boolean };

export interface HeartbeatRepo {
  record(beat: { job: string; ok: boolean; detail: string }): Promise<void>;
  latestRuns(jobs: readonly string[]): Promise<Record<string, LatestRun | null>>;
}

export function createSupabaseHeartbeatRepo(db: Db): HeartbeatRepo {
  return {
    async record(beat) {
      // A write, not a read: this is what keeps the free project from pausing (ADR-001 s8.10).
      const { error } = await db.from("heartbeats").insert({ job: beat.job, ok: beat.ok, detail: beat.detail });
      if (error) throw dbError("ops.recordHeartbeat", error);
    },
    async latestRuns(jobs) {
      const entries = await Promise.all(
        jobs.map(async (job) => {
          const { data, error } = await db
            .from("heartbeats")
            .select("ran_at, ok")
            .eq("job", job)
            .order("ran_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw dbError("ops.latestRuns", error);
          return [job, data ? { ranAt: data.ran_at, ok: data.ok } : null] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
  };
}
