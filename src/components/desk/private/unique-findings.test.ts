import { describe, expect, it } from "vitest";
import { uniqueFindings } from "./unique-findings";

const f = (field: string | null, over: Record<string, string | null> = {}) => ({ rule: "1", message: "Looks like a recommendation.", field, sentence: "Multibagger ideas", match: "multibagger", ...over });

describe("uniqueFindings", () => {
  it("a concept that is also the item's theme is flagged twice by the lint; it shows once", () => {
    const list = [f("themeName"), f("conceptName")];
    expect(uniqueFindings(list)).toEqual([list[0]]);
  });

  it("keeps findings that differ in rule, sentence, match, message or place", () => {
    const list = [f("themeName"), f("body"), f("conceptName", { sentence: "Another one" }), f("conceptName", { rule: "2" }), f("conceptName", { match: "x" }), f("conceptName", { message: "other" })];
    expect(uniqueFindings(list)).toHaveLength(6);
  });

  it("two concepts with the same flagged words stay two (the slug is another field)", () => {
    expect(uniqueFindings([f("conceptName"), f("conceptSlug")])).toHaveLength(2);
  });

  it("keeps order and leaves an empty list alone", () => {
    expect(uniqueFindings([])).toEqual([]);
    const list = [f("title"), f("body", { sentence: "b" }), f("title")];
    expect(uniqueFindings(list).map((x) => x.sentence)).toEqual(["Multibagger ideas", "b"]);
  });
});
