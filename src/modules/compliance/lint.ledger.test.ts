import { describe, expect, it } from "vitest";
import { caseRecordFixture, sealFixtureEvent, type FixtureEvent, type FixtureRecord } from "@/test/fixtures/case-record";
import { sentenceHash } from "./hash";
import { lintText } from "./lint";
import type { LintInput } from "./rules";

// D42: the lint reads every word he sealed, once, and nothing the machine made (publishing rule 10.8).

const input = (structured: Record<string, unknown>, allowances: string[] = []): LintInput => ({
  revisionId: "5b1d9c1e-0a53-4f3e-8c53-2d6a9a7e1f10",
  kind: "case_study",
  title: "A closed idea, Jan 2026 to Jun 2026",
  slug: null,
  learningObjective: "See how a view was formed and judged.",
  bodyMd: "## What would prove me wrong\n\nThe margin story reversing.",
  structured,
  changeReason: null,
  companyName: null,
  companyOneLiner: null,
  themeName: null,
  companyId: null,
  holdsPosition: null,
  dataAsOf: "2026-06-16",
  today: "2026-10-15",
  allowances: new Set(allowances),
});

const record = (patch: Partial<FixtureRecord> = {}): FixtureRecord => caseRecordFixture(patch);
const withWords = (words: string, index = 0): FixtureEvent[] => {
  const events = caseRecordFixture().events;
  const old = events[index] as FixtureEvent;
  events[index] = sealFixtureEvent(old.prev_hash, old.seq, old.kind, old.at, words, old.stance);
  return events;
};

describe("lintText reads the words of a ledger case study", () => {
  it("passes a clean record", () => {
    expect(lintText(input({ ledger: record() })).findings).toEqual([]);
  });

  it("reports a refused sentence in an entry's words once, in the structured field, with the sentence", () => {
    const sentence = "I would buy more on any dip.";
    const result = lintText(input({ ledger: record({ events: withWords(`Seed demand is steady. ${sentence}`) }) }));
    const hits = result.findings.filter((f) => f.rule === "1");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ field: "structured", sentence, sentenceHash: sentenceHash(sentence) });
  });

  it("reports nothing from the sealed text when the words are clean (the canonical copy is not linted)", () => {
    const events = caseRecordFixture().events;
    const first = events[0] as FixtureEvent;
    // The sealed text holds a refused word; the words he wrote do not. Only the words are his.
    events[0] = { ...first, canonical: first.canonical.replace("Kaveri Seed Company Limited", "Kaveri Seed Company Limited, a buy") };
    expect(lintText(input({ ledger: record({ events }) })).findings).toEqual([]);
  });

  it("does not read the fixed keys: hashes, dates, the company name and symbol, the stance", () => {
    const events = caseRecordFixture().events.map((e) => ({ ...e, stance: { reason: "buy more", note: "sell" } }));
    const result = lintText(input({ ledger: record({ company: "Buy Hold Ltd", symbol: "BUY", events }) }));
    expect(result.findings).toEqual([]);
  });

  it("reads every revealed entry, not only the first", () => {
    const result = lintText(input({ ledger: record({ events: withWords("You should sell now.", 3) }) }));
    expect(result.findings.filter((f) => f.rule === "1")).toHaveLength(1);
  });

  it("honours a sentence allowance for rule 1, as for any public text", () => {
    const sentence = "I would buy more on any dip.";
    const result = lintText(input({ ledger: record({ events: withWords(sentence) }) }, [sentenceHash(sentence)]));
    expect(result.findings).toEqual([]);
    expect(result.allowedBy).toHaveLength(1);
    expect(result.allowedBy[0]).toMatchObject({ rule: "1", field: "structured", sentence });
  });

  it("still lints other structured data next to the record", () => {
    const result = lintText(input({ ledger: record(), note: "Please buy this." }));
    expect(result.findings.filter((f) => f.rule === "1")).toHaveLength(1);
  });

  it("does not throw on a record it cannot read, and reads the words it can find", () => {
    expect(() => lintText(input({ ledger: null }))).not.toThrow();
    expect(() => lintText(input({ ledger: { events: "x" } }))).not.toThrow();
    expect(() => lintText(input({ ledger: { events: [null, 4, { words: 7 }] } }))).not.toThrow();
    const result = lintText(input({ ledger: { events: [null, { words: "Sell it all." }] } }));
    expect(result.findings.filter((f) => f.rule === "1")).toHaveLength(1);
  });
});

describe("rule 10.7: a ledger case study prints no price or return in his own words", () => {
  const rule10 = (result: ReturnType<typeof lintText>) => result.findings.filter((f) => f.rule === "10");
  const failing = [
    ["close words", "The share is down 18% since I opened it."],
    ["close words, a multiple", "Looking back it is up 3x from my entry."],
    ["close words, a rupee price", "It trades at Rs 450, cheap for its growth."],
    ["close words, the rupee sign", "I opened at ₹450 a share."],
    ["close words, a gain", "A 40% gain would not have changed my mind."],
  ] as const;

  for (const [label, sentence] of failing) {
    it(`fails with rule 10 for ${label}: ${sentence}`, () => {
      const result = lintText(input({ ledger: record({ events: withWords(sentence, 2) }) }));
      const hits = rule10(result);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0]).toMatchObject({ field: "structured", sentence, message: "A case study from the ledger prints no price or return (publishing rule 10.7)." });
      expect(result.passed).toBe(false);
    });
  }

  it("fails the body \"It trades at Rs 450.\" and the title and the change reason too", () => {
    const base = input({ ledger: record() });
    expect(rule10(lintText({ ...base, bodyMd: "It trades at Rs 450." }))).toHaveLength(1);
    expect(rule10(lintText({ ...base, bodyMd: "₹450 a share." }))).toHaveLength(1);
    expect(rule10(lintText({ ...base, title: "Down 18% since I opened it" }))).toHaveLength(1);
    expect(rule10(lintText({ ...base, changeReason: "Fixed the Rs 450 typo." }))).toHaveLength(1);
  });

  it("lets clean sentences through", () => {
    for (const text of ["Revenue grew 20% last year.", "An order book of Rs 500 crore.", "The company has 1,200 customers.", "I waited two seasons."]) {
      const result = lintText({ ...input({ ledger: record() }), bodyMd: text });
      expect(rule10(result), text).toEqual([]);
    }
  });

  it("is not cleared by an allowance on the sentence", () => {
    const sentence = "The share is down 18% since I opened it.";
    const result = lintText(input({ ledger: record({ events: withWords(sentence, 2) }) }, [sentenceHash(sentence)]));
    expect(rule10(result)).toHaveLength(1);
    expect(result.allowedBy).toEqual([]);
  });

  it("does not change the result for the same sentences on a case study that is not from the ledger", () => {
    for (const sentence of ["The share is down 18% since I opened it.", "It trades at Rs 450."]) {
      const result = lintText({ ...input({}), bodyMd: `## What would prove me wrong

${sentence}` });
      expect(rule10(result)).toEqual([]);
    }
  });
});

describe("a ledger case study's body is optional (spec s33.5)", () => {
  it("has no structure finding with an empty body; a case study without the record still has one", () => {
    const ledger = lintText({ ...input({ ledger: record() }), bodyMd: "" });
    expect(ledger.findings.filter((f) => f.rule === "structure")).toEqual([]);
    expect(ledger.passed).toBe(true);
    const plain = lintText({ ...input({}), bodyMd: "" });
    expect(plain.findings.filter((f) => f.rule === "structure")).toHaveLength(1);
  });
});

