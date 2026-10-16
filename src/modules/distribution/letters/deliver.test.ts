import { beforeEach, describe, expect, it } from "vitest";
import { peekFixtureLetters, resetFixtureLetters, unsubscribeFixtureContact } from "@/lib/providers/fixture-letters";
import type { LetterPorts } from "@/lib/providers";
import { deliverLetter, runLetterSends, type DeliverDeps } from "./deliver";
import { ADMIN, createFakeRpc, fakeSource, fixturePorts, LEASE_MS, type FakeRpc } from "@/test/fakes/letters-kit";
import type { LetterEntry, LetterView, SendRow } from "./types";

const SITE = "https://desk.example";
const ITEM = "10000000-0000-4000-8000-000000000001";
const REV = "20000000-0000-4000-8000-000000000001";
const entry: LetterEntry = {
  revisionId: "30000000-0000-4000-8000-000000000001", kind: "learning", path: "/notes/receivable-days", revNo: 1, detail: "Learning note · R1",
  title: "How to read receivable days", learningObjective: "Learn it.", changeReason: "First version.", holdsPosition: null, companyName: null,
};
const view: LetterView = { itemId: ITEM, revisionId: REV, subject: "What changed on the desk", objective: "One note moved.", note: "A short note.", entries: [entry] };

let rpc: FakeRpc;
let ports: LetterPorts;
let deps: DeliverDeps;
const sentBroadcasts = () => peekFixtureLetters().broadcasts.filter((b) => b.status === "sent");
const approve = (kind: "subscribers" | "self_test" = "subscribers") => rpc.approve(ADMIN, ITEM, REV, kind);

beforeEach(() => {
  resetFixtureLetters();
  rpc = createFakeRpc();
  ports = fixturePorts(rpc);
  rpc.addReader("a@example.com");
  rpc.addReader("b@example.com");
  deps = { rpc, ports, source: fakeSource(view), siteUrl: SITE, now: () => rpc.clock.now };
});

