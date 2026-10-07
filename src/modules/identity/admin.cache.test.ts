import { beforeEach, describe, expect, it, vi } from "vitest";

// React's cache() only dedupes inside a React server render, so it cannot be exercised from
// vitest. This stands in a per-"request" memo with the same contract (same arguments, same
// scope, one call) and proves that getAdmin() without deps goes through cache() and that
// requireAdmin() goes through getAdmin(). The per-request scoping itself is React's guarantee.
const scope = vi.hoisted(() => ({ memos: [] as Map<string, unknown>[] }));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    const memo = new Map<string, unknown>();
    scope.memos.push(memo);
    return (...args: A): R => {
      const key = JSON.stringify(args);
      if (!memo.has(key)) memo.set(key, fn(...args));
      return memo.get(key) as R;
    };
  },
}));

const claims = vi.hoisted(() => ({
  getClaims: vi.fn(async () => ({ data: { claims: { sub: "u-1", email: "aksh@example.com" } }, error: null })),
  maybeSingle: vi.fn(async () => ({ data: { role: "admin" }, error: null })),
}));

vi.mock("@/lib/env.server", () => ({ serverEnv: () => ({ ADMIN_EMAIL: "aksh@example.com" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getClaims: claims.getClaims },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: claims.maybeSingle }) }) }),
  })),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

describe("getAdmin within one request scope", () => {
  beforeEach(() => {
    vi.resetModules();
    scope.memos.length = 0;
    claims.getClaims.mockClear();
    claims.maybeSingle.mockClear();
  });

  it("checks the claims and reads the profile once however many callers ask", async () => {
    const { getAdmin, requireAdmin } = await import("./admin");
    expect(scope.memos).toHaveLength(1); // exactly one per-request memo: getAdmin() and requireAdmin() share it
    const first = await getAdmin();
    const second = await getAdmin();
    const third = await requireAdmin(); // what the layout, the page and an action each call
    expect(first).toEqual({ userId: "u-1", email: "aksh@example.com" });
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(claims.getClaims).toHaveBeenCalledTimes(1);
    expect(claims.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("does not share a result when the caller supplies its own client (sign-in confirmation)", async () => {
    const { confirmAdminSession } = await import("./admin");
    const db = {
      auth: { getClaims: claims.getClaims, signOut: vi.fn(async () => ({ error: null })) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: claims.maybeSingle }) }) }),
    };
    await confirmAdminSession(db as never, "aksh@example.com");
    await confirmAdminSession(db as never, "aksh@example.com");
    expect(claims.getClaims).toHaveBeenCalledTimes(2);
  });
});
