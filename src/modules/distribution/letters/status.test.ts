import { describe, expect, it } from "vitest";
import { LETTERS_OFF_LINE } from "@/lib/providers";
import { listLine, sendState, testCopyLine, type LetterListRow, type SendFacts } from "./status";
import type { SendRow } from "./types";

const send = (patch: Partial<SendRow> = {}): SendRow => ({
  id: "s1", itemId: "i1", revisionId: "r1", kind: "subscribers", status: "approved", approvedAt: "2026-10-16T06:00:00+00:00", claimedAt: null, broadcastId: null,
  recipientsAtApproval: 40, recipientsSent: null, sentAt: null, problem: null, ...patch,
});
const facts = (patch: Partial<SendFacts> = {}): SendFacts => ({ on: true, subjectIsLabel: false, published: true, confirmed: 40, sends: [], ...patch });

describe("the send block, one state at a time (spec s8.6, s15)", () => {
  it("off: no control at all, and the off line", () => {
    const s = sendState(facts({ on: false }));
    expect(s).toMatchObject({ code: "off", line: LETTERS_OFF_LINE, control: "none" });
  });

  it("not published: no control, and it says the gate comes first", () => {
    const s = sendState(facts({ published: false }));
    expect(s.code).toBe("not-published");
    expect(s.control).toBe("none");
    expect(s.line).toBe("Run the publishing gate first. A letter is sent only after it is on the archive.");
  });

  it("ready: the Send control is on, and the line names how many will get it", () => {
    const s = sendState(facts());
    expect(s).toMatchObject({ code: "ready", control: "send", disabledWhy: null });
    expect(s.line).toBe("Ready. This is on the archive and goes to 40 subscribers.");
    expect(sendState(facts({ confirmed: 1 })).line).toBe("Ready. This is on the archive and goes to 1 subscriber.");
  });

  it("ready but the subject is still the label: the control is there and disabled, with the reason", () => {
    const s = sendState(facts({ subjectIsLabel: true }));
    expect(s).toMatchObject({ code: "ready", control: "send" });
    expect(s.disabledWhy).toBe("The subject is still a label. Replace it with your own subject, save, and run the gate again.");
  });

  it("ready but nobody has confirmed: the control is disabled and says why", () => {
    const s = sendState(facts({ confirmed: 0 }));
    expect(s.control).toBe("send");
    expect(s.disabledWhy).toBe("There are no confirmed readers yet, so there is nobody to send this to.");
  });

  it("the label wins over the empty list as the reason", () => {
    expect(sendState(facts({ subjectIsLabel: true, confirmed: 0 })).disabledWhy).toMatch(/still a label/);
  });

  it("approved: the time, and a way to cancel; nothing to press for sending", () => {
    const s = sendState(facts({ sends: [send()] }));
    expect(s).toMatchObject({ code: "approved", control: "cancel", tone: "ok" });
    expect(s.line).toBe("Approved 11:30. It goes out within 15 minutes.");
    expect(s.send?.id).toBe("s1");
  });

  it("sending: the word, no control", () => {
    const s = sendState(facts({ sends: [send({ status: "sending", claimedAt: "2026-10-16T06:05:00+00:00" })] }));
    expect(s).toMatchObject({ code: "sending", line: "Sending", control: "none" });
  });

  it("sent: how many and when, no control, even when letters are now off", () => {
    const sent = send({ status: "sent", recipientsSent: 38, sentAt: "2026-10-16T06:20:00+00:00" });
    expect(sendState(facts({ sends: [sent] }))).toMatchObject({ code: "sent", line: "Sent to 38 on 16 Oct 2026", control: "none" });
    expect(sendState(facts({ on: false, sends: [sent] })).code).toBe("sent");
  });

  it("failed: Resend's words as the reason, and Approve again", () => {
    const s = sendState(facts({ sends: [send({ status: "failed", problem: "Resend said no (429)." })] }));
    expect(s).toMatchObject({ code: "failed", control: "again", tone: "bad", line: "Not sent: Resend said no (429)." });
  });

  it("failed with no stored reason still gives a plain line", () => {
    expect(sendState(facts({ sends: [send({ status: "failed" })] })).line).toBe("Not sent: no reason was recorded.");
  });

  it("failed: Approve again is disabled for the same reasons as Send", () => {
    const failed = send({ status: "failed", problem: "x" });
    expect(sendState(facts({ sends: [failed], subjectIsLabel: true })).disabledWhy).toMatch(/still a label/);
    expect(sendState(facts({ sends: [failed], published: false })).control).toBe("none");
  });

  it("expired: says the approval ran out, and Approve again", () => {
    const s = sendState(facts({ sends: [send({ status: "expired" })] }));
    expect(s).toMatchObject({ code: "expired", control: "again" });
    expect(s.line).toBe("Not sent: the approval ran out after 24 hours.");
  });

  it("a cancelled approval is history: the block is as ready as before", () => {
    expect(sendState(facts({ sends: [send({ status: "cancelled" })] })).code).toBe("ready");
  });

  it("reads the newest readers send; test copies do not change the block", () => {
    const copy = send({ id: "c1", kind: "self_test", status: "sent", sentAt: "2026-10-16T07:00:00+00:00", approvedAt: "2026-10-16T07:00:00+00:00" });
    expect(sendState(facts({ sends: [copy] })).code).toBe("ready");
    expect(sendState(facts({ sends: [copy, send({ status: "sending" })] })).code).toBe("sending");
  });

  it("a send under way is shown while letters are off, with a way to cancel an approval", () => {
    expect(sendState(facts({ on: false, sends: [send()] })).control).toBe("cancel");
  });
});

