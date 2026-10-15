import { describe, expect, it } from "vitest";
import { PAGE_SIZE, readAllPages } from "./paging";

describe("readAllPages", () => {
  it("reads page by page until a short one and joins them in order", async () => {
    const asked: [number, number][] = [];
    const result = await readAllPages<number>(async (from, to) => {
      asked.push([from, to]);
      return { data: from === 0 ? Array.from({ length: PAGE_SIZE }, (_, i) => i) : [PAGE_SIZE], error: null };
    });
    expect(asked).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(PAGE_SIZE + 1);
    expect(result.data?.at(-1)).toBe(PAGE_SIZE);
  });

  it("makes one request when the first page is short, or empty", async () => {
    let calls = 0;
    const result = await readAllPages<number>(async () => {
      calls += 1;
      return { data: null, error: null };
    });
    expect(calls).toBe(1);
    expect(result).toEqual({ data: [], error: null });
  });

  it("stops at the first error and returns it as it came", async () => {
    const result = await readAllPages<number>(async () => ({ data: null, error: { message: "boom", code: "XX000" } }));
    expect(result).toEqual({ data: null, error: { message: "boom", code: "XX000" } });
  });
});
