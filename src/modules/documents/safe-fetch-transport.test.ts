import { EventEmitter } from "node:events";
import https from "node:https";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns/promises";
import { httpsTransport, pinnedLookup, systemResolver } from "./safe-fetch-transport";

// The real request is not made: node:https.request is replaced by a function that records its options and answers with a stream.

const PINNED = { address: "93.184.216.34", family: 4 as const };

type Options = Parameters<typeof https.request>[0] & Record<string, unknown>;

function fakeHttps(status: number, headers: Record<string, string>, payload: Buffer) {
  const seen: { options: Options | null; ended: boolean } = { options: null, ended: false };
  vi.spyOn(https, "request").mockImplementation(((options: Options, callback: (res: Readable) => void) => {
    seen.options = options;
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    request.end = () => {
      seen.ended = true;
      const res = Object.assign(Readable.from([payload]), { statusCode: status, headers });
      queueMicrotask(() => callback(res));
    };
    return request;
  }) as unknown as typeof https.request);
  return seen;
}

const run = (url = "https://www.bseindia.com/xml-data/a.pdf?x=1") => httpsTransport({ url: new URL(url), address: PINNED, signal: new AbortController().signal });

async function text(body: AsyncIterable<Uint8Array>): Promise<string> {
  const parts: Buffer[] = [];
  for await (const chunk of body) parts.push(Buffer.from(chunk));
  return Buffer.concat(parts).toString("utf8");
}

afterEach(() => vi.restoreAllMocks());

describe("pinnedLookup", () => {
  it("answers with the vetted address whatever name it is asked for (a second resolution cannot swap it)", () => {
    const lookup = pinnedLookup(PINNED);
    const single = vi.fn();
    lookup("anything.example", {}, single);
    expect(single).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    const all = vi.fn();
    lookup("rebind.example", { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
    const none = vi.fn();
    lookup("x.example", undefined, none);
    expect(none).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  });
});

describe("systemResolver", () => {
  it("asks the system for every address of the name", async () => {
    const lookup = vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1::1", family: 6 },
    ] as never);
    expect(await systemResolver("example.com")).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1::1", family: 6 },
    ]);
    expect(lookup).toHaveBeenCalledWith("example.com", { all: true });
  });
});

describe("httpsTransport", () => {
  it("makes one GET to port 443 under the original name, connecting through the pinned lookup", async () => {
    const seen = fakeHttps(200, { "content-type": "application/pdf" }, Buffer.from("%PDF-1.4"));
    const res = await run();
    expect(seen.ended).toBe(true);
    expect(seen.options).toMatchObject({ host: "www.bseindia.com", port: 443, path: "/xml-data/a.pdf?x=1", method: "GET", servername: "www.bseindia.com", agent: false });
    let answered: unknown;
    (seen.options?.lookup as (h: string, o: object, cb: (...a: unknown[]) => void) => void)("www.bseindia.com", { all: true }, (...a) => (answered = a));
    expect(answered).toEqual([null, [{ address: "93.184.216.34", family: 4 }]]);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(await text(res.body)).toBe("%PDF-1.4");
  });

  it("sends exactly three headers: no cookie, no authorization, nothing of Aksh's session", async () => {
    const seen = fakeHttps(200, {}, Buffer.from("x"));
    await run();
    expect(Object.keys(seen.options?.headers as object).sort()).toEqual(["accept", "accept-encoding", "user-agent"]);
  });

  it("leaves certificate checking at Node's default (it is never switched off)", async () => {
    const seen = fakeHttps(200, {}, Buffer.from("x"));
    await run();
    expect(seen.options).not.toHaveProperty("rejectUnauthorized");
    expect(seen.options).not.toHaveProperty("ca");
  });

  it("brackets are not part of an IPv6 literal host, and an address literal sends no server name", async () => {
    const seen = fakeHttps(200, {}, Buffer.from("x"));
    await httpsTransport({ url: new URL("https://[2606:4700:4700::1111]/a"), address: { address: "2606:4700:4700::1111", family: 6 }, signal: new AbortController().signal });
    expect(seen.options).toMatchObject({ host: "2606:4700:4700::1111", port: 443 });
    expect(seen.options?.servername).toBeUndefined();
  });

  it("decodes gzip, so the byte cap counts the real size", async () => {
    fakeHttps(200, { "content-encoding": "gzip" }, gzipSync(Buffer.from("<p>hello</p>")));
    expect(await text((await run()).body)).toBe("<p>hello</p>");
  });

  it("refuses an encoding it cannot decode", async () => {
    fakeHttps(200, { "content-encoding": "compress" }, Buffer.from("x"));
    await expect(run()).rejects.toThrow();
  });

  it("passes the redirect's Location and status through untouched", async () => {
    fakeHttps(302, { location: "https://other.example/x" }, Buffer.from(""));
    const res = await run();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://other.example/x");
  });
});
