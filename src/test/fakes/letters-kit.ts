import { createLetterPorts, type LetterPorts } from "@/lib/providers";
import { entriesOf, LetterError } from "@/modules/distribution";
import type { IssuedConfirmation, LetterSource, LetterView, LettersReads, LettersRpc, SendKind, SendRow } from "@/modules/distribution";

// Test helper only (never imported by a route, an action or a step): an in-memory stand-in for the service_role doors of migrations 0024
// and 0025 that keeps their rules (one claim at a time, a 10-minute lease, forward-only status, 50 confirmations a day, the live-approval
// answers), and ports made from the FIXTURE transport behind the real approval guard. Nothing here reaches a network.

export type Reader = { id: string; email: string; status: "waiting" | "sent" | "confirmed"; sentAt: string | null; token: string | null };
export const ADMIN = "00000000-0000-4000-8000-0000000000aa";
export const LEASE_MS = 10 * 60_000;

export type FakeRpc = LettersRpc & {
  clock: { now: number };
  sends: SendRow[];
  readers: Reader[];
  signup: boolean;
  /** Make the next `finish` with this status throw once, as a database that dropped the call. */
  failFinish: (status: "sending" | "sent" | "failed") => void;
  addReader: (email: string, status?: Reader["status"]) => Reader;
  calls: string[];
};

export function createFakeRpc(): FakeRpc {
  const clock = { now: Date.parse("2026-10-16T05:00:00Z") };
  const sends: SendRow[] = [];
  const readers: Reader[] = [];
  const calls: string[] = [];
  const failing = new Set<string>();
  let seq = 0;
  let issuedToday = 0;
  const iso = () => new Date(clock.now).toISOString();
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const copy = (row: SendRow): SendRow => ({ ...row });
  const live = (kind: string) => (s: SendRow) => s.kind === kind && !["failed", "expired", "cancelled"].includes(s.status);

  const rpc: FakeRpc = {
    clock, sends, readers, calls, signup: false,
    failFinish: (status) => void failing.add(status),
    addReader(email, status = "confirmed") {
      const reader: Reader = { id: uuid(1000 + readers.length), email, status, sentAt: null, token: null };
      readers.push(reader);
      return reader;
    },
    async approve(actor, itemId, revisionId, kind: SendKind) {
      calls.push("approve");
      if (actor !== ADMIN) throw new LetterError("letter-refused");
      if (kind === "subscribers") {
        if (sends.some((s) => s.itemId === itemId && live("subscribers")(s))) throw new LetterError("letter-already-sent");
        if (sends.some((s) => live("subscribers")(s) && ["approved", "sending"].includes(s.status))) throw new LetterError("letter-another-sending");
      } else if (sends.filter((s) => s.kind === "self_test").length >= 5) throw new LetterError("letter-test-limit");
      const row: SendRow = {
        id: uuid(++seq), itemId, revisionId, kind, status: "approved", approvedAt: iso(), claimedAt: null, broadcastId: null,
        recipientsAtApproval: kind === "subscribers" ? readers.filter((r) => r.status === "confirmed").length : 1, recipientsSent: null, sentAt: null, problem: null,
      };
      sends.push(row);
      return copy(row);
    },
    async cancel(actor, sendId) {
      calls.push("cancel");
      const row = sends.find((s) => s.id === sendId);
      if (!row) throw new LetterError("letter-send-not-found");
      if (row.status !== "approved") throw new LetterError("letter-cannot-cancel");
      row.status = "cancelled";
      return copy(row);
    },
    async claim() {
      calls.push("claim");
      // No await before the change: two callers at once can never get the same row (the database serialises the same way).
      const row =
        sends.find((s) => s.status === "sending" && s.claimedAt !== null && Date.parse(s.claimedAt) < clock.now - LEASE_MS) ??
        sends.find((s) => s.status === "approved");
      if (!row) return null;
      row.status = "sending";
      row.claimedAt = iso();
      return copy(row);
    },
    async finish(sendId, status, broadcastId, recipients, problem) {
      calls.push(`finish:${status}`);
      if (failing.delete(status)) throw new Error("the database dropped the call");
      const row = sends.find((s) => s.id === sendId);
      if (!row) throw new Error("no such send");
      if (row.status !== "sending") throw new Error(`the send is ${row.status}, not sending`);
      if (broadcastId && row.broadcastId && broadcastId !== row.broadcastId) throw new Error("the send already has a broadcast");
      row.status = status;
      row.broadcastId = row.broadcastId ?? broadcastId;
      if (status === "sent") Object.assign(row, { sentAt: iso(), recipientsSent: recipients });
      if (status === "failed") row.problem = (problem ?? "").slice(0, 160);
      return copy(row);
    },
    async issueConfirmations(actor, ids) {
      calls.push("issue");
      if (actor !== ADMIN) throw new LetterError("letter-refused");
      const out: IssuedConfirmation[] = [];
      for (const reader of readers.filter((r) => ids.includes(r.id) && r.status === "waiting")) {
        if (issuedToday >= 50) break;
        issuedToday += 1;
        reader.status = "sent";
        reader.sentAt = iso();
        reader.token = `token-${reader.id.slice(-4)}-${"x".repeat(30)}`;
        out.push({ id: reader.id, email: reader.email, token: reader.token, sentAt: reader.sentAt });
      }
      return out;
    },
    async confirmationFailed(id) {
      calls.push("confirmation-failed");
      const reader = readers.find((r) => r.id === id && r.status === "sent");
      if (reader) Object.assign(reader, { status: "waiting", sentAt: null, token: null });
    },
    async bin(_actor, ids) {
      const gone = readers.filter((r) => ids.includes(r.id) && r.status === "waiting");
      for (const r of gone) readers.splice(readers.indexOf(r), 1);
      return gone.length;
    },
    async erase(_actor, id) {
      const at = readers.findIndex((r) => r.id === id);
      if (at >= 0) readers.splice(at, 1);
      return at >= 0 ? 1 : 0;
    },
    async purge() {
      calls.push("purge");
      return 0;
    },
    async markLeft(emails) {
      calls.push("mark-left");
      const gone = readers.filter((r) => emails.includes(r.email));
      for (const r of gone) readers.splice(readers.indexOf(r), 1);
      return gone.length;
    },
    async confirmedEmails() {
      return readers.filter((r) => r.status === "confirmed").map((r) => r.email);
    },
    async setSignup(_actor, on) {
      rpc.signup = on;
      return on;
    },
    // The live-approval answers, as letters_send_live and letters_confirmation_live give them.
    async sendIsLive(sendId, kind, broadcastId) {
      const row = sends.find((s) => s.id === sendId && s.kind === kind);
      return Boolean(row && row.status === "sending" && row.claimedAt !== null && Date.parse(row.claimedAt) > clock.now - LEASE_MS && row.broadcastId === broadcastId);
    },
    async confirmationIsLive(subscriberId, email, sentAt) {
      const r = readers.find((x) => x.id === subscriberId && x.email === email.trim().toLowerCase());
      return Boolean(r && r.status === "sent" && r.sentAt === sentAt && Date.parse(sentAt) > clock.now - 3_600_000);
    },
  };
  return rpc;
}

