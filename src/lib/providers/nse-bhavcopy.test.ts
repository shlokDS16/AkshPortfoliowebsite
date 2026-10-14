import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { deflateRawSync, gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildZip } from "@/test/zip-builder";
import { bhavCsv, indexCsv } from "@/test/nse-files";
import { createNseMarketData, NSE_USER_AGENT } from "./nse-bhavcopy";
import { DEFAULT_NSE_BHAVCOPY_TEMPLATE, DEFAULT_NSE_INDEX_TEMPLATE, fillNseTemplate, nseTemplateProblem } from "./nse-template";

const BHAV_URL = "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_20261012_F_0000.csv.zip";
const INDEX_URL = "https://nsearchives.nseindia.com/content/indices/ind_close_all_12102026.csv";
const templates = { bhavcopyTemplate: DEFAULT_NSE_BHAVCOPY_TEMPLATE, indexTemplate: DEFAULT_NSE_INDEX_TEMPLATE };

const zipOf = (csv: string) => buildZip([{ data: new TextEncoder().encode(csv) }]);
const goodZip = () => zipOf(bhavCsv([{ symbol: "ALPHA", close: "1234.50", isin: "INE111A01011" }, { symbol: "BETA", close: "88.05" }]));
const goodIndex = () => indexCsv([{ name: "Nifty 50", close: "22363.35" }]);
const body = (bytes: Uint8Array | string, init: ResponseInit = {}) => new Response(bytes as BodyInit, init);

function port(fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createNseMarketData>[0]> = {}) {
  return createNseMarketData({ ...templates, fetch: fetchImpl, ...extra });
}
const respondWith = (make: () => Response | Promise<Response>) => vi.fn<typeof fetch>(async () => make());

describe("the NSE adapter: a good day", () => {
  it("asks the exact archive address, https, with the fixed headers, no redirect, and a timeout", async () => {
    const fetchMock = respondWith(() => body(goodZip(), { status: 200, headers: { "content-type": "application/zip" } }));
    const out = await port(fetchMock).equityCloses("2026-10-12", ["ALPHA", "BETA", "NOPE"]);
    expect(out).toEqual({
      kind: "ok",
      tradeDate: "2026-10-12",
      closes: [
        { symbol: "ALPHA", series: "EQ", isin: "INE111A01011", close: 1234.5 },
        { symbol: "BETA", series: "EQ", isin: "INE000A01010", close: 88.05 },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(BHAV_URL);
    expect(init?.redirect).toBe("error");
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.headers).toEqual({ "user-agent": NSE_USER_AGENT, accept: "*/*" });
    expect(NSE_USER_AGENT).toMatch(/AkshResearchDesk/);
  });

  it("reads the index file at its own address", async () => {
    const fetchMock = respondWith(() => body(goodIndex(), { status: 200, headers: { "content-type": "text/csv" } }));
    expect(await port(fetchMock).indexClose("2026-10-12")).toEqual({ kind: "ok", tradeDate: "2026-10-12", close: 22363.35 });
    expect(fetchMock.mock.calls[0][0]).toBe(INDEX_URL);
  });
});

describe("the NSE adapter: what is a holiday and what is not", () => {
  it("404 is no_file, for both files", async () => {
    const p = port(respondWith(() => body("", { status: 404 })));
    expect(await p.equityCloses("2026-10-12", ["ALPHA"])).toEqual({ kind: "no_file" });
    expect(await p.indexClose("2026-10-12")).toEqual({ kind: "no_file" });
  });

  it.each([401, 403, 429])("%i is blocked, never no_file", async (status) => {
    const out = await port(respondWith(() => body("denied", { status }))).equityCloses("2026-10-12", ["ALPHA"]);
    expect(out).toMatchObject({ kind: "blocked" });
  });

  it("a 200 that is an HTML page is blocked (a zip, and an index file)", async () => {
    const html = "<!DOCTYPE html><html><body>Access Denied</body></html>";
    const a = port(respondWith(() => body(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })));
    expect(await a.equityCloses("2026-10-12", ["ALPHA"])).toMatchObject({ kind: "blocked" });
    expect(await a.indexClose("2026-10-12")).toMatchObject({ kind: "blocked" });
    // The same page under a wrong content type is still caught by its first byte.
    const b = port(respondWith(() => body(html, { status: 200, headers: { "content-type": "application/zip" } })));
    expect(await b.equityCloses("2026-10-12", ["ALPHA"])).toMatchObject({ kind: "blocked" });
  });

  it.each([500, 502, 503, 400])("%i is a provider error, never no_file", async (status) => {
    expect(await port(respondWith(() => body("", { status }))).indexClose("2026-10-12")).toMatchObject({ kind: "provider_error" });
  });

  it("a connection reset, a DNS failure and a refused redirect are provider errors", async () => {
    const reset = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) });
    });
    expect(await port(reset).equityCloses("2026-10-12", ["ALPHA"])).toMatchObject({ kind: "provider_error" });
    // With redirect: "error" a real fetch rejects on a 3xx; the mock does the same when asked not to follow.
    const redirecting = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.redirect === "error") throw new TypeError("fetch failed");
      return body("", { status: 302, headers: { location: "https://evil.example/x" } });
    });
    expect(await port(redirecting).indexClose("2026-10-12")).toMatchObject({ kind: "provider_error" });
    expect(redirecting).toHaveBeenCalledTimes(1);
  });

  it("a 3xx answer that reaches us anyway is a provider error and is not followed", async () => {
    const fetchMock = respondWith(() => body("", { status: 302, headers: { location: "https://evil.example/x" } }));
    expect(await port(fetchMock).indexClose("2026-10-12")).toMatchObject({ kind: "provider_error" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a timeout before any answer, and a body that stalls halfway, are provider errors", async () => {
    const never = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))));
    expect(await port(never, { timeoutMs: 20 }).equityCloses("2026-10-12", ["ALPHA"])).toMatchObject({ kind: "provider_error" });
    expect(await port(never).indexClose("2026-10-12", { timeoutMs: 20 })).toMatchObject({ kind: "provider_error" });

    const stalling = vi.fn<typeof fetch>(async (_url, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([80, 75, 3, 4]));
        },
        pull: () => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
      });
      return new Response(stream, { status: 200 });
    });
    expect(await port(stalling, { timeoutMs: 30 }).equityCloses("2026-10-12", ["ALPHA"])).toMatchObject({ kind: "provider_error" });
  });
});

