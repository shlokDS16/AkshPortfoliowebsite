import type { LetterFailure, LetterPorts } from "@/lib/providers";
import { reconcileContacts } from "./readers";
import { renderLetter } from "./render";
import type { LetterSource, LettersRpc, SendRow } from "./types";

// Sending (spec s8.6, D91). `deliverLetter` takes ONE claimed send (status `sending`, lease held) and carries it out through the ports,
// which will not send unless the database still calls that send live. The order is the point:
//   reconcile the list; (subscribers) create the broadcast as a draft; RECORD its id; send it; record `sent`.
// A retry that finds a broadcast id reads the broadcast first (inside the port) and sends only a draft, so a crash between any two steps
// can neither lose the send nor send it twice. A failure that may pass (Resend slow, rate limited) leaves the row `sending` for the
// database to hand out again when the lease runs out; one that will not (a refusal, the quota, a letter that changed) fails the row.

/** Pending Shlok's approval (the same sentence the database writes when it re-checks a send). */
export const CHANGED_AFTER_APPROVAL = "The letter changed after you approved it.";
export const NO_CONFIRMED_READERS = "There are no confirmed readers to send to.";
const WAIT_LIMIT_MS = 24 * 3_600_000;
const SEND_BUDGET_MS = 150_000;

export type DeliverDeps = { rpc: LettersRpc; ports: LetterPorts; source: LetterSource; siteUrl: string; now?: () => number; budgetMs?: number };
export type Delivery = { status: "sent"; recipients: number } | { status: "failed"; problem: string } | { status: "deferred"; reason: string };

export async function deliverLetter(send: SendRow, deps: DeliverDeps): Promise<Delivery> {
  const { rpc, ports, siteUrl } = deps;
  const now = deps.now ?? Date.now;
  const fail = async (problem: string): Promise<Delivery> => {
    await rpc.finish(send.id, "failed", null, 0, problem);
    return { status: "failed", problem };
  };
  const deferred = (reason: string): Delivery => ({ status: "deferred", reason });
  let broadcastId = send.kind === "subscribers" ? send.broadcastId : null;
  const recordSent = async (): Promise<Delivery> => {
    await rpc.finish(send.id, "sent", broadcastId, send.recipientsAtApproval, null);
    return { status: "sent", recipients: send.recipientsAtApproval };
  };
  /**
   * With a broadcast id the send may already have gone out, and an email cannot be called back: Resend is asked what the broadcast is,
   * and the row is failed only when the answer is `draft` or `canceled`. A broadcast that went out is recorded `sent` (never `failed`,
   * which would re-open the letter for a second send); one that cannot be read, or whose state is not known, waits.
   */
  const settleKnownBroadcast = async (reason: string): Promise<Delivery> => {
    const read = await ports.sender.getBroadcast(broadcastId!);
    if (!read.ok) return deferred(read.message);
    const status = read.value.status;
    if (status === "scheduled" || status === "queued" || status === "sent") return recordSent();
    if (status === "draft" || status === "canceled") return fail(reason);
    return deferred("Resend did not say what became of the broadcast.");
  };
  /** Whether a failure may pass: Resend slow or asking for time is waited out (for a day at most, and without a broadcast id); every other answer ends the send. */
  const settle = (failure: LetterFailure): Promise<Delivery> | Delivery => {
    if (failure.kind === "rate_limited") return deferred(failure.message);
    if (broadcastId) return failure.kind === "unavailable" ? deferred(failure.message) : settleKnownBroadcast(failure.message);
    if (failure.kind === "unavailable" && now() - Date.parse(send.approvedAt) <= WAIT_LIMIT_MS) return deferred(failure.message);
    return fail(failure.message);
  };

  // A retry that finds a broadcast id reads the broadcast before anything else, so a letter that changed or a Resend outage
  // after the send went out cannot fail the row (and re-open the letter).
  if (broadcastId) {
    const read = await ports.sender.getBroadcast(broadcastId);
    if (!read.ok) return deferred(read.message);
    const status = read.value.status;
    if (status === "scheduled" || status === "queued" || status === "sent") return recordSent();
    if (status === "unknown") return deferred("Resend did not say what became of the broadcast.");
  }

  // The letter is read as the public reads it: the current revision that passed the gate, or nothing.
  const letter = await deps.source.load(send.itemId, send.revisionId);
  if (!letter) return broadcastId ? settleKnownBroadcast(CHANGED_AFTER_APPROVAL) : fail(CHANGED_AFTER_APPROVAL);

  if (send.kind === "self_test") {
    const sent = await ports.sender.sendSelfTest({ sendId: send.id }, renderLetter(letter, siteUrl, { unsubscribeUrl: `${siteUrl.replace(/\/+$/, "")}/letters/leave` }));
    if (!sent.ok) return settle(sent);
    await rpc.finish(send.id, "sent", null, 1, null);
    return { status: "sent", recipients: 1 };
  }

  const list = await reconcileContacts({ rpc, contacts: ports.contacts, now, ...(deps.budgetMs === undefined ? {} : { budgetMs: deps.budgetMs }) });
  if (!list.ok) return settle(list.failure);
  if (!list.complete) return deferred("The reader list is still being made equal.");
  if (list.readers === 0) return fail(NO_CONFIRMED_READERS);

  if (!broadcastId) {
    const created = await ports.sender.createBroadcast({ sendId: send.id }, renderLetter(letter, siteUrl));
    if (!created.ok) return settle(created);
    broadcastId = created.value.id;
    await rpc.finish(send.id, "sending", broadcastId, 0, null);
  }
  // Reads the broadcast first: one Resend already has (queued or sent) is not sent again.
  const sent = await ports.sender.sendBroadcast({ sendId: send.id }, broadcastId);
  if (!sent.ok) return settle(sent);
  await rpc.finish(send.id, "sent", broadcastId, list.readers, null);
  return { status: "sent", recipients: list.readers };
}

export type SendRun = { off: true } | { off: false; sent: number; failed: number; deferred: number };

/**
 * `letters:send`: claims the sends one at a time and delivers each (at most three, within the time the step has). With letters off it
 * claims nothing, so an approval stays as it is and expires after a day.
 */
export async function runLetterSends(deps: Omit<DeliverDeps, "ports"> & { ports: LetterPorts | null }, maxSends = 3): Promise<SendRun> {
  const { ports } = deps;
  if (!ports) return { off: true };
  const now = deps.now ?? Date.now;
  const started = now();
  const run = { off: false as const, sent: 0, failed: 0, deferred: 0 };
  for (let n = 0; n < maxSends && now() - started <= (deps.budgetMs ?? SEND_BUDGET_MS); n += 1) {
    const send = await deps.rpc.claim();
    if (!send) break;
    const outcome = await deliverLetter(send, { ...deps, ports });
    run[outcome.status === "sent" ? "sent" : outcome.status === "failed" ? "failed" : "deferred"] += 1;
  }
  return run;
}
