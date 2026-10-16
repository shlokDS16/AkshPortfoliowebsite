// The letters ports (Phase 5c, spec s8.8, s9): types only, plus the off line. Adapters: resend-letters.ts (the only file that names
// Resend's broadcasts and contacts endpoints) and fixture-letters.ts (memory or a local file, no network). Callers never hold a
// transport: createLetterPorts (index.ts) wraps it in letters-guard.ts, which sends nothing unless the database answers that a
// recorded approval is live for exactly that send.

/** What the desk shows while letters are off (spec s8.8). Pending Shlok's approval. */
export const LETTERS_OFF_LINE = "Email is not set up yet. Letters still publish to the archive.";

/**
 * Why a call did nothing (or did not finish). `message` is plain text that is safe to store and show: a status number and
 * Resend's own words cleaned (no control characters, no key, no email address, at most 160 characters), or a fixed phrase.
 *  - not_approved: no live approval for this send, or the broadcast is not the approved draft; nothing was called
 *  - invalid: the input could not be sent as it is (an address, an id, a subject); nothing was called
 *  - rate_limited: Resend's 10 requests a second (retryAfterSeconds when Resend said); try the step again later
 *  - quota: the free plan's daily or monthly email quota is used up
 *  - not_found, refused (another 4xx), unavailable (5xx, timeout, network, an answer that could not be read)
 */
export type LetterFailureKind = "not_approved" | "invalid" | "rate_limited" | "quota" | "not_found" | "refused" | "unavailable";
export type LetterFailure = { ok: false; kind: LetterFailureKind; message: string; retryAfterSeconds?: number };
export type LetterResult<T> = { ok: true; value: T } | LetterFailure;

export type OutgoingEmail = { to: string; subject: string; text: string; html?: string; idempotencyKey: string };
export type BroadcastDraft = { name: string; subject: string; html: string; text: string };
/** Resend's broadcast statuses (dashboard/broadcasts/manage-broadcasts); anything else reads as `unknown`. */
export type BroadcastStatus = "draft" | "scheduled" | "queued" | "sent" | "canceled" | "unknown";
export type BroadcastView = { id: string; name: string | null; segmentId: string | null; status: BroadcastStatus };
export type Contact = { id: string; email: string; unsubscribed: boolean };

/** The raw adapter. Only letters-guard.ts holds one; nothing else in the app can reach a transport. Never throws. */
export interface LetterTransport {
  readonly name: "resend" | "fixture";
  /** The segment every broadcast goes to and every contact is kept in (LETTERS_SEGMENT_ID). */
  readonly segmentId: string;
  sendOne(email: OutgoingEmail): Promise<LetterResult<{ id: string | null }>>;
  /** Always a draft (`send: false`); sending is a separate call. */
  createBroadcast(draft: BroadcastDraft): Promise<LetterResult<{ id: string }>>;
  getBroadcast(id: string): Promise<LetterResult<BroadcastView>>;
  sendBroadcast(id: string): Promise<LetterResult<null>>;
  /** Every contact of the segment, all pages. */
  listContacts(): Promise<LetterResult<Contact[]>>;
  /** Puts an address in the segment. Never changes a contact's `unsubscribed` flag (a reader who left stays left). */
  upsertContact(email: string): Promise<LetterResult<null>>;
  /** Removes the contact; one that is already gone is a success. */
  deleteContact(email: string): Promise<LetterResult<null>>;
}

/**
 * The database's answer to "is there a live approval for exactly this?", asked right before every send call and never cached.
 * Task 12 wires it to `letters_send_live` and `letters_confirmation_live` (migration 0025, service_role only). A throw is a no.
 */
export type ApprovalCheck = {
  /** `letter_sends` holds this id in `sending`, of this kind, claimed under a live lease, with exactly this broadcast id (or none). */
  sendIsLive(sendId: string, kind: "subscribers" | "self_test", broadcastId: string | null): Promise<boolean>;
  /** `subscribers` holds this reader at this address with a confirmation issued at `sentAt` (as returned), in the last hour. */
  confirmationIsLive(subscriberId: string, email: string, sentAt: string): Promise<boolean>;
};

export type SendApproval = { sendId: string };
export type ConfirmationApproval = { subscriberId: string; email: string; sentAt: string };
export type LetterContent = { subject: string; html: string; text: string };

/** Sends, each behind a live approval. The recipient, the broadcast name and every idempotency key come from the approval. */
export interface LetterSender {
  readonly name: "resend" | "fixture";
  /** One transactional email to ADMIN_EMAIL, the only recipient a self test can have. Key `self-test-{sendId}`. */
  sendSelfTest(approval: SendApproval, letter: LetterContent): Promise<LetterResult<null>>;
  /** One plain-text email to the reader the confirmation was issued to. Key `confirm-{subscriberId}-{sentAt}` (spec s8.5). */
  sendConfirmation(approval: ConfirmationApproval, email: { subject: string; text: string }): Promise<LetterResult<null>>;
  /** The draft for a claimed subscribers send, named `letter-{sendId}`, before any broadcast id is recorded. */
  createBroadcast(approval: SendApproval, letter: LetterContent): Promise<LetterResult<{ id: string }>>;
  getBroadcast(id: string): Promise<LetterResult<BroadcastView>>;
  /**
   * Sends the recorded draft. Reads it first: only a draft named `letter-{sendId}` in our segment is sent ("sent_now"); one Resend
   * already has (scheduled, queued, sent) is "already_sent" and is not sent again, so a retry after a crash cannot send twice.
   */
  sendBroadcast(approval: SendApproval, broadcastId: string): Promise<LetterResult<"sent_now" | "already_sent">>;
}

/** The contact mirror the reconcile step keeps equal to the confirmed readers (spec s8.5). Sends nothing. */
export interface ContactMirror {
  listContacts(): Promise<LetterResult<Contact[]>>;
  upsertContact(email: string): Promise<LetterResult<null>>;
  deleteContact(email: string): Promise<LetterResult<null>>;
}

export type LetterPorts = { readonly name: "resend" | "fixture"; sender: LetterSender; contacts: ContactMirror };
