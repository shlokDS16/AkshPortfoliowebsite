import { AccessDeniedError } from "@/lib/errors";
import { jobDbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { LetterError, refusalCode } from "./errors";
import type { IssuedConfirmation, LettersRpc, SendKind, SendRow, SendStatus } from "./types";

// The service_role doors of migrations 0024 and 0025 as one port (`LettersRpc`). `db` MUST be the secret-key client: it is handed in by
// ../send-rpc.ts (the desk's actions, after requireAdmin) or by the ops steps (job code), and by nothing else (distribution.graph.test.ts).
// Nothing here puts a database message in an error: a refusal is a fixed code, anything else is the operation and the code only, because
// these errors reach a heartbeat and a desk screen and a message can quote a row (an address).

type Failure = { message: string; code?: string };
const STATUSES: readonly string[] = ["approved", "sending", "sent", "failed", "expired", "cancelled"] satisfies SendStatus[];
const KINDS: readonly string[] = ["self_test", "subscribers"] satisfies SendKind[];

function fail(op: string, error: Failure): never {
  if (error.code === "42501") throw new AccessDeniedError();
  if (error.code === "55000") throw new LetterError(refusalCode(error.message));
  throw jobDbError(`letters.${op}`, error);
}

type SendRecord = {
  id: string; item_id: string; revision_id: string; kind: string; status: string; approved_at: string; claimed_at: string | null; broadcast_id: string | null;
  recipients_at_approval: number; recipients_sent: number | null; sent_at: string | null; problem: string | null;
};

function sendOf(op: string, r: SendRecord): SendRow {
  if (!KINDS.includes(r.kind) || !STATUSES.includes(r.status)) throw jobDbError(`letters.${op}`, { message: "unknown state" });
  return {
    id: r.id, itemId: r.item_id, revisionId: r.revision_id, kind: r.kind as SendKind, status: r.status as SendStatus, approvedAt: r.approved_at,
    claimedAt: r.claimed_at, broadcastId: r.broadcast_id, recipientsAtApproval: r.recipients_at_approval, recipientsSent: r.recipients_sent,
    sentAt: r.sent_at, problem: r.problem,
  };
}

export function createLettersRpc(db: Db): LettersRpc {
  return {
    async approve(actor, itemId, revisionId, kind) {
      const { data, error } = await db.rpc("approve_letter_send", { p_actor: actor, p_item_id: itemId, p_revision_id: revisionId, p_kind: kind });
      if (error) fail("approve", error);
      return sendOf("approve", data);
    },
    async cancel(actor, sendId) {
      const { data, error } = await db.rpc("cancel_letter_send", { p_actor: actor, p_id: sendId });
      if (error?.code === "P0002") throw new LetterError("letter-send-not-found");
      if (error) fail("cancel", error);
      return sendOf("cancel", data);
    },
    async claim() {
      const { data, error } = await db.rpc("claim_letter_send");
      if (error) fail("claim", error);
      // A composite result with nothing to claim arrives as null or as a row of nulls.
      return data && data.id ? sendOf("claim", data) : null;
    },
    async finish(sendId, status, broadcastId, recipients, problem) {
      // The generated types call the nullable arguments plain strings; PostgREST sends a null as null.
      const args = { p_id: sendId, p_status: status, p_broadcast_id: broadcastId, p_recipients: recipients, p_problem: problem };
      const { data, error } = await db.rpc("finish_letter_send", args as unknown as Parameters<typeof db.rpc<"finish_letter_send">>[1]);
      if (error) fail("finish", error);
      return sendOf("finish", data);
    },
    async issueConfirmations(actor, ids) {
      const { data, error } = await db.rpc("letters_issue_confirmations", { p_actor: actor, p_ids: [...ids] });
      if (error) fail("issue", error);
      return (data ?? []).map((r): IssuedConfirmation => ({ id: r.id, email: r.email, token: r.token, sentAt: r.sent_at }));
    },
    async confirmationFailed(id) {
      const { error } = await db.rpc("letters_confirmation_failed", { p_id: id });
      if (error) fail("confirmationFailed", error);
    },
    async bin(actor, ids) {
      const { data, error } = await db.rpc("letters_bin", { p_actor: actor, p_ids: [...ids] });
      if (error) fail("bin", error);
      return typeof data === "number" ? data : 0;
    },
    async erase(actor, id) {
      const { data, error } = await db.rpc("letters_erase", { p_actor: actor, p_id: id });
      if (error) fail("erase", error);
      return typeof data === "number" ? data : 0;
    },
    async purge() {
      const { data, error } = await db.rpc("letters_purge");
      if (error) fail("purge", error);
      return typeof data === "number" ? data : 0;
    },
    async markLeft(emails) {
      const { data, error } = await db.rpc("letters_mark_left", { p_emails: [...emails] });
      if (error) fail("markLeft", error);
      return typeof data === "number" ? data : 0;
    },
    async confirmedEmails() {
      const { data, error } = await db.rpc("confirmed_subscribers");
      if (error) fail("confirmed", error);
      return (data ?? []).map((r) => r.email);
    },
    async setSignup(actor, on) {
      const { data, error } = await db.rpc("set_letters_signup", { p_actor: actor, p_on: on });
      if (error) fail("signup", error);
      return data === true;
    },
    // The no-send guard's two questions. A yes only on exactly `true`; an error is a no (nothing is sent), and is not thrown.
    async sendIsLive(sendId, kind, broadcastId) {
      const { data, error } = await db.rpc("letters_send_live", { p_id: sendId, p_kind: kind, p_broadcast_id: broadcastId as string });
      return !error && data === true;
    },
    async confirmationIsLive(subscriberId, email, sentAt) {
      const { data, error } = await db.rpc("letters_confirmation_live", { p_id: subscriberId, p_email: email, p_sent_at: sentAt });
      return !error && data === true;
    },
  };
}
