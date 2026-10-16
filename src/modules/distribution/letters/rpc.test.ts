import { describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/errors";
import type { Db } from "@/lib/supabase/types";
import { LetterError } from "./errors";
import { createLettersRpc } from "./rpc";

// The service_role doors of migrations 0024 and 0025, as one port. A fake client records each call by name and arguments and answers as set.
type Answer = { data?: unknown; error?: { message: string; code?: string } };
function fakeDb(answers: Record<string, Answer | (() => Answer)> = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args });
      const a = answers[name];
      const answer = typeof a === "function" ? a() : a ?? {};
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
  } as unknown as Db;
  return { db, calls };
}
const ID = "10000000-0000-4000-8000-000000000001";
const ACTOR = "aaaaaaaa-0000-4000-8000-000000000001";
const row = (patch: Record<string, unknown> = {}) => ({
  id: ID, item_id: "i", revision_id: "r", gate_decision_id: "g", kind: "subscribers", status: "approved", approved_by: ACTOR, approved_at: "2026-10-16T05:00:00+00:00",
  recipients_at_approval: 2, claimed_at: null, broadcast_id: null, recipients_sent: null, sent_at: null, problem: null, ...patch,
});

describe("approve and cancel (the desk's doors, with the admin as actor)", () => {
  it("passes the actor and the exact ids, and returns the row in the module's shape", async () => {
    const { db, calls } = fakeDb({ approve_letter_send: { data: row() } });
    const out = await createLettersRpc(db).approve(ACTOR, "item", "rev", "subscribers");
    expect(calls).toEqual([{ name: "approve_letter_send", args: { p_actor: ACTOR, p_item_id: "item", p_revision_id: "rev", p_kind: "subscribers" } }]);
    expect(out).toEqual({
      id: ID, itemId: "i", revisionId: "r", kind: "subscribers", status: "approved", approvedAt: "2026-10-16T05:00:00+00:00", claimedAt: null, broadcastId: null,
      recipientsAtApproval: 2, recipientsSent: null, sentAt: null, problem: null,
    });
  });

  it.each([
    ["This is not a letter.", "letter-not-a-letter"],
    ["Another letter is being sent. Wait until it has gone.", "letter-another-sending"],
    ["5 test copies sent today. The next can go tomorrow.", "letter-test-limit"],
    ["Entry 2 changed or is no longer public. Make the letter again.", "letter-refused"],
  ])("turns the database's refusal %j into the fixed code %s", async (message, code) => {
    const { db } = fakeDb({ approve_letter_send: { error: { message, code: "55000" } } });
    await expect(createLettersRpc(db).approve(ACTOR, "i", "r", "subscribers")).rejects.toMatchObject({ code });
  });

  it("turns a non-admin refusal into access denied, and anything else into an error that holds no row data", async () => {
    const denied = fakeDb({ approve_letter_send: { error: { message: "approve_letter_send: admin only", code: "42501" } } });
    await expect(createLettersRpc(denied.db).approve("x", "i", "r", "subscribers")).rejects.toBeInstanceOf(AccessDeniedError);
    const broken = fakeDb({ approve_letter_send: { error: { message: 'secret address "a@b.example" in detail', code: "XX000" } } });
    const error = await createLettersRpc(broken.db).approve(ACTOR, "i", "r", "subscribers").catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toContain("a@b.example");
  });

  it("cancels by id; an unknown id and a send already claimed have their own codes", async () => {
    const { db, calls } = fakeDb({ cancel_letter_send: { data: row({ status: "cancelled" }) } });
    expect((await createLettersRpc(db).cancel(ACTOR, ID)).status).toBe("cancelled");
    expect(calls[0]).toEqual({ name: "cancel_letter_send", args: { p_actor: ACTOR, p_id: ID } });
    const missing = fakeDb({ cancel_letter_send: { error: { message: "This send could not be found.", code: "P0002" } } });
    await expect(createLettersRpc(missing.db).cancel(ACTOR, ID)).rejects.toMatchObject({ code: "letter-send-not-found" });
    const late = fakeDb({ cancel_letter_send: { error: { message: "Only a send that is still waiting can be cancelled.", code: "55000" } } });
    await expect(createLettersRpc(late.db).cancel(ACTOR, ID)).rejects.toBeInstanceOf(LetterError);
  });

  it("refuses a row of a state it does not know rather than guess", async () => {
    const { db } = fakeDb({ approve_letter_send: { data: row({ status: "teleported" }) } });
    await expect(createLettersRpc(db).approve(ACTOR, "i", "r", "subscribers")).rejects.toThrow();
  });
});

