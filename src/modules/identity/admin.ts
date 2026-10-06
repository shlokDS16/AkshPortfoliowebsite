import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { serverEnv } from "@/lib/env.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Db } from "@/lib/supabase/types";

export type AdminIdentity = { userId: string; email: string };
/** The cookie-session client surface getAdmin needs: verified claims plus the caller's own profile row. */
export type AdminDb = Pick<Db, "auth" | "from">;
export type GetAdminDeps = { db?: AdminDb; adminEmail?: string };

const digest = (value: string) => createHash("sha256").update(value.trim().toLowerCase()).digest();

/** Constant-time on the digests, so the comparison leaks neither length nor matching prefix. */
export function isAdminEmail(email: string | null | undefined, adminEmail: string): boolean {
  if (!email) return false;
  return timingSafeEqual(digest(email), digest(adminEmail));
}

// A throwaway origin: resolving against it shows where a path would really land.
const BASE = "http://desk.invalid";
const CONTROL_OR_SPACE = /[\u0000-\u001F\u007F\s]/;

/** Only same-site paths under /desk survive; anything else falls back (open-redirect guard). */
export function safeNextPath(next: string | null | undefined, fallback = "/desk"): string {
  if (!next || CONTROL_OR_SPACE.test(next)) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  let resolved: URL;
  try {
    resolved = new URL(next, BASE);
  } catch {
    return fallback;
  }
  const inDesk = resolved.pathname === "/desk" || resolved.pathname.startsWith("/desk/");
  if (resolved.origin !== BASE || !inDesk) return fallback;
  // Return the resolved form so the redirect target is exactly what was checked.
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

/**
 * Admin only if BOTH the database and the environment agree (controller ruling R12):
 * the verified claims email is ADMIN_EMAIL, and the caller's own profiles row says role
 * 'admin'. RLS lets only an admin read that row, so a non-admin gets no row at all.
 * getClaims() verifies the JWT; getSession() is never used for authorisation (pitfalls s2).
 */
export async function getAdmin(deps: GetAdminDeps = {}): Promise<AdminIdentity | null> {
  const db = deps.db ?? (await createSupabaseServerClient());
  const adminEmail = deps.adminEmail ?? serverEnv().ADMIN_EMAIL;
  const { data, error } = await db.auth.getClaims();
  if (error || !data) return null;
  const claims = data.claims as unknown as Record<string, unknown>;
  const sub = typeof claims.sub === "string" ? claims.sub : null;
  const email = typeof claims.email === "string" ? claims.email : null;
  if (!sub || !email || !isAdminEmail(email, adminEmail)) return null;

  const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", sub).maybeSingle();
  if (profileError || profile?.role !== "admin") return null;
  return { userId: sub, email: email.trim().toLowerCase() };
}

/** Every desk page, layout and server action calls this (spec s9). */
export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  return admin;
}

/** After a sign-in exchange: keep the session only if it is the admin's. */
export async function confirmAdminSession(db: AdminDb, adminEmail?: string): Promise<boolean> {
  const admin = await getAdmin({ db, adminEmail });
  if (admin) return true;
  await db.auth.signOut();
  return false;
}
