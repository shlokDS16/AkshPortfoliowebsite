import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createSupabaseHeartbeatRepo, type HeartbeatRepo } from "./heartbeat";

/** Job code is the only place the secret-key client is created (ADR-001 s3). */
export function createJobHeartbeatRepo(): HeartbeatRepo {
  return createSupabaseHeartbeatRepo(createSupabaseServiceClient());
}
