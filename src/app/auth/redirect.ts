import { NextResponse } from "next/server";

/**
 * Redirect with a relative Location so the browser resolves it against the host it actually
 * used. request.nextUrl.origin is the server's bind host ("localhost") when self-hosted, which
 * would bounce a 127.0.0.1 session onto another origin and drop its cookies. Cookies set via
 * cookies() are merged into this response by Next.
 */
export function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}
