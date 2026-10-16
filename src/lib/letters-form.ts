import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { serverEnv } from "./env.server";

// The sign-up form's render-time ticket (spec s8.5). The page puts `issueFormTicket()` in a hidden field when it renders; the action
// accepts a submit only if the ticket is genuine and at least 3 seconds old (a person types an address slower than a script posts one),
// and not older than two hours. The signature is an HMAC-SHA256 of the time under a key DERIVED (HKDF-SHA256, a purpose label) from the
// server secret that already protects the job routes (CRON_SECRET: required, at least 32 characters, never sent to a browser), so the
// secret itself never signs a ticket and no other use of it can forge one (review finding 6). No new setting. Rotating CRON_SECRET
// rotates this key too and voids the forms that are open: a reader who submits one gets the thank-you without being kept (spec s8.5).
//
// WHAT THIS IS NOT: the ticket and the honeypot are a speed bump for scripts that post the HTML form. They are not a control. The
// publishable key is in every page, so the database doors (letters_request, letters_leave) can be called without this form; their
// caps in SQL are the control (migration 0024), and the desk shows the typed leaves of the day (review finding 2).

export const MIN_FILL_MS = 3_000;
export const MAX_FORM_AGE_MS = 2 * 3_600_000;
const DOMAIN = "letters-form-v1";

const PURPOSE = "aksh-desk/letters-form-v1";

/** The signing key for this purpose, derived from the server secret (HKDF-SHA256, empty salt). Exported for its test only. */
export const formKey = (secret: string): Buffer => Buffer.from(hkdfSync("sha256", secret, "", PURPOSE, 32));

const macOf = (secret: string, time: number): string => createHmac("sha256", formKey(secret)).update(`${DOMAIN}|${time}`).digest("hex");

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
