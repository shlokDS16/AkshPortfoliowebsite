import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import type { MarketDayRow } from "@/modules/ledger";
import { fetchCloses, scoreIdeas, type LedgerJobDeps } from "./ledger-prices";
import { equityOk, fakeLedgerDb, fakePort, indexOk, type FakePort } from "./ledger-test-kit";

// 2026-10-12 is a Monday. "today" is Wednesday the 14th unless a test says otherwise.
const TODAY = "2026-10-14";
const open = (tradeDate: string, source = "nse_fetch"): MarketDayRow => ({ tradeDate, status: "open", source });
/** Official open rows for every weekday from `first` to `last`. */
const run = (first: string, last: string): MarketDayRow[] => {
  const rows: MarketDayRow[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) if (![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) rows.push(open(d));
  return rows;
};
const SYMBOLS = ["RELIANCE", "TCS"];
const EARLIER = run("2026-10-07", "2026-10-12"); // everything before the 13th is decided

function setup(opts: {
  days?: MarketDayRow[];
  today?: string;
  symbols?: string[];
  port?: Parameters<typeof fakePort>[0];
  clock?: () => number;
  storeError?: { message: string; code?: string };
}) {
  const today = opts.today ?? TODAY;
  const dbk = fakeLedgerDb({ today, symbols: opts.symbols ?? SYMBOLS, days: opts.days ?? EARLIER, storeError: opts.storeError });
  const port: FakePort = fakePort(opts.port ?? { equity: (d) => equityOk(d, SYMBOLS), index: (d) => indexOk(d) });
  const made: { count: number } = { count: 0 };
  const deps: LedgerJobDeps = {
    db: dbk.db,
    market: () => ((made.count += 1), port),
    today: () => today,
    clock: opts.clock ?? (() => 0),
  };
  return { ...dbk, port, deps, made };
}

describe("fetchCloses: the ordinary day", () => {
  it("says there is nothing to fetch when no idea needs a close, and asks NSE for nothing", async () => {
    const t = setup({ symbols: [] });
    expect(await fetchCloses(t.deps)).toBe("nothing to fetch");
    expect(t.port.calls).toEqual([]);
    expect(t.names()).toEqual(["tracked_symbols"]);
  });

  it("stores yesterday's closes and the Nifty 50 once both files are there", async () => {
    const t = setup({});
    const detail = await fetchCloses(t.deps);
    expect(detail).toBe("stored 1 date, 2 closes");
    const store = t.rpcCalls.find((c) => c.name === "store_fetched_closes");
    expect(store?.args).toEqual({
      p_trade_date: "2026-10-13",
      p_rows: [
        { symbol: "RELIANCE", series: "EQ", isin: null, close: 100 },
        { symbol: "TCS", series: "EQ", isin: null, close: 101 },
      ],
      p_index_close: 22_000,
    });
    expect(t.days.get("2026-10-13")).toMatchObject({ status: "open", source: "nse_fetch" });
    // the equity file is asked for the tracked symbols, never for a name the caller typed
    expect(t.port.calls.filter((c) => c.kind === "equity").map((c) => c.symbols)).toEqual([SYMBOLS]);
  });

  it("gives each NSE call 8 seconds, or what is left of the budget", async () => {
    const t = setup({});
    await fetchCloses(t.deps);
    expect(t.port.calls.map((c) => c.timeoutMs)).toEqual([8000, 8000]);
    // 3 s of the 25 s budget are left when the first date starts: the clock reads 0 once, then 22 s.
    let reads = 0;
    const slow = setup({ clock: () => (reads++ === 0 ? 0 : 22_000) });
    await fetchCloses(slow.deps);
    expect(slow.port.calls.map((c) => c.timeoutMs)).toEqual([3000, 3000]);
  });

  it("is idempotent: a second run on the same day asks NSE for nothing and stores nothing", async () => {
    const t = setup({});
    await fetchCloses(t.deps);
    const callsAfterFirst = t.port.calls.length;
    const storesAfterFirst = t.names().filter((n) => n === "store_fetched_closes").length;
    expect(await fetchCloses(t.deps)).toBe("up to date");
    expect(t.port.calls.length).toBe(callsAfterFirst);
    expect(t.names().filter((n) => n === "store_fetched_closes").length).toBe(storesAfterFirst);
  });
});

describe("fetchCloses: how many dates a run takes", () => {
  it("takes the two oldest undecided days and says how many are left; behind but healthy is not a failure", async () => {
    const t = setup({ days: [], today: "2026-10-21" });
    const detail = await fetchCloses(t.deps);
    expect(detail).toBe("stored 2 dates, 4 closes, 3 dates left");
    expect([...t.days.keys()].sort()).toEqual(["2026-10-14", "2026-10-15"]);
  });

  it("stops when the 25 seconds are spent, and leaves the rest for tomorrow", async () => {
    let now = 0;
    const t = setup({ days: [], today: "2026-10-16", clock: () => now, port: { equity: (d) => equityOk(d, SYMBOLS), index: (d) => indexOk(d), onCall: () => (now += 12_500) } });
    // today Fri 16th: window 9th-15th -> 9th, 12th, 13th, 14th, 15th. The first date uses the whole 25 s.
    const detail = await fetchCloses(t.deps);
    expect(detail).toMatch(/^stored 1 date, 2 closes, 4 dates left/);
    expect(t.port.calls.map((c) => c.date)).toEqual(["2026-10-09", "2026-10-09"]);
  });
});

describe("fetchCloses: a holiday", () => {
  // Tuesday the 13th has no files; Wednesday the 14th is open. Today is Thursday the 15th.
  const holidayDays = [...EARLIER, open("2026-10-14")];
  const holiday = (d: string) => (d === "2026-10-13" ? { kind: "no_file" as const } : equityOk(d, SYMBOLS));
  const holidayIndex = (d: string) => (d === "2026-10-13" ? { kind: "no_file" as const } : indexOk(d));

  it("marks the day shut when BOTH files are missing and the last open day still answers (the canary)", async () => {
    const t = setup({ days: holidayDays, today: "2026-10-15", port: { equity: holiday, index: holidayIndex } });
    const detail = await fetchCloses(t.deps);
    expect(detail).toBe("1 date marked shut");
    expect(t.days.get("2026-10-13")).toMatchObject({ status: "shut", source: "nse_fetch" });
    // the canary is the equity address of the newest open day, asked with no symbols
    expect(t.port.calls.at(-1)).toMatchObject({ kind: "equity", date: "2026-10-14", symbols: [] });
  });

  it("does not ask the canary again when that very day was fetched in this run", async () => {
    // Wednesday the 14th is undecided too: the run fetches the 13th (no file) and the 14th (ok), then shuts the 13th.
    const t = setup({ days: EARLIER, today: "2026-10-15", port: { equity: holiday, index: holidayIndex } });
    const detail = await fetchCloses(t.deps);
    expect(detail).toBe("stored 1 date, 2 closes, 1 date marked shut");
    expect(t.days.get("2026-10-13")?.status).toBe("shut");
    expect(t.port.calls.filter((c) => c.date === "2026-10-14" && c.kind === "equity")).toHaveLength(1);
  });

  it("marks nothing when the canary now answers 'no file': the address has moved, and the step fails with a plain reason", async () => {
    const t = setup({ days: holidayDays, today: "2026-10-15", port: { equity: () => ({ kind: "no_file" }), index: holidayIndex } });
    await expect(fetchCloses(t.deps)).rejects.toThrow(/address may have changed/);
    expect(t.names()).not.toContain("mark_market_day_shut");
    expect(t.days.get("2026-10-13")).toBeUndefined();
  });

  it.each([
    ["blocked", { kind: "blocked" as const, message: "NSE refused the request (403)" }],
    ["a provider error", { kind: "provider_error" as const, message: "the equity file could not be read (too_large)" }],
  ])("marks nothing when the canary answers %s: the day stays undecided and the run does not fail", async (_label, canary) => {
    const equity = (d: string) => (d === "2026-10-14" ? canary : holiday(d));
    const t = setup({ days: holidayDays, today: "2026-10-15", port: { equity, index: holidayIndex } });
    const detail = await fetchCloses(t.deps);
    expect(detail).toContain("could not confirm");
    expect(t.names()).not.toContain("mark_market_day_shut");
  });

  it("marks nothing when no open day is known to check against (a fresh system with nothing stored fails, plainly)", async () => {
    const t = setup({ days: [], today: "2026-10-15", port: { equity: { kind: "no_file" }, index: { kind: "no_file" } } });
    await expect(fetchCloses(t.deps)).rejects.toThrow(/no open day to check against/);
    expect(t.names()).not.toContain("mark_market_day_shut");
  });

  it("an open day opened only by a typed close is not a canary", async () => {
    const days = [open("2026-10-14", "manual")];
    const t = setup({ days, today: "2026-10-15", port: { equity: { kind: "no_file" }, index: { kind: "no_file" } } });
    const detail = await fetchCloses(t.deps);
    expect(detail).toContain("no open day to check against");
    expect(t.names()).not.toContain("mark_market_day_shut");
  });
});

describe("fetchCloses: files that disagree, and files that fail", () => {
  it("equity 404 with the index there is a provider problem, never a holiday", async () => {
    const t = setup({ port: { equity: { kind: "no_file" }, index: (d) => indexOk(d) } });
    const detail = await fetchCloses(t.deps);
    expect(detail).toContain("two NSE files disagree");
    expect(t.names()).not.toContain("store_fetched_closes");
    expect(t.names()).not.toContain("mark_market_day_shut");
  });

  it("the equity file there with the index missing stores nothing and leaves the day undecided", async () => {
    const t = setup({ port: { equity: (d) => equityOk(d, SYMBOLS), index: { kind: "no_file" } } });
    const detail = await fetchCloses(t.deps);
    expect(detail).toContain("two NSE files disagree");
    expect(t.names()).not.toContain("store_fetched_closes");
    expect(t.days.has("2026-10-13")).toBe(false);
  });

  it("blocked on the first date stops the run: the second date is not asked, nothing is shut", async () => {
    const t = setup({ days: run("2026-10-07", "2026-10-09"), port: { equity: { kind: "blocked", message: "NSE refused the request (403)" }, index: (d) => indexOk(d) } });
    const detail = await fetchCloses(t.deps);
    expect(detail).toBe("NSE refused; closes to 2026-10-09");
    expect(new Set(t.port.calls.map((c) => c.date))).toEqual(new Set(["2026-10-12"]));
    expect(t.names()).not.toContain("mark_market_day_shut");
  });

  it("fails once three weekdays have passed with no stored close, and says so", async () => {
    // last open day Thu 8th; today Wed 14th: the 9th, 12th and 13th are missing
    const t = setup({ days: run("2026-10-07", "2026-10-08"), port: { equity: { kind: "blocked", message: "x" }, index: (d) => indexOk(d) } });
    await expect(fetchCloses(t.deps)).rejects.toThrow(/NSE refused; closes to 2026-10-08.*3 weekdays behind/);
  });

  it("two weekdays behind is not yet a failure", async () => {
    const t = setup({ days: run("2026-10-07", "2026-10-09"), port: { equity: { kind: "blocked", message: "x" }, index: (d) => indexOk(d) } });
    await expect(fetchCloses(t.deps)).resolves.toBe("NSE refused; closes to 2026-10-09");
  });

  it("a file that cannot be read (including one over the size cap) is retried tomorrow and, being a problem, fails once three weekdays are behind", async () => {
    const tooLarge = { kind: "provider_error" as const, message: "the equity file could not be read (too_large)" };
    const t = setup({ days: run("2026-10-07", "2026-10-08"), port: { equity: tooLarge, index: (d) => indexOk(d) } });
    await expect(fetchCloses(t.deps)).rejects.toThrow(/could not be read \(too_large\).*3 weekdays behind/);
    expect(t.names()).not.toContain("store_fetched_closes");
    expect(t.names()).not.toContain("mark_market_day_shut");
  });

  it("an unreadable file for one date does not hold back the next date", async () => {
    const t = setup({
      days: run("2026-10-07", "2026-10-09"),
      port: { equity: (d) => (d === "2026-10-12" ? { kind: "provider_error", message: "the equity file could not be read (bad_number)" } : equityOk(d, SYMBOLS)), index: (d) => indexOk(d) },
    });
    const detail = await fetchCloses(t.deps);
    expect(detail).toContain("stored 1 date");
    expect(detail).toContain("could not be read (bad_number)");
    expect(t.days.get("2026-10-13")?.status).toBe("open");
    expect(t.days.has("2026-10-12")).toBe(false);
  });

  it("a thrown port is a provider error, not a crash", async () => {
    const t = setup({ days: run("2026-10-07", "2026-10-09") });
    t.port.equityCloses = async () => {
      throw new Error("socket exploded");
    };
    const detail = await fetchCloses(t.deps);
    expect(detail).toContain("could not be read");
    expect(detail).not.toContain("socket");
  });

  it("a database failure while storing fails the step with the operation and code only", async () => {
    const t = setup({ storeError: { message: "duplicate key value violates ... (RELIANCE)", code: "23505" } });
    const error = await fetchCloses(t.deps).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/ledger\.storeCloses \(23505\)/);
    expect((error as Error).message).not.toContain("RELIANCE");
  });
});

