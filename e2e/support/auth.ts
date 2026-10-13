import { createClient } from "@supabase/supabase-js";
import { readLocalStack, type LocalStack } from "./stack";

export function requireStack(): LocalStack {
  const stack = readLocalStack();
  if (!stack) {
    throw new Error("The local Supabase stack is not running. Start it with `supabase start`, then re-run `pnpm e2e`.");
  }
  return stack;
}

function adminClient(stack: LocalStack) {
  return createClient(stack.apiUrl, stack.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

const confirmedHere = new Set<string>();

/**
 * Creates a confirmed user through GoTrue (so on_auth_user_created runs); a no-op if it exists and is confirmed.
 *
 * An address that is taken but NOT confirmed is confirmed here. GoTrue's generate_link signs an unknown address up (unconfirmed)
 * instead of refusing it, and a magic-link request for an unconfirmed user is handled as a sign-up, which this stack refuses
 * (signup_disabled). Without this, any spec that asked for a link on an empty auth database before auth.spec.ts ran left the
 * admin unconfirmed and broke the magic-link form test (Plan 3a fix round 3).
 */
export async function ensureUser(stack: LocalStack, email: string): Promise<void> {
  const admin = adminClient(stack);
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (!error) {
    confirmedHere.add(email);
    return;
  }
  if (!/already|registered|exists/i.test(error.message)) throw error;
  if (confirmedHere.has(email)) return;
  const { data, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (user && !user.email_confirmed_at) {
    const { error: confirmError } = await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
    if (confirmError) throw confirmError;
  }
  confirmedHere.add(email);
}

/** Removes a throw-away user made by a spec for itself. */
export async function removeUser(stack: LocalStack, email: string): Promise<void> {
  const admin = adminClient(stack);
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (user) await admin.auth.admin.deleteUser(user.id);
  confirmedHere.delete(email);
}

/**
 * True when the account exists and is confirmed, which is what the sign-in form needs: GoTrue handles a magic-link request for an
 * unconfirmed account as a sign-up and answers signup_disabled. Checked through the admin API because the local mailer allows
 * only about one message per few seconds across the whole instance, and auth.spec.ts already sends the one it needs.
 */
export async function isConfirmed(stack: LocalStack, email: string): Promise<boolean> {
  const { data, error } = await adminClient(stack).auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return Boolean(user?.email_confirmed_at);
}

/**
 * A single-use token-hash link target for /auth/confirm; sends no email. The user is made (confirmed) first, because
 * generate_link would otherwise sign an unknown address up, unconfirmed.
 */
export async function tokenHashFor(stack: LocalStack, email: string): Promise<string> {
  await ensureUser(stack, email);
  const { data, error } = await adminClient(stack).auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) throw error ?? new Error("generateLink returned no token");
  return data.properties.hashed_token;
}

type MailpitList = { messages: { ID: string }[] };

async function messagesTo(stack: LocalStack, email: string): Promise<MailpitList["messages"]> {
  const res = await fetch(`${stack.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  return ((await res.json()) as MailpitList).messages;
}

export async function clearMailbox(stack: LocalStack): Promise<void> {
  await fetch(`${stack.mailpitUrl}/api/v1/messages`, { method: "DELETE" });
}

export async function mailCountFor(stack: LocalStack, email: string): Promise<number> {
  return (await messagesTo(stack, email)).length;
}

/**
 * Polls Mailpit for the newest message to `email` and returns its sign-in link: the token-hash link to
 * /auth/confirm that supabase/templates/magic_link.html renders (final review I4).
 */
export async function latestEmailLink(stack: LocalStack, email: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const messages = await messagesTo(stack, email);
    if (messages.length > 0) {
      const res = await fetch(`${stack.mailpitUrl}/api/v1/message/${messages[0].ID}`);
      const detail = (await res.json()) as { Text?: string; HTML?: string };
      const body = `${detail.Text ?? ""}\n${detail.HTML ?? ""}`;
      const link = /https?:\/\/[^\s"'<>]+\/auth\/confirm\?[^\s"'<>]+/.exec(body)?.[0];
      if (link) return link.replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No sign-in email reached ${email} within 15 s.`);
}
