import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();
const signOutAuth = vi.fn();
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("@/lib/env.server", () => ({ serverEnv: () => ({ ADMIN_EMAIL: "aksh@example.com" }) }));
vi.mock("@/lib/env", () => ({ publicEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://desk.example" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithOtp, signOut: signOutAuth } }),
}));

import { requestMagicLink, signOut, type MagicLinkState } from "./actions";

const idle: MagicLinkState = { status: "idle", message: "" };
const form = (email: unknown) => {
  const data = new FormData();
  if (email !== undefined) data.set("email", String(email));
  return data;
};

beforeEach(() => {
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  signOutAuth.mockReset().mockResolvedValue({ error: null });
  redirect.mockClear();
});

describe("requestMagicLink", () => {
  it("sends a link to the admin address, never creating a user", async () => {
    const state = await requestMagicLink(idle, form("  Aksh@Example.com "));
    expect(state.status).toBe("sent");
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "aksh@example.com",
      options: { shouldCreateUser: false, emailRedirectTo: "https://desk.example/auth/callback?next=/desk" },
    });
  });

  it("answers a stranger identically and sends nothing", async () => {
    const admin = await requestMagicLink(idle, form("aksh@example.com"));
    const stranger = await requestMagicLink(idle, form("stranger@example.com"));
    expect(stranger).toEqual(admin);
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("does not reveal the admin address when the provider errors (for example a rate limit)", async () => {
    signInWithOtp.mockResolvedValue({ error: { message: "rate limit", status: 429 } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await requestMagicLink(idle, form("aksh@example.com"));
    const stranger = await requestMagicLink(idle, form("stranger@example.com"));
    expect(failed).toEqual(stranger);
  });

  it.each([[""], ["not-an-email"], [undefined]])("rejects the malformed address %j", async (value) => {
    const state = await requestMagicLink(idle, form(value));
    expect(state.status).toBe("error");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("ends the session and redirects to /login without needing an admin check", async () => {
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(signOutAuth).toHaveBeenCalledTimes(1);
  });
});
