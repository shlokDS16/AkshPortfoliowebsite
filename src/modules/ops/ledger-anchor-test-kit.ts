import type { AnchorPort, AnchorRead, AnchorReadAll, AnchorWrite } from "@/lib/providers";
import { anchorWriteGate } from "@/lib/providers/anchor";
import type { Db } from "@/lib/supabase/types";
import type { AnchorJobDeps } from "./ledger-anchor";

// Test doubles for the ledger:anchor step (not shipped: only *.test.ts files import this). The database double keeps the
// sealed days in memory and follows the real rules of migration 0013 (a row changes once, to record publication, and not to a
// time before the row was created).

export type FakeAnchorRow = { date: string; line: string; published?: boolean; version?: string | null; createdAt?: string };

export const lineFor = (date: string): string => `{"v":1,"date":"${date}","count":0}`;
export const rowsFor = (...dates: string[]): FakeAnchorRow[] => dates.map((date) => ({ date, line: lineFor(date) }));
/** The text of a public file holding these lines. */
export const fileOf = (...dates: string[]): string => dates.map((d) => `${lineFor(d)}\n`).join("");

type DbError = { message: string; code?: string };
type Stored = { date: string; line: string; published: boolean; version: string | null; createdAt: string };
const DEFAULT_CREATED_AT = "2026-10-01T00:00:00Z";

export function fakeAnchorDb(opts: {
  rows?: FakeAnchorRow[];
  /** Rows the next seal adds (and the count it answers). */
  sealAdds?: FakeAnchorRow[];
  seal?: { error: DbError } | "hang";
  readError?: DbError;
  updateError?: DbError;
  /** Reads (selects and counts) / updates that never answer until their abort signal fires. */
  hangReads?: boolean;
  hangUpdates?: boolean;
  /** Called at the start of each update, to simulate a crash between two records, or another run in between. */
  beforeUpdate?: (n: number) => void;
}) {
  const rows: Stored[] = (opts.rows ?? []).map((r) => ({ date: r.date, line: r.line, published: r.published ?? false, version: r.version ?? null, createdAt: r.createdAt ?? DEFAULT_CREATED_AT }));
  const calls: string[] = [];
  const updates: { dates: string[]; published_at: string; anchor_version: string | null }[] = [];
  /** One entry per read/update that carried an abort signal, with the time it allowed. */
  const signals: { op: "select" | "count" | "update"; signal: AbortSignal }[] = [];
  let sealCount = 0;

  const rpc = (name: string) => {
    calls.push(`rpc:${name}`);
    if (name !== "seal_ledger_days") throw new Error(`unexpected rpc ${name}`);
    sealCount += 1;
    let signal: AbortSignal | undefined;
    const run = (): Promise<unknown> => {
      if (opts.seal === "hang") {
        return new Promise((resolve) => {
          const settle = () => resolve({ data: null, error: { message: "AbortError: The operation was aborted", code: "" } });
          if (signal?.aborted) settle();
          else signal?.addEventListener("abort", settle);
        });
      }
      if (opts.seal) return Promise.resolve({ data: null, error: opts.seal.error });
      const adds = sealCount === 1 ? (opts.sealAdds ?? []) : [];
      for (const r of adds) rows.push({ date: r.date, line: r.line, published: false, version: null, createdAt: r.createdAt ?? DEFAULT_CREATED_AT });
      rows.sort((a, b) => a.date.localeCompare(b.date));
      return Promise.resolve({ data: adds.length, error: null });
    };
    const builder = {
      abortSignal: (s: AbortSignal) => ((signal = s), builder),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return builder;
  };

  type Patch = { published_at: string; anchor_version: string | null };
  const from = (table: string) => {
    if (table !== "ledger_anchors") throw new Error(`unexpected table ${table}`);
    const q: { op: "select" | "update"; head: boolean; from?: string; to?: string; asc: boolean; limit?: number; inDates?: string[]; filter?: "unpublished" | "published"; patch?: Patch; signal?: AbortSignal } =
      { op: "select", head: false, asc: true };
    const chain: Record<string, unknown> = {
      select: (_cols?: string, o?: { head?: boolean }) => ((q.head = Boolean(o?.head)), chain),
      update: (patch: Patch) => ((q.op = "update"), (q.patch = patch), chain),
      gte: (_c: string, v: string) => ((q.from = v), chain),
      lte: (_c: string, v: string) => ((q.to = v), chain),
      order: (_c: string, o?: { ascending?: boolean }) => ((q.asc = o?.ascending !== false), chain),
      limit: (n: number) => ((q.limit = n), chain),
      in: (_c: string, v: string[]) => ((q.inDates = v), chain),
      is: () => ((q.filter = "unpublished"), chain),
      not: () => ((q.filter = "published"), chain),
      abortSignal: (s: AbortSignal) => ((q.signal = s), chain),
    };
    const hang = (): Promise<unknown> =>
      new Promise((resolve) => {
        const settle = () => resolve({ data: null, count: null, error: { message: "AbortError: The operation was aborted", code: "" } });
        if (q.signal?.aborted) settle();
        else q.signal?.addEventListener("abort", settle);
      });
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      let result: unknown;
      const kind = q.op === "update" ? "update" : q.head ? "count" : "select";
      if (q.signal) signals.push({ op: kind, signal: q.signal });
      if (q.op === "update") {
        calls.push("update");
        opts.beforeUpdate?.(updates.length);
        if (opts.hangUpdates) result = hang();
        else if (opts.updateError) result = { data: null, error: opts.updateError };
        else {
          const patch = q.patch as Patch;
          const hit = rows.filter((r) => q.inDates?.includes(r.date) && (q.filter !== "unpublished" || !r.published));
          // The database's own guard: a row is marked once, and never at a time before it was created.
          const early = hit.find((r) => Date.parse(patch.published_at) < Date.parse(r.createdAt));
          if (early) result = { data: null, error: { message: "ledger_anchors: published_at before created_at", code: "P0001" } };
          else {
            for (const r of hit) {
              r.published = true;
              r.version = patch.anchor_version;
            }
            updates.push({ dates: hit.map((r) => r.date), published_at: patch.published_at, anchor_version: patch.anchor_version });
            result = { data: null, error: null };
          }
        }
      } else if (opts.hangReads) {
        calls.push(kind);
        result = hang();
      } else if (opts.readError) {
        result = { data: null, count: null, error: opts.readError };
      } else if (q.head) {
        calls.push("count");
        result = { data: null, count: rows.filter((r) => (q.filter === "published" ? r.published : !r.published)).length, error: null };
      } else {
        calls.push("select");
        let hit = rows.filter((r) => (!q.from || r.date >= q.from) && (!q.to || r.date <= q.to));
        hit = q.asc ? hit : [...hit].reverse();
        if (q.limit !== undefined) hit = hit.slice(0, q.limit);
        result = { data: hit.map((r) => ({ anchor_date: r.date, line: r.line, published_at: r.published ? "2026-10-01T00:00:00Z" : null, created_at: r.createdAt })), error: null };
      }
      return Promise.resolve(result).then(resolve, reject);
    };
    return chain;
  };

  const db = { rpc, from } as unknown as Db;
  return { db, rows, calls, updates, signals, get seals() { return sealCount; }, published: () => rows.filter((r) => r.published).map((r) => r.date) };
}

