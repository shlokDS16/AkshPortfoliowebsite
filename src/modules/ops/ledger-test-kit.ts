import type { EquityDay, IndexDay, MarketDataPort } from "@/lib/providers";
import { addDays } from "@/lib/dates";
import type { Db } from "@/lib/supabase/types";
import type { MarketDayRow } from "@/modules/ledger";

// Test doubles for the ledger job steps (not shipped: only *.test.ts files import this). The database double keeps the
// calendar in memory and follows the real rules of migration 0011 (what store_fetched_closes and mark_market_day_shut do).

export type PortCall = { kind: "equity" | "index"; date: string; symbols?: readonly string[]; timeoutMs?: number };

export type FakePort = MarketDataPort & { calls: PortCall[] };

type Answer<T> = T | ((date: string) => T);

export function fakePort(opts: {
  equity?: Answer<EquityDay>;
  index?: Answer<IndexDay>;
  /** Called after each port call, to move a fake clock. */
  onCall?: () => void;
}): FakePort {
  const calls: PortCall[] = [];
  const pick = <T,>(answer: Answer<T> | undefined, date: string, fallback: T): T =>
    answer === undefined ? fallback : typeof answer === "function" ? (answer as (d: string) => T)(date) : answer;
  return {
    name: "fixture",
    calls,
    async equityCloses(tradeDate, symbols, o) {
      calls.push({ kind: "equity", date: tradeDate, symbols, timeoutMs: o?.timeoutMs });
      opts.onCall?.();
      return pick(opts.equity, tradeDate, { kind: "no_file" } as EquityDay);
    },
    async indexClose(tradeDate, o) {
      calls.push({ kind: "index", date: tradeDate, timeoutMs: o?.timeoutMs });
      opts.onCall?.();
      return pick(opts.index, tradeDate, { kind: "no_file" } as IndexDay);
    },
  };
}

/** A file that is there: one close per asked symbol. */
export const equityOk = (date: string, symbols: readonly string[] = ["TCS"]): EquityDay => ({
  kind: "ok",
  tradeDate: date,
  closes: symbols.map((symbol, i) => ({ symbol, series: "EQ", isin: null, close: 100 + i })),
});
export const indexOk = (date: string): IndexDay => ({ kind: "ok", tradeDate: date, close: 22_000 });

export type RpcCall = { name: string; args?: Record<string, unknown> };

export function fakeLedgerDb(opts: {
  today: string;
  symbols?: string[];
  days?: MarketDayRow[];
  score?: { data: number } | { error: { message: string; code?: string } };
  storeError?: { message: string; code?: string };
  marketDaysError?: { message: string; code?: string };
}) {
  const days = new Map<string, MarketDayRow>((opts.days ?? []).map((d) => [d.tradeDate, { ...d }]));
  // Dates with an official (non-typed) price row. Test rows given as nse_fetch or nse_upload count as priced.
  const priced = new Set([...days.values()].filter((d) => d.source !== "manual").map((d) => d.tradeDate));
  const rpcCalls: RpcCall[] = [];
  const db = {
    from: (table: string) => {
      if (table !== "market_days") throw new Error(`unexpected table ${table}`);
      const rows = () =>
        [...days.values()].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate)).map((d) => ({ trade_date: d.tradeDate, status: d.status, source: d.source }));
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "gte", "lte", "order"]) chain[op] = () => chain;
      chain.then = (resolve: (v: unknown) => void) => resolve(opts.marketDaysError ? { data: null, error: opts.marketDaysError } : { data: rows(), error: null });
      return chain;
    },
    rpc: (name: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "tracked_symbols") return Promise.resolve({ data: opts.symbols ?? [], error: null });
      if (name === "store_fetched_closes") {
        if (opts.storeError) return Promise.resolve({ data: null, error: opts.storeError });
        const date = args?.p_trade_date as string;
        const rows = args?.p_rows as unknown[];
        priced.add(date);
        if (args?.p_index_close !== null && args?.p_index_close !== undefined) days.set(date, { tradeDate: date, status: "open", source: "nse_fetch" });
        return Promise.resolve({ data: rows.length, error: null });
      }
      if (name === "mark_market_day_shut") {
        const date = args?.p_trade_date as string;
        const laterOpen = [...days.values()].some((d) => d.tradeDate > date && d.status === "open" && d.source !== "manual");
        if (date >= addDays(opts.today, -7) && date <= opts.today && !priced.has(date) && laterOpen) {
          days.set(date, { tradeDate: date, status: "shut", source: "nse_fetch" });
        }
        return Promise.resolve({ data: null, error: null });
      }
      if (name === "score_ideas") return Promise.resolve({ data: null, error: null, ...(opts.score ?? { data: 0 }) });
      throw new Error(`unexpected rpc ${name}`);
    },
  } as unknown as Db;
  return { db, days, rpcCalls, names: () => rpcCalls.map((c) => c.name) };
}
