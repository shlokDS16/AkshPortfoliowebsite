import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CONCEPTS } from "@/modules/research";
import { createMemoryCaptureRepo } from "@/test/fakes/capture-repo";
import { createMemoryCatalogRepo } from "@/test/fakes/catalog-repo";
import { createMemoryResearchRepo } from "@/test/fakes/research-repo";
import { MAX_LINKED_CONCEPTS } from "./parse";
import { saveCapture } from "./service";

function setup() {
  const research = createMemoryResearchRepo();
  const catalog = createMemoryCatalogRepo();
  const captures = createMemoryCaptureRepo();
  return { research, catalog, captures, deps: { research, catalog, captures } };
}
const input = (rawText: string) => ({ rawText, source: "web" as const, clientId: randomUUID() });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("saveCapture: reads and concepts (Phase 4)", () => {
  it("the capture limit and the research limit are the same number", () => {
    expect(MAX_LINKED_CONCEPTS).toBe(MAX_CONCEPTS);
  });

  it("files r: as a reading note", async () => {
    const { deps, research } = setup();
    const result = await saveCapture(deps, input("r: Marks memo https://example.com/m"));
    expect(research.items.get(result.itemId ?? "")).toMatchObject({ kind: "reading_note", title: "Marks memo", visibility: "private" });
    expect(result).toMatchObject({ kind: "reading_note", parseError: null });
  });

  it("links every resolved #name to the revision in order, and the first to the item", async () => {
    const { deps, catalog, research } = setup();
    const result = await saveCapture(deps, input("margins #alpha and #beta again #alpha"));
    const [a, b] = ["alpha", "beta"].map((slug) => [...catalog.themes.values()].find((t) => t.slug === slug)?.id);
    const [revision] = await research.listRevisions(result.itemId ?? "");
    expect(revision.conceptIds).toEqual([a, b]);
    expect(research.items.get(result.itemId ?? "")?.themeId).toBe(a);
  });

  it("files only the first 8 concepts, and makes no stub for the rest", async () => {
    const { deps, catalog, research } = setup();
    const slugs = Array.from({ length: 10 }, (_, i) => `c${String.fromCharCode(97 + i)}`);
    const result = await saveCapture(deps, input(`ten tags ${slugs.map((s) => `#${s}`).join(" ")}`));
    const [revision] = await research.listRevisions(result.itemId ?? "");
    expect(revision.conceptIds).toHaveLength(8);
    expect([...catalog.themes.values()].map((t) => t.slug)).toEqual(slugs.slice(0, 8));
  });

  it("an ignored #name does not take one of the eight", async () => {
    const { deps, catalog, research } = setup();
    catalog.ignored.add("theme:ca");
    const slugs = Array.from({ length: 9 }, (_, i) => `c${String.fromCharCode(97 + i)}`);
    const result = await saveCapture(deps, input(`tags ${slugs.map((s) => `#${s}`).join(" ")}`));
    const [revision] = await research.listRevisions(result.itemId ?? "");
    expect(revision.conceptIds).toHaveLength(8);
    expect(catalog.themes.size).toBe(8);
  });

  it("no tag files null (the database carries or reads the item's theme)", async () => {
    const { deps, research } = setup();
    const insert = vi.spyOn(research, "insertRevision");
    await saveCapture(deps, input("no tags here"));
    expect(insert.mock.calls[0][0].conceptIds).toBeNull();
  });

  it("a t: append with #gamma on a thesis whose last revision links [alpha] writes [alpha, gamma]; with no tag it writes null", async () => {
    const { deps, catalog, research } = setup();
    const first = await saveCapture(deps, input("t: $TCS deal wins #alpha"));
    const a = [...catalog.themes.values()][0].id;
    const second = await saveCapture(deps, input("t: $TCS margins #gamma"));
    const c = [...catalog.themes.values()].find((t) => t.slug === "gamma")?.id;
    expect(second.itemId).toBe(first.itemId);
    expect((await research.listRevisions(first.itemId ?? ""))[0].conceptIds).toEqual([a, c]);
    const insert = vi.spyOn(research, "insertRevision");
    await saveCapture(deps, input("t: $TCS no tag this time"));
    expect(insert.mock.calls[0][0].conceptIds).toBeNull();
  });
});
