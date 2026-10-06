import { describe, expect, it } from "vitest";
import { lintText } from "./lint";
import type { LintInput } from "./rules";

const base: LintInput = {
  revisionId: "5b1d9c1e-0a53-4f3e-8c53-2d6a9a7e1f10",
  kind: "learning",
  title: "How capex cycles turn",
  slug: null,
  learningObjective: "Recognise the late stage of a capex cycle.",
  bodyMd: "",
  structured: {},
  changeReason: null,
  companyName: null,
  companyOneLiner: null,
  themeName: null,
  companyId: null,
  holdsPosition: null,
  dataAsOf: null,
  today: "2026-10-04",
  allowances: new Set<string>(),
};

function timed(bodyMd: string) {
  const start = performance.now();
  const result = lintText({ ...base, bodyMd });
  return { result, ms: performance.now() - start };
}

// Generous bounds: before the join window was capped, a 6 KB hyphenated token took about 15 seconds.
describe("lint stays linear on pathological input", () => {
  it("handles a 200k-character body of ISO dates", () => {
    const { result, ms } = timed("2024-01-01,".repeat(18_200));
    expect(result.passed).toBe(true);
    expect(ms).toBeLessThan(500);
  });

  it("handles a 6 KB single hyphenated token", () => {
    const { result, ms } = timed("2024-01-01-".repeat(550));
    expect(result.passed).toBe(true);
    expect(ms).toBeLessThan(500);
  });

  it("handles a 6 KB token of single letters between hyphens", () => {
    const { ms } = timed("a-".repeat(3000));
    expect(ms).toBeLessThan(500);
  });

  it("still finds a phrase at the end of a long hyphenated token", () => {
    const { result, ms } = timed("2024-01-01-".repeat(550) + " b-u-y");
    expect(result.passed).toBe(false);
    expect(ms).toBeLessThan(500);
  });

  it("handles a 200k-character run of spaced letters", () => {
    const { ms } = timed("a b c ".repeat(33_000));
    expect(ms).toBeLessThan(500);
  });
});
