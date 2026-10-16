import { isUuid } from "@/lib/ids";
import type { ContactMirror, LetterFailure, LetterPorts } from "@/lib/providers";
import { LetterError } from "./errors";
import { renderConfirmation } from "./render";
import type { LettersRpc } from "./types";

// Readers (spec s8.5, D88-D90). Our table is the consent record; Resend's segment is a mirror that is made equal to it before every send
// and once a day. Confirmation emails go only when Aksh presses, to the readers he chose, within the day's limit, and only through the
// approval guard. Nothing here returns or logs an address: results are counts.

const lower = (email: string) => email.trim().toLowerCase();
/** The longest a send waits for the mirror to be made equal (the step has 250 s; a send needs the rest). */
export const RECONCILE_BUDGET_MS = 60_000;

export type ReconcileResult =
  | { ok: true; left: number; deleted: number; added: number; readers: number; complete: boolean }
  | { ok: false; failure: LetterFailure };

/**
 * 1. Every address Resend reports unsubscribed, that is confirmed here, is erased here (the withdrawal is honoured at once).
 * 2. Every contact that is not a confirmed reader here is deleted from the segment (a reader who left, a request never confirmed).
 * 3. Every confirmed reader the segment lacks is added.
 * A refused call stops the run with that failure; `complete: false` means the time ran out first (the caller waits and goes on later).
 */
export async function reconcileContacts(deps: { rpc: LettersRpc; contacts: ContactMirror; budgetMs?: number; now?: () => number }): Promise<ReconcileResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const budget = deps.budgetMs ?? RECONCILE_BUDGET_MS;
  const outOfTime = () => now() - started > budget;

  const mine = new Set((await deps.rpc.confirmedEmails()).map(lower));
  const listed = await deps.contacts.listContacts();
  if (!listed.ok) return { ok: false, failure: listed };

  // Only a confirmed reader is erased here for withdrawing at Resend: a newer request from the same address is not undone by an older withdrawal.
  const withdrawn = [...new Set(listed.value.filter((c) => c.unsubscribed).map((c) => lower(c.email)))].filter((e) => mine.has(e));
  const left = withdrawn.length > 0 ? await deps.rpc.markLeft(withdrawn) : 0;
  for (const email of withdrawn) mine.delete(email);

  const present = new Set<string>();
  let deleted = 0;
  let added = 0;
  let complete = true;
  for (const contact of listed.value) {
    const email = lower(contact.email);
    if (mine.has(email) && !contact.unsubscribed) {
      present.add(email);
      continue;
    }
    if (outOfTime()) {
      complete = false;
      break;
    }
    const removed = await deps.contacts.deleteContact(email);
    if (!removed.ok) return { ok: false, failure: removed };
    deleted += 1;
  }
  for (const email of mine) {
    if (present.has(email)) continue;
    if (!complete || outOfTime()) {
      complete = false;
      break;
    }
    const put = await deps.contacts.upsertContact(email);
    if (!put.ok) return { ok: false, failure: put };
    added += 1;
  }
  return { ok: true, left, deleted, added, readers: mine.size, complete };
}

export type ConfirmationBatch = { requested: number; issued: number; sent: number; failed: number; capped: boolean };

/**
 * "Send confirmation emails": for the readers he chose (at most 50 a day, counted by the database across calls), issue a link for each,
 * then send each its plain email. A reader whose email could not go is put back to waiting. `capped` says the day's limit cut the batch.
 * With letters off nothing is asked of the database and nothing is sent. The actor is checked by the database against the admin's profile.
 */
export async function sendConfirmations(deps: { rpc: LettersRpc; ports: LetterPorts | null; siteUrl: string }, actor: string, ids: readonly string[]): Promise<ConfirmationBatch> {
  const { ports, rpc } = deps;
  if (!ports) throw new LetterError("letters-off");
  const chosen = [...new Set(ids.filter(isUuid))];
  if (chosen.length === 0) return { requested: 0, issued: 0, sent: 0, failed: 0, capped: false };
  const issued = await rpc.issueConfirmations(actor, chosen);
  let sent = 0;
  let failed = 0;
  let stop = false;
  for (const row of issued) {
    let delivered = false;
    if (!stop) {
      const result = await ports.sender.sendConfirmation({ subscriberId: row.id, email: row.email, sentAt: row.sentAt }, renderConfirmation(deps.siteUrl, row.token));
      delivered = result.ok;
      // A limit means the rest would fail too: they go back to waiting without another call.
      if (!result.ok && (result.kind === "quota" || result.kind === "rate_limited")) stop = true;
    }
    if (delivered) {
      sent += 1;
      continue;
    }
    failed += 1;
    try {
      await rpc.confirmationFailed(row.id);
    } catch {
      // Left as sent: its link expires in 7 days and the nightly purge frees the address to ask again.
    }
  }
  return { requested: chosen.length, issued: issued.length, sent, failed, capped: issued.length < chosen.length };
}
