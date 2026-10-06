import { describe, expect, it } from "vitest";
import { lintText } from "./lint";
import type { LintInput } from "./rules";
import { POLICY_VERSION } from "./policy";
import { sentenceHash } from "./hash";

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
  companyId: null,
  holdsPosition: null,
  dataAsOf: null,
  today: "2026-10-04",
  allowances: new Set<string>(),
};
const lint = (patch: Partial<LintInput>) => lintText({ ...base, ...patch });

describe("lintText: clean educational text", () => {
  it("passes and stamps the policy version", () => {
    expect(lint({})).toEqual({ revisionId: base.revisionId, passed: true, policyVersion: POLICY_VERSION, findings: [], allowedBy: [] });
  });

  it("passes when every optional public field is filled with clean text", () => {
    const result = lint({
      changeReason: "Clarified the utilisation chart.",
      companyName: "Example Industries Ltd",
      companyOneLiner: "Makes industrial valves.",
      themeName: "Capex cycles",
    });
    expect(result.passed).toBe(true);
  });

  it.each([
    "The buyback was funded from cash.",
    "Selling expenses rose faster than revenue.",
    "The promoter exited a joint venture in 2019.",
  ])("does not flag look-alike words: %s", (sentence) => {
    expect(lint({ bodyMd: sentence }).passed).toBe(true);
  });
});

describe("lintText: adversarial phrases (spec s10, publishing-rules rules 1-2)", () => {
  it.each([
    ["buy", "You should buy RELIANCE here.", "1"],
    ["BUY upper case", "BUY on any weakness.", "1"],
    ["sell", "Time to sell the cyclicals.", "1"],
    ["accumulate on dips", "Accumulate on dips below the 200 DMA.", "1"],
    ["add on dips", "Add on dips for the long term.", "1"],
    ["exit", "I would exit before results.", "1"],
    ["book profit", "Book profits at these levels.", "1"],
    ["target price", "My target price is 3000.", "1"],
    ["TP 2,400", "TP 2,400 in twelve months.", "1"],
    ["stop loss", "Keep a stop loss at 900.", "1"],
    ["SL", "SL 880 on a closing basis.", "1"],
    ["upside of", "There is an upside of 40 percent.", "1"],
    ["multibagger", "This is a multibagger in the making.", "1"],
    ["will rally", "Metals will rally next quarter.", "1"],
    ["will fall", "The stock will fall after results.", "1"],
    ["undervalued by X%", "The stock is undervalued by 25%.", "1"],
    ["markdown emphasis", "Please **buy** it.", "1"],
    ["returned 34%", "This idea returned 34% since January.", "2"],
    ["my calls", "My calls have been right all year.", "2"],
    ["hit rate", "My hit rate is 70 out of 100.", "2"],
    ["beat the Nifty", "Our ideas beat the Nifty.", "2"],
    ["CAGR of my ideas", "The CAGR of my ideas is high.", "2"],
  ])("flags %s", (_label, sentence, rule) => {
    const result = lint({ bodyMd: `Context first. ${sentence} More context.` });
    expect(result.passed).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ rule, field: "body", sentence }));
  });

  it("lints the whole public surface, not only the body (ADR-001 s8.3)", () => {
    expect(lint({ title: "Buy this bank" }).findings[0]).toMatchObject({ field: "title", rule: "1" });
    expect(lint({ slug: "why-to-buy-hdfc" }).findings[0]).toMatchObject({ field: "slug", rule: "1" });
    expect(lint({ learningObjective: "Learn when to sell." }).findings[0]).toMatchObject({ field: "learningObjective" });
    expect(lint({ structured: { notes: ["Accumulate slowly"] } }).findings[0]).toMatchObject({ field: "structured" });
  });

  it("lints the revision change reason and the company and theme labels shown on public pages (ruling R1)", () => {
    expect(lint({ changeReason: "Added a reason to buy" }).findings[0]).toMatchObject({ field: "changeReason", rule: "1" });
    expect(lint({ companyName: "Hit Rate Holdings" }).findings[0]).toMatchObject({ field: "companyName", rule: "2" });
    expect(lint({ companyOneLiner: "A stock to accumulate" }).findings[0]).toMatchObject({ field: "companyOneLiner", rule: "1" });
    expect(lint({ themeName: "Multibagger ideas" }).findings[0]).toMatchObject({ field: "themeName", rule: "1" });
  });

  it("treats null and empty optional public fields as nothing to lint", () => {
    expect(lint({ changeReason: "", companyName: "  ", companyOneLiner: null, themeName: null, slug: null }).passed).toBe(true);
  });

  it("finds a phrase in a nested structured value", () => {
    const result = lint({ structured: { scenarios: [{ label: "Base", note: "Book profits here." }] } });
    expect(result.findings).toContainEqual(expect.objectContaining({ field: "structured", rule: "1" }));
  });

  it("reports every matching phrase in one sentence", () => {
    const result = lint({ bodyMd: "Buy now, target price 3000." });
    expect(result.findings.map((f) => f.match?.toLowerCase())).toEqual(expect.arrayContaining(["buy", "target price"]));
  });

  it("still flags the standard disclosure if someone pastes it into the body (it is rendered, never linted or typed)", () => {
    const disclosure =
      "Nothing here is a recommendation, offer or solicitation to buy or sell any security. Figures are shown with a minimum 30-day lag.";
    const result = lint({ bodyMd: disclosure });
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.match?.toLowerCase())).toEqual(expect.arrayContaining(["buy", "sell"]));
  });
});