describe("claim and finish (the step's doors)", () => {
  it("claim returns the row, or null for the row of nulls the database gives when there is nothing to send", async () => {
    const some = fakeDb({ claim_letter_send: { data: row({ status: "sending", claimed_at: "2026-10-16T05:01:00+00:00" }) } });
    expect(await createLettersRpc(some.db).claim()).toMatchObject({ id: ID, status: "sending" });
    const nulls = fakeDb({ claim_letter_send: { data: { id: null, status: null } } });
    expect(await createLettersRpc(nulls.db).claim()).toBeNull();
    const none = fakeDb({ claim_letter_send: { data: null } });
    expect(await createLettersRpc(none.db).claim()).toBeNull();
  });

  it("finish sends the status, the broadcast, the count and the problem, and nothing else", async () => {
    const { db, calls } = fakeDb({ finish_letter_send: { data: row({ status: "sent", broadcast_id: "bc", recipients_sent: 2 }) } });
    const out = await createLettersRpc(db).finish(ID, "sent", "bc", 2, null);
    expect(calls[0]).toEqual({ name: "finish_letter_send", args: { p_id: ID, p_status: "sent", p_broadcast_id: "bc", p_recipients: 2, p_problem: null } });
    expect(out).toMatchObject({ status: "sent", broadcastId: "bc", recipientsSent: 2 });
  });

  it("a failure of a job door names the operation and the code only", async () => {
    const { db } = fakeDb({ claim_letter_send: { error: { message: "row data 'a@b.example'", code: "40001" } } });
    let text = "";
    try {
      await createLettersRpc(db).claim();
    } catch (error) {
      text = (error as Error).message;
    }
    expect(text).toContain("claim");
    expect(text).not.toContain("a@b.example");
  });
});

describe("readers", () => {
  it("issues confirmations for the chosen ids and returns the links' tokens once, in the module's shape", async () => {
    const { db, calls } = fakeDb({ letters_issue_confirmations: { data: [{ id: ID, email: "a@b.example", token: "T", sent_at: "2026-10-16T05:00:00.123456+00:00" }] } });
    expect(await createLettersRpc(db).issueConfirmations(ACTOR, [ID])).toEqual([{ id: ID, email: "a@b.example", token: "T", sentAt: "2026-10-16T05:00:00.123456+00:00" }]);
    expect(calls[0]).toEqual({ name: "letters_issue_confirmations", args: { p_actor: ACTOR, p_ids: [ID] } });
  });

  it("reads the confirmed addresses, counts what bin, erase, purge and mark-left removed, and sets sign-up", async () => {
    const { db, calls } = fakeDb({
      confirmed_subscribers: { data: [{ email: "a@b.example" }, { email: "c@d.example" }] }, letters_bin: { data: 2 }, letters_erase: { data: 1 },
      letters_purge: { data: 3 }, letters_mark_left: { data: 1 }, set_letters_signup: { data: true },
    });
    const rpc = createLettersRpc(db);
    expect(await rpc.confirmedEmails()).toEqual(["a@b.example", "c@d.example"]);
    expect(await rpc.bin(ACTOR, [ID])).toBe(2);
    expect(await rpc.erase(ACTOR, ID)).toBe(1);
    expect(await rpc.purge()).toBe(3);
    expect(await rpc.markLeft(["x@y.example"])).toBe(1);
    expect(await rpc.setSignup(ACTOR, true)).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(["confirmed_subscribers", "letters_bin", "letters_erase", "letters_purge", "letters_mark_left", "set_letters_signup"]);
    expect(calls[4]!.args).toEqual({ p_emails: ["x@y.example"] });
  });

  it("confirmation_failed marks one reader", async () => {
    const { db, calls } = fakeDb();
    await createLettersRpc(db).confirmationFailed(ID);
    expect(calls[0]).toEqual({ name: "letters_confirmation_failed", args: { p_id: ID } });
  });
});

describe("the live-approval questions the no-send guard asks (migration 0025)", () => {
  it("is a yes only on exactly true, and a database error is a no", async () => {
    const yes = fakeDb({ letters_send_live: { data: true }, letters_confirmation_live: { data: true } });
    expect(await createLettersRpc(yes.db).sendIsLive(ID, "subscribers", "bc")).toBe(true);
    expect(yes.calls[0]).toEqual({ name: "letters_send_live", args: { p_id: ID, p_kind: "subscribers", p_broadcast_id: "bc" } });
    expect(await createLettersRpc(yes.db).confirmationIsLive(ID, "a@b.example", "2026-10-16T05:00:00.123+00:00")).toBe(true);
    expect(yes.calls[1]).toEqual({ name: "letters_confirmation_live", args: { p_id: ID, p_email: "a@b.example", p_sent_at: "2026-10-16T05:00:00.123+00:00" } });
    for (const answer of [{ data: false }, { data: null }, { data: "true" }, { data: 1 }, { error: { message: "x", code: "XX000" } }]) {
      const no = fakeDb({ letters_send_live: answer, letters_confirmation_live: answer });
      expect(await createLettersRpc(no.db).sendIsLive(ID, "self_test", null)).toBe(false);
      expect(await createLettersRpc(no.db).confirmationIsLive(ID, "a@b.example", "2026-10-16T05:00:00Z")).toBe(false);
    }
  });
});
