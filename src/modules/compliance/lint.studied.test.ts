import { describe, expect, it } from "vitest";
import { sentenceHash } from "./hash";
import { lintText } from "./lint";
import type { LintInput, OutsideSource } from "./rules";

// Phase 5d, rule 14 and spec s5: an outside source on a company file. What a reader sees is linted: the link always (host and path), the
// title and the site or channel name only when the entry shows them, and his note on the entry like the rest of his words. The machine's keys in
// an entry (link, show, metaSha) are not prose. Rules 1 and 2 apply as usual (a rule 1 allowance too); a price, return or valuation figure in
// somebody else's title, name or link is refused whatever the file's "Figures to" date and is never allowanceable (rule 3, 14.4).
const LINK = "11111111-1111-4111-8111-111111111111";
const SHA = "a".repeat(64);
const entry = (patch: Record<string, unknown> = {}) => ({ link: LINK, show: true, metaSha: SHA, note: "Why it matters to this file.", ...patch });
const outside = (patch: Partial<OutsideSource> = {}): OutsideSource => ({
  url: "https://www.example.com/talks/moats-explained", show: true, metaSha: SHA, read: true, title: "A talk on moats", siteName: "Some Channel", ...patch,
});
const base: LintInput = {
  revisionId: "5b1d9c1e-0a53-4f3e-8c53-2d6a9a7e1f10", kind: "thesis", title: "ACME thesis", slug: "acme-thesis", learningObjective: "See how one moat shows up in the numbers.",
  bodyMd: "Body.\n\n## What would prove me wrong\nIf margins fall.", structured: { schema: "casefile/1", studied: [entry()] },
  changeReason: null, companyName: "ACME Ltd", companyOneLiner: "Makes pumps.", themeName: null, conceptNames: [], conceptSlugs: [], transcript: null, outside: [outside()],
  companyId: "c-1", holdsPosition: "no", dataAsOf: "2026-08-01", today: "2026-10-16", allowances: new Set<string>(),
};
const lint = (patch: Partial<LintInput>) => lintText({ ...base, ...patch });

describe("an outside source that is clean passes, and the lint says which titles it read", () => {
  it("passes and lists the hash of the entry whose title it read", () => {
    const result = lint({});
    expect(result.passed).toBe(true);
    expect(result.studied).toEqual([SHA]);
  });

  it("lists nothing for an entry that shows no title, and carries no list at all when there are no sources", () => {
    expect(lint({ outside: [outside({ show: false, metaSha: null, read: false, title: null, siteName: null })] }).studied).toBeUndefined();
    expect(lint({ outside: [], structured: { schema: "casefile/1" } }).studied).toBeUndefined();
  });

  it("lists only an entry whose texts were read: a changed hash lists nothing (the gate then refuses)", () => {
    expect(lint({ outside: [outside({ read: false, title: null, siteName: null })] }).studied).toBeUndefined();
  });

  it("lists each read entry once, in the file's order", () => {
    const other = "b".repeat(64);
    expect(lint({ outside: [outside(), outside({ metaSha: other, url: "https://other.example/x" })] }).studied).toEqual([SHA, other]);
  });
});

describe("rules 1 and 2 on a third party's title, site name and link", () => {
  it.each([
    ["title", { title: "Five stocks to buy now" }, "outsideTitle"],
    ["site name", { siteName: "Buy now with us" }, "outsideSite"],
    ["link", { url: "https://example.com/you-should-buy-this-stock" }, "outsideLink"],
  ])("refuses a buy call in the %s, naming the field", (_label, patch, field) => {
    const result = lint({ outside: [outside(patch)] });
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual([expect.objectContaining({ rule: "1", field })]);
  });

  it("allows a rule 1 sentence with the usual allowance, and lists it as allowed", () => {
    const title = "Five stocks to buy now";
    const result = lint({ outside: [outside({ title })], allowances: new Set([sentenceHash(title)]) });
    expect(result.passed).toBe(true);
    expect(result.allowedBy).toEqual([expect.objectContaining({ rule: "1", field: "outsideTitle", sentence: title })]);
  });

  it("never allows rule 2", () => {
    const title = "How my calls beat the Nifty";
    const first = lint({ outside: [outside({ title })] });
    const rule2 = first.findings.filter((f) => f.rule === "2");
    expect(rule2.length).toBeGreaterThan(0);
    const allowed = lint({ outside: [outside({ title })], allowances: new Set(first.findings.flatMap((f) => (f.sentenceHash ? [f.sentenceHash] : []))) });
    expect(allowed.findings.filter((f) => f.rule === "2").length).toBe(rule2.length);
  });

  it("does not lint the title or site name of an entry that does not show them (only the link is public)", () => {
    const result = lint({ outside: [outside({ show: false, metaSha: null, read: false, title: "Five stocks to buy now", siteName: "Buy now" })] });
    expect(result.passed).toBe(true);
  });

  it("reads hyphens, underscores and slashes in a link as spaces, so a call written in the path is seen", () => {
    for (const url of ["https://example.com/a/sell-everything-now", "https://example.com/a/sell_everything_now", "https://example.com/sell/everything/now"]) {
      expect(lint({ outside: [outside({ url })] }).passed, url).toBe(false);
    }
    expect(lint({ outside: [outside({ url: "https://example.com/how-to-read-a-balance-sheet" })] }).passed).toBe(true);
  });

  it("reads only the host and the path of a link, not the query string or the fragment", () => {
    expect(lint({ outside: [outside({ url: "https://example.com/post?utm_campaign=buy-now#sell" })] }).passed).toBe(true);
  });
});

