import type { EquityDay, IndexDay, MarketDataPort, Miss } from "./market-data";
import { CsvError, parseBhavcopyCsv, parseIndexCsv } from "./nse-csv";
import { BHAVCOPY_PLACEHOLDER, fillNseTemplate, INDEX_PLACEHOLDER, type NsePlaceholder, nseTemplateProblem } from "./nse-template";
import { unzipSingle, ZipError } from "./zip-one";

export { CsvError, parseBhavcopyCsv, parseIndexCsv } from "./nse-csv";
export { NSE_HOST } from "./nse-template";

// The NSE adapter (spec s7, ADR-005 s2): the day's equity file (a zip holding one CSV) and the Nifty 50 index file, from
// NSE's public archive. Outbound rules: the host is fixed in code (nse-template.ts validates both templates, so an
// environment value can change the path only); https only; no redirect is followed; every call has a timeout; the body is
// read through a counter that stops at a byte cap (never trusting Content-Length); and the unzipped size is capped too.
// Every outcome is a typed result, never a throw. Only a 404 is `no_file`, the one answer that may mark a market holiday;
// being blocked, a timeout, a bad file all mean "we do not know" and must never look like a holiday. Nothing is logged:
// no address, no file content, no stack in any message.

/** Honest about who is asking. NSE answers a browser-shaped agent and gives nothing to an empty one (ADR-005 s2). */
export const NSE_USER_AGENT = "Mozilla/5.0 (compatible; AkshResearchDesk/1.0)";
const DEFAULT_TIMEOUT_MS = 8_000;
/** The answer as sent (the real zip is about 207 KB), the file unzipped (about 639 KB), and the index file (about 17.5 KB). */
const ZIP_CAP_BYTES = 4 * 1024 * 1024;
const UNZIP_CAP_BYTES = 16 * 1024 * 1024;
const INDEX_CAP_BYTES = 1024 * 1024;

export type NseMarketDataOptions = {
  bhavcopyTemplate: string;
  indexTemplate: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type Fetched = { kind: "ok"; bytes: Uint8Array } | Miss;

const LT = 0x3c; // "<": an HTML page where a zip or a CSV should be

/** Reads the stream up to maxBytes; the count is of bytes actually received. Cancels the stream when the cap is passed. */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | "too_big"> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return "too_big";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

async function get(doFetch: typeof fetch, url: string, maxBytes: number, timeoutMs: number): Promise<Fetched> {
  let response: Response;
  try {
    response = await doFetch(url, {
      method: "GET",
      headers: { "user-agent": NSE_USER_AGENT, accept: "*/*" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // The error's kind only: its message can echo the address.
    return { kind: "provider_error", message: error instanceof Error && error.name === "TimeoutError" ? "NSE did not answer in time" : "could not reach NSE" };
  }
  const status = response.status;
  if (status === 404) {
    await response.body?.cancel().catch(() => undefined);
    return { kind: "no_file" };
  }
  if (!response.ok || status !== 200) {
    await response.body?.cancel().catch(() => undefined);
    if (status === 401 || status === 403 || status === 429) return { kind: "blocked", message: `NSE answered HTTP ${status}` };
    return { kind: "provider_error", message: `NSE answered HTTP ${status}` };
  }
  if ((response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
    await response.body?.cancel().catch(() => undefined);
    return { kind: "blocked", message: "NSE sent a web page where a file was expected" };
  }
  let bytes: Uint8Array | "too_big";
  try {
    bytes = await readCapped(response, maxBytes);
  } catch {
    return { kind: "provider_error", message: "the NSE answer was cut off" };
  }
  if (bytes === "too_big") return { kind: "provider_error", message: "the NSE answer is larger than allowed" };
  if (bytes[0] === LT) return { kind: "blocked", message: "NSE sent a web page where a file was expected" };
  return { kind: "ok", bytes };
}

const unreadable = (what: string, error: unknown): Miss => {
  const code = error instanceof ZipError || error instanceof CsvError ? error.code : "unreadable";
  return { kind: "provider_error", message: `the ${what} could not be read (${code})` };
};

/** The address for one date, or a provider error when the date is not a real calendar date (no request is made). */
function addressFor(template: string, placeholder: NsePlaceholder, tradeDate: string): string | Miss {
  try {
    return fillNseTemplate(template, placeholder, tradeDate);
  } catch {
    return { kind: "provider_error", message: "the trade date is not a calendar date" };
  }
}

export function createNseMarketData(opts: NseMarketDataOptions): MarketDataPort {
  for (const [name, template, placeholder] of [
    ["NSE_BHAVCOPY_URL_TEMPLATE", opts.bhavcopyTemplate, BHAVCOPY_PLACEHOLDER],
    ["NSE_INDEX_URL_TEMPLATE", opts.indexTemplate, INDEX_PLACEHOLDER],
  ] as const) {
    const problem = nseTemplateProblem(template, placeholder);
    if (problem) throw new Error(`${name} ${problem}`);
  }
  const doFetch = opts.fetch ?? fetch;
  const timeout = (call?: number) => call ?? opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    name: "nse",
    async equityCloses(tradeDate, symbols, call): Promise<EquityDay> {
      const url = addressFor(opts.bhavcopyTemplate, BHAVCOPY_PLACEHOLDER, tradeDate);
      if (typeof url !== "string") return url;
      const got = await get(doFetch, url, ZIP_CAP_BYTES, timeout(call?.timeoutMs));
      if (got.kind !== "ok") return got;
      try {
        const csv = new TextDecoder("utf-8", { fatal: true }).decode(unzipSingle(got.bytes, UNZIP_CAP_BYTES));
        const day = parseBhavcopyCsv(csv, symbols);
        if (day.tradeDate !== tradeDate) return { kind: "provider_error", message: "the equity file is for another date than the one asked" };
        return { kind: "ok", ...day };
      } catch (error) {
        return unreadable("equity file", error);
      }
    },
    async indexClose(tradeDate, call): Promise<IndexDay> {
      const url = addressFor(opts.indexTemplate, INDEX_PLACEHOLDER, tradeDate);
      if (typeof url !== "string") return url;
      const got = await get(doFetch, url, INDEX_CAP_BYTES, timeout(call?.timeoutMs));
      if (got.kind !== "ok") return got;
      try {
        const day = parseIndexCsv(new TextDecoder("utf-8", { fatal: true }).decode(got.bytes));
        if (day.tradeDate !== tradeDate) return { kind: "provider_error", message: "the index file is for another date than the one asked" };
        return { kind: "ok", ...day };
      } catch (error) {
        return unreadable("index file", error);
      }
    },
  };
}
