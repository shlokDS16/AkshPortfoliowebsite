import { describe, expect, it } from "vitest";
import { latestFigureDate, parseFactsSheet } from "@/modules/casefile/client";
import { KAVERI } from "@/test/fixtures/casefile";
import { allowableHashes, type GateDecision } from "./decision";
import { annotateBody, previewGate } from "./preview";
import type { PublishContext } from "./repo";

const ctx = (over: Partial<PublishContext["item"]> = {}, bodyMd = "Utilisation peaked in 2024. You should buy the leader now."): PublishContext => ({
  item: {
    id: "i1", kind: "thesis", title: "Kaveri file", slug: null, learningObjective: "Learn X.", companyId: "c1", holdsPosition: "no",
    dataAsOf: "2026-08-22", visibility: "private", ...over,
  },
  revision: { id: "r1", bodyMd: `${bodyMd}\n\n## What would prove me wrong\n- T1: Margins fall.`, structured: {}, changeReason: null },
  companyName: "Kaveri Pumps (fictional)",
  companyOneLiner: null,
  themeName: null,
  allowances: [],
});

const NOTE = { kind: "learning", companyId: null, holdsPosition: null, dataAsOf: null } as const;
const preview = (c: PublishContext, companyPublic: boolean | null = true) => previewGate({ ctx: c, today: "2026-10-06", companyPublic, structureProblems: [] });

describe("previewGate (D17: the same lint, before publish; advisory)", () => {
  it("lists every rule with its state; a named company needs the rule-4 hand check", () => {
    const result = previewGate({ ctx: ctx(), today: "2026-10-06", companyPublic: false, structureProblems: [] });
    const state = Object.fromEntries(result.items.map((i) => [i.id, i.state]));
    expect(state).toEqual({ "rule-1": "fail", "rule-2": "pass", "rule-3": "pass", "rule-5": "pass", "rule-6": "pass", structure: "pass", company: "fail", "rule-4": "manual" });
    expect(result.failing).toBe(2);
    expect(result.rule4Needed).toBe(true);
  });

  it("a thesis without a figures-to date fails rule 3 (D9); no company means rule 4 is not needed", () => {
    const undated = preview(ctx({ dataAsOf: null }, "Margins held."));
    expect(undated.items.find((i) => i.id === "rule-3")?.state).toBe("fail");
    const note = preview(ctx(NOTE, "Margins held."), null);
    expect(note.items.find((i) => i.id === "rule-4")).toMatchObject({ state: "pass", detail: "No company named" });
    expect(note.items.some((i) => i.id === "company")).toBe(false);
  });

  it("file-structure problems from the casefile check fail the structure row", () => {
    const result = previewGate({ ctx: ctx({}, "Margins held."), today: "2026-10-06", companyPublic: true, structureProblems: ["The view cites [F9], which is not in the facts sheet."] });
    expect(result.items.find((i) => i.id === "structure")).toMatchObject({ state: "fail", detail: "The view cites [F9], which is not in the facts sheet." });
  });

  it("surfaces rule 3a's own message (a figure newer than Figures to) on the rule 3 row", () => {
    const structured = parseFactsSheet(KAVERI.revisions[1].sheet).caseFile;
    const latest = latestFigureDate(structured)!;
    const c = ctx({ dataAsOf: "2026-01-31" }, "Margins held.");
    const row = preview({ ...c, revision: { ...c.revision, structured } }).items.find((i) => i.id === "rule-3");
    expect(row).toMatchObject({ state: "fail" });
    expect(row?.detail).toBe(`A figure is dated ${latest}, after this file's 'Figures to' date (2026-01-31). Move 'Figures to' forward or remove the figure.`);
  });
});

describe("allowableHashes (an allowance may cover only a recorded rule-1 failure on the newest revision)", () => {
  const hash = "a".repeat(64);
  const decision = (revisionId: string): GateDecision => ({
    decisionId: "d1", revisionId, verdict: "fail", policyVersion: "p", decidedAt: "2026-10-06T05:00:00Z", allowedBy: [],
    failures: [
      { rule: "1", message: "m", field: "body", sentence: "s", match: "buy", sentenceHash: hash },
      { rule: "2", message: "m", field: "body", sentence: "t", match: "beat", sentenceHash: "b".repeat(64) },
    ],
  });
  it("keeps rule 1 hashes of the newest revision only", () => {
    expect([...allowableHashes(decision("r1"), "r1")]).toEqual([hash]);
    expect(allowableHashes(decision("r1"), "r2").size).toBe(0);
    expect(allowableHashes(null, "r1").size).toBe(0);
    expect(allowableHashes(decision("r1"), null).size).toBe(0);
  });
});

describe("annotateBody (B: the note sits beside the sentence)", () => {
  it("places a flagged sentence inside its paragraph and keeps the rest as plain text", () => {
    const c = ctx();
    const result = preview(c);
    const hash = result.lint.findings[0].sentenceHash!;
    const body = annotateBody(c.revision.bodyMd, result.lint, [], new Set([hash]));
    const first = body.paragraphs[0];
    expect(first.map((s) => s.text).join("")).toBe("Utilisation peaked in 2024. You should buy the leader now.");
    const flagged = first.find((s) => s.flag);
    expect(flagged?.text).toBe("You should buy the leader now.");
    expect(flagged?.flag).toMatchObject({ rule: "1", match: expect.stringMatching(/buy/i), allowable: true });
    expect(body.unplaced).toEqual([]);
  });

  it("shows an allowed sentence with the reason Aksh gave", () => {
    const sentence = "Why I avoid target prices.";
    const c = ctx(NOTE, sentence);
    const hash = preview(c, null).lint.findings[0].sentenceHash!;
    const allowed = preview({ ...c, allowances: [hash] }, null);
    const body = annotateBody(c.revision.bodyMd, allowed.lint, [{ sentenceHash: hash, reason: "Explains my process", createdAt: "2026-10-06T05:00:00Z" }], new Set());
    expect(body.paragraphs[0].find((s) => s.allowed)?.allowed).toMatchObject({ reason: "Explains my process" });
  });

  it("a rule-1 flag not in the recorded set is not allowable", () => {
    const c = ctx();
    const body = annotateBody(c.revision.bodyMd, preview(c).lint, [], new Set());
    expect(body.paragraphs[0].find((s) => s.flag)?.flag?.allowable).toBe(false);
  });

  it("a rule-2 flag is never allowable, even when its hash is in the set", () => {
    const c = ctx(NOTE, "My calls beat the market.");
    const lint = preview(c, null).lint;
    const finding = lint.findings.find((f) => f.rule === "2")!;
    const body = annotateBody(c.revision.bodyMd, lint, [], new Set([finding.sentenceHash!]));
    expect(body.paragraphs[0].find((s) => s.flag)?.flag).toMatchObject({ rule: "2", allowable: false });
  });

  it("lists a second finding on an already marked sentence, and every finding outside the body, as unplaced", () => {
    const c = ctx({ ...NOTE, learningObjective: null }, "You should buy the leader now; my calls have a strong hit rate.");
    const lint = preview(c, null).lint;
    const body = annotateBody(c.revision.bodyMd, lint, [], new Set());
    expect(body.unplaced.map((f) => f.rule)).toContain("6");
    expect(body.paragraphs[0].filter((s) => s.flag)).toHaveLength(1);
    const inBody = lint.findings.filter((f) => f.field === "body").length;
    expect(inBody).toBeGreaterThan(1);
    expect(body.unplaced.filter((f) => f.field === "body")).toHaveLength(inBody - 1);
  });
});
