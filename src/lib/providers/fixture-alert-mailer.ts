import type { AlertMailer, AlertMessage } from "./alert-mailer";

// The fake alert mailer: tests only. It sends nothing; it keeps what it was asked to send. `fail` makes every send fail with
// that text (and keeps nothing), the way a provider outage does.

export type FixtureAlertMailer = AlertMailer & {
  /** The messages the mailer accepted, in order. */
  readonly sent: AlertMessage[];
  /** How many times `send` was called, accepted or not. */
  readonly attempts: number;
};

export function createFixtureAlertMailer(opts: { fail?: string } = {}): FixtureAlertMailer {
  const sent: AlertMessage[] = [];
  const state = { attempts: 0 };
  return {
    name: "fixture",
    sent,
    get attempts() {
      return state.attempts;
    },
    async send(message) {
      state.attempts += 1;
      if (opts.fail !== undefined) return { ok: false, message: opts.fail };
      sent.push(message);
      return { ok: true };
    },
  };
}
