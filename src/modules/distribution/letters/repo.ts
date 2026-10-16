import { istDate, istDayStartUtc } from "@/lib/dates";
import { jobDbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { CONFIRMATIONS_PER_DAY } from "./copy";
import { entriesOf } from "./structured";
import type { LetterSource, LettersReads, SendKind, SendRow, SendStatus } from "./types";

// Reads. Two clients, never the secret-key one:
//  - `createSupabaseLettersReads(db)`: Aksh's own session (the cookie client). The tables it reads are admin-select under row-level
//    security, so a session that is not the admin's reads nothing.
//  - `createPublicLetterSource(db)`: the cookie-less anon client. A send is made from what the public can read, so the email can only ever
//    hold text the gate passed and that is public now.
// Explicit column lists (anon holds column-level grants only).

const SEND_COLUMNS = "id, item_id, revision_id, kind, status, approved_at, claimed_at, broadcast_id, recipients_at_approval, recipients_sent, sent_at, problem";
const CHUNK = 100;

type SendRecord = {
  id: string; item_id: string; revision_id: string; kind: string; status: string; approved_at: string; claimed_at: string | null; broadcast_id: string | null;
  recipients_at_approval: number; recipients_sent: number | null; sent_at: string | null; problem: string | null;
};

const sendOf = (r: SendRecord): SendRow => ({
  id: r.id, itemId: r.item_id, revisionId: r.revision_id, kind: r.kind as SendKind, status: r.status as SendStatus, approvedAt: r.approved_at, claimedAt: r.claimed_at,
  broadcastId: r.broadcast_id, recipientsAtApproval: r.recipients_at_approval, recipientsSent: r.recipients_sent, sentAt: r.sent_at, problem: r.problem,
});

export function createSupabaseLettersReads(db: Db, now: () => Date = () => new Date()): LettersReads {
  return {
    async passTimes(revisionIds) {
      const latest = new Map<string, string>();
      for (let at = 0; at < revisionIds.length; at += CHUNK) {
        const { data, error } = await db.from("gate_decisions").select("revision_id, decided_at").eq("verdict", "pass").in("revision_id", revisionIds.slice(at, at + CHUNK));
        if (error) throw jobDbError("letters.passTimes", error);
        for (const row of data ?? []) {
          const seen = latest.get(row.revision_id);
          if (seen === undefined || Date.parse(row.decided_at) > Date.parse(seen)) latest.set(row.revision_id, row.decided_at);
        }
      }
      return latest;
    },
    async lastSentAt() {
      const { data, error } = await db.from("letter_sends").select("sent_at").eq("kind", "subscribers").eq("status", "sent").order("sent_at", { ascending: false }).limit(1);
      if (error) throw jobDbError("letters.lastSentAt", error);
      return data?.[0]?.sent_at ?? null;
    },
    async confirmedCount() {
      const { count, error } = await db.from("subscribers").select("id", { count: "exact", head: true }).eq("status", "confirmed");
      if (error) throw jobDbError("letters.confirmedCount", error);
      return count ?? 0;
    },
    async readerIdByEmail(email) {
      const { data, error } = await db.from("subscribers").select("id").eq("email", email.trim().toLowerCase()).maybeSingle();
      if (error) throw jobDbError("letters.readerId", error);
      return data?.id ?? null;
    },
    async readerCounts() {
      const count = async (status: string): Promise<number> => {
        const { count: n, error } = await db.from("subscribers").select("id", { count: "exact", head: true }).eq("status", status);
        if (error) throw jobDbError("letters.readerCounts", error);
        return n ?? 0;
      };
      const [waiting, asked, confirmed] = [await count("waiting"), await count("sent"), await count("confirmed")];
      return { waiting, asked, confirmed };
    },
    async sendsForItems(itemIds) {
      if (itemIds.length === 0) return [];
      const { data, error } = await db.from("letter_sends").select(SEND_COLUMNS).in("item_id", [...itemIds]).order("approved_at", { ascending: false });
      if (error) throw jobDbError("letters.sendsForItems", error);
      return (data ?? []).map(sendOf);
    },
    async sendsOf(itemId) {
      const { data, error } = await db.from("letter_sends").select(SEND_COLUMNS).eq("item_id", itemId).order("approved_at", { ascending: false });
      if (error) throw jobDbError("letters.sendsOf", error);
      return (data ?? []).map(sendOf);
    },
    async waiting() {
      const { data, error } = await db.from("subscribers").select("id, email, requested_at").eq("status", "waiting").order("requested_at", { ascending: true }).limit(300);
      if (error) throw jobDbError("letters.waiting", error);
      return (data ?? []).map((r) => ({ id: r.id, email: r.email, requestedAt: r.requested_at }));
    },
    async confirmationsLeftToday() {
      const since = istDayStartUtc(istDate(now()));
      const { count, error } = await db.from("subscriber_events").select("id", { count: "exact", head: true }).eq("event", "sent").gte("at", since);
      if (error) throw jobDbError("letters.confirmationsToday", error);
      return Math.max(0, CONFIRMATIONS_PER_DAY - (count ?? 0));
    },
    async signupOn() {
      const { data, error } = await db.from("letters_signup_events").select("signup_on").order("at", { ascending: false }).limit(1);
      if (error) throw jobDbError("letters.signupOn", error);
      return data?.[0]?.signup_on === true;
    },
  };
}

export function createPublicLetterSource(db: Db): LetterSource {
  return {
    async load(itemId, revisionId) {
      const { data, error } = await db
        .from("public_items")
        .select("id, kind, title, learning_objective, revision_id, body_md, structured")
        .eq("id", itemId)
        .maybeSingle();
      if (error) throw jobDbError("letters.publicLetter", error);
      if (!data || data.kind !== "letter" || data.revision_id !== revisionId || !data.title) return null;
      const entries = entriesOf(data.structured);
      if (!entries) return null;
      return { itemId, revisionId, subject: data.title, objective: data.learning_objective ?? "", note: data.body_md ?? "", entries };
    },
  };
}
