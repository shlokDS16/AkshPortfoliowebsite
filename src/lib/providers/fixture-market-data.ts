import type { Close, MarketDataPort } from "./market-data";

// The fixture market-data adapter: local e2e and CI only. createMarketDataPort creates it only when the Supabase URL is a
// loopback address (made-up closes are stored as official closes, so a hosted database must never see them). No network. Closes are a pure function of the
// symbol and the date, so every run of every test sees the same numbers. Weekends have no file; the symbol BLOCKED is blocked.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** FNV-1a, 32 bit: a stable number from text. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** The weekday (0 Sunday .. 6 Saturday) of a real calendar date, or null. */
function weekday(tradeDate: string): number | null {
  const m = ISO.exec(tradeDate);
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  return d && d.toISOString().slice(0, 10) === tradeDate ? d.getUTCDay() : null;
}

/** A level between `low` and `low + span` that is fixed by the name, nudged within +-2 % by the date. */
function level(name: string, tradeDate: string, low: number, span: number): number {
  const base = low + (hash(name) % span);
  const nudge = 1 + ((hash(`${name}|${tradeDate}`) % 4001) - 2000) / 100_000;
  return Math.round(base * nudge * 100) / 100;
}

export function createFixtureMarketData(): MarketDataPort {
  return {
    name: "fixture",
    async equityCloses(tradeDate, symbols) {
      const day = weekday(tradeDate);
      if (day === null) return { kind: "provider_error", message: "the trade date is not a calendar date" };
      if (day === 0 || day === 6) return { kind: "no_file" };
      if (symbols.some((s) => s.trim().toUpperCase() === "BLOCKED")) return { kind: "blocked", message: "fixture: this symbol is blocked" };
      const closes: Close[] = symbols.map((s) => {
        const symbol = s.trim().toUpperCase();
        return { symbol, series: "EQ", isin: null, close: level(symbol, tradeDate, 50, 4950) };
      });
      return { kind: "ok", tradeDate, closes };
    },
    async indexClose(tradeDate) {
      const day = weekday(tradeDate);
      if (day === null) return { kind: "provider_error", message: "the trade date is not a calendar date" };
      if (day === 0 || day === 6) return { kind: "no_file" };
      return { kind: "ok", tradeDate, close: level("NIFTY 50", tradeDate, 20_000, 4_000) };
    },
  };
}
