import { createSupabasePublicClient } from "@/lib/supabase/public";
import { getPublicHealth } from "@/modules/ops/health";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Public, no secret: polled by the external uptime monitor (spec s8). Ages and outcomes only.
 * Reads public.heartbeat_ages() through the anon client; this route never holds the secret key.
 */
export async function GET() {
  try {
    const report = await getPublicHealth(createSupabasePublicClient());
    return Response.json(report, { status: report.ok ? 200 : 500, headers: NO_STORE });
  } catch {
    return Response.json({ ok: false, error: "database unreachable" }, { status: 500, headers: NO_STORE });
  }
}
