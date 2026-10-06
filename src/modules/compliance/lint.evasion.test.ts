import { describe, expect, it } from "vitest";
import { lintText, type LintInput } from "./lint";
import { sentenceHash } from "./sentences";

// Evasion cases for the publishing-rules rule 1 lexicon (controller ruling: rule 1 beats the brief's
// verbatim lexicon). Everything here must be flagged, except the bare-verb negatives and the documented
// remaining gaps at the end.
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
const lint = (patch: Partial<LintInput>) => lintText({ ...base, ...patch });
const passes = (bodyMd: string) => lint({ bodyMd }).passed;

describe("lint evasions that are flagged", () => {
  it.each([
    ["spaced letters", "B U Y this stock"],
    ["dotted letters", "Time to s.e.l.l the lot"],
    ["spaced letters with a stray leading letter", "I B U Y it"],
    ["hyphenated target price", "The tar-get price is 3000"],
    ["hyphen for the space", "A target-price of 3000"],
    ["underscore for the space", "target_price 3000"],
    ["hyphenated book profit", "Time to book-profit"],
    ["split by hyphens inside buy", "Please b-u-y it"],
    ["zero-width space inside a word", "bu\u200By this"],
    ["zero-width joiner and word joiner", "s\u200De\u2060ll it"],
    ["zero-width space instead of the space", "add\u200Bon dips"],
    ["soft hyphen inside a word", "bu\u00ADy this"],
    ["Cyrillic look-alike letters", "\u0455\u0435ll the cyclicals"],
    ["Cyrillic letters in buy", "bu\u0443 it"],
    ["Greek look-alike letters", "s\u03B5ll it"],
    ["full-width letters", "\uFF42\uFF55\uFF59 now"],
    ["non-breaking space in a phrase", "add\u00A0on dips"],
    ["narrow no-break space in a phrase", "target\u202Fprice 3000"],
    ["double space and tab in a phrase", "add  on\tdips"],
    ["target of a rupee amount", "target of \u20B92,400"],
    ["target of Rs", "Target of Rs. 2400"],
    ["target price of a number", "target price of 2400"],
    ["target of a dollar amount", "a target of $50"],
    ["price target word order", "A price target of 2,400"],
    ["TP glued to its number", "TP2400"],
    ["TP with a colon", "TP: 2,400"],
    ["TP with an equals sign", "tp=2400"],
    ["SL glued to its number", "SL880"],
    ["buying opportunity", "This is a buying opportunity"],
    ["time to buy", "Time to buy"],
    ["time to sell", "time  to sell"],
    ["time to exit", "Time to exit the position"],
    ["time to accumulate", "Time to accumulate"],
    ["rule 2 phrase, spaced letters", "my h i t rate is high"],
    ["rule 2 phrase, Cyrillic", "my c\u0430lls were right"],
  ])("flags %s", (_label, text) => {
    expect(passes(text)).toBe(false);
  });

  it("reports the sentence as typed and the rule, not the folded text", () => {
    const typed = "Please b\u0443y B U Y  now.";
    const result = lint({ bodyMd: typed });
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      expect(finding.sentence).toBe(typed);
      expect(finding.sentenceHash).toBe(sentenceHash(typed));
      expect(finding.field).toBe("body");
    }
  });

  it("applies the same folding to every public field", () => {
    expect(lint({ title: "B U Y this" }).findings[0]).toMatchObject({ field: "title", sentence: "B U Y this" });
    expect(lint({ changeReason: "bu\u200By" }).findings[0]).toMatchObject({ field: "changeReason", rule: "1" });
    expect(lint({ structured: { note: "tar-get price" } }).findings[0]).toMatchObject({ field: "structured" });
  });

  it("folds when checking rule 3 price numbers too", () => {
    const result = lint({ companyId: "6f1c2a8e-5d7b-4c1e-9a3f-2b8d7e6c5a41", holdsPosition: "no", dataAsOf: "2026-09-25", bodyMd: "It was tr\u0430ding at 18x earnings." });
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: "3" }));
  });
});

describe("bare verbs and look-alikes stay clean", () => {
  it.each([
    "The company sold 2 million pumps last year.",
    "Management bought back shares.",
    "Buying power fell as inflation rose.",
    "Selling expenses rose faster than revenue.",
    "The buyer was a strategic investor.",
    "The firm exited the retail segment in 2019.",
    "Operating leverage turned negative.",
    "Capex of 2 billion was a stretch target for the plant team.",
    "Plan A or B depends on utilisation.",
  ])("does not flag: %s", (text) => {
    expect(passes(text)).toBe(true);
  });
});

describe("allowance hash is over the sentence as typed", () => {
  const sentence = "Why I avoid target prices.";
  const allowances = new Set([sentenceHash(sentence)]);

  it("still matches after harmless whitespace and case changes", () => {
    for (const variant of ["Why I avoid target prices.", "why  i avoid\ttarget\u00A0prices.", "WHY I AVOID TARGET PRICES.", "Why I avoid\u202Ftarget prices."]) {
      expect(lint({ bodyMd: variant, allowances }).passed).toBe(true);
    }
  });

  it("does not stretch to a differently spelled sentence that only folds to the same text", () => {
    expect(lint({ bodyMd: "Why I avoid tar-get prices.", allowances }).passed).toBe(false);
    expect(lint({ bodyMd: "Why I avoid target pr\u0456ces.", allowances }).passed).toBe(false);
  });
});

describe("remaining known gaps (documented, not caught)", () => {
  it.each([
    ["a letter run split across sentence ends", "B. U. Y."],
    ["a word split by a single space", "bu y it"],
    ["letter-spaced two-letter abbreviation with digits", "T P 2400"],
    ["unlisted synonyms", "I would load up here"],
    ["an unmapped look-alike", "b\u00FCy it"],
  ])("lets through %s", (_label, text) => {
    expect(passes(text)).toBe(true);
  });
});
