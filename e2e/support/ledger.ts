import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/lib/supabase/types";
import { istDate, istTime, istWeekday } from "@/lib/dates";
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
