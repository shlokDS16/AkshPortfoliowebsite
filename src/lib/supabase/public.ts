import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";
import type { Db } from "./types";

/**
 * Cookie-less anon client for cached public reads (Plan 1B) and public.heartbeat_ages().
 * Anon has column-level grants only: always select explicit column lists, never select("*") (42501).
 */
export function createSupabasePublicClient(): Db {
  const env = publicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
