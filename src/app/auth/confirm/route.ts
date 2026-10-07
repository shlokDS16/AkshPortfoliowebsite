import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { confirmAdminSession, safeNextPath } from "@/modules/identity";
import { seeOther } from "../redirect";

const ALLOWED: EmailOtpType[] = ["magiclink", "email"];

/** Token-hash links: server-generated links and the e2e harness. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));
  if (!tokenHash || !type || !ALLOWED.includes(type)) {
    return seeOther("/login?error=bad-link");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return seeOther("/login?error=link-expired");
  if (!(await confirmAdminSession(supabase))) {
    return seeOther("/login?error=not-allowed");
  }
  return seeOther(next);
}