describe("lintText: allowances and cited quotes", () => {
  const sentence = "Why I avoid target prices.";
  const allow = (s: string) => new Set([sentenceHash(s)]);

  it("flags an educational sentence until Aksh allows it", () => {
    const blocked = lint({ bodyMd: sentence });
    expect(blocked.passed).toBe(false);
    const allowed = lint({ bodyMd: sentence, allowances: allow(sentence) });
    expect(allowed.passed).toBe(true);
    expect(allowed.allowedBy).toEqual([
      { rule: "1", field: "body", sentence, sentenceHash: sentenceHash(sentence), match: "target prices" },
    ]);
  });

  it("matches an allowance regardless of case and spacing", () => {
    const result = lint({ bodyMd: "why i  AVOID target prices.", allowances: allow(sentence) });
    expect(result.passed).toBe(true);
  });

  it("does not let an allowance for one sentence cover another", () => {
    const result = lint({ bodyMd: "Why I avoid target prices. You should buy it.", allowances: allow(sentence) });
    expect(result.passed).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule: "1", sentence: "You should buy it." });
  });

  it("ignores an allowance for a rule 2 performance claim", () => {
    const claim = "My hit rate is 70 out of 100.";
    const result = lint({ bodyMd: claim, allowances: allow(claim) });
    expect(result.passed).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: "2", sentence: claim }));
    expect(result.allowedBy).toEqual([]);
  });

  it("allows only the rule 1 part of a sentence that also makes a performance claim", () => {
    const mixed = "My calls never used a target price.";
    const result = lint({ bodyMd: mixed, allowances: allow(mixed) });
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toEqual(["2"]);
    expect(result.allowedBy.map((a) => a.rule)).toEqual(["1"]);
  });

  it("exempts quoted source text that carries a citation URL", () => {
    const quote = { title: "Broker note", url: "https://example.com/note.pdf", quote: "We rate the stock a BUY with TP 2,400." };
    expect(lint({ structured: { sources: [quote] } }).passed).toBe(true);
    expect(lint({ structured: { sources: [{ ...quote, url: "" }] } }).passed).toBe(false);
    expect(lint({ structured: { sources: [{ ...quote, url: "   " }] } }).passed).toBe(false);
    expect(lint({ structured: { sources: [{ title: quote.title, quote: quote.quote }] } }).passed).toBe(false);
  });

  it("exempts a cited quote from rule 2 as well", () => {
    const quote = { url: "https://example.com/a", quote: "The fund's hit rate was 70%." };
    expect(lint({ structured: { sources: [quote] } }).passed).toBe(true);
  });

  it("exempts only the quote, not the other fields of a cited source", () => {
    const source = { title: "Why to buy", url: "https://example.com/a", quote: "A neutral sentence." };
    const result = lint({ structured: { sources: [source] } });
    expect(result.findings).toContainEqual(expect.objectContaining({ field: "structured", sentence: "Why to buy" }));
  });

  it("still applies rule 3 to a cited quote", () => {
    const quote = { url: "https://example.com/a", quote: "It was trading at 18x earnings." };
    const result = lint({
      companyId: "6f1c2a8e-5d7b-4c1e-9a3f-2b8d7e6c5a41",
      holdsPosition: "no",
      dataAsOf: "2026-09-20",
      structured: { sources: [quote] },
    });
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: "3" }));
  });

  it("never lets an allowance cover rule 3", () => {
    const priceSentence = "It was trading at 18x earnings.";
    const result = lint({
      companyId: "6f1c2a8e-5d7b-4c1e-9a3f-2b8d7e6c5a41",
      holdsPosition: "no",
      dataAsOf: "2026-09-20",
      bodyMd: priceSentence,
      allowances: allow(priceSentence),
    });
    expect(result.passed).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: "3", sentence: priceSentence }));
  });
});

