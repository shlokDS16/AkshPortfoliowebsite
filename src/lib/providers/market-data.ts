// The market-data port (spec s7, Plan 3a Task 6). Types only; the adapters are nse-bhavcopy.ts and fixture-market-data.ts.

export type Close = { symbol: string; series: string; isin: string | null; close: number };

/**
 * Why no data came back. Only `no_file` means NSE answered that there is no file for the day (a weekend, a market holiday,
 * or not published yet); it is the one outcome that may ever mark a day shut. `blocked` and `provider_error` mean we do not
 * know: NSE could not be reached, refused us, or sent a file that could not be read. They must never look like a holiday.
 */
export type Miss =
  | { kind: "no_file" } // 404: weekend, holiday or not published yet
  | { kind: "blocked"; message: string } // 401, 403, 429, or an HTML page where a file was expected
  | { kind: "provider_error"; message: string }; // timeout, 5xx, a zip or CSV we could not read
export type EquityDay = { kind: "ok"; tradeDate: string; closes: Close[] } | Miss;
export type IndexDay = { kind: "ok"; tradeDate: string; close: number } | Miss;

export interface MarketDataPort {
  readonly name: "nse" | "fixture";
  /** Only the asked-for symbols are returned; the rest of the file is dropped in memory. `tradeDate` is YYYY-MM-DD. */
  equityCloses(tradeDate: string, symbols: readonly string[], opts?: { timeoutMs?: number }): Promise<EquityDay>;
  /** The Nifty 50 price-index close for the date. */
  indexClose(tradeDate: string, opts?: { timeoutMs?: number }): Promise<IndexDay>;
}
