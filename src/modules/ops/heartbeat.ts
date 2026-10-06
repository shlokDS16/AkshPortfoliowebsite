import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

export interface HeartbeatRepo {
  record(beat: { job: string; ok: boolean; detail: string }): Promise<void>;
  latestOk(jobs: readonly string[]): Promise<Record<string, string | null>>;
}

export function createSupabaseHeartbeatRepo(db: Db): HeartbeatRepo {
  return {
    async record(beat) {
      // A write, not a read: this is what keeps the free project from pausing (ADR-001 s8.10).
      const { error } = await db.from("heartbeats").insert({ job: beat.job, ok: beat.ok, detail: beat.detail });
      if (error) throw dbError("ops.recordHeartbeat", error);
    },
    async latestOk(jobs) {
      const entries = await Promise.all(
        jobs.map(async (job) => {
          const { data, error } = await db
            .from("heartbeats")
            .select("ran_at")
            .eq("job", job)
            .eq("ok", true)
            .order("ran_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw dbError("ops.latestOk", error);
          return [job, data?.ran_at ?? null] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
  };
}
