import { describe, expect, it } from "vitest";
import { lintText, type LintInput } from "./lint";

// Characterisation tests: what the verbatim lexicon does and does not catch today. A "gap" test passing
// means the evasion gets through; if the lexicon is hardened later, flip the expectation deliberately.
const base: LintInput = {
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
const passes = (bodyMd: string) => lintText({ ...base, bodyMd }).passed;

describe("lint: evasions that ARE caught", () => {
  it.each([
    "stoploss at 900",
    "stop-loss at 900",
    "a multi-bagger",
    "booking profits now",
    "TP: 2,400",
    "sl 880",
    "Undervalued by 25 %",
    "BuY it",
    "Neutral. Buy now.",
  ])("flags %j", (text) => {
    expect(passes(text)).toBe(false);
  });
});

describe("lint: KNOWN GAPS (these evasions currently pass; see report)", () => {
  it.each([
    ["spaced letters", "B U Y this stock"],
    ["hyphenated target price", "The tar-get price is 3000"],
    ["hyphen for the space", "A target-price of 3000"],
    ["zero-width space inside a word", "bu​y this"],
    ["soft hyphen inside a word", "bu­y this"],
    ["Cyrillic look-alike letter", "ѕell the cyclicals"],
    ["non-breaking space in a phrase", "add on dips"],
    ["double space in a phrase", "add  on dips"],
    ["target of a rupee amount", "target of ₹2,400"],
    ["price target word order", "A price target of 2,400"],
    ["TP glued to its number", "TP2400"],
    ["inflected verb", "I am buying more and sold the rest"],
    ["book-profit with a hyphen", "Time to book-profit"],
  ])("lets through %s", (_label, text) => {
    expect(passes(text)).toBe(true);
  });
});
