import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sentenceHash } from "./hash";
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
const withCompany = { companyId, holdsPosition: "no" } as const;
const rule3 = (patch: Partial<LintInput>) => lint({ ...withCompany, ...patch }).findings.filter((f) => f.rule === "3");

describe("soft line wraps do not hide a phrase", () => {
  it.each([
    "My target\nprice is 3000.",
    "Add on\ndips.",
    "Keep a stop\nloss at 900.",
    "Book\nprofits now.",
    "Metals will\nrally.",
    "My hit\nrate is 70%.",
    "We beat the\nNifty.",
    "Windows line\r\nending: my target\r\nprice.",
  ])("flags %j", (text) => {
    expect(passes(text)).toBe(false);
  });

  it("reports the wrapped sentence with single spaces and hashes it like the unwrapped one", () => {
    const result = lint({ bodyMd: "Why I avoid\ntarget prices." });
    expect(result.findings[0]).toMatchObject({ sentence: "Why I avoid target prices.", sentenceHash: sentenceHash("Why I avoid target prices.") });
  });

  it("honours an allowance after the sentence is re-wrapped", () => {
    const allowances = new Set([sentenceHash("Why I avoid target prices.")]);
    expect(lint({ bodyMd: "Why I avoid\ntarget prices.", allowances }).passed).toBe(true);
    expect(lint({ bodyMd: "Why I avoid target prices.", allowances }).passed).toBe(true);
  });

  it("still keeps separate blocks apart", () => {
    expect(passes("The firm will\n\nrally the team.")).toBe(true);
    expect(passes("My target\n## price heading")).toBe(true);
  });
});

describe("target-of: operating targets pass, price targets flag", () => {
  it.each([
    "target of " + R + "2,400",
    "Target of Rs. 2400",
    "target price of 2400",
    "a target of $50",
    "target of INR 3000.",
    "my target of 2,400, then 3,000",
  ])("flags %s", (text) => {
    expect(passes(text)).toBe(false);
  });

  it.each([
    "The capex target of " + R + "2,400 crore was met.",
    "A revenue target of 15% was set.",
    "A margin target of 18 per cent was set.",
    "A margin target of 18 percent was set.",
    "A debt reduction target of Rs 500 crore was set.",
    "A target of 1 million subscribers was missed.",
    "A target of 40 stores and 5 mn units.",
    "A target of 300 MW by FY28.",
    "Targets of 2 bn were raised.",
  ])("does not flag %s", (text) => {
    expect(passes(text)).toBe(true);
  });
});

describe("compound terms: corporate-finance vocabulary passes, advice flags", () => {
  it.each([
    "The buy-back was funded from cash.",
    "Under the SEBI buy-back regulations",
    "The buyback was funded from cash.",
    "Two buybacks happened.",
    "Sell-side analysts expect growth.",
    "The sell side expects growth.",
    "Buy-side investors disagree.",
    "The sell-off in metals was sharp.",
    "An exit multiple of 12x EV/EBITDA",
    "Q4 exit run-rate margin was 18%",
    "The exit rate for FY26 was higher.",
  ])("does not flag %s", (text) => {
    expect(passes(text)).toBe(true);
  });

  it.each(["Buy this bank.", "Time to sell.", "Exit now.", "Time to sell off the stake.", "Sell the rally."])("still flags %s", (text) => {
    expect(passes(text)).toBe(false);
  });
});

describe("TP and SL: level forms only", () => {
  it.each(["Sl. No. 1 lists the items.", "SL Rao, the CFO, spoke.", "Tata Power (TP) reported results.", "Exhibit TP1/SL2 shows the split."])(
    "does not flag %s",
    (text) => {
      expect(passes(text)).toBe(true);
    },
  );

  it.each(["TP 2,400", "SL: 880", "SL880", "tp=2400", "TP: 2,400 in a year", "stop loss at 900", "target price 3000"])("flags %s", (text) => {
    expect(passes(text)).toBe(false);
  });
});

describe("rule 2 and undervalued inflections", () => {
  it.each([
    "It is undervalued by 25 per cent.",
    "It is undervalued by ~25%.",
    "It returned ~34%.",
    "It returned 34 percent.",
    "It returned 34 per cent.",
    "The idea beats the Nifty.",
    "We are beating the Nifty.",
    "I booked profits early.",
    "She books profit often.",
  ])("flags %s", (text) => {
    expect(passes(text)).toBe(false);
  });

  it.each(["The fund returned cash to holders.", "The index beat expectations."])("does not flag %s", (text) => {
    expect(passes(text)).toBe(true);
  });
});

describe("rule 3 recall: CMP, LTP and per-share prices", () => {
  const priced = ["CMP " + R + "2,400.", "LTP was high.", "It trades at " + R + "2,400 per share.", "Priced at Rs 2400 per share."];

  it.each(priced)("flags %s when a company is named and the data is recent or undated", (text) => {
    expect(rule3({ bodyMd: text, dataAsOf: "2026-09-25" })).not.toEqual([]);
    expect(rule3({ bodyMd: text, dataAsOf: null })).not.toEqual([]);
  });

  it.each(priced)("ignores %s without a company or with lagged data", (text) => {
    expect(lint({ bodyMd: text }).findings.filter((f) => f.rule === "3")).toEqual([]);
    expect(rule3({ bodyMd: text, dataAsOf: "2026-08-01" })).toEqual([]);
  });

  it("does not treat an ordinary per-share sentence without a price as a price", () => {
    expect(rule3({ bodyMd: "Dividends are paid per share held.", dataAsOf: "2026-09-25" })).toEqual([]);
  });
});

describe("revision binding", () => {
  it("echoes the revision id with a boolean passed and the policy version", () => {
    const json = JSON.parse(JSON.stringify(lint({})));
    expect(json).toMatchObject({ revisionId: base.revisionId, passed: true, policyVersion: expect.any(String), allowedBy: [] });
    expect(typeof json.passed).toBe("boolean");
    expect(JSON.parse(JSON.stringify(lint({ bodyMd: "Buy it." }))).passed).toBe(false);
  });
});

describe("client-safe entry", () => {
  const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

  it("keeps node and server-only imports out of the client-safe files", () => {
    for (const file of ["./rules.ts", "./policy.ts", "./sentences.ts", "./lexicon.ts", "./normalise.ts"]) {
      expect(read(file)).not.toMatch(/^import .*(node:|server-only)/m);
    }
  });

  it("puts the node:crypto hashing behind server-only", () => {
    expect(read("./hash.ts")).toMatch(/import "server-only"/);
    expect(read("./hash.ts")).toMatch(/node:crypto/);
  });
});
