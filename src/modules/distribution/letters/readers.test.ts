import { beforeEach, describe, expect, it } from "vitest";
import { peekFixtureLetters, resetFixtureLetters, unsubscribeFixtureContact } from "@/lib/providers/fixture-letters";
import type { ContactMirror, LetterPorts } from "@/lib/providers";
import { LetterError } from "./errors";
import { reconcileContacts, sendConfirmations } from "./readers";
import { ADMIN, createFakeRpc, fixturePorts, type FakeRpc } from "@/test/fakes/letters-kit";

const SITE = "https://desk.example";
let rpc: FakeRpc;
let ports: LetterPorts;
beforeEach(() => {
  resetFixtureLetters();
  rpc = createFakeRpc();
  ports = fixturePorts(rpc);
});
const contactEmails = () => peekFixtureLetters().contacts.map((c) => c.email).sort();

describe("reconcileContacts: Resend's list is made equal to the readers confirmed here (spec s8.5)", () => {
  it("adds every confirmed reader the segment does not have", async () => {
    rpc.addReader("a@example.com");
    rpc.addReader("b@example.com");
    const result = await reconcileContacts({ rpc, contacts: ports.contacts });
    expect(result).toMatchObject({ ok: true, added: 2, deleted: 0, left: 0, readers: 2, complete: true });
    expect(contactEmails()).toEqual(["a@example.com", "b@example.com"]);
  });

  it("deletes every contact that is not confirmed here, whatever its state here", async () => {
    rpc.addReader("a@example.com");
    rpc.addReader("waiting@example.com", "waiting");
    for (const email of ["a@example.com", "waiting@example.com", "stranger@example.com"]) await ports.contacts.upsertContact(email);
    const result = await reconcileContacts({ rpc, contacts: ports.contacts });
    expect(result).toMatchObject({ ok: true, added: 0, deleted: 2, readers: 1 });
    expect(contactEmails()).toEqual(["a@example.com"]);
  });

  it("erases here every address Resend reports unsubscribed, then removes the contact there too", async () => {
    rpc.addReader("a@example.com");
    rpc.addReader("gone@example.com");
    await ports.contacts.upsertContact("a@example.com");
    await ports.contacts.upsertContact("gone@example.com");
    unsubscribeFixtureContact("gone@example.com");
    const result = await reconcileContacts({ rpc, contacts: ports.contacts });
    expect(result).toMatchObject({ ok: true, left: 1, deleted: 1, added: 0, readers: 1 });
    expect(rpc.readers.map((r) => r.email)).toEqual(["a@example.com"]);
    expect(contactEmails()).toEqual(["a@example.com"]);
  });

  it("is case-blind and changes nothing when the two sides agree", async () => {
    rpc.addReader("a@example.com");
    await ports.contacts.upsertContact("A@Example.com");
    const result = await reconcileContacts({ rpc, contacts: ports.contacts });
    expect(result).toMatchObject({ ok: true, added: 0, deleted: 0, left: 0, readers: 1 });
  });

  it("changes nothing at all when Resend's list cannot be read", async () => {
    rpc.addReader("a@example.com");
    const broken: ContactMirror = { ...ports.contacts, listContacts: async () => ({ ok: false, kind: "unavailable", message: "Resend did not answer in time" }) };
    const result = await reconcileContacts({ rpc, contacts: broken });
    expect(result).toMatchObject({ ok: false, failure: { kind: "unavailable" } });
    expect(rpc.calls).not.toContain("mark-left");
    expect(contactEmails()).toEqual([]);
  });

  it("stops with a failure when a delete or an add is refused, so a send does not go on a list that is not right", async () => {
    rpc.addReader("a@example.com");
    await ports.contacts.upsertContact("stranger@example.com");
    const refusing: ContactMirror = { ...ports.contacts, deleteContact: async () => ({ ok: false, kind: "refused", message: "Resend answered 403" }) };
    expect(await reconcileContacts({ rpc, contacts: refusing })).toMatchObject({ ok: false, failure: { kind: "refused" } });
    const noAdd: ContactMirror = { ...ports.contacts, upsertContact: async () => ({ ok: false, kind: "rate_limited", message: "Resend answered 429", retryAfterSeconds: 2 }) };
    expect(await reconcileContacts({ rpc, contacts: noAdd })).toMatchObject({ ok: false, failure: { kind: "rate_limited", retryAfterSeconds: 2 } });
  });

  it("stops when its time is up and says it is not complete (the send then waits)", async () => {
    for (let n = 0; n < 5; n += 1) rpc.addReader(`r${n}@example.com`);
    let t = 0;
    const result = await reconcileContacts({ rpc, contacts: ports.contacts, budgetMs: 2, now: () => t++ });
    expect(result).toMatchObject({ ok: true, complete: false });
    expect(contactEmails().length).toBeLessThan(5);
  });

  it("reports counts only: no address is in what it returns", async () => {
    rpc.addReader("secret.reader@example.com");
    const result = await reconcileContacts({ rpc, contacts: ports.contacts });
    expect(JSON.stringify(result)).not.toContain("secret.reader");
  });
});

