import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { registerClock } from "./clock-register";
import type { Step } from "./steps";

// Job code: the one place the clock registration gets the secret-key client (ADR-001 s3). The logic is clock-register.ts.

/** First in both server clocks, so the first production run after a deploy registers the database clock. Builds nothing at import. */
export const CLOCK_REGISTER_STEP: Step = {
  job: "clock:register",
  run: () => {
    const env = serverEnv();
    return registerClock({ vercelEnv: env.VERCEL_ENV, siteUrl: env.NEXT_PUBLIC_SITE_URL, db: createSupabaseServiceClient });
  },
};
