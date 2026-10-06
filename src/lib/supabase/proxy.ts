import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Refreshes the Supabase session cookie. It is NOT an auth boundary (spec s4): it never
 * redirects, because a redirect after a refresh drops the refreshed cookies (pitfalls s2).
 * Pages and actions call requireAdmin().
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  // setAll can run several times per request, and @supabase/ssr sends the Cache-Control /
  // Expires / Pragma headers on the first write only. Accumulate everything (cookies by
  // name, last write wins) and rebuild the response from the full set each time.
  const cookieWrites = new Map<string, { value: string; options: CookieOptions }>();
  const headerWrites: Record<string, string> = {};
  const env = publicEnv();
  const supabase = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          cookieWrites.set(name, { value, options });
        });
        Object.assign(headerWrites, headers);
        response = NextResponse.next({ request });
        cookieWrites.forEach(({ value, options }, name) => response.cookies.set(name, value, options));
        Object.entries(headerWrites).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });
  // Do not put code between client creation and getClaims().
  await supabase.auth.getClaims();
  return response;
}
