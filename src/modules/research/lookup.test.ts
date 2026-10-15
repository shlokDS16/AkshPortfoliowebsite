import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { listItemsByIds, listItemsCreatedBetween } from "./lookup";

const row = (id: string) => ({
  id,
  kind: "learning",
  slug: null,
  title: `title ${id}`,
  company_id: null,
  theme_id: null,
  visibility: "private",
  status: "draft",
  current_revision_id: null,
  published_at: null,
  data_as_of: null,
  learning_objective: null,
  holds_position: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
});

/** A query-builder stub: records the calls; `pages` are the answers to successive range() reads. */
function stubDb(pages: unknown[][]) {
  const calls: string[] = [];
  let page = 0;
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "in", "gte", "lt", "order"]) {
    chain[name] = (...args: unknown[]) => {
      calls.push(`${name}:${args.map((a) => JSON.stringify(a)).join(",")}`);
      return chain;
    };
  }
  chain.range = (from: number, to: number) => {
    calls.push(`range:${from},${to}`);
    return chain;
  };
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: pages[page++] ?? [], error: null });
  return { db: { from: (t: string) => (calls.push(`from:${t}`), chain) } as unknown as Db, calls };
}

describe("listItemsByIds", () => {
  it("reads items in chunks of 100 and maps rows to items", async () => {
    const ids = Array.from({ length: 150 }, () => randomUUID());
    const { db, calls } = stubDb([[row(ids[0] as string)], [row(ids[100] as string)]]);
    const items = await listItemsByIds(db, ids);
    expect(items.map((i) => i.id)).toEqual([ids[0], ids[100]]);
    expect(calls.filter((c) => c.startsWith("in:"))).toHaveLength(2);
    expect(calls.filter((c) => c.startsWith("from:"))).toEqual(["from:items", "from:items"]);
  });

  it("asks for nothing, and drops anything that is not a uuid", async () => {
    const { db, calls } = stubDb([]);
    expect(await listItemsByIds(db, [])).toEqual([]);
    expect(await listItemsByIds(db, ["not-an-id", "1) or (1=1"])).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("listItemsCreatedBetween", () => {
  it("filters on created_at from (included) to (not included) and the kinds, and pages past 1000 rows", async () => {
    const full = Array.from({ length: 1000 }, () => row(randomUUID()));
    const { db, calls } = stubDb([full, [row(randomUUID())]]);
    const items = await listItemsCreatedBetween(db, "2026-09-30T18:30:00.000Z", "2026-10-31T18:30:00.000Z", ["learning", "reading_note"]);
    expect(items).toHaveLength(1001);
    expect(calls).toEqual(
      expect.arrayContaining(['gte:"created_at","2026-09-30T18:30:00.000Z"', 'lt:"created_at","2026-10-31T18:30:00.000Z"', 'in:"kind",["learning","reading_note"]', "range:0,999", "range:1000,1999"]),
    );
  });

  it("asks for nothing when no kind is wanted", async () => {
    const { db, calls } = stubDb([]);
    expect(await listItemsCreatedBetween(db, "a", "b", [])).toEqual([]);
    expect(calls).toEqual([]);
  });
});
