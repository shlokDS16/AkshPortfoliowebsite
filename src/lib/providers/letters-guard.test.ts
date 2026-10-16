import { describe, expect, it, vi } from "vitest";
import type { ApprovalCheck, BroadcastView, LetterResult, LetterTransport } from "./letters";
import { guardLetterTransport } from "./letters-guard";

// Phase 5c Task 11: nothing leaves without a live approval for exactly that send (spec s9.2). The transport here is a fake that
// records every call; the approval check is a fake standing in for letters_send_live / letters_confirmation_live (0025).

const SEG = "78261eea-8f8b-4381-83c6-79fa7120f1cf";
const SEND = "f8000000-0000-4000-8000-000000000001";
const BID = "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794";
const ADMIN = "admin@example.com";
const LETTER = { subject: "Letter", html: "<p>h</p>", text: "t" };
const CONFIRM = { subscriberId: "c8000000-0000-4000-8000-000000000001", email: "reader@example.org", sentAt: "2026-10-16T10:00:00.123456+00:00" };

const ok = <T>(value: T): LetterResult<T> => ({ ok: true, value });
function fakeTransport(broadcast: Partial<BroadcastView> = {}) {
  const calls: string[] = [];
  const transport: LetterTransport & { calls: string[]; emails: unknown[] } = {
    name: "fixture",
    segmentId: SEG,
    calls,
    emails: [],
    async sendOne(email) { calls.push("sendOne"); transport.emails.push(email); return ok({ id: "e-1" }); },
    async createBroadcast(draft) { calls.push(`createBroadcast:${draft.name}`); return ok({ id: BID }); },
    async getBroadcast(id) { calls.push("getBroadcast"); return ok({ id, name: `letter-${SEND}`, segmentId: SEG, status: "draft", ...broadcast }); },
    async sendBroadcast() { calls.push("sendBroadcast"); return ok(null); },
    async listContacts() { calls.push("listContacts"); return ok([]); },
    async upsertContact() { calls.push("upsertContact"); return ok(null); },
    async deleteContact() { calls.push("deleteContact"); return ok(null); },
  };
  return transport;
}
const approvals = (live: boolean | "throw" = true): ApprovalCheck & { asked: unknown[][] } => {
  const asked: unknown[][] = [];
  const answer = async (...args: unknown[]) => {
    asked.push(args);
    if (live === "throw") throw new Error("database down");
    return live;
  };
  return { asked, sendIsLive: answer, confirmationIsLive: answer };
};
const guarded = (t: LetterTransport, check: ApprovalCheck) => guardLetterTransport(t, { approvals: check, adminEmail: ADMIN });

describe("no approval, no call", () => {
  it.each([[false], ["throw" as const]])("with the check answering %s, every send method calls nothing", async (answer) => {
    const t = fakeTransport();
    const { sender } = guarded(t, approvals(answer));
    for (const out of [
      await sender.sendSelfTest({ sendId: SEND }, LETTER),
      await sender.sendConfirmation(CONFIRM, { subject: "Confirm", text: "Open the link." }),
      await sender.createBroadcast({ sendId: SEND }, LETTER),
      await sender.sendBroadcast({ sendId: SEND }, BID),
    ]) {
      expect(out).toEqual({ ok: false, kind: "not_approved", message: "No approved send matches this." });
    }
    expect(t.calls).toEqual([]);
  });
});

