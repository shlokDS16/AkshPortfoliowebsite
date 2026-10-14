// The alert mailer port (docs/specs/2026-10-14-alert-email-design.md s3). Types only; the adapters are resend-mailer.ts and
// fixture-alert-mailer.ts. The recipients and the sender are fixed when the mailer is built, so a message is only words.

export type AlertMessage = {
  subject: string;
  /** Plain text. The caller keeps secrets, URLs with tokens and stack traces out of it. */
  text: string;
  /** Makes a retry of the same message harmless: the provider drops a repeat of a key it has already accepted (24 h). */
  idempotencyKey: string;
};

/** `message` is plain text that is safe to show on the desk: a status number and the provider's own words, never a key. */
export type AlertSend = { ok: true } | { ok: false; message: string };

export interface AlertMailer {
  readonly name: "resend" | "fixture";
  /** Never throws: every failure is `{ ok: false }`. */
  send(message: AlertMessage): Promise<AlertSend>;
}