describe("the NSE adapter: the byte cap is counted while reading", () => {
  it("cuts an endless body at the cap and stops reading, whatever Content-Length says", async () => {
    let pulled = 0;
    let cancelled = false;
    const endless = vi.fn<typeof fetch>(async () => {
      const stream = new ReadableStream<Uint8Array>({
        pull(c) {
          pulled++;
          c.enqueue(new Uint8Array(1_000_000));
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "application/zip", "content-length": "10" } });
    });
    const out = await port(endless).equityCloses("2026-10-12", ["ALPHA"]);
    expect(out).toMatchObject({ kind: "provider_error" });
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(8);
  });

  it("the index file has a much smaller cap than the zip", async () => {
    const big = new Uint8Array(2_000_000).fill(65);
    expect(await port(respondWith(() => body(big, { status: 200 }))).indexClose("2026-10-12")).toMatchObject({ kind: "provider_error" });
  });
});

describe("the NSE adapter: a file that cannot be trusted is a provider error, never a holiday", () => {
  const ask = async (zip: Uint8Array) => port(respondWith(() => body(zip, { status: 200 }))).equityCloses("2026-10-12", ["ALPHA"]);

  it("a zip bomb, two entries, an encrypted entry and a truncated archive", async () => {
    expect(await ask(buildZip([{ data: new Uint8Array(40_000_000) }]))).toMatchObject({ kind: "provider_error" });
    expect(await ask(buildZip([{ data: new Uint8Array(10) }, { data: new Uint8Array(10) }]))).toMatchObject({ kind: "provider_error" });
    expect(await ask(buildZip([{ data: new Uint8Array(10), flags: 1 }]))).toMatchObject({ kind: "provider_error" });
    const zip = goodZip();
    expect(await ask(zip.subarray(0, zip.length - 30))).toMatchObject({ kind: "provider_error" });
    expect(await ask(buildZip([{ data: new Uint8Array(10), rawCompressed: deflateRawSync(new Uint8Array(10)).subarray(0, 2) }]))).toMatchObject({ kind: "provider_error" });
  });

  it("a wrong header row and a malformed number", async () => {
    expect(await ask(zipOf("a,b,c\n1,2,3\n"))).toMatchObject({ kind: "provider_error" });
    expect(await ask(zipOf(bhavCsv([{ symbol: "ALPHA", close: "12x" }])))).toMatchObject({ kind: "provider_error" });
  });

  it("a file for another date than the one asked", async () => {
    const out = await ask(zipOf(bhavCsv([{ symbol: "ALPHA", date: "2026-10-09" }])));
    expect(out).toMatchObject({ kind: "provider_error" });
    const idx = await port(respondWith(() => body(indexCsv([{ name: "Nifty 50", date: "09-10-2026" }]), { status: 200 }))).indexClose("2026-10-12");
    expect(idx).toMatchObject({ kind: "provider_error" });
  });

  it("an index file with no Nifty 50 row", async () => {
    expect(await port(respondWith(() => body(indexCsv([{ name: "Nifty Bank" }]), { status: 200 }))).indexClose("2026-10-12")).toMatchObject({ kind: "provider_error" });
  });

  it("no message carries the address, a value from the file, or a stack", async () => {
    const out = await ask(zipOf(bhavCsv([{ symbol: "ALPHA", close: "SECRETVALUE" }])));
    expect(JSON.stringify(out)).not.toMatch(/SECRETVALUE|nseindia|https?:/);
    const failing = port(vi.fn<typeof fetch>(async () => { throw new TypeError("fetch failed https://nsearchives.nseindia.com/x?key=SECRET"); }));
    expect(JSON.stringify(await failing.indexClose("2026-10-12"))).not.toMatch(/SECRET|nseindia/);
  });
});

