import { describe, expect, it } from "vitest";
import { visibleItems } from "./visible-items";

const rows = [
  { id: "1", kind: "note" }, { id: "2", kind: "video" }, { id: "3", kind: "letter" }, { id: "4", kind: "thesis" },
];

// Phase 5d (spec s8): the Items list links every row to its page; a video or letter row has none while its feature is off, so it is not listed.
describe("visibleItems", () => {
  it("drops video and letter rows while both features are off", () => {
    expect(visibleItems(rows, { ownVideos: false, letters: false }).map((r) => r.id)).toEqual(["1", "4"]);
  });

  it("keeps the rows of a feature that is on", () => {
    expect(visibleItems(rows, { ownVideos: true, letters: false }).map((r) => r.id)).toEqual(["1", "2", "4"]);
    expect(visibleItems(rows, { ownVideos: false, letters: true }).map((r) => r.id)).toEqual(["1", "3", "4"]);
    expect(visibleItems(rows, { ownVideos: true, letters: true })).toBe(rows);
  });
});
