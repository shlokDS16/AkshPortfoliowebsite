import { addDays } from "@/lib/dates";
import type { EquityDay, IndexDay, MarketDataPort } from "@/lib/providers";
import { jobDbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { datesToFetch, lastOpenDate, weekdaysBehind, type MarketDayRow } from "@/modules/ledger";

// The two ledger steps of the daily job (spec s8, ADR-005 s2). Job code: the ledger module cannot name a provider, so the
// steps that join the module to MarketDataPort live here. Every step is safe to run twice (the cron may duplicate).
//
// Heartbeat details hold counts, dates of closes and the port's own safe messages; never a URL, a file value or database text.

/** The look-back and the per-run bound: at most this many dates are fetched in one run (the rest wait a day). */
export const MAX_DATES_PER_RUN = 2;
/** Each NSE call has the port's own timeout; this caps it (spec s7: 8 s). */
export const PORT_TIMEOUT_MS = 8000;
/** The ledger:prices budget (spec s8). */
export const PRICES_BUDGET_MS = 25_000;
/** A call is not started with less than this left. */
const MIN_CALL_MS = 1000;
/** How much of the calendar one run reads (the fetch window is 7 days; the "behind" count wants more). */
const CALENDAR_DAYS = 60;
/** The step fails once the stored closes are this many weekdays behind (spec s8) and the run did not make it up. */
const BEHIND_FAILS_AT = 3;

export type LedgerJobDeps = {
  db: Db;
  /** Builds the market-data port. Called inside the step: the factory throws on a configuration error (a fixture asked for
   *  against a hosted database), and that must become a failed heartbeat, not a crash of the whole cron run. */
  market: () => MarketDataPort;
  /** The India date today, YYYY-MM-DD. */
  today: () => string;
  /** Milliseconds, monotonic enough for a budget. */
  clock: () => number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function readDays(db: Db, today: string): Promise<MarketDayRow[]> {
  const { data, error } = await db
    .from("market_days")
    .select("trade_date, status, source")
    .gte("trade_date", addDays(today, -CALENDAR_DAYS))
    .order("trade_date", { ascending: true });
  if (error) throw jobDbError("ledger.readCalendar", error);
  return (data ?? []).flatMap((r) => (r.status === "open" || r.status === "shut" ? [{ tradeDate: r.trade_date, status: r.status, source: r.source }] : []));
}

async function trackedSymbols(db: Db): Promise<string[]> {
  const { data, error } = await db.rpc("tracked_symbols");
  if (error) throw jobDbError("ledger.trackedSymbols", error);
  return data ?? [];
}

/** The day to re-ask before a "no file" is believed: the newest open day that an official file opened (a typed close proves nothing). */
function canaryDate(days: readonly MarketDayRow[], today: string): string | null {
  return lastOpenDate(days.filter((d) => d.source === "nse_fetch" || d.source === "nse_upload"), today);
}

const MESSAGE_LIMIT = 160;
const unreadable = (what: string) => ({ kind: "provider_error" as const, message: `the ${what} file could not be read` });

/** The port never throws by contract; a bug in an adapter must still be a provider error, not a lost run. */
const askEquity = (market: MarketDataPort, date: string, symbols: readonly string[], timeoutMs: number): Promise<EquityDay> =>
  Promise.resolve().then(() => market.equityCloses(date, symbols, { timeoutMs })).catch(() => unreadable("equity"));
const askIndex = (market: MarketDataPort, date: string, timeoutMs: number): Promise<IndexDay> =>
  Promise.resolve().then(() => market.indexClose(date, { timeoutMs })).catch(() => unreadable("index"));

/**
 * ledger:prices. Fetches the official closes of the tracked companies and the Nifty 50 for the oldest undecided weekdays
 * (at most two a run), and records a holiday only when both files are missing and the address still works for the newest open day.
 */
export async function fetchCloses(deps: LedgerJobDeps, budgetMs = PRICES_BUDGET_MS): Promise<string> {
  const started = deps.clock();
  const timeLeft = () => budgetMs - (deps.clock() - started);

  let market: MarketDataPort;
  try {
    market = deps.market();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    throw new Error(`the closing-price source is not set up correctly: ${reason.slice(0, MESSAGE_LIMIT)}`);
  }

  const { db } = deps;
  const symbols = await trackedSymbols(db);
  if (symbols.length === 0) return "nothing to fetch";

  const today = deps.today();
  const due = datesToFetch(await readDays(db, today), today);
  const noFile: string[] = [];
  const fetched = new Set<string>();
  let attempted = 0;
  let closes = 0;
  let blocked = false;
  let disagreements = 0;
  const problems: string[] = [];

  for (const date of due.slice(0, MAX_DATES_PER_RUN)) {
    const left = timeLeft();
    if (left < MIN_CALL_MS) break;
    attempted += 1;
    const timeoutMs = Math.min(PORT_TIMEOUT_MS, left);
    const [equity, index] = await Promise.all([askEquity(market, date, symbols, timeoutMs), askIndex(market, date, timeoutMs)]);
    if (equity.kind === "ok" && index.kind === "ok") {
      const { data, error } = await db.rpc("store_fetched_closes", { p_trade_date: date, p_rows: equity.closes, p_index_close: index.close });
      if (error) throw jobDbError("ledger.storeCloses", error);
      closes += data ?? 0;
      fetched.add(date);
    } else if (equity.kind === "no_file" && index.kind === "no_file") {
      noFile.push(date);
    } else if (equity.kind === "blocked" || index.kind === "blocked") {
      blocked = true; // NSE is refusing us: the later dates would only be refused too
      break;
    } else if (equity.kind === "provider_error" || index.kind === "provider_error") {
      problems.push((equity.kind === "provider_error" ? equity.message : (index as { message: string }).message).slice(0, MESSAGE_LIMIT));
    } else {
      // One file is there and the other is not: a Nifty 50 close proves the market was open, so this is never a holiday.
      disagreements += 1;
    }
  }

  // A holiday needs both files missing, a later open day (the database checks), and a working address (the canary).
  let confirmed = false;
  let unconfirmed: string | null = null;
  let moved = false;
  if (noFile.length > 0) {
    const canary = canaryDate(await readDays(db, today), today);
    if (canary === null) {
      unconfirmed = "no open day to check against";
    } else {
      const check = fetched.has(canary) ? { kind: "ok" as const } : await askEquity(market, canary, [], Math.min(PORT_TIMEOUT_MS, Math.max(timeLeft(), 0)));
      if (check.kind === "ok") confirmed = true;
      else if (check.kind === "no_file") moved = true;
      else unconfirmed = "the newest open day's file could not be read";
    }
    if (confirmed) {
      for (const date of noFile) {
        const { error } = await db.rpc("mark_market_day_shut", { p_trade_date: date });
        if (error) throw jobDbError("ledger.markShut", error);
      }
    }
  }

  const days = await readDays(db, today);
  const shut = confirmed ? noFile.filter((d) => days.some((r) => r.tradeDate === d && r.status === "shut")).length : 0;
  const parts: string[] = [];
  if (fetched.size > 0) parts.push(`stored ${plural(fetched.size, "date")}, ${plural(closes, "close")}`);
  if (shut > 0) parts.push(`${plural(shut, "date")} marked shut`);
  if (disagreements > 0) parts.push(`the two NSE files disagree for ${plural(disagreements, "date")}`);
  if (problems.length > 0) parts.push(problems[0] as string);
  if (unconfirmed) parts.push(`could not confirm ${plural(noFile.length, "possible holiday")} (${unconfirmed})`);
  if (blocked) {
    const last = lastOpenDate(days, today);
    parts.push(last ? `NSE refused; closes to ${last}` : "NSE refused");
  } else if (due.length > attempted) {
    parts.push(`${plural(due.length - attempted, "date")} left`);
  }
  const detail = parts.length > 0 ? parts.join(", ") : due.length === 0 ? "up to date" : "nothing stored";

  if (moved) throw new Error(`${detail}; the equity file address may have changed (the newest open day no longer has a file)`);
  const behind = weekdaysBehind(days, today);
  const hadProblem = blocked || problems.length > 0 || disagreements > 0 || unconfirmed !== null;
  // Behind while this run is storing closes is catching up, not failing; behind with nothing to show for the run is.
  if (behind >= BEHIND_FAILS_AT && (hadProblem || fetched.size + shut === 0)) {
    throw new Error(`${detail}; closes are ${plural(behind, "weekday")} behind`);
  }
  return detail;
}

/** The codes `score_ideas()` raises when it refuses to run (spec s18, s23). Only these may reach a heartbeat. */
const REFUSALS = new Set(["chain_broken", "anchor_mismatch", "projection_mismatch"]);

/** ledger:score. The database function is the only writer of scores; a refusal writes nothing and fails the step. */
export async function scoreIdeas(deps: LedgerJobDeps): Promise<string> {
  const { data, error } = await deps.db.rpc("score_ideas");
  if (error) {
    const code = /^ledger:([a-z_]+)/.exec(error.message)?.[1];
    if (code && REFUSALS.has(code)) throw new Error(`the ledger failed its own check (${code}); nothing was scored`);
    throw jobDbError("ledger.score", error);
  }
  return `scored ${plural(Number(data ?? 0), "idea")}`;
}
