import { LETTERS_NOTICE_VERSION } from "./copy";

// The reader's three doors (spec s8.5). Plain functions over two ports, so the logic is tested without a request. The database's own
// functions (migration 0024) decide everything that matters: they take or refuse silently, cap the day, and never say which. This layer
// adds the hidden-field trap and the render-time ticket, and gives one answer to every outcome, so an address cannot be found out.

export type AskState = { status: "idle" } | { status: "asked" };
export type ConfirmState = { status: "idle" } | { status: "confirmed" } | { status: "expired" };
export type LeaveState = { status: "idle" } | { status: "left" };

/** The database refuses an address over 320 characters with an error; none is a real address. */
const MAX_EMAIL = 320;
/** letters_confirm refuses a token over 128 characters; a real one is 43. */
const MAX_TOKEN = 128;

export type AskDeps = {
  /** public.letters_request through the anon client. */
  request(email: string, noticeVersion: string, adult: boolean): Promise<void>;
  /** The render-time ticket check (lib/letters-form). */
  ticketOk(ticket: unknown): boolean;
};
export type AskInput = { email: unknown; adult: unknown; ticket: unknown; /** The honeypot: a field no person sees. */ website: unknown };

/** Always `asked`. A bot's post (the hidden field filled, or too fast, or forged) is answered the same and goes no further. */
export async function askToSubscribe(deps: AskDeps, input: AskInput): Promise<AskState> {
  const trapped = typeof input.website === "string" ? input.website !== "" : input.website != null;
  if (trapped || !deps.ticketOk(input.ticket)) return { status: "asked" };
  if (typeof input.email !== "string" || input.email.length > MAX_EMAIL) return { status: "asked" };
  await deps.request(input.email, LETTERS_NOTICE_VERSION, input.adult === "on");
  return { status: "asked" };
}

/** Called only from a POST (a button), never a GET: mail scanners open links. */
export async function confirmSubscription(deps: { confirm(token: string): Promise<boolean> }, token: unknown): Promise<ConfirmState> {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN) return { status: "expired" };
  return (await deps.confirm(token)) ? { status: "confirmed" } : { status: "expired" };
}

/** Withdrawal is as easy as giving: one field, deleted at once, the same answer whether or not the address was known. A failure is thrown, so the reader can try again. */
export async function leaveLetters(deps: { leave(email: string): Promise<void> }, email: unknown): Promise<LeaveState> {
  if (typeof email === "string" && email.length <= MAX_EMAIL) await deps.leave(email);
  return { status: "left" };
}
