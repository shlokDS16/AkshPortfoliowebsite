import { describe, expect, it } from "vitest";
import { decisionFromRow, type DecisionRow } from "./decision";
import { RULE_TITLES } from "./policy";

// Task 6 records rule 12 failures as {rule: '12', code: '12.1'..'12.4', message} with the plain sentence in `message`. A code that
// maps to several sentences (12.1 has five) is shown by its stored sentence, never collapsed to one.
const row = (failures: unknown[], findings: unknown[] = []) => ({
  id: "d1", revision_id: "r1", verdict: "fail", policy_version: "sebi-unreg-2026-07-v1.2", decided_at: "2026-10-16T00:00:00Z",
  reasons: { failures, lint: { findings, allowedBy: [] } },
});

describe("a rule 12 refusal on the desk", () => {
  it("has a title", () => {
    expect(RULE_TITLES["12"]).toBe("Rule 12: videos");
  });

  it.each([
    ["12.1", "This video is not from your channel."],
    ["12.1", "YouTube data is more than 7 days old. Fetch it again."],
    ["12.1", "This video is private or gone on YouTube."],
    ["12.1", "YouTube data has not been fetched yet."],
    ["12.1", "This revision does not match the video's YouTube link."],
    ["12.2", "A video needs its transcript before it is listed."],
    ["12.2", "The transcript in this revision does not match the stored transcript."],
    ["12.2", "The lint did not check this transcript."],
    ["12.3", "A video that names a company needs a figures-to date at least 30 days old."],
    ["12.4", "Chapters must start at 0:00, number 3 to 100, rise in time and each have a title of 1 to 100 characters."],
  ])("shows %s with the sentence the database recorded", (code, message) => {
    const decision = decisionFromRow(row([{ rule: "12", code, message }]) as DecisionRow);
    expect(decision.verdict).toBe("fail");
    expect(decision.failures).toEqual([expect.objectContaining({ rule: "12", code, message })]);
  });

  it("shows a lint finding on the transcript next to a rule 12 refusal, hiding neither", () => {
    const finding = { rule: "1", field: "transcript", sentence: "You should buy it.", sentenceHash: "h", match: "buy", message: "Actionable language." };
    const decision = decisionFromRow(row([{ rule: "12", code: "12.2", message: "The lint did not check this transcript." }], [finding]) as DecisionRow);
    expect(decision.failures.map((f) => f.rule)).toEqual(["1", "12"]);
    expect(decision.failures[0]).toMatchObject({ field: "transcript", sentenceHash: "h" });
  });
});
