import { describe, expect, it, vi } from "vitest";
import type { Item, Revision } from "@/modules/research";

const conceptRefs = vi.fn();
const screenedConceptRefs = vi.fn();
vi.mock("@/modules/knowledge", () => ({
  createSupabaseKnowledgeDeps: () => ({}),
  conceptRefs: (...a: unknown[]) => conceptRefs(...a),
  screenedConceptRefs: (...a: unknown[]) => screenedConceptRefs(...a),
}));

import { conceptChecks, loadItemConcepts } from "./concepts";

const ref = (id: string, status: "private" | "public" | "unchecked") => ({ id, slug: id, name: id.toUpperCase(), status });
const item = (themeId: string | null) => ({ themeId }) as Item;
const rev = (conceptIds: string[] | null) => ({ conceptIds }) as Revision;

describe("conceptChecks", () => {
  it("one line per linked concept that is not public: Make public for a checked one, none for a stub; a public one gets no line", () => {
    const make = vi.fn((id: string) => async () => void id);
    const checks = conceptChecks([ref("a", "private"), ref("b", "public"), ref("c", "unchecked")], make);
    expect(checks.map((c) => [c.id, c.name, c.unchecked, c.action !== null])).toEqual([
      ["a", "A", false, true],
      ["c", "C", true, false],
    ]);
    expect(make).toHaveBeenCalledTimes(1);
    expect(make).toHaveBeenCalledWith("a");
  });

  it("nothing to show when every concept is public or there are none", () => {
    expect(conceptChecks([], vi.fn())).toEqual([]);
    expect(conceptChecks([ref("b", "public")], vi.fn())).toEqual([]);
  });
});

describe("loadItemConcepts", () => {
  it("reads the newest revision's concepts, in order, and the picker's choices", async () => {
    conceptRefs.mockResolvedValueOnce([ref("a", "private")]);
    screenedConceptRefs.mockResolvedValueOnce([ref("a", "private"), ref("b", "public")]);
    const out = await loadItemConcepts({} as never, item("t"), rev(["a"]));
    expect(conceptRefs.mock.calls.at(-1)?.[1]).toEqual(["a"]);
    expect(out?.linked.map((c) => c.id)).toEqual(["a"]);
    expect(out?.screened).toHaveLength(2);
  });

  it("a revision from before concepts (null) reads as the item's theme; no theme reads as none", async () => {
    conceptRefs.mockResolvedValue([]);
    screenedConceptRefs.mockResolvedValue([]);
    await loadItemConcepts({} as never, item("t1"), rev(null));
    expect(conceptRefs.mock.calls.at(-1)?.[1]).toEqual(["t1"]);
    await loadItemConcepts({} as never, item(null), rev(null));
    expect(conceptRefs.mock.calls.at(-1)?.[1]).toEqual([]);
    await loadItemConcepts({} as never, item("t1"), null);
    expect(conceptRefs.mock.calls.at(-1)?.[1]).toEqual(["t1"]);
  });

  it("an explicit empty list is none, not the theme", async () => {
    conceptRefs.mockResolvedValue([]);
    screenedConceptRefs.mockResolvedValue([]);
    await loadItemConcepts({} as never, item("t1"), rev([]));
    expect(conceptRefs.mock.calls.at(-1)?.[1]).toEqual([]);
  });

  it("a failed read hides the row instead of breaking the editor, and logs only the error's name", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    conceptRefs.mockRejectedValueOnce(new Error("connection failed: password=hunter2"));
    screenedConceptRefs.mockResolvedValueOnce([]);
    expect(await loadItemConcepts({} as never, item(null), rev([]))).toBeNull();
    expect(JSON.stringify(log.mock.calls)).not.toContain("hunter2");
  });
});