describe("rule 3: a price, return or valuation figure in somebody else's words", () => {
  const figured = ["Why it was trading at Rs 450 a share", "Up 40% in a year", "The share price is 1,250 rupees", "Valuation of 30 times earnings", "Gained 3x since 2020", "A stock at Rs 99"];

  it.each(figured)("refuses %s in a title, whatever the Figures to date", (title) => {
    for (const dataAsOf of ["2026-08-01", "2026-10-15", "2026-10-16", null]) {
      const result = lint({ outside: [outside({ title })], dataAsOf });
      expect(result.passed, `${title} / ${dataAsOf}`).toBe(false);
      expect(result.findings.some((f) => f.rule === "3" && f.field === "outsideTitle"), title).toBe(true);
    }
  });

  it("refuses a figure in a site or channel name and in a link", () => {
    expect(lint({ outside: [outside({ siteName: "Stock at Rs 450 daily" })] }).findings.some((f) => f.rule === "3" && f.field === "outsideSite")).toBe(true);
    expect(lint({ outside: [outside({ url: "https://example.com/trading-at-rs-450-per-share" })] }).findings.some((f) => f.rule === "3" && f.field === "outsideLink")).toBe(true);
  });

  it("can never be allowed", () => {
    const title = "Why it was trading at Rs 450 a share";
    const first = lint({ outside: [outside({ title })] });
    const hashes = first.findings.flatMap((f) => (f.sentenceHash ? [f.sentenceHash] : []));
    expect(lint({ outside: [outside({ title })], allowances: new Set(hashes) }).passed).toBe(false);
  });

  it("is checked even when the file has no company or no date (the title's own date is unknown)", () => {
    expect(lint({ outside: [outside({ title: "Trading at Rs 450" })], companyId: null }).passed).toBe(false);
  });

  it("says what to do, in plain words, differently for a link", () => {
    const title = lint({ outside: [outside({ title: "Trading at Rs 450" })] }).findings.find((f) => f.rule === "3");
    const link = lint({ outside: [outside({ url: "https://example.com/trading-at-rs-450" })] }).findings.find((f) => f.rule === "3");
    expect(title?.message).toMatch(/Show its title and picture/);
    expect(link?.message).toMatch(/Take the source off the file/);
    expect(`${title?.message}${link?.message}`).not.toMatch(/\b(proof|verified|buy|sell)\b/i);
  });

  it("does not flag a clean number, a year, or a quantity that is not a price", () => {
    for (const title of ["10 lessons from 2008", "How to read a balance sheet in 20 minutes", "Q2 results call"]) {
      expect(lint({ outside: [outside({ title })] }).passed, title).toBe(true);
    }
  });
});

describe("his note on the entry, and the entry's machine keys", () => {
  it("lints his note like the rest of his words", () => {
    const result = lint({ structured: { schema: "casefile/1", studied: [entry({ note: "You should buy this stock now." })] } });
    expect(result.findings).toEqual([expect.objectContaining({ rule: "1", field: "structured", sentence: "You should buy this stock now." })]);
  });

  it("does not lint the link id or the hash", () => {
    // A hash or id that happened to spell a lexicon word would otherwise be flagged; the walk skips link, show and metaSha.
    const result = lint({ structured: { schema: "casefile/1", studied: [entry({ link: "buy-sell-guarantee", metaSha: "target-price" })] } });
    expect(result.findings).toEqual([]);
  });

  it("lints a key it does not know in an entry as his words", () => {
    const result = lint({ structured: { schema: "casefile/1", studied: [entry({ extra: "You should buy this stock now." })] } });
    expect(result.findings.some((f) => f.rule === "1" && f.field === "structured")).toBe(true);
  });

  it("a figure in his note follows the file's date rule as any other, not the stricter outside rule", () => {
    const note = "The price was Rs 450 then.";
    expect(lint({ structured: { schema: "casefile/1", studied: [entry({ note })] }, dataAsOf: "2026-08-01" }).passed).toBe(true);
    expect(lint({ structured: { schema: "casefile/1", studied: [entry({ note })] }, dataAsOf: "2026-10-15" }).passed).toBe(false);
  });

  it("lints a studied list that is not a list as text rather than skipping it", () => {
    expect(lint({ structured: { schema: "casefile/1", studied: "You should buy this stock now." } }).passed).toBe(false);
  });
});