/** The ports of the fixture transport, behind the real approval guard, asking this fake. A test reads what was "sent" with peekFixtureLetters(). */
export function fixturePorts(rpc: FakeRpc, adminEmail = "admin@desk.test"): LetterPorts {
  const ports = createLetterPorts({ ADMIN_EMAIL: adminEmail, DISTRIBUTION_ADAPTER: "fixture" }, { approvals: rpc });
  if (!ports) throw new Error("the fixture ports are off");
  return ports;
}

/** A source that holds one letter as the public sees it. `view.revisionId` must equal the send's. */
export function fakeSource(view: LetterView | null): LetterSource & { loads: number } {
  const source = {
    loads: 0,
    async load(itemId: string, revisionId: string) {
      source.loads += 1;
      return view && view.itemId === itemId && view.revisionId === revisionId && entriesOf({ schema: "letter/1", entries: view.entries }) ? view : null;
    },
  };
  return source;
}

export type FakeReads = LettersReads & { passes: Map<string, string>; last: string | null; rpc: FakeRpc };

/** The admin session's reads, over the fake database: pass times and the last sent time are set by the test; readers and sends come from `rpc`. */
export function fakeReads(rpc: FakeRpc): FakeReads {
  const reads: FakeReads = {
    passes: new Map(),
    last: null,
    rpc,
    async passTimes(ids) {
      return new Map([...reads.passes].filter(([id]) => ids.includes(id)));
    },
    async lastSentAt() {
      return reads.last;
    },
    async confirmedCount() {
      return rpc.readers.filter((r) => r.status === "confirmed").length;
    },
    async readerIdByEmail(email) {
      return rpc.readers.find((r) => r.email === email.trim().toLowerCase())?.id ?? null;
    },
    async readerCounts() {
      const n = (status: Reader["status"]) => rpc.readers.filter((r) => r.status === status).length;
      return { waiting: n("waiting"), asked: n("sent"), confirmed: n("confirmed") };
    },
    async sendsOf(itemId) {
      return rpc.sends.filter((s) => s.itemId === itemId).map((s) => ({ ...s }));
    },
    async sendsForItems(ids) {
      return rpc.sends.filter((s) => ids.includes(s.itemId)).map((s) => ({ ...s }));
    },
    async waiting() {
      return rpc.readers.filter((r) => r.status === "waiting").map((r) => ({ id: r.id, email: r.email, requestedAt: "2026-10-15T05:00:00Z" }));
    },
    async confirmationsLeftToday() {
      return 50;
    },
    async signupOn() {
      return rpc.signup;
    },
  };
  return reads;
}
