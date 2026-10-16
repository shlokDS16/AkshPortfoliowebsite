import type { HoldsPosition } from "@/modules/research";
import type { ApprovalCheck } from "@/lib/providers";

// Phase 5c, spec s8. His words (the subject, the objective, the note, and the title, objective and change reason copied into an entry) and
// the machine's (kind, path, revNo, detail, dates, counts, labels) never share a field. Nothing here re-words anything.

export const LETTER_SCHEMA = "letter/1";
/** At most this many entries in one letter (migration 0025, 13.2). */
export const MAX_ENTRIES = 20;
/** The note is at most this long (13.1). */
export const MAX_NOTE = 4000;
/** The subject (the item title) is 1 to this many characters (13.1). */
export const MAX_SUBJECT = 120;
export const MAX_OBJECTIVE = 300;

export type EntryKind = "file" | "case" | "learning" | "process" | "video";

/** One entry as the database gate (13.2) reads it from `structured.entries`. */
export type LetterEntry = {
  /** The current, passed revision of the public item this entry is about. Kept for the gate. */
  revisionId: string;
  kind: EntryKind;
  /** A page of this site: `/companies/x`, `/notes/x`. The one link the machine adds. */
  path: string;
  revNo: number;
  /** The machine's line (the "What changed" detail), e.g. `Revision R2 · 3 sentences changed · figures to 3 Sep 2026`. */
  detail: string;
  // His words, copied verbatim from the item and its revision:
  title: string;
  learningObjective: string | null;
  changeReason: string | null;
  /** Only for a page that names a company; null otherwise. */
  holdsPosition: HoldsPosition | null;
  companyName: string | null;
};

export type LetterStructured = { schema: typeof LETTER_SCHEMA; entries: LetterEntry[] };

/** A public change that is not yet in a sent letter. `itemId` and `visibleFrom` are for the desk; they are not stored in an entry. */
export type Candidate = LetterEntry & { itemId: string; visibleFrom: string };

/** What an email is made from. The subject is the item title; the objective is the preheader; the note is the body. */
export type LetterView = { itemId: string; revisionId: string; subject: string; objective: string; note: string; entries: LetterEntry[] };

export type SendKind = "self_test" | "subscribers";
export type SendStatus = "approved" | "sending" | "sent" | "failed" | "expired" | "cancelled";
export type SendRow = {
  id: string;
  itemId: string;
  revisionId: string;
  kind: SendKind;
  status: SendStatus;
  approvedAt: string;
  claimedAt: string | null;
  broadcastId: string | null;
  recipientsAtApproval: number;
  recipientsSent: number | null;
  sentAt: string | null;
  problem: string | null;
};

export type IssuedConfirmation = { id: string; email: string; token: string; sentAt: string };

/**
 * Every service_role door of migrations 0024 and 0025 that this module uses, as one port. The Supabase version is `rpc.ts`; the only
 * file that hands it the secret-key client is `../send-rpc.ts` (the desk's actions) or the ops steps (job code).
 */
export interface LettersRpc extends ApprovalCheck {
  approve(actor: string, itemId: string, revisionId: string, kind: SendKind): Promise<SendRow>;
  cancel(actor: string, sendId: string): Promise<SendRow>;
  /** The oldest approved send (or a stale one), now `sending`; null when there is nothing to send. */
  claim(): Promise<SendRow | null>;
  finish(sendId: string, status: "sending" | "sent" | "failed", broadcastId: string | null, recipients: number, problem: string | null): Promise<SendRow>;
  issueConfirmations(actor: string, ids: readonly string[]): Promise<IssuedConfirmation[]>;
  confirmationFailed(id: string): Promise<void>;
  bin(actor: string, ids: readonly string[]): Promise<number>;
  erase(actor: string, id: string): Promise<number>;
  purge(): Promise<number>;
  markLeft(emails: readonly string[]): Promise<number>;
  confirmedEmails(): Promise<string[]>;
  setSignup(actor: string, on: boolean): Promise<boolean>;
}

/** The letter as the public can read it (the anon views): what the gate passed, and nothing else. */
export interface LetterSource {
  /** The letter's CURRENT public revision, or null when `revisionId` is not it (unpublished, or a newer revision passed). */
  load(itemId: string, revisionId: string): Promise<LetterView | null>;
}

export type WaitingReader = { id: string; email: string; requestedAt: string };
/** Readers by where they are: asked and not yet sent a link, sent a link and not yet confirmed, confirmed. Counts only; no address. */
export type ReaderCounts = { waiting: number; asked: number; confirmed: number };

/** What the desk reads through Aksh's own session (RLS: only the admin sees these tables). Never the secret-key client. */
export interface LettersReads {
  /** The time of the LATEST pass decision of each of these revisions; a revision with none is absent. */
  passTimes(revisionIds: readonly string[]): Promise<Map<string, string>>;
  /** When the last letter to subscribers finished sending, or null (then the candidates look back 14 days). */
  lastSentAt(): Promise<string | null>;
  confirmedCount(): Promise<number>;
  readerIdByEmail(email: string): Promise<string | null>;
  readerCounts(): Promise<ReaderCounts>;
  /** The sends of one letter, newest first. */
  sendsOf(itemId: string): Promise<SendRow[]>;
  /** The sends of several letters at once (the list), newest first. */
  sendsForItems(itemIds: readonly string[]): Promise<SendRow[]>;
  /** The waiting requests, oldest first (the readers screen shows the address and the date). */
  waiting(): Promise<WaitingReader[]>;
  /** 50 minus the confirmation emails issued since midnight India time. */
  confirmationsLeftToday(): Promise<number>;
  /** Readers who stopped on the public leave page since midnight India time (the typed form, review finding 2: abuse shows here the same day). */
  leftOnFormToday(): Promise<number>;
  /** Whether sign-ups are switched on (the last event of letters_signup_events). */
  signupOn(): Promise<boolean>;
}
