import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("slugify", () => {
  it.each([
    ["How Capex Cycles Turn!", "how-capex-cycles-turn"],
    ["M&M", "m-and-m"],
    ["BAJAJ-AUTO", "bajaj-auto"],
    ["Café Coffee Day", "cafe-coffee-day"],
    ["  capital--cycle  ", "capital-cycle"],
  ])("slugify(%j) = %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("returns an empty string when nothing is usable", () => {
    expect(slugify("  --  !!")).toBe("");
  });

  it("caps the length without leaving a trailing hyphen", () => {
    const slug = slugify("word ".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toMatch(SLUG);
  });
});
