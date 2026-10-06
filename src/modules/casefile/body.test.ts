import { describe, expect, it } from "vitest";
import { KAVERI } from "@/test/fixtures/casefile";
import { checkCaseFile } from "./check";
import { parseFactsSheet } from "./sheet";
import { inlineText, parseInline, parseProse, splitThesisBody } from "./body";

describe("thesis body template (D6)", () => {
  it("splits VIEW from the test conditions under the required heading", () => {
    const { viewMd, conditions } = splitThesisBody(KAVERI.revisions[1].bodyMd);
    expect(viewMd).not.toMatch(/What would prove me wrong/);
    expect(conditions.map((c) => c.id)).toEqual(["T1", "T2", "T3"]);
    expect(conditions[2].text).toBe("The dealer count shrinks for two straight years.");
  });

  it("never lets a condition swallow the next line when it is empty", () => {
    const { conditions } = splitThesisBody("View.\n\n## What would prove me wrong\n- T1:\n- T2: Margin  falls below 28%.");
    expect(conditions).toEqual([{ id: "T2", text: "Margin  falls below 28%." }]);
  });

  it("parses paragraphs, headings, lists and [F1] chips, nothing else (D7)", () => {
    expect(parseProse("Revenue [F1] grew.\nStill the same paragraph.\n\n## Next\n- one\n- two [F2]")).toEqual([
      { kind: "p", inline: ["Revenue ", { chip: "F1" }, " grew. Still the same paragraph."] },
      { kind: "h", text: "Next" },
      { kind: "ul", items: [["one"], ["two ", { chip: "F2" }]] },
    ]);
    expect(parseProse("<script>alert(1)</script>")).toEqual([{ kind: "p", inline: ["<script>alert(1)</script>"] }]);
  });

  it("drops chip tokens from reading text and touches nothing else (rule g)", () => {
    expect(inlineText(parseInline("Revenue reached ₹1,284 cr in FY26 [F1], up from last year."))).toBe("Revenue reached ₹1,284 cr in FY26, up from last year.");
    expect(inlineText(parseInline("Revenue [F1] grew."))).toBe("Revenue grew.");
    expect(inlineText(parseInline("[F1] Revenue grew."))).toBe("Revenue grew.");
    // Inner spacing, odd punctuation spacing and capitals are Aksh's and stay as typed.
    expect(inlineText(parseInline("I like  ITC's  moat ,  and HUL  too [F2]."))).toBe("I like  ITC's  moat ,  and HUL  too.");
    expect(inlineText(parseInline("word[F1]word"))).toBe("wordword");
  });

  it("checks that chips and readings match the sheet", () => {
    const cf = parseFactsSheet(KAVERI.revisions[1].sheet).caseFile;
    expect(checkCaseFile(KAVERI.revisions[1].bodyMd, cf)).toEqual([]);
    expect(checkCaseFile(`Revenue [F9].\n\n## What would prove me wrong\n- T1: x`, cf)).toEqual([
      "The view cites [F9], which is not in the facts sheet.",
      "T2 has a reading in the facts sheet but no condition under \"What would prove me wrong\".",
    ]);
  });

  it("tells Aksh when a source link will not be shown (rule c)", () => {
    const cf = parseFactsSheet(KAVERI.revisions[1].sheet).caseFile;
    const linked = (url: string) => ({ ...cf, sources: cf.sources.map((x) => ({ ...x, url })) });
    expect(checkCaseFile(KAVERI.revisions[1].bodyMd, linked("https://example.org/a.pdf"))).toEqual([]);
    expect(checkCaseFile(KAVERI.revisions[1].bodyMd, linked("javascript:alert(1)"))).toEqual(["S1 has a link that is not an http or https address, so readers will not see it."]);
  });
});
