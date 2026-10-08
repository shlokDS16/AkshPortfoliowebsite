import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { createSupabaseInboxRepo } from "./inbox-repo";

type Call = { table: string; ops: [string, ...unknown[]][] };

/** A recording PostgREST stand-in: every chain resolves to the next queued result. */
function fakeDb(results: { data: unknown; error: unknown }[]) {
  const calls: Call[] = [];
  const db = {
    from: (table: string) => {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const proxy: Record<string, unknown> = {};
      for (const op of ["select", "update", "eq", "order", "limit", "maybeSingle"]) {
        proxy[op] = (...args: unknown[]) => (call.ops.push([op, ...args]), proxy);
      }
      proxy.then = (resolve: (v: unknown) => void) => resolve(results.shift() ?? { data: null, error: null });
      return proxy;
    },
  } as unknown as Db;
  return { db, calls };
}

describe("inbox repo and the pass column (migration 0008, R2)", () => {
  it("lists a re-read page once", async () => {
    const { db } = fakeDb([{ data: [{ page_no: 4 }, { page_no: 4 }, { page_no: 9 }, { page_no: null }], error: null }]);
    expect(await createSupabaseInboxRepo(db).extractPages("j1")).toEqual([4, 9]);
  });

  it("acts on the highest pass of the page when it skips a queued step", async () => {
    const { db, calls } = fakeDb([{ data: { id: "s2" }, error: null }, { data: null, error: null }]);
    await createSupabaseInboxRepo(db).skipQueuedStep("j1", 4);
    expect(calls[0].ops).toEqual([
      ["select", "id"],
      ["eq", "job_id", "j1"],
      ["eq", "kind", "extract_page"],
      ["eq", "page_no", 4],
      ["order", "pass", { ascending: false }],
      ["limit", 1],
      ["maybeSingle"],
    ]);
    expect(calls[1].ops).toEqual([["update", { status: "skipped" }], ["eq", "id", "s2"], ["eq", "status", "queued"]]);
  });

  it("revives only that latest step, and does nothing when the page has none", async () => {
    const found = fakeDb([{ data: { id: "s2" }, error: null }, { data: null, error: null }]);
    await createSupabaseInboxRepo(found.db).reviveStep("j1", 4);
    expect(found.calls[1].ops.slice(1)).toEqual([["eq", "id", "s2"], ["eq", "status", "skipped"]]);

    const none = fakeDb([{ data: null, error: null }]);
    await createSupabaseInboxRepo(none.db).reviveStep("j1", 4);
    expect(none.calls).toHaveLength(1);
  });
});