describe("the test copy line", () => {
  const copy = (patch: Partial<SendRow>) => send({ kind: "self_test", ...patch });
  it("is null before any test copy", () => {
    expect(testCopyLine([])).toBeNull();
    expect(testCopyLine([send()])).toBeNull();
  });
  it("says the newest one in words", () => {
    expect(testCopyLine([copy({})])).toBe("Test copy approved 11:30.");
    expect(testCopyLine([copy({ status: "sending" })])).toBe("Test copy is being sent.");
    expect(testCopyLine([copy({ status: "sent", sentAt: "2026-10-16T06:20:00+00:00" })])).toBe("Test copy sent to you on 16 Oct 2026.");
    expect(testCopyLine([copy({ status: "failed", problem: "bad key" })])).toBe("Test copy not sent: bad key");
    expect(testCopyLine([copy({ status: "cancelled" }), copy({ status: "sent", sentAt: "2026-10-15T06:20:00+00:00", approvedAt: "2026-10-15T06:00:00+00:00" })])).toBe("Test copy sent to you on 15 Oct 2026.");
  });
});

describe("the list line of a letter (no revisions read: the sends and the visibility)", () => {
  const row = (patch: Partial<LetterListRow> = {}): LetterListRow => ({ itemId: "i1", title: "What changed", visibility: "private", createdAt: "2026-10-16T05:00:00+00:00", sends: [], ...patch });
  it("private: not on the archive yet; public: on the archive, not sent", () => {
    expect(listLine(row())).toBe("Private. Not on the archive yet.");
    expect(listLine(row({ visibility: "public" }))).toBe("On the archive. Not sent.");
  });
  it("a readers send decides the rest, from the rows", () => {
    expect(listLine(row({ visibility: "public", sends: [send()] }))).toBe("Approved 11:30");
    expect(listLine(row({ visibility: "public", sends: [send({ status: "sending" })] }))).toBe("Sending");
    expect(listLine(row({ visibility: "public", sends: [send({ status: "sent", recipientsSent: 38, sentAt: "2026-10-16T06:20:00+00:00" })] }))).toBe("Sent to 38 on 16 Oct 2026");
    expect(listLine(row({ visibility: "public", sends: [send({ status: "failed", problem: "x" })] }))).toBe("Not sent: x");
    expect(listLine(row({ visibility: "public", sends: [send({ status: "expired" })] }))).toBe("Not sent: the approval ran out after 24 hours.");
    expect(listLine(row({ visibility: "public", sends: [send({ status: "cancelled" })] }))).toBe("On the archive. Not sent.");
  });
  it("a test copy alone changes nothing", () => {
    expect(listLine(row({ sends: [send({ kind: "self_test", status: "sent", sentAt: "2026-10-16T06:20:00+00:00" })] }))).toBe("Private. Not on the archive yet.");
  });
});
