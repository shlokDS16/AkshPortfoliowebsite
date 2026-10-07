import { describe, expect, it } from "vitest";
import { KAVERI } from "@/test/fixtures/casefile";
import { fullTextOf, sentenceDiff } from "./diff";

const body = (view: string, tests = "- T1: Margin falls below 28%.") => `${view}\n\n## What would prove me wrong\n${tests}`;

describe("sentenceDiff", () => {
  it("groups removed and added sentences by where they sit, without chip tokens", () => {
    const groups = sentenceDiff(KAVERI.revisions[0].bodyMd, KAVERI.revisions[1].bodyMd);
    expect(groups).toEqual([
      {
        location: "Aksh's view, paragraph 3",
        removed: ["Receivable days rose to 142, from 81 four years ago."],
        added: ["Receivable days rose again to 142, from 81 four years ago, and the order book grew faster than revenue."],
      },
      { location: "I would be wrong if", removed: [], added: ["T3: The dealer count shrinks for two straight years."] },
    ]);
  });

  it("gives the full text of a revision as reading paragraphs", () => {
    expect(fullTextOf(KAVERI.revisions[0].bodyMd)[0]).toBe(
      "Kaveri ships most of its pumps through about 1,900 dealers. Revenue reached ₹1,284 cr in FY26, up from ₹1,102 cr a year earlier.",
    );
  });

  it("hands back Aksh's sentences verbatim: inner spacing, capitals and odd punctuation are untouched (rule g)", () => {
    const older = body("I like  ITC's moat ,  and HUL too.");
    const newer = body("I like  ITC's moat ,  and HUL too.\n\nGross  margin HELD at 31.4% [F2], iPhone-style  pricing ?");
    expect(sentenceDiff(older, newer)).toEqual([
      { location: "Aksh's view, paragraph 2", removed: [], added: ["Gross  margin HELD at 31.4%, iPhone-style  pricing ?"] },
    ]);
  });

  it("keeps a condition's inner spacing and case, and reports an edited condition as removed plus added", () => {
    const groups = sentenceDiff(body("One."), body("One.", "- T1: Margin  falls BELOW 28%."));
    expect(groups).toEqual([{ location: "I would be wrong if", removed: ["T1: Margin falls below 28%."], added: ["T1: Margin  falls BELOW 28%."] }]);
  });

  it("does not split at abbreviations or decimals, and never invents text", () => {
    const text = "Revenue was Rs. 2,400 crore and grew 2.5x. Ltd. reported more.";
    const [group] = sentenceDiff(body("Same."), body(`Same.\n\n${text}`));
    expect(group.added).toEqual(["Revenue was Rs. 2,400 crore and grew 2.5x.", "Ltd. reported more."]);
    expect(group.added.join(" ")).toBe(text);
  });

  it("reads full text with the same verbatim rule", () => {
    expect(fullTextOf(body("Kept  as typed [F1], ITC."))[0]).toBe("Kept  as typed, ITC.");
  });
});