describe("with a live approval", () => {
  it("a self test goes to ADMIN_EMAIL only, keyed by the send", async () => {
    const t = fakeTransport();
    const check = approvals();
    expect(await guarded(t, check).sender.sendSelfTest({ sendId: SEND }, LETTER)).toEqual({ ok: true, value: null });
    expect(check.asked).toEqual([[SEND, "self_test", null]]);
    expect(t.emails).toEqual([{ to: ADMIN, subject: "Letter", html: "<p>h</p>", text: "t", idempotencyKey: `self-test-${SEND}` }]);
  });

  it("a confirmation goes to the reader it was issued to, keyed confirm-{id}-{sent_at}, plain text", async () => {
    const t = fakeTransport();
    const check = approvals();
    expect(await guarded(t, check).sender.sendConfirmation(CONFIRM, { subject: "Confirm", text: "Open the link." })).toEqual({ ok: true, value: null });
    expect(check.asked).toEqual([[CONFIRM.subscriberId, CONFIRM.email, CONFIRM.sentAt]]);
    expect(t.emails).toEqual([{ to: CONFIRM.email, subject: "Confirm", text: "Open the link.", idempotencyKey: `confirm-${CONFIRM.subscriberId}-${CONFIRM.sentAt}` }]);
  });

  it("a draft is created only before a broadcast id is recorded, and is named for the send", async () => {
    const t = fakeTransport();
    const check = approvals();
    expect(await guarded(t, check).sender.createBroadcast({ sendId: SEND }, LETTER)).toEqual({ ok: true, value: { id: BID } });
    expect(check.asked).toEqual([[SEND, "subscribers", null]]);
    expect(t.calls).toEqual([`createBroadcast:letter-${SEND}`]);
  });

  it("sends the recorded draft after reading it: approval for that broadcast id, then GET, then send", async () => {
    const t = fakeTransport();
    const check = approvals();
    expect(await guarded(t, check).sender.sendBroadcast({ sendId: SEND }, BID)).toEqual({ ok: true, value: "sent_now" });
    expect(check.asked).toEqual([[SEND, "subscribers", BID]]);
    expect(t.calls).toEqual(["getBroadcast", "sendBroadcast"]);
  });

  it.each(["scheduled", "queued", "sent"] as const)("a broadcast Resend already has (%s) is not sent again", async (status) => {
    const t = fakeTransport({ status });
    expect(await guarded(t, approvals()).sender.sendBroadcast({ sendId: SEND }, BID)).toEqual({ ok: true, value: "already_sent" });
    expect(t.calls).toEqual(["getBroadcast"]);
  });

  it.each([
    ["canceled", { status: "canceled" as const }],
    ["unknown", { status: "unknown" as const }],
    ["named for another send", { name: "letter-someone-else" }],
    ["in another segment", { segmentId: "00000000-0000-4000-8000-000000000000" }],
  ])("a broadcast that is %s is refused and not sent", async (_label, broadcast) => {
    const t = fakeTransport(broadcast);
    expect(await guarded(t, approvals()).sender.sendBroadcast({ sendId: SEND }, BID)).toMatchObject({ ok: false, kind: "not_approved" });
    expect(t.calls).toEqual(["getBroadcast"]);
  });

  it("a failed read is passed on and nothing is sent", async () => {
    const t = fakeTransport();
    t.getBroadcast = vi.fn(async () => ({ ok: false as const, kind: "unavailable" as const, message: "Resend answered 503" }));
    expect(await guarded(t, approvals()).sender.sendBroadcast({ sendId: SEND }, BID)).toEqual({ ok: false, kind: "unavailable", message: "Resend answered 503" });
    expect(t.calls).toEqual([]);
  });

  it("an approval with an id that is not a uuid is refused before the database is asked", async () => {
    const t = fakeTransport();
    const check = approvals();
    const { sender } = guarded(t, check);
    expect(await sender.sendSelfTest({ sendId: "x" }, LETTER)).toMatchObject({ kind: "not_approved" });
    expect(await sender.sendConfirmation({ ...CONFIRM, subscriberId: "../x" }, { subject: "s", text: "t" })).toMatchObject({ kind: "not_approved" });
    expect(check.asked).toEqual([]);
    expect(t.calls).toEqual([]);
  });
});

describe("reads and the contact mirror need no approval, and send nothing", () => {
  it("passes through to the transport", async () => {
    const t = fakeTransport();
    const ports = guarded(t, approvals(false));
    await ports.sender.getBroadcast(BID);
    await ports.contacts.listContacts();
    await ports.contacts.upsertContact("a@example.org");
    await ports.contacts.deleteContact("a@example.org");
    expect(t.calls).toEqual(["getBroadcast", "listContacts", "upsertContact", "deleteContact"]);
    expect(ports.name).toBe("fixture");
  });

  it("the ports expose no transport and no send-one method", () => {
    const ports = guarded(fakeTransport(), approvals());
    expect(Object.keys(ports).sort()).toEqual(["contacts", "name", "sender"]);
    expect(Object.keys(ports.sender).sort()).toEqual(["createBroadcast", "getBroadcast", "name", "sendBroadcast", "sendConfirmation", "sendSelfTest"]);
  });
});
