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

/** Creates a confirmed user through GoTrue (so on_auth_user_created runs); a no-op if it exists. */
export async function ensureUser(stack: LocalStack, email: string): Promise<void> {
  const { error } = await adminClient(stack).auth.admin.createUser({ email, email_confirm: true });
  if (error && !/already|registered|exists/i.test(error.message)) throw error;
}

/** A single-use token-hash link target for /auth/confirm; sends no email. */
export async function tokenHashFor(stack: LocalStack, email: string): Promise<string> {
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
