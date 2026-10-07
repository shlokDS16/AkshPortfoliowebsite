import { describe, expect, it } from "vitest";
import { diffRevisions } from "./diff";

describe("diffRevisions", () => {
  it("marks unchanged, removed and added lines", () => {
    expect(diffRevisions("a\nb\nc", "a\nc\nd")).toEqual([
      { op: "equal", text: "a" },
      { op: "remove", text: "b" },
      { op: "equal", text: "c" },
      { op: "add", text: "d" },
    ]);
  });

  it("treats empty text as no lines", () => {
    expect(diffRevisions("", "x")).toEqual([{ op: "add", text: "x" }]);
    expect(diffRevisions("x", "")).toEqual([{ op: "remove", text: "x" }]);
  });

  it("returns only equal lines for identical text", () => {
    expect(diffRevisions("a\nb", "a\nb").every((line) => line.op === "equal")).toBe(true);
  });

  it("falls back to remove-all then add-all beyond the size cap", () => {
    const older = Array.from({ length: 2100 }, (_, i) => `a${i}`).join("\n");
    const newer = Array.from({ length: 2100 }, (_, i) => `b${i}`).join("\n");
    const lines = diffRevisions(older, newer);
    expect(lines).toHaveLength(4200);
    expect(lines[0]).toEqual({ op: "remove", text: "a0" });
    expect(lines[4199]).toEqual({ op: "add", text: "b2099" });
  });
});
