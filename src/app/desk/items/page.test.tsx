import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const listRecentItems = vi.fn();
vi.mock("@/modules/identity", () => ({ requireAdmin: vi.fn(async () => ({ email: "admin@desk.test" })) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }));
vi.mock("@/modules/research/actions", () => ({ createItemAction: vi.fn() }));
vi.mock("@/modules/research", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/research")>()),
  createSupabaseResearchRepo: () => ({}),
  listRecentItems: (...a: unknown[]) => listRecentItems(...a),
}));

import ItemsPage from "./page";

const item = (id: string, kind: string, title: string) => ({ id, kind, title, visibility: "private" });
const render = async (search: Record<string, string> = {}) => renderToStaticMarkup(await ItemsPage({ searchParams: Promise.resolve(search) }));

describe("the Items page (Phase 4)", () => {
  it("links to Concepts and This month under the title", async () => {
    listRecentItems.mockResolvedValueOnce([]);
    const html = await render();
    expect(html).toMatch(/<a[^>]*href="\/desk\/concepts"[^>]*>Concepts<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/desk\/learned"[^>]*>This month<\/a>/);
  });

  it("lists everything by default and only the reads under ?kind=reading_note, labelled Reads", async () => {
    const all = [item("1", "learning", "A learning"), item("2", "reading_note", "Marks memo")];
    listRecentItems.mockResolvedValue(all);
    const everything = await render();
    expect(everything).toContain("A learning");
    expect(everything).toContain("Marks memo");
    const reads = await render({ kind: "reading_note" });
    expect(reads).not.toContain("A learning");
    expect(reads).toContain("Marks memo");
    expect(reads).toMatch(/aria-current="page"[^>]*>Reads</);
  });

  it("an unknown kind in the address shows everything", async () => {
    listRecentItems.mockResolvedValue([item("1", "learning", "A learning")]);
    expect(await render({ kind: "<b>" })).toContain("A learning");
  });

  it("a read's row says read, not 'reading note'", async () => {
    listRecentItems.mockResolvedValue([item("2", "reading_note", "Marks memo")]);
    const html = await render();
    expect(html).toContain("read · private");
  });
});

describe("the Items page, reads filter, nothing logged", () => {
  it("says how to log a read, not that there are no items", async () => {
    listRecentItems.mockResolvedValue([item("1", "learning", "A learning")]);
    const html = await render({ kind: "reading_note" });
    expect(html).toContain("No reads yet. A line starting with r: logs one.");
    expect(html).not.toContain("No items yet");
  });
});
