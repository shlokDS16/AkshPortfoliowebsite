import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/lib/supabase/types";
import { addDays, istDate, istTime, istWeekday } from "@/lib/dates";
import { bhavCsv, indexCsv } from "@/test/nse-files";
import { buildZip } from "@/test/zip-builder";
import type { LocalStack } from "./stack";

// Test setup only, for the Ledger specs. Each run makes its own company (a unique NSE symbol), so no other spec's file is
// touched by an idea. The secret key stores a close the way the daily job does (store_fetched_closes); the app's own daily
// route is then asked to score it. Nothing here is shared with a real provider.

/** A unique, valid-looking NSE symbol and a company that carries it (the admin's own rights create it). */
export async function createLedgerCompany(db: Db, tag: string): Promise<{ id: string; name: string; symbol: string }> {
  const symbol = `LG${tag}${Date.now().toString(36)}`.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
  const name = `Ledger Test ${symbol} Ltd`;
  const { data, error } = await db.from("companies").insert({ slug: symbol.toLowerCase(), name, nse_symbol: symbol }).select("id").single();
  if (error) throw error;
  return { id: data.id, name, symbol };
}

/**
 * True when an idea recorded now would take TODAY's close as its entry: an India weekday, and well before 15:00 (the entry is
 * the first close after the moment the idea is sealed). The margin keeps a test that starts at 14:40 from sealing at 15:00.
 */
export function entryIsToday(now = new Date()): boolean {
  const weekday = istWeekday(now);
  if (weekday === "Sat" || weekday === "Sun") return false;
  const [h, m] = istTime(now).split(":").map(Number) as [number, number];
  return h * 60 + m < 14 * 60 + 30;
}

/** True within five minutes of the withdrawal cut-off (15:00 India), when "withdraw is offered" is a race and is not asserted. */
export function nearVoidCutoff(now = new Date()): boolean {
  const [h, m] = istTime(now).split(":").map(Number) as [number, number];
  const minutes = h * 60 + m;
  return minutes >= 14 * 60 + 55 && minutes <= 15 * 60 + 5;
}

/** Stores today's close for the company and the Nifty 50 (official-file source), so the next scoring run can fix an entry. */
export async function seedTodayCloses(stack: LocalStack, symbol: string): Promise<string> {
  const service = createClient(stack.apiUrl, stack.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const today = istDate(new Date());
  const { error } = await service.rpc("store_fetched_closes", {
    p_trade_date: today,
    p_rows: [{ symbol, series: "EQ", close: "100.00" }],
    p_index_close: 20000,
  });
  if (error) throw error;
  return today;
}

/**
 * Empties the trading calendar and every stored close of the last 10 days (owner SQL through the CLI: service_role has no
 * DELETE grant, by design). A daily run only fetches days that are still undecided, so a spec that wants the run to store the
 * week's closes for a company it has just made must start from an empty week, or a second run of the suite (no `db:reset`)
 * finds the week already stored and the new company gets no close. Later specs seed what they need themselves.
 */
export function clearRecentCloses(now = new Date()): void {
  const from = addDays(istDate(now), -10);
  for (const table of ["market_days", "prices_daily"]) {
    const sql = `delete from public.${table} where trade_date >= '${from}'`; // one statement per call: the CLI prepares each query
    execFileSync("pnpm", ["exec", "supabase", "db", "query", "--local", process.platform === "win32" ? `"${sql}"` : sql], {
      stdio: "ignore",
      shell: process.platform === "win32",
    });
  }
}

/** The `back`-th weekday before today in India (1 = the last one). Saturdays and Sundays are skipped. */
export function weekdayBack(back: number, now = new Date()): string {
  let date = istDate(now);
  for (let left = back; left > 0; ) {
    date = addDays(date, -1);
    const day = istWeekday(new Date(`${date}T12:00:00Z`));
    if (day !== "Sat" && day !== "Sun") left -= 1;
  }
  return date;
}

/** A synthetic official pair for one date (the real header rows, invented symbols and prices; never a real NSE file). */
export function syntheticOfficialFiles(date: string, rows: { symbol: string; close: string }[], niftyClose = "22000.50") {
  const [y, m, d] = date.split("-") as [string, string, string];
  const csv = bhavCsv([...rows.map((r) => ({ symbol: r.symbol, close: r.close, date })), { symbol: "NOTTRACKED", close: "10.00", date }]);
  return {
    zip: Buffer.from(buildZip([{ data: new TextEncoder().encode(csv) }])),
    index: Buffer.from(indexCsv([{ name: "Nifty 50", date: `${d}-${m}-${y}`, close: niftyClose }, { name: "Nifty Bank", date: `${d}-${m}-${y}`, close: "48000" }])),
  };
}

/**
 * Stores today's close for the company as a TYPED close, through the database owner (setup only: the screen refuses a typed
 * close for today before 15:30 India, and an idea opened now takes today's close as its entry, so this is the one way a test
 * run in the morning can reach a score that rests on a close he typed). The market-closed clock is moved a day on.
 */
export function seedTypedTodayCloses(symbol: string): void {
  const sql =
    `select private.put_hand_closes((now() at time zone 'Asia/Kolkata')::date, ` +
    `jsonb_build_array(jsonb_build_object('symbol', '${symbol}', 'close', '100.00')), 20000, 'manual', now() + interval '1 day')`;
  execFileSync("pnpm", ["exec", "supabase", "db", "query", "--local", process.platform === "win32" ? `"${sql}"` : sql], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
}

/** True when today is a weekday in India and the market has closed (15:30), so a typed close for today is accepted. */
export function typedCloseForTodayAllowed(now = new Date()): boolean {
  const weekday = istWeekday(now);
  if (weekday === "Sat" || weekday === "Sun") return false;
  const [h, m] = istTime(now).split(":").map(Number) as [number, number];
  return h * 60 + m >= 15 * 60 + 35;
}
