import { describe, expect, it } from "vitest";
import {
  countsByGroup,
  groupConceptItems,
  groupMonth,
  groupOfKind,
  isMonth,
  monthBounds,
  monthOf,
  normaliseEdge,
  primaryConceptByItem,
  shiftMonth,
  suggestRelated,
  type ConceptLinkRow,
  type ConceptRef,
  type ItemLine,
} from "./client";

const link = (itemId: string, conceptId: string, position = 1): ConceptLinkRow => ({ itemId, revisionId: `r-${itemId}`, conceptId, position });
const ref = (id: string, name: string): ConceptRef => ({ id, slug: name.toLowerCase(), name, status: "private" });
const line = (id: string, kind: string, title: string, createdAt: string): ItemLine => ({ id, kind, title, createdAt, visibility: "private", status: "draft" });

describe("monthOf and monthBounds (India months)", () => {
  it("puts 2026-10-31T19:00:00Z in November and 2026-09-30T18:29:59Z in September", () => {
    expect(monthOf("2026-10-31T19:00:00Z")).toBe("2026-11");
    expect(monthOf("2026-09-30T18:29:59Z")).toBe("2026-09");
    expect(monthOf("2026-09-30T18:30:00Z")).toBe("2026-10");
  });

  it("bounds a month from 00:00 India on the 1st, up to but not including the next", () => {
    expect(monthBounds("2026-10")).toEqual({ fromIso: "2026-09-30T18:30:00.000Z", toIso: "2026-10-31T18:30:00.000Z" });
    expect(monthBounds("2026-12").toIso).toBe("2026-12-31T18:30:00.000Z");
  });

  it("agrees with monthOf at both edges", () => {
    const { fromIso, toIso } = monthBounds("2026-10");
    expect(monthOf(fromIso)).toBe("2026-10");
    expect(monthOf(new Date(Date.parse(toIso) - 1).toISOString())).toBe("2026-10");
    expect(monthOf(toIso)).toBe("2026-11");
  });

  it("shifts across a year end and validates the shape", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(isMonth("2026-10")).toBe(true);
    for (const bad of ["2026-13", "2026-00", "26-10", "2026-1", "2026-10-01", "", undefined, 202610]) expect(isMonth(bad)).toBe(false);
  });
});

describe("normaliseEdge", () => {
  it("orders a pair so concept_a < concept_b, whichever way it was tapped", () => {
    expect(normaliseEdge("b", "a")).toEqual(["a", "b"]);
    expect(normaliseEdge("a", "b")).toEqual(["a", "b"]);
  });

  it("compares lower-cased ids, as the database orders a uuid", () => {
    expect(normaliseEdge("B0000000-0000-0000-0000-000000000000", "a0000000-0000-0000-0000-000000000000")).toEqual([
      "a0000000-0000-0000-0000-000000000000",
      "b0000000-0000-0000-0000-000000000000",
    ]);
  });
});

describe("groupOfKind, groupConceptItems, countsByGroup", () => {
  it("maps the six kinds to the five headings", () => {
    expect(["learning", "thesis", "case_study", "process", "reading_note", "note"].map(groupOfKind)).toEqual(["learning", "file", "file", "process", "read", "note"]);
  });

  it("orders the headings as the spec does, newest first, and leaves empty groups out", () => {
    const items = [
      line("1", "note", "n old", "2026-10-01T00:00:00Z"),
      line("2", "thesis", "t", "2026-10-02T00:00:00Z"),
      line("3", "case_study", "c", "2026-10-09T00:00:00Z"),
      line("4", "learning", "l", "2026-10-05T00:00:00Z"),
      line("5", "note", "n new", "2026-10-07T00:00:00Z"),
    ];
    const groups = groupConceptItems(items);
    expect(groups.map((g) => g.group)).toEqual(["learning", "file", "note"]);
    expect(groups[1]?.items.map((i) => i.id)).toEqual(["3", "2"]);
    expect(groups[2]?.items.map((i) => i.id)).toEqual(["5", "1"]);
  });

  it("counts every heading, zero included", () => {
    expect(countsByGroup([line("1", "note", "a", "2026-10-01T00:00:00Z"), line("2", "reading_note", "b", "2026-10-01T00:00:00Z")])).toEqual({
      learning: 0,
      file: 0,
      process: 0,
      read: 1,
      note: 1,
    });
  });
});

