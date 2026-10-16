import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sentenceHash } from "./hash";
import { lintText } from "./lint";
import type { LintInput } from "./rules";

const base: LintInput = {
  revisionId: "5b1d9c1e-0a53-4f3e-8c53-2d6a9a7e1f10",
  kind: "video",
  title: "How I read an annual report",
  slug: "how-i-read-an-annual-report",
  learningObjective: "See what each section of an annual report is for.",
  bodyMd: "A walk through the sections.",
  structured: { schema: "video/1", youtubeId: "dQw4w9WgXcQ", transcriptId: "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e", transcriptSha: "ab".repeat(32), chapters: [] },
  changeReason: null,
  companyName: null,
  companyOneLiner: null,
  themeName: null,
  conceptNames: [],
  conceptSlugs: [],
  transcript: null,
  companyId: null,
  holdsPosition: null,
  dataAsOf: null,
  today: "2026-10-16",
  allowances: new Set<string>(),
};
const lint = (patch: Partial<LintInput>) => lintText({ ...base, ...patch });
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("lintText: a video's transcript is public text, every word of it (rule 12.2, rule 8)", () => {
  it("passes a clean transcript and carries the sha256 of exactly that text (what the gate compares)", () => {
    const transcript = "Hello world.\nSecond line here";
    const result = lint({ transcript });
    expect(result.passed).toBe(true);
    expect(result.transcriptSha).toBe(sha(transcript));
    expect(result.transcriptSha).toMatch(/^54cf37a1.*318db5$/);
    expect(lint({ transcript: "é\nb" }).transcriptSha).toMatch(/^7148cd8e.*527d12$/);
  });

  it("carries no transcriptSha when the revision has no transcript, so other kinds' results are unchanged", () => {
    const result = lint({ transcript: null });
    expect("transcriptSha" in result).toBe(false);
  });

  it("flags a spoken buy as rule 1 in the field 'transcript', with the sentence as spoken", () => {
    const result = lint({ transcript: "I read the filing.\nYou should buy this stock now.\nThen I closed it." });
    expect(result.passed).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule: "1", field: "transcript", sentence: "You should buy this stock now." });
  });

  it("flags a sentence that runs across two segments", () => {
    const result = lint({ transcript: "I think you should\nbuy it before the results." });
    expect(result.findings.map((f) => f.rule)).toContain("1");
    expect(result.findings.every((f) => f.field === "transcript")).toBe(true);
  });

  it("is cleared only by a sentence allowance (rule 1), which applies to the transcript's sentence like any other", () => {
    const sentence = "You should buy this stock now.";
    const result = lint({ transcript: `Intro.\n${sentence}`, allowances: new Set([sentenceHash(sentence)]) });
    expect(result.passed).toBe(true);
    expect(result.allowedBy).toEqual([expect.objectContaining({ rule: "1", field: "transcript", sentence })]);
    expect(result.transcriptSha).toBe(sha(`Intro.\n${sentence}`));
  });

  it("never lets an allowance clear a rule 2 claim in the transcript", () => {
    const sentence = "My calls have been right all year.";
    const result = lint({ transcript: sentence, allowances: new Set([sentenceHash(sentence)]) });
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.rule === "2" && f.field === "transcript")).toBe(true);
  });

  it("applies the price rule to the transcript when the video names a company and its figures are not 30 days old", () => {
    const result = lint({ transcript: "The share price is 1,250 rupees.", companyId: "c-1", holdsPosition: "no", dataAsOf: "2026-10-10" });
    expect(result.findings.some((f) => f.rule === "3" && f.field === "transcript")).toBe(true);
  });

  it("lints his chapter titles, and not the machine's keys (a YouTube id is not prose)", () => {
    const structured = {
      schema: "video/1",
      youtubeId: "buy-now-aaa",
      transcriptId: "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e",
      transcriptSha: "ab".repeat(32),
      chapters: [
        { s: 0, title: "Intro" },
        { s: 60, title: "Why you should buy it" },
        { s: 120, title: "The end" },
      ],
    };
    const result = lint({ structured, transcript: "Clean words." });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule: "1", field: "structured", sentence: "Why you should buy it" });
  });

  it("lints a long transcript in linear time", () => {
    const transcript = Array.from({ length: 5000 }, (_, i) => `Segment ${i} talks about the balance sheet and cash flow in plain words.`).join("\n");
    const started = Date.now();
    const result = lint({ transcript });
    expect(result.passed).toBe(true);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});
