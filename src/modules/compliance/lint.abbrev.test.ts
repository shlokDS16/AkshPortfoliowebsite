import { describe, expect, it } from "vitest";
import { KEYWORDS, LEXICON } from "./lexicon";
import { lintText } from "./lint";
import type { LintInput } from "./rules";

const R = String.fromCharCode(0x20b9); // rupee sign, kept out of the source as a raw character
const companyId = "6f1c2a8e-5d7b-4c1e-9a3f-2b8d7e6c5a41";

const base: LintInput = {
  revisionId: "5b1d9c1e-0a53-4f3e-8c53-2d6a9a7e1f10",
  kind: "learning",
  title: "How capex cycles turn",
  slug: null,
  learningObjective: "Recognise the late stage of a capex cycle.",
  bodyMd: "Neutral.",
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
const lint = (patch: Partial<LintInput>) => lintText({ ...base, ...patch });
const passes = (bodyMd: string) => lint({ bodyMd }).passed;
const rule3 = (bodyMd: string) =>
  lint({ companyId, holdsPosition: "no", dataAsOf: "2026-09-25", bodyMd }).findings.filter((f) => f.rule === "3");

describe("Rs. amounts: rule 3 now sees the whole sentence", () => {
  it.each(["Priced at Rs. 2400 per share.", "The stock is trading at Rs. 2,400.", "The price is Rs. 2,400 today.", "Valuation of Rs. 5,000 crore."])(
    "flags %s",
    (text) => {
      expect(rule3(text)).not.toEqual([]);
    },
  );

  it("does not flag a sentence with no price", () => {
    expect(rule3("Tata Ltd. reported strong volumes.")).toEqual([]);
  });
});

describe("target-of with Rs.", () => {
  it.each(["Target of Rs. 2400", "A target of Rs. 2,400 per share.", "Target price of Rs. 3000", "target of " + R + " 2,400"])("flags %s", (text) => {
    expect(passes(text)).toBe(false);
  });

  it.each([
    "A debt reduction target of Rs. 500 crore was set.",
    "A capex target of Rs. 2,400 crore was met.",
    "A capex target of " + R + "2,400 crore was met.",
    "A target of Rs. 1.5 bn was set.",
    "A target of Rs.",
  ])("does not flag %s", (text) => {
    expect(passes(text)).toBe(true);
  });
});

describe("TP and SL with currency and connector words", () => {
  it.each([
    "TP Rs 2,400",
    "TP: Rs. 2,400",
    "TP Rs. 2,400",
    "TP " + R + "2,400",
    "TP: " + R + "2,400",
    "SL below 880",
    "SL at 880",
    "SL above Rs. 880",
    "TP of 2400",
    "TP - 2400",
    "TP = 2400",
    "TP near $50",
    "TP 2,400",
    "SL: 880",
    "SL880",
  ])("flags %s", (text) => {
    expect(passes(text)).toBe(false);
  });

  it.each([
    "Sl. No. 1 lists the items.",
    "SL Rao, the CFO, spoke.",
    "Tata Power (TP) reported results.",
    "Exhibit TP1/SL2 shows the split.",
    "The TP and the SL were discussed in the paper.",
  ])("does not flag %s", (text) => {
    expect(passes(text)).toBe(true);
  });
});

describe("buy-back and sell-off prose passes; re-entry advice flags", () => {
  it.each([
    "The company will buy back shares.",
    "It will buy back its shares in 2026.",
    "The board approved a buy back of the company stock.",
    "The buyback at Rs 1,000 per share closed.",
    "The buy-back was funded from cash.",
    "The sell-off in metals was sharp.",
    "Buy-side and sell-side views differ.",
  ])("does not flag %s", (text) => {
    expect(passes(text)).toBe(true);
  });

  it.each(["Buy back in at 900.", "Buy back Reliance below 2400.", "Sell off the stock now.", "Time to buy back."])("flags %s", (text) => {
    expect(passes(text)).toBe(false);
  });
});

describe("rule 2 numbers with thousands separators", () => {
  it.each(["It returned 1,200%.", "It returned 1,200 per cent.", "It returned 1,200.5%.", "Undervalued by 1,200%."])("flags %s", (text) => {
    expect(passes(text)).toBe(false);
  });
});

// One flagged example per lexicon entry. Adding a lexicon entry without an example fails the first test.
const EXAMPLES: Record<string, string> = {
  buy: "You should buy it.",
  sell: "Please sell now.",
  accumulate: "Accumulate on weakness.",
  "add-on-dips": "Add on dips for the long term.",
  exit: "Exit before results.",
  "book-profit": "Book profits at these levels.",
  "target-price": "My target price is 3000.",
  "price-target": "The price target is high.",
  "target-of": "A target of Rs. 2,400 was set.",
  "stop-loss": "Keep a stop loss at 900.",
  "tp-level": "TP near Rs. 2,400",
  "sl-level": "SL below 880",
  "buying-opportunity": "This is a buying opportunity.",
  "time-to": "Time to accumulate.",
  "upside-of": "There is an upside of 40 percent.",
  multibagger: "A multibagger in the making.",
  "will-rally": "Metals will rally.",
  "will-fall": "The stock will fall.",
  "undervalued-by": "It is undervalued by 25 percent.",
  "returned-pct": "It returned 34 percent.",
  "my-calls": "My calls were right.",
  "hit-rate": "My hit rate is high.",
  "beat-the-nifty": "We beat the Nifty.",
  "cagr-of-my": "The CAGR of my ideas is high.",
};

describe("hyphenated spellings of every lexicon keyword are flagged", () => {
  it("has an example for every lexicon entry", () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual(LEXICON.map((entry) => entry.id).sort());
  });

  it.each(Object.entries(EXAMPLES))("%s: %s", (_id, example) => {
    expect(passes(example)).toBe(false);
    const words = (example.match(/[A-Za-z]{3,}/g) ?? []).filter((word) => KEYWORDS.has(word.toLowerCase()));
    expect(words.length).toBeGreaterThan(0);
    for (const word of words) {
      const middle = Math.floor(word.length / 2);
      const halved = `${word.slice(0, middle)}-${word.slice(middle)}`; // "tar-get", "ac-cumulate"
      const everyLetter = word.split("").join("-");
      expect(passes(example.replace(word, halved)), halved).toBe(false);
      expect(passes(example.replace(word, everyLetter)), everyLetter).toBe(false);
    }
  });
});
