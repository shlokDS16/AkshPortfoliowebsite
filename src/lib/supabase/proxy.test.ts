import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type CookieWrite = { name: string; value: string; options: Record<string, unknown> };
type CookieMethods = { setAll: (cookies: CookieWrite[], headers: Record<string, string>) => void };

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  cookies: undefined as CookieMethods | undefined,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: CookieMethods }) => {
    mocks.cookies = options.cookies;
    return { auth: { getClaims: mocks.getClaims } };
  },
}));

import { config } from "@/proxy";
import { updateSession } from "./proxy";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  mocks.getClaims.mockReset();
});

describe("updateSession", () => {
  it("calls getClaims once and passes the request through when nothing refreshes", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    const response = await updateSession(new NextRequest("http://localhost:3000/desk"));
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("writes refreshed cookies and the no-store cache headers onto the response", async () => {
    mocks.getClaims.mockImplementation(async () => {
      mocks.cookies?.setAll(
        [{ name: "sb-test-auth-token", value: "refreshed", options: { path: "/" } }],
        { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0", Expires: "0", Pragma: "no-cache" },
      );
      return { data: { claims: { sub: "user-1" } }, error: null };
    });
    const response = await updateSession(new NextRequest("http://localhost:3000/desk"));
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.status).toBe(200);
  });
  it("keeps every cookie and the no-store headers across multiple setAll calls", async () => {
    mocks.getClaims.mockImplementation(async () => {
      // @supabase/ssr sends cache headers on the first write only; later writes get {}.
      mocks.cookies?.setAll(
        [{ name: "sb-test-auth-token.0", value: "chunk-a", options: { path: "/" } }],
        { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0", Expires: "0", Pragma: "no-cache" },
      );
      mocks.cookies?.setAll([{ name: "sb-test-auth-token.1", value: "chunk-b", options: { path: "/" } }], {});
      return { data: { claims: { sub: "user-1" } }, error: null };
    });
    const response = await updateSession(new NextRequest("http://localhost:3000/desk"));
    expect(response.cookies.get("sb-test-auth-token.0")?.value).toBe("chunk-a");
    expect(response.cookies.get("sb-test-auth-token.1")?.value).toBe("chunk-b");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("lets the last write to a cookie win", async () => {
    mocks.getClaims.mockImplementation(async () => {
      mocks.cookies?.setAll([{ name: "sb-test-auth-token", value: "old", options: { path: "/" } }], {});
      mocks.cookies?.setAll([{ name: "sb-test-auth-token", value: "new", options: { path: "/" } }], {});
      return { data: null, error: null };
    });
    const response = await updateSession(new NextRequest("http://localhost:3000/desk"));
    expect(response.cookies.getAll().filter((c) => c.name === "sb-test-auth-token")).toHaveLength(1);
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("new");
  });
});

describe("proxy matcher", () => {
  it("only runs on /desk so cron, pump, health and public pages never touch auth cookies", () => {
    expect(config.matcher).toEqual(["/desk/:path*"]);
  });
});
