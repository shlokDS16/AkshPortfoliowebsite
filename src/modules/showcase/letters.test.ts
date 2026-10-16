import { describe, expect, it } from "vitest";
import { entriesOf } from "@/modules/distribution";
import { buildSeedSnapshot, LETTER_ENTRIES, withLetter } from "@/test/fakes/showcase-snapshot";
import { derivedProblems } from "./derived-scan";
import { buildLetterView, hasLetters, letterHref, listedLetters, listLetterSummaries } from "./letters";

// Plan 5c (spec s8.9): a letter is public when it passed the gate and is the current revision in the snapshot. Nothing about readers or sends is
// in the snapshot, so nothing of them can be here. His words (subject, sentence, note, copied entries) are never changed.
const seed = buildSeedSnapshot();
const world = () => withLetter(seed);
const SLUG = "l1-what-changed-this-fortnight";
const structuredWith = (entries: unknown[]) => ({ schema: "letter/1", entries });

describe("listedLetters", () => {
  it("lists nothing in the deploy state", () => {
    expect(listedLetters(seed)).toEqual([]);
    expect(hasLetters(seed)).toBe(false);
    expect(listLetterSummaries(seed)).toEqual([]);
    expect(buildLetterView(seed, SLUG)).toBeNull();
  });

  it("lists a published letter with his subject, sentence and the date it passed the gate", () => {
    expect(listLetterSummaries(world())).toEqual([
      { slug: SLUG, href: `/letters/${SLUG}`, subject: "What changed this fortnight", objective: "Two pages changed and one test moved.", publishedOn: "2026-09-28" },
    ]);
    expect(letterHref(SLUG)).toBe(`/letters/${SLUG}`);
    expect(hasLetters(world())).toBe(true);
  });

  it("orders the archive newest first", () => {
    const early = { id: "l1", publishedAt: "2026-09-01T05:00:00Z", revisedAt: "2026-09-01T05:00:00Z" };
    const late = { id: "l2", publishedAt: "2026-10-01T05:00:00Z", revisedAt: "2026-10-01T05:00:00Z" };
    expect(listLetterSummaries(withLetter(withLetter(seed, early), late)).map((l) => l.slug)).toEqual(["l2-what-changed-this-fortnight", "l1-what-changed-this-fortnight"]);
  });

  it("drops a letter whose record is not whole: wrong schema, no entries, a damaged entry, a bad path", () => {
    const listed = (structured: unknown) => listedLetters(withLetter(seed, { structured }));
    expect(listed({ schema: "letter/2", entries: LETTER_ENTRIES })).toEqual([]);
    expect(listed(structuredWith([]))).toEqual([]);
    expect(listed({ schema: "letter/1" })).toEqual([]);
    expect(listed(structuredWith(Array.from({ length: 21 }, () => LETTER_ENTRIES[0])))).toEqual([]);
    expect(listed(structuredWith([{ ...LETTER_ENTRIES[0], path: "https://elsewhere.example/x" }]))).toEqual([]);
    expect(listed(structuredWith([{ ...LETTER_ENTRIES[0], path: "/companies/Kav Pump" }]))).toEqual([]);
    expect(listed(structuredWith([{ ...LETTER_ENTRIES[0], kind: "letter" }]))).toEqual([]);
    expect(listed(structuredWith([{ ...LETTER_ENTRIES[0], revNo: 0 }]))).toEqual([]);
    expect(listed(structuredWith([{ ...LETTER_ENTRIES[0], title: 7 }]))).toEqual([]);
    expect(listed(structuredWith([{ ...LETTER_ENTRIES[0], holdsPosition: "maybe" }]))).toEqual([]);
    expect(listed("nothing")).toEqual([]);
  });

  it("drops a letter that carries a company, a theme or a data_as_of, or a title or sentence the gate would refuse", () => {
    expect(listedLetters(withLetter(seed, { companyId: "c1" }))).toEqual([]);
    expect(listedLetters(withLetter(seed, { themeId: "t1" }))).toEqual([]);
    expect(listedLetters(withLetter(seed, { dataAsOf: "2026-01-01" }))).toEqual([]);
    expect(listedLetters(withLetter(seed, { title: "x".repeat(121) }))).toEqual([]);
    expect(listedLetters(withLetter(seed, { bodyMd: "x".repeat(4001) }))).toEqual([]);
    expect(listedLetters(withLetter(seed, { learningObjective: null }))).toEqual([]);
    expect(listedLetters(withLetter(seed, { learningObjective: "  " }))).toEqual([]);
  });

  it("reads a record the way the writer's parser does (the gate's shape)", () => {
    const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
    const good = structuredWith(LETTER_ENTRIES.map((e, i) => ({ ...e, revisionId: uuid(i) })));
    expect(entriesOf(good)).not.toBeNull();
    const damaged = [
      structuredWith([]),
      structuredWith([{ ...LETTER_ENTRIES[0], revisionId: uuid(1), path: "/Bad Path" }]),
      structuredWith([{ ...LETTER_ENTRIES[0], revisionId: uuid(1), kind: "letter" }]),
      structuredWith([{ ...LETTER_ENTRIES[0], revisionId: uuid(1), holdsPosition: "maybe" }]),
    ];
    for (const record of damaged) {
      expect(entriesOf(record)).toBeNull();
      expect(listedLetters(withLetter(seed, { structured: record }))).toEqual([]);
    }
  });
});

