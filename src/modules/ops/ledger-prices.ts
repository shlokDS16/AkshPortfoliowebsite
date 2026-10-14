import { addDays } from "@/lib/dates";
import type { EquityDay, IndexDay, MarketDataPort } from "@/lib/providers";
import { jobDbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { datesToFetch, lastOpenDate, unsettledWeekdays, weekdaysBehind, type MarketDayRow } from "@/modules/ledger";
import { noRowDetail } from "./ledger-detail";

// The two ledger steps of the daily job (spec s8, ADR-005 s2). Job code: the ledger module cannot name a provider, so the
// steps that join the module to MarketDataPort live here. Every step is safe to run twice (the cron may duplicate).
//
// Heartbeat details hold counts, dates of closes and the port's own safe messages; never a URL, a file value or database text.

/** The per-run bound: at most this many dates are STORED in one run (a date with no file, or an unreadable one, does not count). */
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
/** A weekday older than the newest open day that is still neither open nor shut fails the step after this many weekdays. */
const HOLE_FAILS_AT = 3;

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
 * ledger:prices. Fetches the official closes of the tracked companies and the Nifty 50 for the oldest undecided weekdays (at
 * most two STORED dates a run: a date with no file, or one that cannot be read, does not use a slot), and records a holiday
 * only when both files are missing, a later official day is known to be open, and the address still works for that day.
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
  const noRow = new Set<string>();
  let visited = 0;
  let closes = 0;
  let blocked = false;
  let disagreements = 0;
  const problems: string[] = [];

  for (const date of due) {
    if (fetched.size >= MAX_DATES_PER_RUN) break;
    // Once a possible holiday is on the list, a second of the budget stays back for the canary that would confirm it.
    const left = timeLeft() - (noFile.length > 0 ? MIN_CALL_MS : 0);
    if (left < MIN_CALL_MS) break;
    visited += 1;
    const timeoutMs = Math.min(PORT_TIMEOUT_MS, left);
    const [equity, index] = await Promise.all([askEquity(market, date, symbols, timeoutMs), askIndex(market, date, timeoutMs)]);
    if (equity.kind === "ok" && index.kind === "ok") {
      // The adapter checks the date inside the file; the step does too, so no other source can store a close under the wrong day.
      if (equity.tradeDate !== date || index.tradeDate !== date) {
        problems.push("a file was for another date than the one asked for");
        continue;
      }
      const { data, error } = await db.rpc("store_fetched_closes", { p_trade_date: date, p_rows: equity.closes, p_index_close: index.close });
      if (error) throw jobDbError("ledger.storeCloses", error);
      closes += data ?? 0;
      fetched.add(date);
      const got = new Set(equity.closes.map((c) => c.symbol));
      for (const symbol of symbols) if (!got.has(symbol)) noRow.add(symbol);
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

  // A holiday needs both files missing, a later official open day (the canary day, or a day fetched in this run, which is then
  // the canary), and a working address: the canary day's own file is still there. A date that is not EARLIER than the canary
  // day stays undecided until a later day opens.
  let confirmed: string[] = [];
  let waiting = 0;
  let unconfirmed: { count: number; reason: string } | null = null;
  let moved = false;
  if (noFile.length > 0) {
    const canary = canaryDate(await readDays(db, today), today);
    if (canary === null) {
      unconfirmed = { count: noFile.length, reason: "no open day to check against" };
    } else {
      const earlier = noFile.filter((d) => d < canary);
      waiting = noFile.length - earlier.length;
      if (earlier.length > 0) {
        if (!fetched.has(canary) && timeLeft() < MIN_CALL_MS) {
          unconfirmed = { count: earlier.length, reason: "out of time" };
        } else {
          const check = fetched.has(canary) ? { kind: "ok" as const } : await askEquity(market, canary, [], Math.min(PORT_TIMEOUT_MS, timeLeft()));
          if (check.kind === "ok") confirmed = earlier;
          else if (check.kind === "no_file") moved = true;
          else unconfirmed = { count: earlier.length, reason: "the newest open day's file could not be read" };
        }
      }
    }
    for (const date of confirmed) {
      const { error } = await db.rpc("mark_market_day_shut", { p_trade_date: date });
      if (error) throw jobDbError("ledger.markShut", error);
    }
  }

  const days = await readDays(db, today);
  const shut = confirmed.filter((d) => days.some((r) => r.tradeDate === d && r.status === "shut")).length;
  const parts: string[] = [];
  if (fetched.size > 0) parts.push(`stored ${plural(fetched.size, "date")}, ${plural(closes, "close")}`);
  if (noRow.size > 0) parts.push(noRowDetail(noRow.size, symbols.length));
  if (shut > 0) parts.push(`${plural(shut, "date")} marked shut`);
  if (waiting > 0) parts.push(`${plural(waiting, "date")} waiting for a later open day`);
  if (disagreements > 0) parts.push(`the two NSE files disagree for ${plural(disagreements, "date")}`);
  if (problems.length > 0) parts.push(problems[0] as string);
  if (unconfirmed) parts.push(`could not confirm ${plural(unconfirmed.count, "possible holiday")} (${unconfirmed.reason})`);
  if (blocked) {
    const last = lastOpenDate(days, today);
    parts.push(last ? `NSE refused; closes to ${last}` : "NSE refused");
  } else if (due.length > visited) {
    parts.push(`${plural(due.length - visited, "date")} left`);
  }
  const detail = parts.length > 0 ? parts.join(", ") : due.length === 0 ? "up to date" : "nothing stored";

  if (moved) throw new Error(`${detail}; the equity file address may have changed (the newest open day no longer has a file)`);
  // A weekday older than the newest open day that is still neither open nor shut after 3 weekdays must not slide out of the
  // look-back window unnoticed: the entry of an idea opened that day would silently be the next day's close.
  const holes = unsettledWeekdays(days, today).filter((h) => h.weekdaysOld >= HOLE_FAILS_AT);
  if (holes.length > 0) {
    const dates = holes.slice(0, 3).map((h) => h.date).join(", ");
    throw new Error(`${detail}; ${plural(holes.length, "weekday")} in the last week still ${holes.length === 1 ? "has" : "have"} no close (${dates})`);
  }
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

/** The ledger:score budget (spec s8). Enforced with an abort on the request, the way the provider calls are. */
export const SCORE_BUDGET_MS = 5000;

/** ledger:score. The database function is the only writer of scores; a refusal writes nothing and fails the step. */
export async function scoreIdeas(deps: Pick<LedgerJobDeps, "db">, budgetMs = SCORE_BUDGET_MS): Promise<string> {
  const signal = AbortSignal.timeout(budgetMs);
  const { data, error } = await deps.db.rpc("score_ideas").abortSignal(signal);
  if (error) {
    if (signal.aborted) throw new Error("scoring did not finish within its time limit");
    const code = /^ledger:([a-z_]+)/.exec(error.message)?.[1];
    if (code && REFUSALS.has(code)) throw new Error(`the ledger failed its own check (${code}); nothing was scored`);
    throw jobDbError("ledger.score", error);
  }
  return `scored ${plural(Number(data ?? 0), "idea")}`;
}
