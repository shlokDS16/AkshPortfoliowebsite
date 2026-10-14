import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createAlertMailer } from "@/lib/providers";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { alertEmail, type AlertDeps } from "./alert-email";
import { createSupabaseHeartbeatRepo } from "./heartbeat";
import type { Step } from "./steps";

// Job code: the one place the alert step gets the secret-key client and the mailer (ADR-001 s3). The step logic is alert-email.ts.

/**
 * The deps of one run, built when the step runs (never at import): a missing secret then lands in this step's own heartbeat,
 * and the steps before it have already run. The mailer is built inside the step too, so a mistyped RESEND_API_KEY or
 * ALERT_EMAIL fails only this step, with the setting's name and never its value.
 */
export function buildAlertDeps(): AlertDeps {
  const db = createSupabaseServiceClient();
  return {
    db,
    repo: createSupabaseHeartbeatRepo(db),
    mailer: () => createAlertMailer(serverEnv()),
    now: () => new Date(),
    origin: serverEnv().NEXT_PUBLIC_SITE_URL,
  };
}

/** Last in both server clocks, so the steps before it have written their heartbeats and each clock alerts on the other's silence. */
export const ALERT_STEP: Step = { job: "alerts:email", run: () => alertEmail(buildAlertDeps()) };