describe("an entry that is no longer public is not shown", () => {
  it("drops an entry whose revision is not in the snapshot, and the letter when none is left", () => {
    const gone = { ...seed, revisions: seed.revisions.filter((r) => r.id !== "r1b"), items: seed.items.filter((i) => i.id !== "i1") };
    const view = buildLetterView(withLetter(gone), SLUG)!;
    expect(view.entries.map((e) => e.title)).toEqual(["How to read receivable days"]);
    const none = { ...gone, revisions: gone.revisions.filter((r) => r.id !== "rn0"), items: gone.items.filter((i) => i.id !== "n0") };
    expect(listedLetters(withLetter(none))).toEqual([]);
    expect(buildLetterView(withLetter(none), SLUG)).toBeNull();
  });

  it("drops an entry whose page is a file less than 30 days old on the day (defence in depth for the lag)", () => {
    const young = { ...seed, items: seed.items.map((i) => (i.id === "i1" ? { ...i, dataAsOf: "2026-09-20" } : i)) };
    expect(buildLetterView(withLetter(young), SLUG)!.entries.map((e) => e.title)).toEqual(["How to read receivable days"]);
  });

  it("never shows another letter as an entry", () => {
    const first = withLetter(seed, { id: "l0", revisionId: "l0-rev" });
    const second = withLetter(first, { structured: structuredWith([{ ...LETTER_ENTRIES[0], revisionId: "l0-rev" }]) });
    expect(listedLetters(second).map((l) => l.item.id)).toEqual(["l0"]);
  });
});

describe("buildLetterView", () => {
  it("copies his words byte for byte and adds only the machine's labels, dates and links", () => {
    const view = buildLetterView(world(), SLUG)!;
    expect(view).toMatchObject({ slug: SLUG, subject: "What changed this fortnight", objective: "Two pages changed and one test moved.", publishedOn: "2026-09-28", revisedOn: "2026-09-28", revNo: 1, revCount: 1 });
    expect(view.note).toEqual(["Two things this time.", "The first line of the second paragraph\nand its second line."]);
    expect(view.entries).toEqual([
      { kindLabel: "File", title: "Kaveri Pumps", changeReason: "Moved the receivable days test.", detail: "Revision R2 · 3 sentences changed · figures to 22 Aug 2026", href: "/companies/kavpump", position: "No" },
      { kindLabel: "Learning note", title: "How to read receivable days", changeReason: "First version.", detail: "Learning note · R1", href: "/notes/how-to-read-receivable-days", position: null },
    ]);
  });

  it("shows 'Not disclosed' for a page that names a company without a stated position", () => {
    const entries = [{ ...LETTER_ENTRIES[0], holdsPosition: null }];
    expect(buildLetterView(withLetter(seed, { structured: structuredWith(entries) }), SLUG)!.entries[0].position).toBe("Not disclosed");
  });

  it("carries no id, no percent sign and no rupee figure", () => {
    const text = JSON.stringify(buildLetterView(world(), SLUG));
    expect(derivedProblems(text)).toEqual([]);
    expect(text).not.toContain("r1b");
  });

  it("is null for an unknown slug and for an item that is not a letter", () => {
    expect(buildLetterView(world(), "nope")).toBeNull();
    expect(buildLetterView(world(), seed.items[0].slug)).toBeNull();
  });
});
