import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "./env.server";

// The sign-up form's render-time ticket (spec s8.5). The page puts `issueFormTicket()` in a hidden field when it renders; the action
// accepts a submit only if the ticket is genuine and at least 3 seconds old (a person types an address slower than a script posts one),
// and not older than two hours. The signature is an HMAC-SHA256 of the time under the server secret that already protects the job routes
// (CRON_SECRET: a required, 32-character secret that is never sent to a browser), with a prefix of its own so the same key signs
// nothing else in the same way. It is a speed bump on top of the honeypot and the database's own caps, not a login.

export const MIN_FILL_MS = 3_000;
export const MAX_FORM_AGE_MS = 2 * 3_600_000;
const DOMAIN = "letters-form-v1";

const macOf = (secret: string, time: number): string => createHmac("sha256", secret).update(`${DOMAIN}|${time}`).digest("hex");

export function signFormTicket(secret: string, nowMs: number): string {
  return `${nowMs}.${macOf(secret, nowMs)}`;
}

export function formTicketOk(secret: string, ticket: unknown, nowMs: number): boolean {
  if (typeof ticket !== "string" || ticket.length > 100) return false;
  const [time, mac, extra] = ticket.split(".");
  if (extra !== undefined || !time || !mac || !/^\d{10,16}$/.test(time) || !/^[0-9a-f]{64}$/.test(mac)) return false;
  const made = Number(time);
  const age = nowMs - made;
  if (age < MIN_FILL_MS || age > MAX_FORM_AGE_MS) return false;
  return timingSafeEqual(Buffer.from(macOf(secret, made)), Buffer.from(mac));
}

/** For the page that renders the form. */
export const issueFormTicket = (now: () => number = Date.now): string => signFormTicket(serverEnv().CRON_SECRET, now());
/** For the action that receives it. */
export const checkFormTicket = (ticket: unknown, now: () => number = Date.now): boolean => formTicketOk(serverEnv().CRON_SECRET, ticket, now());
