import type { Db } from "@/lib/supabase/types";

export type FakeDbCall = { target: string; ops: [string, ...unknown[]][] };
export type FakeDbResult = { data?: unknown; count?: number | null; error?: { message: string; code?: string } | null };

const CHAIN_OPS = [
  "select", "insert", "update", "upsert", "eq", "neq", "in", "is", "not", "gt", "gte", "lt", "lte", "limit", "order", "range", "maybeSingle", "single",
];

/**
 * A recording PostgREST stand-in for repo tests: every `from(table)` chain and every `rpc(name, args)` resolves to the
 * next queued result (empty data, no error, when the queue is spent). `calls` lists them in the order they were made.
 */
export function createFakeDb(results: FakeDbResult[]) {
  const calls: FakeDbCall[] = [];
  const next = () => results.shift() ?? { data: null, error: null };
  const db = {
    from: (table: string) => {
      const call: FakeDbCall = { target: table, ops: [] };
      calls.push(call);
      const proxy: Record<string, unknown> = {};
      for (const op of CHAIN_OPS) proxy[op] = (...args: unknown[]) => (call.ops.push([op, ...args]), proxy);
      proxy.then = (resolve: (v: unknown) => void) => resolve(next());
      return proxy;
    },
    rpc: (name: string, args?: Record<string, unknown>) => {
      calls.push({ target: `rpc:${name}`, ops: [["args", args]] });
      return Promise.resolve(next());
    },
  } as unknown as Db;
  return { db, calls };
}
