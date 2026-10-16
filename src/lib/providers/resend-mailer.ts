import type { AlertMailer, AlertMessage, AlertSend } from "./alert-mailer";
import { createResendClient, replyMessage } from "./resend-http";

// The Resend adapter for the alert email (docs/specs/2026-10-14-alert-email-design.md s3). Plain fetch, no SDK.
//
// Facts relied on, read 2026-10-14 (resend.com/docs/api-reference/emails/send-email and .../errors): POST /emails with a bearer
// key and a JSON body { from, to (a string or up to 50 addresses), subject, text }; an optional `Idempotency-Key` header of 1 to
// 256 characters, kept 24 hours, that drops a repeat of a message it has accepted (a repeat with a CHANGED body is a 409
// invalid_idempotent_request, a repeat still in flight is a 409 concurrent_idempotent_requests; both read here as a failure
// and are retried by the next clock tick); success is 200 with { id }; an error is { statusCode, name, message }. Without a
// verified domain `onboarding@resend.dev` may mail only the account owner's own address (403 validation_error).
//
// The key travels only in the Authorization header. Every outcome is a typed result, never a throw, and no outcome carries the
// key: a message is a status number, Resend's own `message` text cleaned of control characters, the key removed, cut at 160.

export const RESEND_URL = "https://api.resend.com/emails";
/** The only sender Resend allows before a domain is verified (and then only to the account owner's own address). */
export const DEFAULT_ALERT_FROM = "Aksh Research Desk <onboarding@resend.dev>";
const DEFAULT_TIMEOUT_MS = 10_000;
const MESSAGE_LIMIT = 160;
const MAX_RECIPIENTS = 50;

const KEY_SHAPE = /^re_\S{6,200}$/;
const ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const SENDER = /[^\s<>]+@[^\s<>]+\.[^\s<>]+/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const IDEMPOTENCY_KEY = /^[\u0021-\u007e]{1,256}$/;

export type ResendOptions = {
  apiKey: string;
  /** `Name <address>` or a bare address. */
  from: string;
  to: readonly string[];
  fetch?: typeof fetch;
  /** The most the call may take (default 10 s). */
  timeoutMs?: number;
};

export function createResendMailer(opts: ResendOptions): AlertMailer {
  // Settings are named here, never quoted: the messages reach a heartbeat the desk shows.
  if (!KEY_SHAPE.test(opts.apiKey)) throw new Error("RESEND_API_KEY does not have the shape of a Resend key (re_...)");
  if (opts.from.length > 200 || CONTROL.test(opts.from) || !SENDER.test(opts.from)) {
    throw new Error("RESEND_FROM must be an address, or Name <address>, on one line");
  }
  if (opts.to.length < 1 || opts.to.length > MAX_RECIPIENTS || !opts.to.every((address) => ADDRESS.test(address))) {
    throw new Error(`ALERT_EMAIL must be 1 to ${MAX_RECIPIENTS} email addresses`);
  }
  const { from, to } = opts;
  // The HTTP call is shared with the letters adapter (resend-http.ts); the messages are the ones this adapter always gave.
  const client = createResendClient({ apiKey: opts.apiKey, fetch: opts.fetch ?? fetch, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS });

  return {
    name: "resend",
    async send(message: AlertMessage): Promise<AlertSend> {
      if (!IDEMPOTENCY_KEY.test(message.idempotencyKey)) return { ok: false, message: "the idempotency key is not valid" };
      const reply = await client.call({
        method: "POST",
        url: RESEND_URL,
        body: { from, to, subject: message.subject, text: message.text },
        idempotencyKey: message.idempotencyKey,
      });
      return reply.ok ? { ok: true } : { ok: false, message: replyMessage(reply, MESSAGE_LIMIT) };
    },
  };
}
