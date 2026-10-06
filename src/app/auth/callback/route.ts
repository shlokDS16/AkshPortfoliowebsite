import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { confirmAdminSession, safeNextPath } from "@/modules/identity";
import { seeOther } from "../redirect";

/** PKCE code from the emailed link. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  if (!code) return seeOther("/login?error=missing-code");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return seeOther("/login?error=link-expired");
  if (!(await confirmAdminSession(supabase))) {
    return seeOther("/login?error=not-allowed");
  }
  return seeOther(next);
}
