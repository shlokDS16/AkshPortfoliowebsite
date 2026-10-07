import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// /desk only: public pages, /api/cron, /api/jobs and /api/health never touch auth cookies,
// and Vercel cron does not follow redirects.
export const config = {
  matcher: ["/desk/:path*"],
};