describe("sendConfirmations: only the readers Aksh chose, only up to the day's limit, each email through the approval guard", () => {
  const waiting = (n: number) => Array.from({ length: n }, (_, i) => rpc.addReader(`w${i}@example.com`, "waiting"));

  it("issues first, then sends one plain email to each issued reader with their own link", async () => {
    const [one] = waiting(1);
    const result = await sendConfirmations({ rpc, ports, siteUrl: SITE }, ADMIN, [one!.id]);
    expect(result).toEqual({ requested: 1, issued: 1, sent: 1, failed: 0, capped: false });
    const { emails } = peekFixtureLetters();
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: "w0@example.com", subject: "Confirm your letters from Aksh Agrawal" });
    expect(emails[0]!.text).toContain(`${SITE}/letters/confirm?t=${rpc.readers[0]!.token}`);
    expect(emails[0]!.html).toBeUndefined();
    expect(rpc.readers[0]!.status).toBe("sent");
  });

  it("a batch of 60 sends 50 and says so; the other ten stay waiting", async () => {
    const ids = waiting(60).map((r) => r.id);
    const result = await sendConfirmations({ rpc, ports, siteUrl: SITE }, ADMIN, ids);
    expect(result).toEqual({ requested: 60, issued: 50, sent: 50, failed: 0, capped: true });
    expect(peekFixtureLetters().emails).toHaveLength(50);
    expect(rpc.readers.filter((r) => r.status === "waiting")).toHaveLength(10);
  });

  it("puts a reader back to waiting when their email could not be sent, and counts it", async () => {
    const [one, two] = waiting(2);
    const failing: LetterPorts = {
      ...ports,
      sender: { ...ports.sender, sendConfirmation: async (a, e) => (a.subscriberId === one!.id ? { ok: false, kind: "refused", message: "Resend answered 422" } : ports.sender.sendConfirmation(a, e)) },
    };
    const result = await sendConfirmations({ rpc, ports: failing, siteUrl: SITE }, ADMIN, [one!.id, two!.id]);
    expect(result).toMatchObject({ issued: 2, sent: 1, failed: 1 });
    expect(rpc.readers.find((r) => r.id === one!.id)!.status).toBe("waiting");
    expect(rpc.readers.find((r) => r.id === two!.id)!.status).toBe("sent");
  });

  it("stops at the free plan's quota: the readers not yet emailed go back to waiting without a call", async () => {
    const ids = waiting(3).map((r) => r.id);
    let calls = 0;
    const limited: LetterPorts = {
      ...ports,
      sender: { ...ports.sender, sendConfirmation: async () => (calls++, { ok: false, kind: "quota", message: "Resend answered 429: daily_quota_exceeded" }) },
    };
    const result = await sendConfirmations({ rpc, ports: limited, siteUrl: SITE }, ADMIN, ids);
    expect(calls).toBe(1);
    expect(result).toMatchObject({ issued: 3, sent: 0, failed: 3 });
    expect(rpc.readers.every((r) => r.status === "waiting")).toBe(true);
  });

  it("with letters off it asks the database for nothing and sends nothing", async () => {
    const [one] = waiting(1);
    await expect(sendConfirmations({ rpc, ports: null, siteUrl: SITE }, ADMIN, [one!.id])).rejects.toThrow(LetterError);
    expect(rpc.calls).toEqual([]);
    expect(peekFixtureLetters().emails).toEqual([]);
  });

  it("drops anything that is not an id, repeats included, before the database is asked", async () => {
    const [one] = waiting(1);
    const result = await sendConfirmations({ rpc, ports, siteUrl: SITE }, ADMIN, [one!.id, one!.id, "nope", "' or 1=1 --"]);
    expect(result.requested).toBe(1);
    expect(peekFixtureLetters().emails).toHaveLength(1);
  });

  it("a non-admin actor is refused by the database and nothing is sent", async () => {
    const [one] = waiting(1);
    await expect(sendConfirmations({ rpc, ports, siteUrl: SITE }, "00000000-0000-4000-8000-0000000000bb", [one!.id])).rejects.toThrow(LetterError);
    expect(peekFixtureLetters().emails).toEqual([]);
  });

  it("an empty choice sends nothing and does not ask", async () => {
    expect(await sendConfirmations({ rpc, ports, siteUrl: SITE }, ADMIN, [])).toEqual({ requested: 0, issued: 0, sent: 0, failed: 0, capped: false });
    expect(rpc.calls).toEqual([]);
  });
});