describe("primaryConceptByItem (position has gaps)", () => {
  it("takes the lowest position present among the known concepts, not position 1", () => {
    const links = [link("i1", "b", 3), link("i1", "a", 2), link("i2", "a", 1), link("i2", "z", 2)];
    const map = primaryConceptByItem(links, new Set(["a", "b"]));
    expect(map.get("i1")).toBe("a");
    expect(map.get("i2")).toBe("a");
  });

  it("skips a concept that is not known and has no entry when none is", () => {
    const map = primaryConceptByItem([link("i1", "gone", 1), link("i1", "a", 2), link("i2", "gone", 1)], new Set(["a"]));
    expect(map.get("i1")).toBe("a");
    expect(map.has("i2")).toBe(false);
  });
});

describe("groupMonth", () => {
  const rates = ref("c1", "Rates");
  const moats = ref("c2", "Moats");

  it("groups by concept name, 'No concept' last, each group in date order", () => {
    const items = [
      line("a", "learning", "later rates", "2026-10-20T00:00:00Z"),
      line("b", "learning", "no concept", "2026-10-02T00:00:00Z"),
      line("c", "learning", "a moat", "2026-10-10T00:00:00Z"),
      line("d", "learning", "early rates", "2026-10-03T00:00:00Z"),
    ];
    const first = new Map([
      ["a", rates],
      ["c", moats],
      ["d", rates],
    ]);
    const groups = groupMonth(items, first);
    expect(groups.map((g) => g.concept?.name ?? null)).toEqual(["Moats", "Rates", null]);
    expect(groups[1]?.items.map((i) => i.id)).toEqual(["d", "a"]);
    expect(groups[2]?.items.map((i) => i.id)).toEqual(["b"]);
  });

  it("returns a title byte-identical: odd punctuation and trailing spaces untouched", () => {
    const title = "  “Rates”  — don't  trim me;  \t";
    const [group] = groupMonth([line("a", "learning", title, "2026-10-02T00:00:00Z")], new Map());
    expect(group?.items[0]?.title).toBe(title);
    expect(Buffer.from(group?.items[0]?.title ?? "").equals(Buffer.from(title))).toBe(true);
  });

  it("is empty for no learnings", () => {
    expect(groupMonth([], new Map())).toEqual([]);
  });
});

describe("suggestRelated", () => {
  const names = new Map([
    ["x", "X"],
    ["a", "Alpha"],
    ["b", "Beta"],
    ["c", "Gamma"],
    ["d", "Delta"],
    ["e", "Epsilon"],
  ]);
  const together = (concepts: string[], items: string[]) => items.flatMap((i) => concepts.map((c) => link(i, c)));

  it("needs at least two shared items", () => {
    const links = [...together(["x", "a"], ["i1", "i2"]), ...together(["x", "b"], ["i3"])];
    expect(suggestRelated(links, [], "x", names).map((s) => s.conceptId)).toEqual(["a"]);
  });

  it("leaves out the concept itself and those already linked, whichever end of the edge it is", () => {
    const links = [...together(["x", "a", "b", "c"], ["i1", "i2"])];
    const edges = [
      { conceptA: "a", conceptB: "x" },
      { conceptA: "x", conceptB: "b" },
    ];
    expect(suggestRelated(links, edges, "x", names).map((s) => s.conceptId)).toEqual(["c"]);
  });

  it("returns at most three, by shared count then name", () => {
    const links = [
      ...together(["x", "d"], ["i1", "i2"]),
      ...together(["x", "c"], ["i3", "i4"]),
      ...together(["x", "a"], ["i5", "i6", "i7"]),
      ...together(["x", "b"], ["i8", "i9"]),
      ...together(["x", "e"], ["i10", "i11"]),
    ];
    const out = suggestRelated(links, [], "x", names);
    expect(out).toEqual([
      { conceptId: "a", shared: 3 },
      { conceptId: "b", shared: 2 },
      { conceptId: "d", shared: 2 },
    ]);
  });

  it("skips a concept the caller gave no name for (not screened or archived)", () => {
    const links = together(["x", "a", "ghost"], ["i1", "i2"]);
    expect(suggestRelated(links, [], "x", names).map((s) => s.conceptId)).toEqual(["a"]);
  });

  it("counts an item once however the links repeat, and has nothing for a concept with no items", () => {
    const links = [link("i1", "x"), link("i1", "a"), link("i1", "a", 2), link("i1", "x", 2)];
    expect(suggestRelated(links, [], "x", names)).toEqual([]);
    expect(suggestRelated([], [], "x", names)).toEqual([]);
  });
});
