import { istDate } from "@/lib/dates";
import { formatCount, formatDate, formatTime } from "@/lib/format";
import { LETTERS_OFF_LINE } from "@/lib/providers";
import { LETTER_ERROR_TEXT } from "@/lib/messages-letters";
import type { SendRow } from "./types";

// What the send block of a letter says and offers (spec s8.1, s8.6, s15). Read from the `letter_sends` rows, never from a flag kept on the
// letter. Pure and advisory: the database decides every approval again (approve_letter_send), and the step re-checks at the claim.

export type SendFacts = {
  /** Letters are set up (the three settings and production, or the local fixture). */
  on: boolean;
  /** The subject is still the label the desk gave a new letter. */
  subjectIsLabel: boolean;
  /** The newest revision is the public one: the gate passed it and the archive shows it. */
  published: boolean;
  /** Confirmed readers now. */
  confirmed: number;
  /** This letter's sends, newest first, test copies included. */
  sends: SendRow[];
};

export type SendState = {
  code: "off" | "not-published" | "ready" | "approved" | "sending" | "sent" | "failed" | "expired";
  line: string;
  tone: "ok" | "warn" | "bad" | "muted";
  /** `send` and `again` open the dialog; `cancel` withdraws a waiting approval; `none` offers nothing. */
  control: "none" | "send" | "again" | "cancel";
  /** Why the `send` or `again` control is switched off, or null when it works. */
  disabledWhy: string | null;
  /** The readers send this state was read from, if any. */
  send: SendRow | null;
};

export const NOT_PUBLISHED_LINE = "Run the publishing gate first. A letter is sent only after it is on the archive.";
export const LABEL_LINE = LETTER_ERROR_TEXT["letter-subject-label"];

const state = (code: SendState["code"], tone: SendState["tone"], line: string, control: SendState["control"], send: SendRow | null = null, disabledWhy: string | null = null): SendState => ({
  code, tone, line, control, disabledWhy, send,
});

const day = (at: string | null, fallback: string) => formatDate(istDate(at ?? fallback));

/** The newest send to readers that still counts: a cancelled approval is history. */
const latestReaders = (sends: SendRow[]): SendRow | null => sends.find((s) => s.kind === "subscribers" && s.status !== "cancelled") ?? null;

export function sendState(f: SendFacts): SendState {
  const last = latestReaders(f.sends);
  if (last?.status === "approved") return state("approved", "ok", `Approved ${formatTime(last.approvedAt)}. It goes out within 15 minutes.`, "cancel", last);
  if (last?.status === "sending") return state("sending", "ok", "Sending", "none", last);
  if (last?.status === "sent") return state("sent", "ok", `Sent to ${last.recipientsSent ?? last.recipientsAtApproval} on ${day(last.sentAt, last.approvedAt)}`, "none", last);
  if (!f.on) return state("off", "muted", LETTERS_OFF_LINE, "none");
  if (!f.published) return state("not-published", "muted", NOT_PUBLISHED_LINE, "none");
  const why = f.subjectIsLabel ? LABEL_LINE : f.confirmed === 0 ? LETTER_ERROR_TEXT["letter-no-readers"] : null;
  if (last?.status === "failed") return state("failed", "bad", `Not sent: ${last.problem ?? "no reason was recorded."}`, "again", last, why);
  if (last?.status === "expired") return state("expired", "warn", "Not sent: the approval ran out after 24 hours.", "again", last, why);
  return state("ready", "ok", `Ready. This is on the archive and goes to ${formatCount(f.confirmed, "subscriber")}.`, "send", null, why);
}

/** One line about the newest test copy, or null when none was asked for. */
export function testCopyLine(sends: SendRow[]): string | null {
  const copy = sends.find((s) => s.kind === "self_test" && s.status !== "cancelled");
  if (!copy) return null;
  switch (copy.status) {
    case "approved":
      return `Test copy approved ${formatTime(copy.approvedAt)}.`;
    case "sending":
      return "Test copy is being sent.";
    case "sent":
      return `Test copy sent to you on ${day(copy.sentAt, copy.approvedAt)}.`;
    case "failed":
      return `Test copy not sent: ${copy.problem ?? "no reason was recorded."}`;
    default:
      return "Test copy not sent: the approval ran out.";
  }
}

/** What the letters list knows of one letter without reading its revisions. */
export type LetterListRow = { itemId: string; title: string; visibility: string; createdAt: string; sends: SendRow[] };

/** The one line under a letter in the list: the readers send if there is a live one, else where the letter is. */
export function listLine(row: LetterListRow): string {
  const last = latestReaders(row.sends);
  if (last?.status === "approved") return `Approved ${formatTime(last.approvedAt)}`;
  if (last?.status === "sending") return "Sending";
  if (last?.status === "sent") return `Sent to ${last.recipientsSent ?? last.recipientsAtApproval} on ${day(last.sentAt, last.approvedAt)}`;
  if (last?.status === "failed") return `Not sent: ${last.problem ?? "no reason was recorded."}`;
  if (last?.status === "expired") return "Not sent: the approval ran out after 24 hours.";
  return row.visibility === "public" ? "On the archive. Not sent." : "Private. Not on the archive yet.";
}
