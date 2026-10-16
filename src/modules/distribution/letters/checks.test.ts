import { describe, expect, it } from "vitest";
import { letterChecks, type LetterFacts } from "./checks";
import { MAX_NOTE } from "./types";
import type { LetterEntry, SendRow } from "./types";

const entry = (n: number, patch: Partial<LetterEntry> = {}): LetterEntry => ({
  revisionId: `00000000-0000-4000-8000-00000000000${n}`, kind: "learning", path: `/notes/n${n}`, revNo: 1, detail: "Learning note · R1", title: `T${n}`, learningObjective: null,
  changeReason: null, holdsPosition: null, companyName: null, ...patch,
});
const sent: SendRow = {
  id: "s", itemId: "i", revisionId: "r", kind: "subscribers", status: "sent", approvedAt: "2026-10-16T06:00:00+00:00", claimedAt: null, broadcastId: null,
  recipientsAtApproval: 3, recipientsSent: 3, sentAt: "2026-10-16T06:10:00+00:00", problem: null,
};
const facts = (patch: Partial<LetterFacts> = {}): LetterFacts => ({
  subject: "What changed in October", note: "", entries: [entry(1), entry(2)], currentRevisionIds: new Set([entry(1).revisionId, entry(2).revisionId]), sends: [], ...patch,
});
const byId = (f: LetterFacts) => Object.fromEntries(letterChecks(f).map((c) => [c.id, c]));

describe("the rule 13 rows of the publish checklist (advisory; the database gate decides and records)", () => {
  it("passes a clean letter on every row", () => {
    const rows = byId(facts());
    expect(Object.keys(rows)).toEqual(["rule-13-1", "rule-13-2", "rule-13-3", "rule-13-4"]);
    expect(Object.values(rows).map((r) => r.state)).toEqual(["pass", "pass", "pass", "pass"]);
  });

  it("13.1 fails while the subject is the label, too long, empty, or the note too long", () => {
    expect(byId(facts({ subject: "Untitled letter, 16 Oct 2026" }))["rule-13-1"]).toMatchObject({ state: "fail", detail: "The subject is still a label. Replace it with your own subject, save, and run the gate again." });
    expect(byId(facts({ subject: "x".repeat(121) }))["rule-13-1"]!.state).toBe("fail");
    expect(byId(facts({ subject: "" }))["rule-13-1"]!.state).toBe("fail");
    expect(byId(facts({ note: "y".repeat(MAX_NOTE + 1) }))["rule-13-1"]).toMatchObject({ state: "fail", detail: "The note must be at most 4,000 characters." });
  });

  it("13.2 fails for each entry that is no longer the current public version, and says how many", () => {
    const rows = byId(facts({ currentRevisionIds: new Set([entry(1).revisionId]) }));
    expect(rows["rule-13-2"]).toMatchObject({ state: "fail", detail: "1 of 2 entries is no longer the current public version of its page." });
    expect(byId(facts({ currentRevisionIds: new Set() }))["rule-13-2"]!.detail).toBe("2 of 2 entries are no longer the current public version of their pages.");
  });

  it("13.2 is left to the gate (manual) when the public site could not be read, and fails with no entries", () => {
    expect(byId(facts({ currentRevisionIds: null }))["rule-13-2"]).toMatchObject({ state: "manual", detail: "The public site could not be read just now. The gate decides." });
    expect(byId(facts({ entries: [] }))["rule-13-2"]!.state).toBe("fail");
  });

  it("13.3 is a hand row when an entry names a company, with the names, once each", () => {
    const rows = byId(facts({ entries: [entry(1, { companyName: "Kaveri Seeds", path: "/companies/k" }), entry(2, { companyName: "Kaveri Seeds", path: "/companies/k" })] }));
    expect(rows["rule-13-3"]).toMatchObject({ state: "manual" });
    expect(rows["rule-13-3"]!.detail).toBe("Entries name Kaveri Seeds. The gate checks the ledger for each company before it passes.");
    expect(byId(facts())["rule-13-3"]!.detail).toBe("No entry names a company.");
  });

  it("13.4 fails once a send to readers has gone, or is waiting or under way", () => {
    expect(byId(facts({ sends: [sent] }))["rule-13-4"]).toMatchObject({ state: "fail", detail: "This letter was already sent. A sent letter cannot be published again." });
    expect(byId(facts({ sends: [{ ...sent, status: "failed" }] }))["rule-13-4"]!.state).toBe("pass");
    expect(byId(facts({ sends: [{ ...sent, kind: "self_test" }] }))["rule-13-4"]!.state).toBe("pass");
  });
});
