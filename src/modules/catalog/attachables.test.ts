import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { listAttachables } from "./attachables";

// Phase 5d: the companies and concepts a source can be attached to (the desk's pickers and filters). Names only; a concept's description is never read.

function fakeDb(rows: Record<string, unknown[]>, failing: string[] = []) {
  const calls: { table: string; columns: string; filters: string[] }[] = [];
  const db = {
    from(table: string) {
      return {
        select(columns: string) {
          const call = { table, columns, filters: [] as string[] };
          calls.push(call);
          const result = failing.includes(table) ? { data: null, error: { message: "boom", code: "XX000" } } : { data: rows[table] ?? [], error: null };
          const q: Record<string, unknown> = {};
          for (const f of ["is", "order", "limit"]) q[f] = (...args: unknown[]) => (call.filters.push(`${f}:${args.map(String).join(",")}`), q);
          q.then = (resolve: (v: unknown) => unknown) => resolve(result);
          return q;
        },
      };
    },
  } as unknown as Db;
  return { db, calls };
}

describe("listAttachables", () => {
  it("lists live companies and concepts by name, named and slugged, never a description", async () => {
    const { db, calls } = fakeDb({
      companies: [{ id: "c1", slug: "kavpump", name: "Kaveri Pumps", nse_symbol: "KAVPUMP", needs_review: false }, { id: "c2", slug: "newco", name: "New Co", nse_symbol: null, needs_review: true }],
      themes: [{ id: "t1", slug: "moats", name: "Moats", needs_review: false }],
    });
    const out = await listAttachables(db);
    expect(out.companies).toEqual([
      { id: "c1", slug: "kavpump", name: "Kaveri Pumps", symbol: "KAVPUMP" },
      { id: "c2", slug: "newco", name: "New Co", symbol: null },
    ]);
    expect(out.concepts).toEqual([{ id: "t1", slug: "moats", name: "Moats" }]);
    for (const call of calls) {
      expect(call.columns).not.toContain("description");
      expect(call.filters).toContain("is:archived_at,null");
    }
  });

  it("throws on a failed read, naming nothing of the database's message", async () => {
    const { db } = fakeDb({}, ["themes"]);
    await expect(listAttachables(db)).rejects.toThrow();
  });
});
