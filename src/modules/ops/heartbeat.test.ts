import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { createSupabaseHeartbeatRepo } from "./heartbeat";

type Call = { table: string; ops: [string, ...unknown[]][] };

function fakeDb(results: { data?: unknown; error?: { message: string; code?: string } | null }[]) {
  const calls: Call[] = [];
  const db = {
    from: (table: string) => {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "insert", "eq", "gte", "order", "limit", "maybeSingle"]) chain[op] = (...args: unknown[]) => (call.ops.push([op, ...args]), chain);
      chain.then = (resolve: (v: unknown) => void) => resolve(results.shift() ?? { data: null, error: null });
      return chain;
    },
  } as unknown as Db;
  return { db, calls };
}

describe("lastFailedRuns: the newest FAILED run of each job since a moment", () => {
  it("asks for failed rows only, newest first, from the given moment, one query per job", async () => {
    const { db, calls } = fakeDb([{ data: { ran_at: "2026-10-10T01:00:00Z", ok: false, detail: "the public file differs" } }, { data: null }]);
    const out = await createSupabaseHeartbeatRepo(db).lastFailedRuns!(["ledger:anchor", "ledger:prices"], "2026-09-14T00:00:00.000Z");
    expect(out).toEqual({ "ledger:anchor": { ranAt: "2026-10-10T01:00:00Z", ok: false, detail: "the public file differs" }, "ledger:prices": null });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.table).toBe("heartbeats");
      expect(call.ops).toContainEqual(["eq", "ok", false]);
      expect(call.ops).toContainEqual(["gte", "ran_at", "2026-09-14T00:00:00.000Z"]);
      expect(call.ops).toContainEqual(["order", "ran_at", { ascending: false }]);
      expect(call.ops).toContainEqual(["limit", 1]);
    }
  });

  it("a database error is thrown as an operation and code, not as the database's text", async () => {
    const { db } = fakeDb([{ error: { message: "row detail leaked", code: "XX000" } }]);
    await expect(createSupabaseHeartbeatRepo(db).lastFailedRuns!(["ledger:anchor"], "2026-09-14T00:00:00.000Z")).rejects.toMatchObject({ op: "ops.lastFailedRuns" });
  });
});
