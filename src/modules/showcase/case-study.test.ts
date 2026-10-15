import { describe, expect, it } from "vitest";
import { caseRecordFixture, FIXTURE_CHART } from "@/test/fixtures/case-record";
import { buildSeedSnapshot, withLedgerCase } from "@/test/fakes/showcase-snapshot";
import { buildCaseStudyView, buildMistakes, hasLedgerCases, ledgerCases, listCaseSummaries } from "./case-study";
import { buildHomeStats, buildRegister, buildSiteChrome, files, servedFiles } from "./site";

const base = buildSeedSnapshot();
const record = () => caseRecordFixture();
const one = (patch: Parameters<typeof withLedgerCase>[2] = {}, rec: unknown = record()) => withLedgerCase(base, rec, patch);
const slug = "lc1-a-closed-idea";

describe("which items are ledger case studies", () => {
  it("shows one whose record parses, whose figures are 30 days old and whose date equals the record's", () => {
    expect(ledgerCases(one()).map((c) => c.item.id)).toEqual(["lc1"]);
    expect(hasLedgerCases(one())).toBe(true);
    expect(hasLedgerCases(base)).toBe(false);
  });

  it("drops an item with no whole record: one changed hash, an unknown key, a wrong version (no partial page)", () => {
    const bad = record();
    bad.events[1].hash = "f".repeat(63);
    expect(hasLedgerCases(one({}, bad))).toBe(false);
    expect(hasLedgerCases(one({}, { ...record(), extra: 1 }))).toBe(false);
    expect(hasLedgerCases(one({}, { ...record(), v: 2 }))).toBe(false);
    expect(hasLedgerCases(one({ structured: {} }))).toBe(false);
  });

  it("is only a case_study, and re-checks the lag and the figures-to date itself (defence in depth)", () => {
    expect(hasLedgerCases(one({ kind: "thesis" }))).toBe(false);
    expect(hasLedgerCases(withLedgerCase(buildSeedSnapshot("2026-07-10"), record()))).toBe(false); // figures to 16 Jun are 24 days old
    expect(hasLedgerCases(one({ dataAsOf: "2026-06-10" }))).toBe(false);
    expect(hasLedgerCases(one({ dataAsOf: null }))).toBe(false);
  });

  it("reads the current revision only: an older published revision with other words is never used", () => {
    const old = record();
    old.events[0].words = "An earlier draft of the same case, since replaced.";
    const s = one();
    s.revisions.unshift({
      id: "lc1-old", itemId: "lc1", revNo: 1, bodyMd: "old body", structured: { ledger: old }, changeReason: "Drafted from the ledger",
      createdAt: "2026-07-01T05:00:00Z",
    });
    const view = buildCaseStudyView(s, slug)!;
    expect(view.opening.words).toBe("Seed demand looks steady and the balance sheet is clean.");
    expect(JSON.stringify(view)).not.toContain("earlier draft");
    expect(JSON.stringify(view)).not.toContain("old body");
  });

  it("treats a ledger case study as body plus record: other structured keys are ignored", () => {
    const clean = buildCaseStudyView(one(), slug)!;
    const noisy = buildCaseStudyView(
      one({ structured: { ledger: record(), facts: [{ id: "F1", value: 12 }], tests: [{ id: "T1" }], oneLiner: "Not shown", readFirst: ["x"] } }),
      slug,
    )!;
    expect(noisy).toEqual(clean);
    expect(JSON.stringify(noisy)).not.toContain("Not shown");
  });
});

