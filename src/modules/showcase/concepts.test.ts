import { describe, expect, it } from "vitest";
import { badDates, countDates } from "@/test/iso-dates";
import { caseRecordFixture } from "@/test/fixtures/case-record";
import { buildSeedSnapshot, withConcepts, withLedgerCase } from "@/test/fakes/showcase-snapshot";
import { buildConceptView, itemConcepts, listConceptSummaries } from "./concepts";
import { buildFileView } from "./file";
import { buildNoteView } from "./notes";
import type { PublicConceptRow, PublicSnapshot } from "./types";

const base = buildSeedSnapshot();
const cycle: PublicConceptRow = { id: "k-cycle", slug: "capital-cycle", name: "Capital cycle" };
const moat: PublicConceptRow = { id: "k-moat", slug: "moats", name: "Moats" };
const credit: PublicConceptRow = { id: "k-credit", slug: "working-capital", name: "Working capital" };

// Seed: file i1 (Kaveri) is at r1b, with an older passed r1a; file i2 (Sahyadri) is at r2a; notes n0 (how to read receivable days),
// n1 (why utilisation is not pricing power), n2 (the process note) are at rn0, rn1, rn2.
const world = (): PublicSnapshot =>
  withConcepts(
    base,
    [cycle, moat, credit],
    [
      ["i1", "r1a", "k-cycle", 1], // the older revision linked it first
      ["i1", "r1b", "k-cycle", 2], // positions have gaps: 1 is gone from the current revision
      ["i1", "r1b", "k-moat", 5],
      ["n0", "rn0", "k-cycle", 1],
      ["n2", "rn2", "k-cycle", 1],
    ],
  );

describe("the deploy state: no concept data", () => {
  it("lists nothing, finds no concept page and puts no line on any item", () => {
    for (const s of [base, { ...base, concepts: undefined, conceptLinks: undefined } as unknown as PublicSnapshot]) {
      expect(listConceptSummaries(s)).toEqual([]);
      expect(buildConceptView(s, "capital-cycle")).toBeNull();
      expect(itemConcepts(s, "i1")).toEqual([]);
      expect(buildFileView(s, "kavpump")!.concepts).toEqual([]);
      expect(buildNoteView(s, "learning", "how-to-read-receivable-days")!.concepts).toEqual([]);
    }
  });

  it("a public concept that nothing links is not listed and has no page (a theme can be public with zero linked items)", () => {
    const s = withConcepts(base, [cycle], []);
    expect(listConceptSummaries(s)).toEqual([]);
    expect(buildConceptView(s, "capital-cycle")).toBeNull();
  });
});

describe("the Concepts line of an item", () => {
  it("is the CURRENT revision's concepts, in position order, with their pages", () => {
    expect(itemConcepts(world(), "i1")).toEqual([
      { slug: "capital-cycle", name: "Capital cycle", href: "/concepts/capital-cycle" },
      { slug: "moats", name: "Moats", href: "/concepts/moats" },
    ]);
  });

  it("never carries a concept only an older revision linked", () => {
    const s = withConcepts(base, [cycle, moat], [["i1", "r1a", "k-cycle", 1], ["i1", "r1b", "k-moat", 1]]);
    expect(itemConcepts(s, "i1").map((c) => c.slug)).toEqual(["moats"]);
  });

  it("never renders an id it does not know (a concept made private after an older revision named it)", () => {
    const s = withConcepts(base, [moat], [["i1", "r1b", "k-private", 1], ["i1", "r1b", "k-moat", 2]]);
    expect(itemConcepts(s, "i1").map((c) => c.slug)).toEqual(["moats"]);
    expect(JSON.stringify([listConceptSummaries(s), buildConceptView(s, "moats"), itemConcepts(s, "i1")])).not.toContain("k-private");
  });

  it("is on the file and note view models", () => {
    const s = world();
    expect(buildFileView(s, "kavpump")!.concepts.map((c) => c.name)).toEqual(["Capital cycle", "Moats"]);
    expect(buildFileView(s, "sahcold")!.concepts).toEqual([]);
    expect(buildNoteView(s, "learning", "how-to-read-receivable-days")!.concepts.map((c) => c.slug)).toEqual(["capital-cycle"]);
    expect(buildNoteView(s, "learning", "why-utilisation-is-not-pricing-power")!.concepts).toEqual([]);
    expect(buildNoteView(s, "process", "how-i-keep-a-case-file")!.concepts.map((c) => c.slug)).toEqual(["capital-cycle"]);
  });

  it("lists a concept once even if the same row came twice", () => {
    const s = withConcepts(base, [moat], [["i1", "r1b", "k-moat", 1], ["i1", "r1b", "k-moat", 1]]);
    expect(itemConcepts(s, "i1")).toHaveLength(1);
  });
});

