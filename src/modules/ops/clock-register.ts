import { jobDbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

// The database clock (docs/specs/2026-10-14-db-pump-clock.md) needs to know where this site lives. Only a production deploy
// may say so: a preview or local run must never point the clock at itself. Pure logic; the wiring is clock-steps.ts.

export type ClockRegisterDeps = {
  /** Vercel's VERCEL_ENV: development | preview | production; unset locally and in CI. */
  vercelEnv: string | undefined;
  /** NEXT_PUBLIC_SITE_URL. */
  siteUrl: string;
  /** The secret-key client, built only when it is needed. */
  db: () => Db;
};

/** The clock:register step body. Returns the heartbeat detail: the address only (it is public), never a database message. */
export async function registerClock(deps: ClockRegisterDeps): Promise<string> {
  if (deps.vercelEnv !== "production") return "not production";
  // The origin only, lower-cased: the database accepts nothing else (no path, no trailing slash).
  const origin = new URL(deps.siteUrl).origin.toLowerCase();
  const { data, error } = await deps.db().rpc("register_clock_target", { p_url: origin });
  if (error) throw jobDbError("ops.registerClock", error);
  return data ? `registered ${origin}` : `unchanged ${origin}`;
}
