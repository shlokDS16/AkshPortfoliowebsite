import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseHeartbeatRepo, describeStale, getHealthReport, type HealthReport } from "@/modules/ops";

const STRIP = "mb-4 rounded bg-red-700 px-3 py-2 text-sm text-white";

/**
 * Spec s8-s9: the owner sees the same condition the uptime monitor alerts on, in plain English.
 * Read as the signed-in admin through the session client (RLS), never the secret-key client.
 */
export async function HealthStrip() {
  let report: HealthReport;
  try {
    report = await getHealthReport(createSupabaseHeartbeatRepo(await createSupabaseServerClient()), new Date());
  } catch {
    return (
      <div role="alert" data-testid="health-strip" className={STRIP}>
        The database cannot be reached right now. New captures stay saved on this device and sync when it is back.
      </div>
    );
  }
  if (report.ok) return null;
  return (
    <div role="alert" data-testid="health-strip" className={STRIP}>
      Background checks are late: {describeStale(report).join("; ")}. The uptime monitor has emailed Shlok and Aksh.
    </div>
  );
}
