"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "./admin";

export type MagicLinkState = { status: "idle" | "sent" | "error"; message: string };

const SENT: MagicLinkState = {
  status: "sent",
  message: "If this address is allowed, a sign-in link is on its way. Check your inbox.",
};

/**
 * No session exists yet, so this cannot call requireAdmin(). Instead it sends a link only for
 * ADMIN_EMAIL (constant-time compare) and answers every other valid address, and every
 * provider failure for the admin address, with the identical "sent" state: the response
 * never reveals whether an address is the admin's, even through a rate-limit error.
 */
export async function requestMagicLink(_prev: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };
  if (!isAdminEmail(parsed.data, serverEnv().ADMIN_EMAIL)) return SENT;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=/desk`,
    },
  });
  // Status and code only: never the address or a key.
  if (error) console.error("magic link send failed", { status: error.status, code: error.code });
  return SENT;
}

/** Exempt from requireAdmin(): signing out must always work, whoever is signed in. */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