describe("lintText: structural rules", () => {
  const companyId = "6f1c2a8e-5d7b-4c1e-9a3f-2b8d7e6c5a41";

  it("accepts price numbers once the data is at least 30 days old (rule 3)", () => {
    expect(lint({ companyId, holdsPosition: "no", dataAsOf: "2026-08-01", bodyMd: "It was trading at 18x earnings." }).passed).toBe(true);
  });

  it("treats data exactly 30 days old as lagged and 29 days old as not", () => {
    const body = "It was trading at 18x earnings.";
    expect(lint({ companyId, holdsPosition: "no", dataAsOf: "2026-09-04", bodyMd: body }).passed).toBe(true);
    expect(lint({ companyId, holdsPosition: "no", dataAsOf: "2026-09-05", bodyMd: body }).passed).toBe(false);
  });

  it("checks price numbers when the company is named and no as-of date is given (rule 3)", () => {
    expect(lint({ companyId, holdsPosition: "no", dataAsOf: null, bodyMd: "It was trading at 18x earnings." }).passed).toBe(false);
  });

  it("requires a learning objective (rule 6)", () => {
    expect(lint({ learningObjective: "  " }).findings).toContainEqual(expect.objectContaining({ rule: "6" }));
    expect(lint({ learningObjective: null }).findings).toContainEqual(expect.objectContaining({ rule: "6" }));
  });

  it("requires holds_position when a company is named (rule 5)", () => {
    expect(lint({ companyId }).findings).toContainEqual(expect.objectContaining({ rule: "5" }));
  });

  it("requires a 'What would prove me wrong' section on theses (spec s6)", () => {
    expect(lint({ kind: "thesis" }).findings).toContainEqual(expect.objectContaining({ rule: "structure" }));
    expect(lint({ kind: "thesis", bodyMd: "View.\n\n## What would prove me wrong\nIf margins shrink." }).passed).toBe(true);
  });

  it("requires a case study to use data at least 30 days old (rule 3)", () => {
    expect(lint({ kind: "case_study", bodyMd: "## What would prove me wrong\nX.", dataAsOf: "2026-09-25" }).findings).toContainEqual(
      expect.objectContaining({ rule: "3", field: null }),
    );
  });

  it("never lets an allowance clear a structural finding", () => {
    const result = lint({ kind: "thesis", allowances: new Set([sentenceHash("Capacity additions slowed after utilisation peaked.")]) });
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: "structure" }));
  });
});