export const anchorDeps = (db: Db, port: AnchorPort | (() => AnchorPort), now: Date, clock: () => number = () => 0): AnchorJobDeps => ({
  db, anchor: typeof port === "function" ? port : () => port, clock, now: () => now,
});

export type AnchorPortCall = { kind: "read" | "readAll" | "write"; file?: string; text?: string; expected?: string | null; timeoutMs?: number };
export type FakeAnchor = AnchorPort & { calls: AnchorPortCall[]; files: Map<string, string>; writes: () => AnchorPortCall[]; reads: () => AnchorPortCall[] };

/**
 * An in-memory gist. By default it behaves like the real port: `write` goes through the real `anchorWriteGate` first (append-only,
 * an equal text is nothing to add), then checks the precondition on the file as it stands. `readAll` and `write` override the
 * answer for a case; returning undefined falls back to the default.
 */
export function fakeAnchor(opts: {
  files?: Record<string, string>;
  name?: AnchorPort["name"];
  readAll?: () => AnchorReadAll | undefined;
  write?: (file: string, text: string) => AnchorWrite | undefined;
  /** Whether the default write really changes the file (false: the answer was lost on the way back). */
  applyWrite?: boolean;
  /** Called at the start of every port call, with the call's kind and how many calls there have been. */
  onCall?: (kind: AnchorPortCall["kind"], n: number) => void;
}): FakeAnchor {
  const files = new Map(Object.entries(opts.files ?? {}));
  const calls: AnchorPortCall[] = [];
  let version = 0;
  return {
    name: opts.name ?? "fixture",
    publicUrl: null,
    calls,
    files,
    writes: () => calls.filter((c) => c.kind === "write"),
    reads: () => calls.filter((c) => c.kind !== "write"),
    async read(file, o): Promise<AnchorRead> {
      calls.push({ kind: "read", file, timeoutMs: o?.timeoutMs });
      opts.onCall?.("read", calls.length);
      const text = files.get(file);
      return text === undefined ? { kind: "absent", what: "file" } : { kind: "ok", text, version: `v${version}` };
    },
    async readAll(o): Promise<AnchorReadAll> {
      calls.push({ kind: "readAll", timeoutMs: o?.timeoutMs });
      opts.onCall?.("readAll", calls.length);
      const forced = opts.readAll?.();
      if (forced) return forced;
      return { kind: "ok", files: new Map(files), version: `v${version}` };
    },
    async write(file, text, o): Promise<AnchorWrite> {
      calls.push({ kind: "write", file, text, expected: o.expected, timeoutMs: o.timeoutMs });
      opts.onCall?.("write", calls.length);
      const gate = anchorWriteGate(file, text, o.expected); // the same refusals as both real adapters
      if (gate) return gate;
      const forced = opts.write?.(file, text);
      if (forced) {
        if (forced.kind === "ok" || forced.kind === "interrupted" || forced.kind === "unconfirmed") if (opts.applyWrite !== false) files.set(file, text);
        return forced;
      }
      if ((files.get(file) ?? null) !== o.expected) return { kind: "changed", found: files.get(file) ?? null, version: null };
      files.set(file, text);
      version += 1;
      return { kind: "ok", version: `v${version}`, continuity: "unbroken" };
    },
  };
}
