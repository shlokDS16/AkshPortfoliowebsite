import { describe, expect, it } from "vitest";
import { lintText } from "./lint";
import type { LintInput } from "./rules";
import { RULE_TITLES } from "./policy";

// Phase 5c, rule 13 and spec s8.4: a letter's lint input is its title (the subject), objective and body (the note) and the TEXT it copied
// into its entries (title, objective, change reason, company name), linted again. The machine's own fields (ids, page address, kind,
// revision number, the "what changed" line) are not prose and are not linted.
const RID = "11111111-2222-4333-8444-555555555555";
const entry = (patch: Record<string, unknown> = {}) => ({
  revisionId: RID, kind: "learning", path: "/notes/how-to-read", revNo: 2, detail: "Revision R2 · 3 sentences changed · figures to 22 Aug 2026", title: "How to read receivable days",
  learningObjective: "Learn what receivable days measure.", changeReason: "Added a check.", holdsPosition: null, companyName: null, ...patch,
});
const base: LintInput = {
  revisionId: "5b1d9c1e-0a53-4f3e-8c53-2d6a9a7e1f10", kind: "letter", title: "What changed this month", slug: "what-changed-this-month",
  learningObjective: "See which notes moved and why.", bodyMd: "Two notes moved.", structured: { schema: "letter/1", entries: [entry()] },
  changeReason: null, companyName: null, companyOneLiner: null, themeName: null, conceptNames: [], conceptSlugs: [], transcript: null, outside: [], companyId: null,
  holdsPosition: null, dataAsOf: null, today: "2026-10-16", allowances: new Set<string>(),
};
const lint = (patch: Partial<LintInput>) => lintText({ ...base, ...patch });

describe("lintText for a letter", () => {
  it("passes a clean letter", () => {
    expect(lint({}).passed).toBe(true);
  });

  it("lints the subject, the one sentence and the note", () => {
    expect(lint({ title: "You should buy this now" }).findings.map((f) => f.field)).toContain("title");
    expect(lint({ learningObjective: "Why you must sell the stock." }).findings.map((f) => f.field)).toContain("learningObjective");
    expect(lint({ bodyMd: "Buy this share today." }).findings.map((f) => f.field)).toContain("body");
  });

  it("lints the words copied into each entry again, so a page that changed after it passed cannot slip into an email", () => {
    for (const field of ["title", "learningObjective", "changeReason", "companyName"]) {
      const result = lint({ structured: { schema: "letter/1", entries: [entry(), entry({ [field]: "You should buy this stock now." })] } });
      expect(result.passed, field).toBe(false);
      expect(result.findings[0], field).toMatchObject({ rule: "1", field: "structured", sentence: "You should buy this stock now." });
    }
  });

  it("does not lint the machine's fields: the ids, the page address, the kind, the revision number and its own line", () => {
    const result = lint({
      structured: { schema: "letter/1", entries: [entry({ path: "/notes/why-i-would-buy-this", detail: "Revision R2 · you should buy · figures to 22 Aug 2026", kind: "file" })] },
    });
    expect(result.passed).toBe(true);
  });

  it("lints a key it does not know, because that could be someone's words in a place the email would not show but the page might", () => {
    const result = lint({ structured: { schema: "letter/1", entries: [entry()], extra: "You should buy this stock now." } });
    expect(result.passed).toBe(false);
  });

  it("is the same for a letter that has no entries yet (the gate, not the lint, refuses that)", () => {
    expect(lint({ structured: { schema: "letter/1", entries: [] } }).passed).toBe(true);
    expect(lint({ structured: {} }).passed).toBe(true);
  });

  it("another kind's record is still linted in full (nothing about this rule leaks to other kinds)", () => {
    const result = lintText({ ...base, kind: "learning", structured: { entries: [entry({ detail: "you should buy" })] } });
    expect(result.passed).toBe(false);
  });
});

describe("the gate's labels for rule 13", () => {
  it("names the letter rule", () => {
    expect(RULE_TITLES["13"]).toBe("Rule 13: letters");
  });
});
