import { describe, expect, it } from "vitest";
import { containsSquashed, DATE_SQUASHED, escapeRe, literal, squash, squashedSource } from "../../e2e/support/squash";

// The CI text layer on Linux puts spaces inside words; these samples are shaped like it (e2e/public-print.spec.ts).
const SPLIT =
  "Educational content only. Aksh Agrawal is not a SEBI-registered Research Analyst or Investment Adviser. Nothing here is a recommendation, offer or solicitation to buy or sell any security. " +
  "Figures are shown with a min imum 30-day lag. Position in the security discussed: No. Investments in securities are subject to market risk; consult a SEBI-regis tered adviser before acting. Last rev iewed 4 O ct 2026.";
const HEAD = "Educational content only. Aksh Agrawal is not a SEBI-registered Research Analyst or Investment Adviser. Nothing here is a recommendation, offer or solicitation to buy or sell any security. Figures are shown with a minimum 30-day lag. Position in the security discussed: ";
const TAIL = " Investments in securities are subject to market risk; consult a SEBI-registered adviser before acting. Last reviewed ";

describe("squash helpers", () => {
  it("find the disclosure in text that has spaces inside words, where the spaced regex fails", () => {
    expect(SPLIT).not.toMatch(new RegExp(`${escapeRe(HEAD)}No\\.`));
    const squashed = new RegExp(`${literal(HEAD)}${squashedSource("(?:stated on each file|No)")}\\.${literal(TAIL)}${DATE_SQUASHED}\\.`);
    expect(squash(SPLIT)).toMatch(squashed);
  });

  it("still refuses a disclosure with a word missing or changed", () => {
    const broken = SPLIT.replace("not a SEBI", "a SEBI");
    expect(squash(broken)).not.toMatch(new RegExp(literal(HEAD)));
  });

  it("see a forbidden phrase even when the text layer split it", () => {
    expect(containsSquashed("Sa ve as P DF  and more", "Save as PDF")).toBe(true);
    expect(containsSquashed("Skip to\ncontent", "Skip to content")).toBe(true);
    expect(containsSquashed("Find a file is gone", "Find a  file")).toBe(true);
    expect(containsSquashed("nothing of the sort", "Save as PDF")).toBe(false);
  });

  it("match the dated lines with a split date or word", () => {
    const line = "This co py shows revision R3 of 4 Oc t 2026. Figures to 1 Sep 2026. The current ver sion is at the address above.";
    const re = new RegExp(
      `${squashedSource("This copy shows revision R\\d+ of")}${DATE_SQUASHED}\\.(?:${literal("Figures to")}${DATE_SQUASHED}\\.)?${literal("The current version is at the address above.")}`,
    );
    expect(squash(line)).toMatch(re);
  });
});
