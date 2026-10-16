import { describe, expect, it } from "vitest";
import { letterScreen, type ScreenInput } from "./screen";
import { letterStructured } from "./structured";
import type { LetterEntry, SendRow } from "./types";

const REV = "20000000-0000-4000-8000-000000000001";
const ENTRY_REV = "30000000-0000-4000-8000-000000000001";
const entry: LetterEntry = {
  revisionId: ENTRY_REV, kind: "learning", path: "/notes/x", revNo: 1, detail: "Learning note · R1", title: "T", learningObjective: "O", changeReason: null, holdsPosition: null, companyName: null,
};
const send = (patch: Partial<SendRow> = {}): SendRow => ({
  id: "s1", itemId: "i1", revisionId: REV, kind: "subscribers", status: "approved", approvedAt: "2026-10-16T06:00:00+00:00", claimedAt: null, broadcastId: null,
  recipientsAtApproval: 4, recipientsSent: null, sentAt: null, problem: null, ...patch,
});
const input = (patch: Partial<ScreenInput> = {}): ScreenInput => ({
  title: "What changed in October", visibility: "public", currentId: REV, latest: { id: REV, bodyMd: "A note.", structured: letterStructured([entry]) }, sends: [], confirmed: 4,
  on: true, currentRevisionIds: new Set([ENTRY_REV]), ...patch,
});

describe("what the letter page knows (spec s8.1)", () => {
  it("a published letter with readers is ready, with every row of the checklist passing", () => {
    const s = letterScreen(input());
    expect(s.published).toBe(true);
    expect(s.state.code).toBe("ready");
    expect(s.state.disabledWhy).toBeNull();
    expect(s.checks.map((c) => c.state)).toEqual(["pass", "pass", "pass", "pass"]);
    expect(s.mode).toBe("public");
    expect(s.canTestCopy).toBe(true);
    expect(s.approveRevisionId).toBe(REV);
    expect(s.entries).toHaveLength(1);
  });

  it("a private letter is open for editing and not ready to send", () => {
    const s = letterScreen(input({ visibility: "private", currentId: null }));
    expect(s.mode).toBe("open");
    expect(s.published).toBe(false);
    expect(s.state.code).toBe("not-published");
    expect(s.canTestCopy).toBe(false);
    expect(s.approveRevisionId).toBeNull();
  });

  it("a public letter with a newer revision waiting is not published until the gate passes it", () => {
    const s = letterScreen(input({ latest: { id: "40000000-0000-4000-8000-000000000009", bodyMd: "new", structured: letterStructured([entry]) } }));
    expect(s.published).toBe(false);
    expect(s.state.code).toBe("not-published");
  });

  it("the label is caught from the title", () => {
    const s = letterScreen(input({ title: "Untitled letter, 16 Oct 2026" }));
    expect(s.subjectIsLabel).toBe(true);
    expect(s.state.disabledWhy).toMatch(/still a label/);
    expect(s.checks[0]).toMatchObject({ id: "rule-13-1", state: "fail" });
    expect(s.canTestCopy).toBe(true);
  });

  it("once sending or sent the fields are frozen and no test copy is offered", () => {
    expect(letterScreen(input({ sends: [send({ status: "sending" })] })).mode).toBe("sent");
    const done = letterScreen(input({ sends: [send({ status: "sent", sentAt: "2026-10-16T06:20:00+00:00", recipientsSent: 4 })] }));
    expect(done.mode).toBe("sent");
    expect(done.canTestCopy).toBe(false);
    expect(done.state.code).toBe("sent");
  });

  it("a waiting approval does not freeze the fields", () => {
    expect(letterScreen(input({ sends: [send()] })).mode).toBe("public");
  });

  it("letters off: no test copy, the off state, the letter still shows as published", () => {
    const s = letterScreen(input({ on: false }));
    expect(s.published).toBe(true);
    expect(s.state.code).toBe("off");
    expect(s.canTestCopy).toBe(false);
  });

  it("a damaged record gives no entries rather than a crash", () => {
    const s = letterScreen(input({ latest: { id: REV, bodyMd: "", structured: { schema: "nope" } } }));
    expect(s.entries).toEqual([]);
    expect(s.checks[1]).toMatchObject({ id: "rule-13-2", state: "fail" });
  });

  it("a letter with no revision at all is an empty, unpublished page", () => {
    const s = letterScreen(input({ latest: null, currentId: null, visibility: "private" }));
    expect(s.entries).toEqual([]);
    expect(s.published).toBe(false);
  });

  it("the test copy line comes from the test copies only", () => {
    const copy = send({ id: "c", kind: "self_test", status: "sent", sentAt: "2026-10-16T07:00:00+00:00" });
    expect(letterScreen(input({ sends: [copy] })).testLine).toBe("Test copy sent to you on 16 Oct 2026.");
    expect(letterScreen(input()).testLine).toBeNull();
  });
});