describe("the concepts index", () => {
  it("lists each linked public concept A to Z with its note and file counts", () => {
    expect(listConceptSummaries(world())).toEqual([
      { slug: "capital-cycle", name: "Capital cycle", notes: 2, files: 1, href: "/concepts/capital-cycle", countLine: "2 notes · 1 file" },
      { slug: "moats", name: "Moats", notes: 0, files: 1, href: "/concepts/moats", countLine: "1 file" },
    ]);
  });

  it("counts case studies as files and lists a concept that only a case links", () => {
    const s = withConcepts(withLedgerCase(base, caseRecordFixture()), [credit], [["lc1", "lc1-rev", "k-credit", 1]]);
    expect(listConceptSummaries(s)).toEqual([
      { slug: "working-capital", name: "Working capital", notes: 0, files: 1, href: "/concepts/working-capital", countLine: "1 file" },
    ]);
  });
});

describe("a concept page", () => {
  it("is a fixed standfirst, then Notes and Applied in, newest first by the date the concept entered the item", () => {
    const v = buildConceptView(world(), "capital-cycle")!;
    expect(v.name).toBe("Capital cycle");
    expect(v.standfirst).toBe("Notes and case files by Aksh Agrawal that use Capital cycle, newest first.");
    expect(v.notes.map((n) => [n.title, n.href, n.since])).toEqual([
      ["How I keep a case file", "/process/how-i-keep-a-case-file", "2026-08-03"],
      ["How to read receivable days", "/notes/how-to-read-receivable-days", "2026-08-01"],
    ]);
    expect(v.applied).toHaveLength(1);
  });

  it("dates a file from the first gated revision that linked the concept, not from its latest", () => {
    const v = buildConceptView(world(), "capital-cycle")!;
    expect(v.applied[0]).toMatchObject({ label: "Kaveri Pumps (fictional)", fileNo: "01", href: "/companies/kavpump", since: "2026-08-05" });
    // Moats first appears on the current revision (r1b, 20 Aug), so that is its date.
    expect(buildConceptView(world(), "moats")!.applied[0].since).toBe("2026-08-20");
  });

  it("carries his title and learning objective unchanged", () => {
    const item = base.items.find((i) => i.id === "n0")!;
    const note = buildConceptView(world(), "capital-cycle")!.notes.find((n) => n.href === "/notes/how-to-read-receivable-days")!;
    expect(note.title).toBe(item.title);
    expect(note.learningObjective).toBe(item.learningObjective);
  });

  it("lists a ledger case through its own page, with its company and its closing standfirst", () => {
    const s = withConcepts(withLedgerCase(base, caseRecordFixture()), [credit], [["lc1", "lc1-rev", "k-credit", 1]]);
    const v = buildConceptView(s, "working-capital")!;
    expect(v.notes).toEqual([]);
    expect(v.applied).toEqual([
      {
        title: "Kaveri Seed Company Limited: a closed idea, Jan 2026 to Jun 2026", label: "Kaveri Seed Company Limited", fileNo: null, href: "/cases/lc1-a-closed-idea",
        learningObjective: "How a margin story can fail while the demand story holds.", since: "2026-07-20",
      },
    ]);
  });

  it("lists a public item of kind note under Notes, without a link (no page serves it)", () => {
    const item = { ...base.items.find((i) => i.id === "n0")!, id: "plain", kind: "note" as const, slug: "a-plain-note", title: "A plain note", revisionId: "plain-rev" };
    const s = withConcepts({ ...base, items: [...base.items, item], revisions: [...base.revisions, { id: "plain-rev", itemId: "plain", revNo: 1, bodyMd: "x", structured: {}, changeReason: null, createdAt: "2026-09-01T05:00:00Z" }] }, [moat], [["plain", "plain-rev", "k-moat", 1]]);
    const v = buildConceptView(s, "moats")!;
    expect(v.notes).toEqual([expect.objectContaining({ title: "A plain note", href: null, since: "2026-09-01" })]);
    expect(listConceptSummaries(s)[0].countLine).toBe("1 note");
  });

  it("does not list an item whose current revision dropped the concept, nor a private or unknown slug", () => {
    const s = withConcepts(base, [cycle, moat], [["i1", "r1a", "k-cycle", 1], ["i1", "r1b", "k-moat", 1]]);
    expect(buildConceptView(s, "capital-cycle")).toBeNull();
    expect(buildConceptView(s, "no-such-concept")).toBeNull();
  });

  it("rule 2: every date is a real calendar date; no word the site never uses", () => {
    const s = world();
    const models = [listConceptSummaries(s), buildConceptView(s, "capital-cycle"), buildConceptView(s, "moats"), itemConcepts(s, "i1")];
    expect(countDates(models)).toBeGreaterThan(2);
    expect(badDates(models)).toEqual([]);
    const text = JSON.stringify(models);
    expect(text).not.toMatch(/\bproof\b|\bproves?\b|\bverified\b|\bbuy\b|\bsell\b/i);
  });
});