describe("the NSE adapter: addresses", () => {
  it("never builds an address from a date that is not a calendar date, and makes no request", async () => {
    const fetchMock = respondWith(() => body("", { status: 200 }));
    for (const bad of ["../../x", "2026-13-01", "2026-02-30", "20261012", "2026-10-12/../../"]) {
      expect(await port(fetchMock).equityCloses(bad, ["ALPHA"])).toMatchObject({ kind: "provider_error" });
      expect(await port(fetchMock).indexClose(bad)).toMatchObject({ kind: "provider_error" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses at start-up a template that points at another host, or is not plain https on the NSE host", () => {
    const bad = [
      "https://evil.example/{YYYYMMDD}.zip",
      "http://nsearchives.nseindia.com/{YYYYMMDD}.zip",
      "https://nsearchives.nseindia.com.evil.example/{YYYYMMDD}.zip",
      "https://nsearchives.nseindia.com@evil.example/{YYYYMMDD}.zip",
      "https://nsearchives.nseindia.com:8443/{YYYYMMDD}.zip",
      "https://nsearchives.nseindia.com/a?next=https://evil.example/{YYYYMMDD}",
      "https://nsearchives.nseindia.com/../{YYYYMMDD}.zip",
      "https://nsearchives.nseindia.com/{DDMMYYYY}.zip",
      "https://nsearchives.nseindia.com/no-placeholder.zip",
      "https://nsearchives.nseindia.com/{YYYYMMDD}/{YYYYMMDD}.zip",
      "//evil.example/{YYYYMMDD}",
      "",
    ];
    for (const bhavcopyTemplate of bad) {
      expect(() => createNseMarketData({ ...templates, bhavcopyTemplate })).toThrow(/NSE_BHAVCOPY_URL_TEMPLATE/);
    }
    expect(() => createNseMarketData({ ...templates, indexTemplate: "https://evil.example/{DDMMYYYY}.csv" })).toThrow(/NSE_INDEX_URL_TEMPLATE/);
    expect(() => createNseMarketData({ ...templates, indexTemplate: DEFAULT_NSE_BHAVCOPY_TEMPLATE })).toThrow(/NSE_INDEX_URL_TEMPLATE/);
  });

  it("accepts a changed path on the same host", () => {
    expect(nseTemplateProblem("https://nsearchives.nseindia.com/content/cm/new/{YYYYMMDD}.csv.zip", "{YYYYMMDD}")).toBeNull();
    expect(fillNseTemplate(DEFAULT_NSE_INDEX_TEMPLATE, "{DDMMYYYY}", "2026-01-05")).toBe("https://nsearchives.nseindia.com/content/indices/ind_close_all_05012026.csv");
  });

  it("the defaults are valid and are the verified patterns (ADR-005 s2)", () => {
    expect(nseTemplateProblem(DEFAULT_NSE_BHAVCOPY_TEMPLATE, "{YYYYMMDD}")).toBeNull();
    expect(nseTemplateProblem(DEFAULT_NSE_INDEX_TEMPLATE, "{DDMMYYYY}")).toBeNull();
    expect(fillNseTemplate(DEFAULT_NSE_BHAVCOPY_TEMPLATE, "{YYYYMMDD}", "2026-10-12")).toBe(BHAV_URL);
  });
});

describe("the NSE adapter: hostile files that are small on the wire (review I-1)", () => {
  const encode = (text: string) => new TextEncoder().encode(text);
  const ask = (data: Uint8Array) => port(respondWith(() => body(buildZip([{ data }]), { status: 200 }))).equityCloses("2026-10-12", ["ALPHA"]);

  it("many tiny rows, one huge field and a row with thousands of fields are provider errors naming the typed cause", async () => {
    for (const data of [encode("a\n".repeat(3_000_000)), encode(",\n".repeat(3_000_000)), encode("x".repeat(100_000)), encode(",".repeat(100_000)), encode(`"${"x".repeat(1_000_000)}"`)]) {
      const out = await ask(data);
      expect(out).toMatchObject({ kind: "provider_error" });
      expect(JSON.stringify(out)).toContain("too_large");
    }
  });

  it("the same shapes in the index file", async () => {
    const out = await port(respondWith(() => body("a\n".repeat(500_000), { status: 200 }))).indexClose("2026-10-12");
    expect(out).toMatchObject({ kind: "provider_error" });
    expect(JSON.stringify(out)).toContain("too_large");
  });

  it("a file past the 8 MB unzip cap is refused before it is inflated", async () => {
    const out = await ask(new Uint8Array(9 * 1024 * 1024));
    expect(JSON.stringify(out)).toContain("too_large");
  });
});

describe("the NSE adapter: empty and unreadable answers", () => {
  it("a 200 with an empty body, or no body at all, is a provider error", async () => {
    expect(await port(respondWith(() => body("", { status: 200 }))).equityCloses("2026-10-12", ["ALPHA"])).toMatchObject({ kind: "provider_error" });
    expect(await port(respondWith(() => new Response(null, { status: 200 }))).indexClose("2026-10-12")).toMatchObject({ kind: "provider_error" });
  });

  it("a file that is not valid UTF-8 is a provider error", async () => {
    const bad = buildZip([{ data: new Uint8Array([0xff, 0xfe, 0xfd, 0x0a]) }]);
    expect(await port(respondWith(() => body(bad, { status: 200 }))).equityCloses("2026-10-12", ["ALPHA"])).toMatchObject({ kind: "provider_error" });
  });

  it("a 404 is no_file whatever it carries, even an HTML page (the status is the only signal)", async () => {
    const out = await port(respondWith(() => body("<html>not found</html>", { status: 404, headers: { "content-type": "text/html" } }))).equityCloses("2026-10-12", ["ALPHA"]);
    expect(out).toEqual({ kind: "no_file" });
  });

  it("the two files are asked independently, for any past date, each with its own typed outcome", async () => {
    const mixed = vi.fn<typeof fetch>(async (url) => (String(url).includes("BhavCopy") ? body("", { status: 404 }) : body(indexCsv([{ name: "Nifty 50", date: "01-09-2026" }]), { status: 200 })));
    const p = port(mixed);
    expect(await p.equityCloses("2026-09-01", ["ALPHA"])).toEqual({ kind: "no_file" });
    expect(await p.indexClose("2026-09-01")).toMatchObject({ kind: "ok", tradeDate: "2026-09-01" });
    expect(String(mixed.mock.calls[0][0])).toContain("20260901");
    expect(String(mixed.mock.calls[1][0])).toContain("01092026");
  });
});

describe("the NSE adapter: the timeout setting", () => {
  it.each([0, -5, 1.5, Number.NaN, 61_000, Number.POSITIVE_INFINITY])("a creation timeout of %s is a configuration error, not a failed fetch", (timeoutMs) => {
    expect(() => createNseMarketData({ ...templates, timeoutMs })).toThrow(/timeout must be a whole number/);
  });

  it("a per-call value that is fractional is rounded down; one that is spent makes no request", async () => {
    const fetchMock = respondWith(() => body(goodIndex(), { status: 200 }));
    const p = port(fetchMock);
    expect(await p.indexClose("2026-10-12", { timeoutMs: 2500.7 })).toMatchObject({ kind: "ok" });
    for (const timeoutMs of [0, 0.4, -10, Number.NaN]) {
      expect(await p.indexClose("2026-10-12", { timeoutMs })).toEqual({ kind: "provider_error", message: "no time left for the NSE call" });
      expect(await p.equityCloses("2026-10-12", ["ALPHA"], { timeoutMs })).toMatchObject({ kind: "provider_error" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("the NSE adapter: template allowlist (review M-4)", () => {
  const problem = (t: string) => nseTemplateProblem(t, "{YYYYMMDD}");

  it.each([
    "https://nsearchives.nseindia.com/a/%2e%2e/{YYYYMMDD}.zip",
    "https://nsearchives.nseindia.com/a\\b/{YYYYMMDD}.zip",
    "https://nsearchives.nseindia.com/a#/{YYYYMMDD}.zip",
    "https://nsearchives.nseindia.com/a\t/{YYYYMMDD}.zip",
    "https://nsearchives.nseindia.com/a\u0000/{YYYYMMDD}.zip",
    "https://nsearchives.nseindia.com/a‮/{YYYYMMDD}.zip",
    "https://nsearchives.nseindia.com/．．/{YYYYMMDD}.zip",
    "https://nsearchives.nseindia.com/a$&/{YYYYMMDD}.zip",
    "https://nsearchives.nseindia.com/a//{YYYYMMDD}.zip",
    "https://nsearchives.nseindia.com/{YYYYMMDD}{YYYYMMDD}.zip",
    "https://nsearchives.nseindia.com/{DDMMYYYY}/{YYYYMMDD}.zip",
    "https://nsearchives.nseindia.com/{YYYYMMDD}.zip{",
    "HTTPS://nsearchives.nseindia.com/{YYYYMMDD}.zip",
    "https://nsearchives.nseindia.com./{YYYYMMDD}.zip",
    "https://NSEARCHIVES.nseindia.com/{YYYYMMDD}.zip",
    " https://nsearchives.nseindia.com/{YYYYMMDD}.zip",
  ])("refuses %j", (template) => {
    expect(problem(template)).not.toBeNull();
  });

  it("accepts a plain path with letters, digits and . _ - /", () => {
    expect(problem("https://nsearchives.nseindia.com/content/cm/v2/Bhav-Copy_{YYYYMMDD}.csv.zip")).toBeNull();
  });
});

describe("the NSE adapter against a real local HTTP server (the behaviour the mocks only imitate)", () => {
  let server: Server;
  let origin = "";
  let handler: (req: IncomingMessage, res: ServerResponse) => void = () => undefined;

  beforeAll(async () => {
    server = createServer((req, res) => handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /** The adapter's own fetch call, re-aimed at the local server; every option the adapter set is passed on untouched. */
  const aimed: typeof fetch = (url, init) => fetch(String(url).replace("https://nsearchives.nseindia.com", origin), init);
  const local = (timeoutMs?: number) => createNseMarketData({ ...templates, fetch: aimed, timeoutMs });

  it("a 302 is not followed and is a provider error", async () => {
    let hits = 0;
    handler = (_req, res) => {
      hits++;
      res.writeHead(302, { location: "http://127.0.0.1:1/elsewhere" }).end();
    };
    expect(await local().indexClose("2026-10-12")).toMatchObject({ kind: "provider_error" });
    expect(hits).toBe(1);
  });

  it("a body that drips is cut by the timeout", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "text/csv" });
      const timer = setInterval(() => res.write("x"), 20);
      res.on("close", () => clearInterval(timer));
    };
    const started = Date.now();
    expect(await local(300).indexClose("2026-10-12")).toMatchObject({ kind: "provider_error" });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("a gzip-encoded body that inflates past the cap is cut at the cap", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/zip", "content-encoding": "gzip" });
      res.end(gzipSync(Buffer.alloc(30 * 1024 * 1024)));
    };
    expect(await local().equityCloses("2026-10-12", ["ALPHA"])).toMatchObject({ kind: "provider_error" });
  });

  it("a good file through a real socket, and a 404", async () => {
    handler = (_req, res) => res.writeHead(200, { "content-type": "text/csv" }).end(goodIndex());
    expect(await local().indexClose("2026-10-12")).toMatchObject({ kind: "ok", close: 22363.35 });
    handler = (_req, res) => res.writeHead(404).end();
    expect(await local().indexClose("2026-10-12")).toEqual({ kind: "no_file" });
  });
});
