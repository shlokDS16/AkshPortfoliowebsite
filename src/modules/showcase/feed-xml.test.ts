// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderRss } from "./feed";

// A conforming reader refuses the whole document at one character XML 1.0 forbids, so every subscriber would lose the feed.
describe("renderRss", () => {
  it("is well-formed XML when a title carries U+FFFF, U+FFFE or a control character", () => {
    const entries = [{ title: "Q2 ￿ results￾\u0001", path: "/notes/a", guid: "/notes/a#r1", on: "2026-08-01", description: "a & b ￿" }];
    const doc = new DOMParser().parseFromString(renderRss(entries, "https://desk.example"), "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(doc.querySelector("item > title")?.textContent).toBe("Q2  results");
  });
});
