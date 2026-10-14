import type { Db } from "@/lib/supabase/types";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export type TableDb = {
  db: Db;
  tables: Record<string, Row[]>;
  /** Tables whose next write fails, with the error text. */
  failOn: Map<string, string>;
  log: { table: string; op: string }[];
};

/**
 * A small stateful stand-in for the PostgREST client: select, insert and update with eq / in / is filters, on plain
 * arrays. Enough for the repos that read and write whole rows; it knows nothing about RLS, triggers or embedded selects.
 */
export function createTableDb(tables: Record<string, Row[]>): TableDb {
  const failOn = new Map<string, string>();
  const log: TableDb["log"] = [];
  const from = (table: string) => {
    let op: "select" | "insert" | "update" = "select";
    let payload: Row | Row[] = {};
    const filters: Filter[] = [];
    let ordering: string[] = [];
    let returning = false;
    const run = () => {
      log.push({ table, op });
      const failure = op === "select" ? undefined : failOn.get(table);
      if (failure) return { data: null, error: { message: failure, code: "XX000" } };
      const rows = (tables[table] ??= []);
      if (op === "insert") {
        const added = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ ...r }));
        rows.push(...added);
        return { data: returning ? added : null, error: null };
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") for (const r of hit) Object.assign(r, payload);
      const sorted = [...hit].sort((a, b) => {
        for (const col of ordering) if (String(a[col] ?? "") !== String(b[col] ?? "")) return String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1;
        return 0;
      });
      return { data: op === "select" || returning ? sorted.map((r) => ({ ...r })) : null, error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => {
        if (op !== "select") returning = true;
        return builder;
      },
      insert: (rows: Row | Row[]) => ((op = "insert"), (payload = rows), builder),
      update: (patch: Row) => ((op = "update"), (payload = patch), builder),
      eq: (col: string, value: unknown) => (filters.push((r) => r[col] === value), builder),
      neq: (col: string, value: unknown) => (filters.push((r) => r[col] !== value), builder),
      in: (col: string, values: unknown[]) => (filters.push((r) => values.includes(r[col])), builder),
      is: (col: string, value: unknown) => (filters.push((r) => (r[col] ?? null) === value), builder),
      order: (col: string) => (ordering.push(col), builder),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    ordering = [];
    return builder;
  };
  return { db: { from } as unknown as Db, tables, failOn, log };
}
