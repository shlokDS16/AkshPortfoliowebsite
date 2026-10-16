import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFixtureLetters,
  FIXTURE_SEGMENT_ID,
  fixtureLettersDirectory,
  peekFixtureLetters,
  resetFixtureLetters,
  unsubscribeFixtureContact,
} from "./fixture-letters";

// Phase 5c Task 11: the fixture letters transport (spec s9.4). It never calls the network; it keeps what it was asked to send so the
// e2e can assert that exactly the approved emails were "sent" and none before the press.

afterEach(() => resetFixtureLetters());
const EMAIL = { to: "admin@example.com", subject: "Letter", text: "t", html: "<p>h</p>", idempotencyKey: "self-test-1" };

describe("the fixture letters transport", () => {
  it("records a sent email once per idempotency key, as Resend drops a repeat", async () => {
    const t = createFixtureLetters();
    expect(await t.sendOne(EMAIL)).toMatchObject({ ok: true });
    expect(await t.sendOne(EMAIL)).toMatchObject({ ok: true });
    expect(await t.sendOne({ ...EMAIL, idempotencyKey: "self-test-2" })).toMatchObject({ ok: true });
    expect(peekFixtureLetters().emails.map((e) => e.idempotencyKey)).toEqual(["self-test-1", "self-test-2"]);
  });

  it("a broadcast is a draft until sent; sending delivers to the segment's subscribed contacts only, once", async () => {
    const t = createFixtureLetters();
    await t.upsertContact("One@Example.org");
    await t.upsertContact("two@example.org");
    unsubscribeFixtureContact("two@example.org");
    const created = await t.createBroadcast({ name: "letter-1", subject: "S", html: "h", text: "t" });
    if (!created.ok) throw new Error("not created");
    expect(await t.getBroadcast(created.value.id)).toEqual({ ok: true, value: { id: created.value.id, name: "letter-1", segmentId: FIXTURE_SEGMENT_ID, status: "draft" } });
    expect(peekFixtureLetters().broadcasts[0].recipients).toEqual([]);
    expect(await t.sendBroadcast(created.value.id)).toEqual({ ok: true, value: null });
    expect(peekFixtureLetters().broadcasts[0]).toMatchObject({ status: "sent", recipients: ["one@example.org"] });
    expect(await t.sendBroadcast(created.value.id)).toMatchObject({ ok: false, kind: "refused" });
    expect(await t.getBroadcast("49a3999c-0ce1-4ea6-ab68-afcd6dc2e794")).toMatchObject({ ok: false, kind: "not_found" });
  });

  it("the contact mirror keeps a reader's unsubscribe, and deleting an absent contact is a success", async () => {
    const t = createFixtureLetters({ segmentId: "78261eea-8f8b-4381-83c6-79fa7120f1cf" });
    await t.upsertContact("a@example.org");
    unsubscribeFixtureContact("a@example.org");
    await t.upsertContact("a@example.org");
    const listed = await t.listContacts();
    expect(listed.ok && listed.value.map(({ email, unsubscribed }) => ({ email, unsubscribed }))).toEqual([{ email: "a@example.org", unsubscribed: true }]);
    expect(await t.deleteContact("a@example.org")).toEqual({ ok: true, value: null });
    expect(await t.deleteContact("a@example.org")).toEqual({ ok: true, value: null });
    expect(peekFixtureLetters().contacts).toEqual([]);
    expect(t.segmentId).toBe("78261eea-8f8b-4381-83c6-79fa7120f1cf");
  });

  it("peek returns a copy; reset empties the store", async () => {
    const t = createFixtureLetters();
    await t.sendOne(EMAIL);
    const seen = peekFixtureLetters();
    seen.emails.length = 0;
    expect(peekFixtureLetters().emails).toHaveLength(1);
    resetFixtureLetters();
    expect(peekFixtureLetters()).toEqual({ emails: [], broadcasts: [], contacts: [] });
  });

  it("in a directory, a second instance (another process, as the e2e runner is) reads what the first wrote", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fixture-letters-"));
    try {
      await createFixtureLetters({ directory }).sendOne(EMAIL);
      expect(peekFixtureLetters({ directory }).emails).toHaveLength(1);
      expect(peekFixtureLetters().emails).toHaveLength(0);
      resetFixtureLetters({ directory });
      expect(peekFixtureLetters({ directory }).emails).toHaveLength(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    expect(fixtureLettersDirectory("http://127.0.0.1:54321")).toBe(fixtureLettersDirectory("http://127.0.0.1:54321"));
    expect(fixtureLettersDirectory("http://127.0.0.1:54321")).not.toBe(fixtureLettersDirectory("http://localhost:54321"));
  });

  it("never calls fetch", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const t = createFixtureLetters();
    await t.sendOne(EMAIL);
    await t.upsertContact("a@example.org");
    const b = await t.createBroadcast({ name: "n", subject: "s", html: "h", text: "t" });
    if (b.ok) await t.sendBroadcast(b.value.id);
    await t.listContacts();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