describe("a send to subscribers: reconcile, draft, record, send, record (spec s8.6)", () => {
  it("sends the gated letter once to the confirmed readers and records it as sent", async () => {
    await approve();
    const summary = await runLetterSends(deps);
    expect(summary).toMatchObject({ off: false, sent: 1, failed: 0, deferred: 0 });
    const [broadcast] = sentBroadcasts();
    expect(broadcast).toMatchObject({ name: `letter-${rpc.sends[0]!.id}`, subject: "What changed on the desk" });
    expect(broadcast!.recipients.sort()).toEqual(["a@example.com", "b@example.com"]);
    expect(broadcast!.html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(broadcast!.text).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(broadcast!.text).toContain("How to read receivable days");
    expect(rpc.sends[0]).toMatchObject({ status: "sent", recipientsSent: 2, broadcastId: broadcast!.id });
    expect(peekFixtureLetters().emails).toEqual([]);
  });

  it("records the draft before it sends it", async () => {
    await approve();
    await runLetterSends(deps);
    expect(rpc.calls.filter((c) => c.startsWith("finish") || c === "claim")).toEqual(["claim", "finish:sending", "finish:sent", "claim"]);
  });

  it("sends nothing when nothing is approved, and nothing before a claimed row", async () => {
    expect(await runLetterSends(deps)).toMatchObject({ off: false, sent: 0 });
    expect(peekFixtureLetters().broadcasts).toEqual([]);
    expect(peekFixtureLetters().emails).toEqual([]);
  });

  it("with letters off it does not even claim", async () => {
    await approve();
    expect(await runLetterSends({ ...deps, ports: null })).toEqual({ off: true });
    expect(rpc.calls).not.toContain("claim");
    expect(rpc.sends[0]!.status).toBe("approved");
  });

  it("sends exactly once when the step runs twice at the same moment (the claim)", async () => {
    await approve();
    await Promise.all([runLetterSends(deps), runLetterSends(deps)]);
    expect(sentBroadcasts()).toHaveLength(1);
    expect(peekFixtureLetters().broadcasts).toHaveLength(1);
    expect(rpc.sends[0]!.status).toBe("sent");
  });

  it("sends exactly once after a crash between creating the draft and recording it", async () => {
    await approve();
    rpc.failFinish("sending");
    await expect(runLetterSends(deps)).rejects.toThrow("dropped");
    expect(peekFixtureLetters().broadcasts).toHaveLength(1); // a draft exists; nothing was sent
    expect(sentBroadcasts()).toHaveLength(0);
    rpc.clock.now += LEASE_MS + 1000; // the lease runs out and the send is handed out again
    await runLetterSends(deps);
    expect(sentBroadcasts()).toHaveLength(1);
    expect(rpc.sends[0]).toMatchObject({ status: "sent" });
  });

  it("sends exactly once after a crash between sending and recording that it was sent", async () => {
    await approve();
    rpc.failFinish("sent");
    await expect(runLetterSends(deps)).rejects.toThrow("dropped");
    expect(sentBroadcasts()).toHaveLength(1);
    rpc.clock.now += LEASE_MS + 1000;
    const again = await runLetterSends(deps);
    expect(again).toMatchObject({ sent: 1 });
    expect(sentBroadcasts()).toHaveLength(1); // read first: Resend already has it, so it is not sent again
    expect(peekFixtureLetters().broadcasts).toHaveLength(1);
    expect(rpc.sends[0]).toMatchObject({ status: "sent" });
  });

  it("does not send to a reader who left at Resend: they are erased here first", async () => {
    await ports.contacts.upsertContact("a@example.com");
    await ports.contacts.upsertContact("b@example.com");
    unsubscribeFixtureContact("b@example.com");
    await approve();
    await runLetterSends(deps);
    expect(sentBroadcasts()[0]!.recipients).toEqual(["a@example.com"]);
    expect(rpc.readers.map((r) => r.email)).toEqual(["a@example.com"]);
    expect(rpc.sends[0]).toMatchObject({ recipientsSent: 1 });
  });

  it("fails, sending nothing, when the letter is no longer the public one", async () => {
    await approve();
    const gone = { ...deps, source: fakeSource(null) };
    expect(await runLetterSends(gone)).toMatchObject({ failed: 1, sent: 0 });
    expect(rpc.sends[0]).toMatchObject({ status: "failed", problem: "The letter changed after you approved it." });
    expect(peekFixtureLetters().broadcasts).toEqual([]);
  });

  it("fails, sending nothing, when the letter's record is damaged", async () => {
    await approve();
    const damaged = { ...deps, source: fakeSource({ ...view, entries: [{ ...entry, path: "https://elsewhere.example/x" }] }) };
    expect(await runLetterSends(damaged)).toMatchObject({ failed: 1 });
    expect(peekFixtureLetters().broadcasts).toEqual([]);
  });

  it("fails, sending nothing, when no reader is confirmed", async () => {
    rpc.readers.length = 0;
    await approve();
    expect(await runLetterSends(deps)).toMatchObject({ failed: 1 });
    expect(rpc.sends[0]!.problem).toBe("There are no confirmed readers to send to.");
    expect(peekFixtureLetters().broadcasts).toEqual([]);
  });

  it("puts Resend's refusal on the send, cleaned and short", async () => {
    await approve();
    const refusing: LetterPorts = { ...ports, sender: { ...ports.sender, createBroadcast: async () => ({ ok: false, kind: "refused", message: "Resend answered 403: not allowed" }) } };
    await runLetterSends({ ...deps, ports: refusing });
    expect(rpc.sends[0]).toMatchObject({ status: "failed", problem: "Resend answered 403: not allowed" });
  });

  it("defers, and does not fail the send, when Resend asks it to slow down or does not answer", async () => {
    await approve();
    const slow: LetterPorts = { ...ports, sender: { ...ports.sender, createBroadcast: async () => ({ ok: false, kind: "rate_limited", message: "Resend answered 429", retryAfterSeconds: 3 }) } };
    expect(await runLetterSends({ ...deps, ports: slow })).toMatchObject({ deferred: 1, failed: 0 });
    expect(rpc.sends[0]!.status).toBe("sending");
    rpc.clock.now += LEASE_MS + 1000;
    const down: LetterPorts = { ...ports, sender: { ...ports.sender, createBroadcast: async () => ({ ok: false, kind: "unavailable", message: "Resend did not answer in time" }) } };
    expect(await runLetterSends({ ...deps, ports: down })).toMatchObject({ deferred: 1 });
    expect(rpc.sends[0]!.status).toBe("sending");
    rpc.clock.now += LEASE_MS + 1000;
    expect(await runLetterSends(deps)).toMatchObject({ sent: 1 });
  });

  it("stops waiting after a day: an approval that Resend never answered becomes a failure", async () => {
    await approve();
    const down: LetterPorts = { ...ports, sender: { ...ports.sender, createBroadcast: async () => ({ ok: false, kind: "unavailable", message: "Resend did not answer in time" }) } };
    await runLetterSends({ ...deps, ports: down });
    rpc.clock.now += 25 * 3_600_000;
    expect(await runLetterSends({ ...deps, ports: down })).toMatchObject({ failed: 1, deferred: 0 });
    expect(rpc.sends[0]).toMatchObject({ status: "failed", problem: "Resend did not answer in time" });
  });

  it("fails on the free plan's quota", async () => {
    await approve();
    const full: LetterPorts = { ...ports, sender: { ...ports.sender, createBroadcast: async () => ({ ok: false, kind: "quota", message: "Resend answered 429: monthly_quota_exceeded" }) } };
    expect(await runLetterSends({ ...deps, ports: full })).toMatchObject({ failed: 1 });
  });

  it("waits when the list could not be made equal in time, and sends nothing", async () => {
    for (let n = 0; n < 5; n += 1) rpc.addReader(`r${n}@example.com`);
    await approve();
    let t = 0;
    expect(await runLetterSends({ ...deps, now: () => (t += 10_000) })).toMatchObject({ deferred: 1, sent: 0 });
    expect(peekFixtureLetters().broadcasts).toEqual([]);
  });

  it("does not send a letter whose state the database no longer calls sending", async () => {
    await approve();
    const row = (await rpc.claim()) as SendRow;
    rpc.sends[0]!.status = "failed";
    const outcome = await deliverLetter(row, deps).catch((error: unknown) => error);
    expect(outcome).not.toMatchObject({ status: "sent" });
    expect(peekFixtureLetters().broadcasts).toEqual([]);
  });
});

describe("a re-leased send whose broadcast already exists is never failed while it may have gone out (review finding 1)", () => {
  const crashAfterSend = async () => {
    await approve();
    rpc.failFinish("sent");
    await expect(runLetterSends(deps)).rejects.toThrow("dropped");
    expect(sentBroadcasts()).toHaveLength(1);
    rpc.clock.now += LEASE_MS + 1000;
  };
  const withSender = (over: Partial<LetterPorts["sender"]>): LetterPorts => ({ ...ports, sender: { ...ports.sender, ...over } });

  it("records sent, not failed, when the letter was unpublished after the send went out", async () => {
    await crashAfterSend();
    const gone = { ...deps, source: fakeSource(null) };
    expect(await runLetterSends(gone)).toMatchObject({ sent: 1, failed: 0 });
    expect(rpc.calls).not.toContain("finish:failed");
    expect(rpc.sends[0]).toMatchObject({ status: "sent", recipientsSent: 2 });
    expect(sentBroadcasts()).toHaveLength(1);
    expect(peekFixtureLetters().broadcasts).toHaveLength(1);
  });

  it("does not call sendBroadcast again for a broadcast that Resend already has", async () => {
    await crashAfterSend();
    let calls = 0;
    const counting = withSender({ sendBroadcast: async (...a) => (calls += 1, ports.sender.sendBroadcast(...a)) });
    await runLetterSends({ ...deps, ports: counting, source: fakeSource(null) });
    expect(calls).toBe(0);
  });

  it("defers, never fails, when Resend cannot be read for over a day", async () => {
    await crashAfterSend();
    rpc.clock.now += 25 * 3_600_000;
    const down = withSender({ getBroadcast: async () => ({ ok: false, kind: "unavailable", message: "Resend did not answer in time" }) });
    expect(await runLetterSends({ ...deps, ports: down, source: fakeSource(null) })).toMatchObject({ deferred: 1, failed: 0, sent: 0 });
    expect(rpc.calls).not.toContain("finish:failed");
    expect(rpc.sends[0]!.status).toBe("sending");
  });

  it("defers, never fails, when the broadcast read is refused", async () => {
    await crashAfterSend();
    const refused = withSender({ getBroadcast: async () => ({ ok: false, kind: "refused", message: "Resend answered 403" }) });
    expect(await runLetterSends({ ...deps, ports: refused })).toMatchObject({ deferred: 1, failed: 0 });
    expect(rpc.sends[0]!.status).toBe("sending");
  });

  it("keeps waiting past a day while the send itself cannot reach Resend and a broadcast id exists", async () => {
    await approve();
    const down = withSender({ sendBroadcast: async () => ({ ok: false, kind: "unavailable", message: "Resend did not answer in time" }) });
    expect(await runLetterSends({ ...deps, ports: down })).toMatchObject({ deferred: 1 });
    expect(rpc.sends[0]!.broadcastId).not.toBeNull();
    rpc.clock.now += 25 * 3_600_000;
    expect(await runLetterSends({ ...deps, ports: down })).toMatchObject({ deferred: 1, failed: 0 });
    expect(rpc.sends[0]!.status).toBe("sending");
  });

  it("re-reads the broadcast after a 4xx on the send, and records sent when Resend has it", async () => {
    await approve();
    const lying = withSender({
      sendBroadcast: async (...a) => {
        await ports.sender.sendBroadcast(...a);
        return { ok: false, kind: "refused", message: "Resend answered 422" };
      },
    });
    expect(await runLetterSends({ ...deps, ports: lying })).toMatchObject({ sent: 1, failed: 0 });
    expect(rpc.calls).not.toContain("finish:failed");
    expect(sentBroadcasts()).toHaveLength(1);
  });

  it("fails on a 4xx only when the broadcast is still a draft (nothing went out)", async () => {
    await approve();
    const refusing = withSender({ sendBroadcast: async () => ({ ok: false, kind: "refused", message: "Resend answered 422" }) });
    expect(await runLetterSends({ ...deps, ports: refusing })).toMatchObject({ failed: 1, sent: 0 });
    expect(sentBroadcasts()).toHaveLength(0);
    expect(rpc.sends[0]).toMatchObject({ status: "failed", broadcastId: expect.any(String) });
  });
});

describe("a test copy: one email to the admin only", () => {
  it("sends the letter to ADMIN_EMAIL with the leave page as its unsubscribe link, and touches no reader or contact", async () => {
    await approve("self_test");
    expect(await runLetterSends(deps)).toMatchObject({ sent: 1 });
    const { emails, broadcasts, contacts } = peekFixtureLetters();
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: "admin@desk.test", subject: "What changed on the desk" });
    expect(emails[0]!.html).not.toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(emails[0]!.html).toContain(`${SITE}/letters/leave`);
    expect(emails[0]!.text).toContain(`${SITE}/letters/leave`);
    expect(broadcasts).toEqual([]);
    expect(contacts).toEqual([]);
    expect(rpc.sends[0]).toMatchObject({ status: "sent", recipientsSent: 1 });
  });

  it("is not sent twice when the step runs twice", async () => {
    await approve("self_test");
    await Promise.all([runLetterSends(deps), runLetterSends(deps)]);
    expect(peekFixtureLetters().emails).toHaveLength(1);
  });
});
