import { describe, expect, it } from "vitest";
import { caseRecordFixture } from "@/test/fixtures/case-record";
import { lintText } from "./lint";
import type { LintInput } from "./rules";
import { lintWords } from "./words";

// F11: the hint while he writes and the gate must flag the same sentences for rules 1, 2 and 10. The two share one list today;
// this fails if someone adds a check to the gate (or the hint) outside it.

const CORPUS = [
  "I would buy more on any dip.",
  "Time to sell.",
  "Accumulate below 500.",
  "Add on dips.",
  "Book profits here.",
  "Target price of Rs 900.",
  "Set a stop loss under 400.",
  "TP 2,400 and SL 1,900.",
  "A multibagger in the making.",
  "Upside of 40% from here.",
  "It returned 30% in a year.",
  "My calls beat the Nifty.",
  "The hit rate was poor.",
  "The share is down 18% since I opened it.",
  "It trades at Rs 450, cheap for its growth.",
  "I opened at \u20B9450 a share.",
  "Looking back it is up 3x.",
  "A 40% gain would not have changed my mind.",
  "The company did a buy-back of its shares.",
  "Sell side analysts disagreed.",
  "Revenue grew 20% last year.",
  "An order book of Rs 500 crore.",
  "Seed demand looks steady.",
  "I waited too long on the monsoon signal.",
  "Closing: the margin story did not hold.",
  "The exit multiple was assumed.",
  "I now think this needs two seasons, not one.",
];

const base = (bodyMd: string): LintInput => ({
  revisionId: "5b1d9c1e-0a53-4f3e-8c53-2d6a9a7e1f10",
  kind: "case_study",
  title: "A closed idea",
  slug: null,
  learningObjective: "See how a view was formed and judged.",
  bodyMd,
  structured: { ledger: caseRecordFixture() },
  changeReason: null,
  companyName: null,
  companyOneLiner: null,
  themeName: null,
  conceptNames: [],
  conceptSlugs: [],
  companyId: null,
  holdsPosition: null,
  dataAsOf: "2026-06-16",
  today: "2026-10-15",
  allowances: new Set(),
});

describe("the hint and the gate flag the same sentences", () => {
  it("agrees on every sentence of the corpus, taken one at a time and all together", () => {
    const gate = (text: string) =>
      new Set(lintText(base(text)).findings.filter((f) => ["1", "2", "10"].includes(f.rule)).map((f) => f.sentence));
    for (const sentence of CORPUS) expect(new Set(lintWords(sentence).map((f) => f.sentence)), sentence).toEqual(gate(sentence));
    const all = CORPUS.join("\n\n");
    expect(new Set(lintWords(all).map((f) => f.sentence))).toEqual(gate(all));
    expect(lintWords(all).length).toBeGreaterThan(10);
  });
});
