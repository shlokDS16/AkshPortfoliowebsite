import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
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