describe("fetchCloses: the market-data factory", () => {
  it("a configuration error from the factory fails the step with a plain reason, before anything else is called", async () => {
    const t = setup({});
    t.deps.market = () => {
      throw new Error("LLM_ADAPTER=fixture needs a loopback NEXT_PUBLIC_SUPABASE_URL");
    };
    await expect(fetchCloses(t.deps)).rejects.toThrow(/not set up correctly: LLM_ADAPTER=fixture needs a loopback/);
    expect(t.rpcCalls).toEqual([]);
  });
});

describe("scoreIdeas", () => {
  it("reports the count in plain words", async () => {
    expect(await scoreIdeas({ ...setup({}).deps, db: fakeLedgerDb({ today: TODAY, score: { data: 3 } }).db })).toBe("scored 3 ideas");
    expect(await scoreIdeas({ ...setup({}).deps, db: fakeLedgerDb({ today: TODAY, score: { data: 1 } }).db })).toBe("scored 1 idea");
    expect(await scoreIdeas({ ...setup({}).deps, db: fakeLedgerDb({ today: TODAY, score: { data: 0 } }).db })).toBe("scored 0 ideas");
  });

  it.each(["chain_broken", "anchor_mismatch", "projection_mismatch"])("a refusal on %s fails the step with the code and nothing else", async (code) => {
    const db = fakeLedgerDb({ today: TODAY, score: { error: { message: `ledger:${code}`, code: "P0001" } } }).db;
    const error = (await scoreIdeas({ ...setup({}).deps, db }).catch((e: Error) => e)) as Error;
    expect(error.message).toContain(code);
    expect(error.message).toMatch(/nothing was scored/);
  });

  it("any other database failure is the operation and code only", async () => {
    const db = fakeLedgerDb({ today: TODAY, score: { error: { message: "relation idea_scores row (RELIANCE) is locked", code: "55P03" } } }).db;
    const error = (await scoreIdeas({ ...setup({}).deps, db }).catch((e: Error) => e)) as Error;
    expect(error.message).toBe("ledger.score (55P03)");
  });
});
