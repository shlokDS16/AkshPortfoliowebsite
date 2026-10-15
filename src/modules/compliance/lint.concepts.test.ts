import { describe, expect, it } from "vitest";
import { sentenceHash } from "./hash";
import { lintText } from "./lint";
import type { LintInput } from "./rules";

const base: LintInput = {
  revisionId: "5b1d9c1e-0a53-4f3e-8c53-2d6a9a7e1f10",
  kind: "learning",
  title: "How capex cycles turn",
  slug: "how-capex-cycles-turn",
  learningObjective: "Recognise the late stage of a capex cycle.",
  bodyMd: "Capacity additions slowed after utilisation peaked.",
  structured: {},
  changeReason: null,
  companyName: null,
  companyOneLiner: null,
  themeName: null,
  conceptNames: [],
  conceptSlugs: [],
  companyId: null,
  holdsPosition: null,
  dataAsOf: null,
  today: "2026-10-04",
  allowances: new Set<string>(),
};
const lint = (patch: Partial<LintInput>) => lintText({ ...base, ...patch });

// Plan 4 Task 2 names "Exit multiples" as the flagged example, but the lexicon exempts "exit multiple" (corporate-finance vocabulary),
// so these tests use "Multibagger ideas" (rule 1, already pinned for themeName) and assert that "Exit multiples" passes.
describe("lintText: linked concepts are public text (spec s9, rule 8)", () => {
  it("flags a concept name as one rule 1 finding on conceptName", () => {
    const result = lint({ conceptNames: ["Multibagger ideas"] });
    expect(result.passed).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule: "1", field: "conceptName", sentence: "Multibagger ideas" });
  });

  it("reads the hyphens of a concept slug as spaces: one finding on conceptSlug", () => {
    const result = lint({ conceptSlugs: ["accumulate-on-dips"] });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule: "1", field: "conceptSlug", sentence: "accumulate on dips" });
  });

  it("lints each linked concept, in its own finding", () => {
    const result = lint({ conceptNames: ["Capex cycles", "Multibagger ideas", "Accumulate on dips"] });
    expect(result.findings.map((f) => f.sentence)).toEqual(["Multibagger ideas", "Accumulate on dips"]);
    expect(result.findings.every((f) => f.field === "conceptName")).toBe(true);
  });

  it("an allowance on that sentence applies, as it does to any rule 1 sentence", () => {
    const result = lint({ conceptNames: ["Multibagger ideas"], allowances: new Set([sentenceHash("Multibagger ideas")]) });
    expect(result.passed).toBe(true);
    expect(result.allowedBy).toEqual([expect.objectContaining({ rule: "1", field: "conceptName", sentence: "Multibagger ideas" })]);
  });

  it("passes clean concepts, including exit multiples (a corporate-finance term)", () => {
    expect(lint({ conceptNames: ["Exit multiples", "Capex cycles"], conceptSlugs: ["exit-multiples", "capex-cycles"] }).passed).toBe(true);
  });

  it("no linked concepts lints nothing extra", () => {
    expect(lint({}).passed).toBe(true);
  });
});
