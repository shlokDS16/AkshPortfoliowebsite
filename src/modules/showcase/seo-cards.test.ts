import { describe, expect, it } from "vitest";
import { buildRichSnapshot, buildSeedSnapshot } from "@/test/fakes/showcase-snapshot";
import { NOTES, PROCESS_NOTE } from "@/test/fixtures/casefile";
import { derivedProblems } from "./derived-scan";
import { caseCard, conceptCard, cutWords, noteCard, processCard } from "./seo";

const rich = buildRichSnapshot();
const FOOTER = "For learning, not advice";
const CASE_SLUG = "lc1-a-closed-idea";

describe("cutWords", () => {
  it("leaves text within the budget as it is", () => {
    expect(cutWords("Learn what receivable days measure.", 40)).toBe("Learn what receivable days measure.");
    expect(cutWords("exactly ten", 11)).toBe("exactly ten");
  });

  it("cuts over-long text on a word boundary and ends with an ellipsis, within the budget", () => {
    const text = "Learn to separate demand for capacity from the ability to charge more for it.";
    const out = cutWords(text, 40);
    expect(out).toBe("Learn to separate demand for capacity…");
    expect(Array.from(out).length).toBeLessThanOrEqual(40);
    expect(text.startsWith(out.slice(0, -1))).toBe(true);
    expect(text[out.length - 1]).toBe(" ");
  });

  it("does not end on a dangling comma, colon or semicolon before the ellipsis, and re-words nothing", () => {
    expect(cutWords("Margins, then dealer days, then the second look at both", 30)).toBe("Margins, then dealer days…");
  });

  it("a single word longer than the budget is cut by characters, never by half a code point", () => {
    expect(cutWords("Supercalifragilistic", 8)).toBe("Superca…");
    expect(Array.from(cutWords("😀😀😀😀😀😀", 4))).toEqual(["😀", "😀", "😀", "…"]);
  });
});

describe("share card builders: fields from the snapshot, plus fixed copy", () => {
  it("a learning note", () => {
    expect(noteCard(rich, NOTES[0].slug)).toEqual({
      tag: "Learning note", number: "N", sub: "R1", title: NOTES[0].title, standfirst: NOTES[0].learningObjective,
      footerLeft: "Revised 1 Aug 2026", footerRight: FOOTER,
    });
  });

  it("a process note", () => {
    expect(processCard(rich, PROCESS_NOTE.slug)).toEqual({
      tag: "Process note", number: "P", sub: "R1", title: PROCESS_NOTE.title, standfirst: PROCESS_NOTE.learningObjective,
      footerLeft: "Revised 3 Aug 2026", footerRight: FOOTER,
    });
  });

  it("a closed case: company over title, his objective, the fixed sub-line and no figure", () => {
    const card = caseCard(rich, CASE_SLUG)!;
    expect(card).toEqual({
      tag: "Closed case", number: "C", sub: "R1", kicker: "Kaveri Seed Company Limited", title: "Kaveri Seed Company Limited: a closed idea, Jan 2026 to Jun 2026",
      standfirst: "How a margin story can fail while the demand story holds.", aside: "A past case, not a view on the share today.",
      footerLeft: "Written 12 Jan 2026 · closed Jun 2026", footerRight: FOOTER,
    });
    expect(derivedProblems(JSON.stringify(card))).toEqual([]);
  });

  it("a concept: its name, the page's standfirst and the count line the page already shows", () => {
    expect(conceptCard(rich, "receivable-days")).toEqual({
      tag: "Concept", number: "Aa", sub: "", title: "Receivable days",
      standfirst: "Notes and case files by Aksh Agrawal that use Receivable days, newest first.", footerLeft: "1 note · 2 files", footerRight: FOOTER,
    });
  });

  it("cuts a long title and a long objective on a word boundary, never re-wording", () => {
    const long = { ...rich, items: rich.items.map((i) => (i.id === "n0" ? { ...i, title: "A very long learning note title that keeps going well past what one share card can show at once", learningObjective: "Learn this. ".repeat(30).trim() } : i)) };
    const card = noteCard(long, NOTES[0].slug)!;
    expect(card.title).toBe("A very long learning note title that keeps going well past what one…");
    expect(Array.from(card.standfirst).length).toBeLessThanOrEqual(120);
    expect(card.standfirst.endsWith("…")).toBe(true);
  });

  it("an unknown slug, a note asked for as a process note, or a case before it is public, has no card", () => {
    expect(noteCard(rich, "nope")).toBeNull();
    expect(noteCard(rich, PROCESS_NOTE.slug)).toBeNull();
    expect(processCard(rich, NOTES[0].slug)).toBeNull();
    expect(caseCard(buildSeedSnapshot(), CASE_SLUG)).toBeNull();
    expect(conceptCard(buildSeedSnapshot(), "receivable-days")).toBeNull();
  });
});
