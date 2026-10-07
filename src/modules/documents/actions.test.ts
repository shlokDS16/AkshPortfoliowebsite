import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), client: vi.fn(), from: vi.fn() }));
vi.mock("@/modules/identity", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));

import { checkQuotesAction, readPageAction, searchPagesAction } from "./actions";

const DOC = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const ITEM = { factId: "F1", pageNo: 1, quote: "q", valueText: "1" };

/** A chainable stand-in for the query builder: every method returns it, awaiting it gives `result`. */
function builder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "textSearch"]) b[m] = vi.fn(() => b);
  b.maybeSingle = vi.fn(async () => result);
  b.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return b;
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.requireAdmin.mockResolvedValue(undefined);
  mocks.client.mockResolvedValue({ from: mocks.from });
  mocks.from.mockImplementation(() => builder({ data: [], error: null }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("document pane actions: admin first", () => {
  it("a failing admin check stops every action before a client or a query exists", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("not admin"));
    await expect(readPageAction(DOC, 1)).rejects.toThrow("not admin");
    await expect(searchPagesAction(DOC, "revenue")).rejects.toThrow("not admin");
    await expect(checkQuotesAction(DOC, [ITEM])).rejects.toThrow("not admin");
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("document pane actions: bad input never reaches the database", () => {
  it("readPageAction refuses a bad id or page", async () => {
    const cases: [string, unknown][] = [["nope", 1], [DOC, 0], [DOC, 5001], [DOC, 1.5], [DOC, Number.NaN], [DOC, "3"]];
    for (const [id, page] of cases) {
      expect(await readPageAction(id, page as number)).toEqual({ ok: false, message: "That page is not in this document." });
    }
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(cases.length);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("searchPagesAction returns [] for a bad id or an empty or non-text query", async () => {
    expect(await searchPagesAction("nope", "revenue")).toEqual([]);
    expect(await searchPagesAction(DOC, "   ")).toEqual([]);
    expect(await searchPagesAction(DOC, undefined as unknown as string)).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("checkQuotesAction returns [] for a bad id, a non-list, or items that are all malformed (null included)", async () => {
    expect(await checkQuotesAction("nope", [ITEM])).toEqual([]);
    expect(await checkQuotesAction(DOC, null as unknown as [])).toEqual([]);
    const bad = [null, undefined, { ...ITEM, pageNo: 0 }, { ...ITEM, factId: 7 }, { ...ITEM, quote: 3 }];
    expect(await checkQuotesAction(DOC, bad as never)).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("document pane actions: caps", () => {
  it("searches with at most 200 characters of the query, and 10 results", async () => {
    const b = builder({ data: [{ page_no: 4, text: "Revenue from operations" }], error: null });
    mocks.from.mockReturnValue(b);
    const out = await searchPagesAction(DOC, `  ${"a".repeat(300)}  `);
    expect(b.textSearch).toHaveBeenCalledWith("search", "a".repeat(200), { type: "websearch", config: "simple" });
    expect(b.limit).toHaveBeenCalledWith(10);
    expect(out).toEqual([{ pageNo: 4, snippet: expect.any(String) }]);
  });

  it("checks at most 100 items, and reads each cited page once", async () => {
    const rows = [1, 2, 3, 4, 5].map((n) => ({ page_no: n, text: "Revenue 1,284.00" }));
    const b = builder({ data: rows, error: null });
    mocks.from.mockReturnValue(b);
    const items = Array.from({ length: 150 }, (_, i) => ({ factId: `F${i}`, pageNo: (i % 5) + 1, quote: "Revenue 1,284.00", valueText: "1284" }));
    const out = await checkQuotesAction(DOC, items);
    expect(out).toHaveLength(100);
    expect(out.every((r) => r.quoteFound && r.valueFound)).toBe(true);
    expect(b.in).toHaveBeenCalledWith("page_no", [1, 2, 3, 4, 5]);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("cuts an oversized quote to 2000 characters before comparing", async () => {
    mocks.from.mockReturnValue(builder({ data: [{ page_no: 1, text: "x".repeat(2000) }], error: null }));
    const [r] = await checkQuotesAction(DOC, [{ ...ITEM, quote: "x".repeat(2000) + "y".repeat(5000) }]);
    expect(r.quoteFound).toBe(true);
  });

  it("answers [] (not 'not found') when the read fails", async () => {
    mocks.from.mockReturnValue(builder({ data: null, error: { message: "boom", code: "XX000" } }));
    expect(await checkQuotesAction(DOC, [ITEM])).toEqual([]);
  });
});
