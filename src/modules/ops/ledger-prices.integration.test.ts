import { execFileSync, execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { addDays, istDate } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import { isWeekday } from "@/modules/ledger";
import { fetchCloses, type LedgerJobDeps } from "./ledger-prices";
import { equityOk, fakePort, indexOk } from "./ledger-test-kit";

// Integration: the holiday path of ledger:prices against the REAL store_fetched_closes and mark_market_day_shut on the LOCAL
// database, as service_role (the secret key), with a fixture market-data port. Skipped, with the reason printed, when no local
// stack answers (`pnpm supabase start`). Never reads hosted credentials and makes no network call beyond the local stack.
// It owns the calendar and EVERY close (Nifty 50 and companies) of the last 10 days of the local database: it clears them before
// and after. The company closes must go too: mark_market_day_shut refuses a date for which any official close exists (the
// e2e daily run leaves such closes for the real tracked company), so a leftover close would make the holiday path depend on
// what ran before this file.
function localStack(): { url: string; secretKey: string } | null {
  try {
    const out = execSync("pnpm supabase status -o env", { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] });
    const get = (name: string) => new RegExp(`^${name}="?([^"\\r\\n]+)"?`, "m").exec(out)?.[1];
    const url = get("API_URL");
    const secretKey = get("SECRET_KEY");
    return url && secretKey ? { url, secretKey } : null;
  } catch {
    return null;
  }
}

const stack = localStack();
if (!stack) console.warn("ledger-prices.integration: no local Supabase stack, skipping (run `pnpm supabase start`)");

/** service_role has no DELETE grant, by design: the owner clears the rows through the CLI, as the e2e helpers do. */
function runSql(sql: string): void {
  execFileSync("pnpm", ["exec", "supabase", "db", "query", "--local", process.platform === "win32" ? `"${sql}"` : sql], { stdio: "ignore", shell: process.platform === "win32" });
}

describe.skipIf(!stack)("ledger:prices holiday path against the real SQL on the local database", () => {
  // Vitest still runs this callback to collect a skipped suite, and createClient throws on an empty URL or key, so the
  // skipped case gets placeholders that are never used.
  const real = createClient<Database>(stack?.url ?? "http://127.0.0.1:54321", stack?.secretKey ?? "skipped-no-local-stack", { auth: { persistSession: false, autoRefreshToken: false } });
  const SYMBOL = "ITEST";
  // The tracked-symbol list is the one thing replaced (it would need an idea opened by the admin session); every other call is real.
  const db = {
    from: (table: string) => real.from(table as never),
    rpc: (name: string, args?: Record<string, unknown>) => (name === "tracked_symbols" ? Promise.resolve({ data: [SYMBOL], error: null }) : real.rpc(name as never, args as never)),
  } as unknown as Db;

  const today = istDate(new Date());
  const clear = () => {
    const from = addDays(today, -10);
    // one statement per call: the CLI prepares each query
    runSql(`delete from public.market_days where trade_date >= '${from}'`);
    runSql(`delete from public.prices_daily where trade_date >= '${from}'`);
  };
  // The fetch window is the 7 days before today: exactly five weekdays.
  const weekdays: string[] = [];
  for (let d = addDays(today, -7); d < today; d = addDays(d, 1)) if (isWeekday(d)) weekdays.push(d);
  const [first, holiday, second, third, fourth] = weekdays as [string, string, string, string, string];

  const status = async () => {
    const { data, error } = await real.from("market_days").select("trade_date, status, source").gte("trade_date", addDays(today, -10)).order("trade_date");
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.trade_date, `${r.status}/${r.source}`]));
  };

  it("shuts the holiday behind a later open day in one run, stores the next two days, and settles the rest the next day", async () => {
    clear();
    try {
      // the first weekday of the window is an ordinary, already settled trading day
      const seed = await real.rpc("store_fetched_closes", { p_trade_date: first, p_rows: [], p_index_close: 22_000 });
      expect(seed.error).toBeNull();

      const port = fakePort({
        equity: (d) => (d === holiday ? { kind: "no_file" } : equityOk(d, [SYMBOL])),
        index: (d) => (d === holiday ? { kind: "no_file" } : indexOk(d)),
      });
      const deps: LedgerJobDeps = { db, market: () => port, today: () => today, clock: Date.now };

      expect(await fetchCloses(deps)).toBe("stored 2 dates, 0 closes, 1 date marked shut, 1 date left");
      expect(await status()).toEqual({
        [first]: "open/nse_fetch",
        [holiday]: "shut/nse_fetch",
        [second]: "open/nse_fetch",
        [third]: "open/nse_fetch",
      });

      // the next day's run takes the last weekday, and asks NSE for nothing it already knows
      expect(await fetchCloses(deps)).toBe("stored 1 date, 0 closes");
      expect((await status())[fourth]).toBe("open/nse_fetch");
      const calls = port.calls.length;
      expect(await fetchCloses(deps)).toBe("up to date");
      expect(port.calls).toHaveLength(calls);
    } finally {
      clear();
    }
  }, 120_000);

  it("leaves yesterday undecided when no later day is open", async () => {
    clear();
    try {
      // Only the day before yesterday is open; yesterday has no files. Nothing is later than yesterday, so nothing is shut.
      const port = fakePort({ equity: { kind: "no_file" }, index: { kind: "no_file" } });
      const seed = await real.rpc("store_fetched_closes", { p_trade_date: third, p_rows: [], p_index_close: 22_000 });
      expect(seed.error).toBeNull();
      // mark the older weekdays decided so only the fourth is asked
      for (const d of [first, holiday, second]) expect((await real.rpc("store_fetched_closes", { p_trade_date: d, p_rows: [], p_index_close: 22_000 })).error).toBeNull();
      const detail = await fetchCloses({ db, market: () => port, today: () => today, clock: Date.now });
      expect(detail).toContain("waiting for a later open day");
      expect((await status())[fourth]).toBeUndefined();
    } finally {
      clear();
    }
  }, 120_000);
});
