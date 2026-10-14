import { describe, expect, it } from "vitest";
import { baseKeyOf, currentRows, passOf, type PassRow } from "./supersede";

const row = (id: string, over: Partial<PassRow> = {}) => ({ id, key: "revenue|FY26|consolidated", pass: 1, status: "pending", superseded: false, ...over });
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
const current = (rows: ReturnType<typeof row>[]) => ids(currentRows(rows, (r) => r));

describe("keys", () => {
  it("reads the pass and the line from a dedupe key", () => {
    expect(passOf("revenue|FY26|consolidated")).toBe(1);
    expect(passOf("revenue|FY26|consolidated|r3")).toBe(3);
    expect(baseKeyOf("revenue|FY26|consolidated|r3")).toBe("revenue|FY26|consolidated");
    expect(baseKeyOf("revenue|FY26|consolidated")).toBe("revenue|FY26|consolidated");
  });
});

describe("currentRows", () => {
  it("drops a row the re-read replaced, whether or not a later pass proposed anything", () => {
    expect(current([row("old", { status: "rejected", superseded: true }), row("new", { pass: 2 })])).toEqual(["new"]);
    expect(current([row("old", { status: "rejected", superseded: true })])).toEqual([]);
  });

  it("keeps a figure Aksh dropped himself, and hides the same line when a later pass proposes it again", () => {
    expect(current([row("mine", { status: "rejected" }), row("again", { pass: 2 })])).toEqual(["mine"]);
  });

  it("keeps his drop when nothing later was proposed, and leaves other lines alone", () => {
    expect(current([row("mine", { status: "rejected" }), row("other", { key: "profit|FY26|consolidated", pass: 2 })])).toEqual(["mine", "other"]);
  });

  it("does not hide an earlier pass because of a later drop, and keeps accepted, edited and filed rows", () => {
    expect(current([row("a", { status: "accepted" }), row("b", { pass: 2, status: "rejected" }), row("c", { status: "filed" })])).toEqual(["a", "b", "c"]);
  });
});