describe("buildCaseStudyView", () => {
  const view = buildCaseStudyView(one({ bodyMd: "## What changed in my mind\n\nI waited for a cleaner signal.\n\n- the monsoon\n- the margin" }), slug)!;

  it("is null for an unknown slug and for a company page slug", () => {
    expect(buildCaseStudyView(one(), "nope")).toBeNull();
    expect(buildCaseStudyView(one(), "kavpump")).toBeNull();
  });

  it("header and dateline (s33.5): company, title, standfirst, written / closed / figures to", () => {
    expect(view).toMatchObject({
      company: "Kaveri Seed Company Limited", symbol: "KAVERI", title: "Kaveri Seed Company Limited: a closed idea, Jan 2026 to Jun 2026",
      standfirst: "How a margin story can fail while the demand story holds.", holdsPosition: "no", revNo: 1, revCount: 1,
      dateline: { writtenOn: "2026-01-12", closedOn: "2026-06-15", figuresTo: "2026-06-16" },
    });
  });

  it("what he expected: the sentence, his open words with the sealed time in India, the fingerprint line, then each change of period", () => {
    expect(view.expected).toBe("Expected Kaveri Seed Company Limited to do better than the Nifty 50 over 1 year.");
    expect(view.opening).toMatchObject({
      words: "Seed demand looks steady and the balance sheet is clean.", writtenLine: "Written on 12 Jan 2026.",
      sealedLabel: "His words, sealed 12 Jan 2026, 11:00 IST", listedLine: null,
    });
    expect(view.opening.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(view.revisions).toHaveLength(1);
    expect(view.revisions[0]).toMatchObject({
      lead: "Changed the period to 2 years on 2 Mar 2026.", words: "I now think this needs two seasons, not one.", writtenLine: "Written on 2 Mar 2026.",
    });
  });

  it("what happened: entry and exit by the exchange's close, the days, his reason and words; no result", () => {
    expect(view.happened.priceLine).toBe("Entry: NSE close of 13 Jan 2026. Exit: NSE close of 16 Jun 2026. 154 days from entry to exit.");
    expect(view.happened.closedLine).toBe("Closed on 15 Jun 2026. His reason: thesis broken.");
    expect(view.happened.closing.words).toBe("Closing: the margin story did not hold.");
    expect(view.happened.chart).toBeNull();
  });

  it("what he learned: his call on his own process and the kinds of mistake he named, with his words", () => {
    expect(view.learned).toHaveLength(1);
    expect(view.learned[0]).toMatchObject({
      call: "His call on his own process: flawed.", mistakes: "Kinds of mistake he named: timing, valuation.",
      entry: { words: "I waited too long on the monsoon signal.", sealedLabel: "His words, sealed 16 Jun 2026, 09:30 IST" },
    });
  });

  it("looking back is the revision body, as text blocks; empty when there is none", () => {
    expect(view.lookingBack).toEqual([
      { kind: "h", text: "What changed in my mind" },
      { kind: "p", text: "I waited for a cleaner signal." },
      { kind: "ul", items: ["the monsoon", "the margin"] },
    ]);
    expect(buildCaseStudyView(one(), slug)!.lookingBack).toEqual([]);
  });

  it("looking back is empty while the body is only the template's headings (a bare heading says nothing)", () => {
    expect(buildCaseStudyView(one({ bodyMd: "## What would prove me wrong\n\n" }), slug)!.lookingBack).toEqual([]);
    expect(buildCaseStudyView(one({ bodyMd: "## What would prove me wrong\n\nThe margin story reversing." }), slug)!.lookingBack).toEqual([
      { kind: "h", text: "What would prove me wrong" },
      { kind: "p", text: "The margin story reversing." },
    ]);
  });

  it("how to check: every entry in order with the fingerprint before it, the sealed text and its own fingerprint", () => {
    const rec = record();
    expect(view.checks.map((c) => c.kind)).toEqual(["open", "revise", "close", "review"]);
    expect(view.checks.map((c) => [c.prevHash, c.hash, c.canonical])).toEqual(rec.events.map((e) => [e.prev_hash, e.hash, e.canonical]));
    expect(view.checks.map((c) => c.kindLabel)).toEqual(["Opening entry", "Change of period", "Closing entry", "Review"]);
    expect(view.publicFile).toBeNull();
  });

  it("the listing line appears only for an entry whose sealed day was listed", () => {
    const rec = record();
    rec.events[0].listed_on = "2026-02-03";
    const v = buildCaseStudyView(one({}, rec), slug)!;
    expect(v.opening.listedLine).toBe("Listed in the public file on 3 Feb 2026.");
    expect(v.happened.closing.listedLine).toBeNull();
    expect(v.checks[0].listedLine).toBe("Listed in the public file on 3 Feb 2026.");
  });

  it("the chart is carried only when the record has one, with its text alternative and the s11 caption", () => {
    const v = buildCaseStudyView(one({}, caseRecordFixture({ chart: FIXTURE_CHART })), slug)!;
    expect(v.happened.chart).toMatchObject({
      points: FIXTURE_CHART.points, company: "Kaveri Seed Company Limited", from: "2026-01-13", to: "2026-06-16",
      alt:
        "Weekly line chart of Kaveri Seed Company Limited and the Nifty 50, both rebased to 100 at the entry close on 13 Jan 2026, to 16 Jun 2026. " +
        "Values are not printed: this site prints no figure for how an idea did.",
      caption:
        "Closing prices, NSE. Rebased to 100 on 13 Jan 2026. Figures to 16 Jun 2026. Price only, dividends not included. " +
        "A past case, not a view on the share today.",
    });
    const single = caseRecordFixture({ chart: { points: [FIXTURE_CHART.points[0]] } });
    expect(buildCaseStudyView(one({}, single), slug)!.happened.chart).toBeNull();
  });

  it("an unreadable period on a revise entry gives a plain lead rather than a guess", () => {
    const rec = record();
    rec.events[1].stance = { horizon_days: "soon" };
    expect(buildCaseStudyView(one({}, rec), slug)!.revisions[0].lead).toBe("Revised on 2 Mar 2026.");
  });
});

describe("the index and Mistakes", () => {
  const second = (process: "sound" | "flawed", tags: string[], id: string, publishedAt: string) => ({
    rec: caseRecordFixture({ process, tags, idea: `8a1f0f64-0000-4a00-8000-00000000${id.padStart(4, "0")}` }), id, publishedAt,
  });
  const many = () => {
    let s = base;
    const cases = [
      second("flawed", ["timing"], "11", "2026-07-20T05:00:00Z"), second("sound", ["luck"], "12", "2026-08-01T05:00:00Z"),
      second("sound", ["sizing"], "13", "2026-08-10T05:00:00Z"), second("sound", ["none"], "14", "2026-08-15T05:00:00Z"),
    ];
    for (const c of cases) s = withLedgerCase(s, c.rec, { id: `c${c.id}`, publishedAt: c.publishedAt });
    return s;
  };

  it("lists case studies newest publication first, with company, title, standfirst and the close month, and no outcome", () => {
    const list = listCaseSummaries(many());
    expect(list.map((c) => c.slug)).toEqual(["c14-a-closed-idea", "c13-a-closed-idea", "c12-a-closed-idea", "c11-a-closed-idea"]);
    expect(list[0]).toEqual({
      slug: "c14-a-closed-idea", href: "/cases/c14-a-closed-idea", company: "Kaveri Seed Company Limited",
      title: "Kaveri Seed Company Limited: a closed idea, Jan 2026 to Jun 2026", standfirst: "How a margin story can fail while the demand story holds.",
      closedMonth: "Jun 2026",
    });
    expect(listCaseSummaries(base)).toEqual([]);
  });

  it("Mistakes: his own review only (process flawed, or a mistake other than luck or none), newest first, no counts", () => {
    const list = buildMistakes(many());
    expect(list.map((m) => m.slug)).toEqual(["c13-a-closed-idea", "c11-a-closed-idea"]);
    expect(list[0]).toMatchObject({
      href: "/cases/c13-a-closed-idea", company: "Kaveri Seed Company Limited", call: "His call on his own process: sound.",
      mistakes: "Kinds of mistake he named: sizing.", entry: { words: "I waited too long on the monsoon signal." },
    });
    expect(Object.keys(list[0]).sort()).toEqual(["call", "closedMonth", "company", "entry", "href", "mistakes", "slug", "title"]);
    expect(buildMistakes(base)).toEqual([]);
  });
});

describe("a ledger case study changes nothing else on the site", () => {
  const withCase = one();
  it("is not a file: the register, the files, the served files, the home counts and the chrome stay as they were", () => {
    expect(files(withCase)).toEqual(files(base));
    expect(servedFiles(withCase)).toEqual(servedFiles(base));
    expect(buildRegister(withCase)).toEqual(buildRegister(base));
    expect(buildHomeStats(withCase)).toEqual(buildHomeStats(base));
    expect(buildSiteChrome(withCase)).toEqual(buildSiteChrome(base));
  });

  it("even when a ledger case study somehow carries a file number and a company, it is never served as a file", () => {
    const sneaky = withLedgerCase(base, record(), { fileNo: 9, companyId: "c1" });
    expect(files(sneaky)).toEqual(files(base));
    expect(buildRegister(sneaky)).toEqual(buildRegister(base));
  });
});
