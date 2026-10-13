import http from "node:http";
import net from "node:net";
import type https from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentError } from "./errors";
import { safeFetch } from "./safe-fetch";
import { createHttpsTransport, LENIENT_PARSER_HOSTS, lenientHostFor } from "./safe-fetch-transport";

// The host-scoped lenient header parser (live smoke S1). A raw TCP server answers like www.bseindia.com does: a control byte inside
// a header VALUE, which Node's strict parser refuses (HPE_INVALID_HEADER_TOKEN) and `insecureHTTPParser` accepts. The transport's
// request function is pointed at it over plain HTTP (the TLS layer is not what is under test); everything else is the real code.

const PUBLIC = [{ address: "93.184.216.34", family: 4 as const }];
const resolve = async () => PUBLIC;
const BAD_VALUE = "X-Note: v\u0001al"; // refused strictly, accepted leniently
const BAD_NAME = "X-Bad@Name: 1"; // refused even by the lenient parser

type Hit = { host: string; lenient: boolean };
let servers: net.Server[] = [];
let hits: Hit[] = [];
const ports = new Map<string, number>();

/** A raw TCP server that ignores the request and writes `response` as it is. Registers the host name it stands for. */
async function serve(host: string, response: string): Promise<void> {
  const server = net.createServer((socket) => {
    socket.once("data", () => socket.end(response));
    socket.on("error", () => undefined);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  servers.push(server);
  ports.set(host, (server.address() as net.AddressInfo).port);
}

/** A raw TCP server that resets the connection as soon as the request arrives. */
async function serveReset(host: string): Promise<void> {
  const server = net.createServer((socket) => {
    socket.once("data", () => socket.resetAndDestroy());
    socket.on("error", () => undefined);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  servers.push(server);
  ports.set(host, (server.address() as net.AddressInfo).port);
}

const page = (header: string, status = "200 OK", extra = "") =>
  `HTTP/1.1 ${status}\r\nContent-Type: text/html\r\n${header}\r\n${extra}Content-Length: 2\r\nConnection: close\r\n\r\nhi`;

/** The request function the transport is given: the real http client, aimed at the server registered for the host name. */
const localRequest = ((options: https.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
  hits.push({ host: String(options.host), lenient: options.insecureHTTPParser === true });
  return http.request({ ...options, host: "127.0.0.1", port: ports.get(String(options.host))!, lookup: undefined }, callback);
}) as unknown as typeof https.request;

const transport = (lenientHosts: readonly string[]) => createHttpsTransport({ request: localRequest, lenientHosts });
const fetchWith = (url: string, lenientHosts: readonly string[]) => safeFetch(url, { resolve, transport: transport(lenientHosts), timeoutMs: 5_000 });
const hitsOn = (host: string) => hits.filter((h) => h.host === host);

beforeEach(() => {
  servers = [];
  hits = [];
  ports.clear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.map((s) => new Promise((done) => s.close(done))));
});

describe("lenientHostFor", () => {
  it("matches a listed domain and its sub-domains on a dot boundary, in lower case, and nothing else", () => {
    const list = ["bseindia.com"];
    expect(lenientHostFor("bseindia.com", list)).toBe("bseindia.com");
    expect(lenientHostFor("www.bseindia.com", list)).toBe("bseindia.com");
    expect(lenientHostFor("WWW.BSEINDIA.COM", list)).toBe("bseindia.com");
    expect(lenientHostFor("a.b.bseindia.com", list)).toBe("bseindia.com");
    for (const other of ["notbseindia.com", "bseindia.com.evil.example", "bseindia.co", "evilbseindia.com", "bseindia.com.", "93.184.216.34", "[::1]", ""]) {
      expect(lenientHostFor(other, list), other).toBeNull();
    }
  });

  it("the shipped list is the one fixed domain", () => {
    expect([...LENIENT_PARSER_HOSTS]).toEqual(["bseindia.com"]);
  });
});

describe("the strict parser is always tried first", () => {
  it("a host that answers cleanly is read on the first attempt, strictly, even when it is on the list", async () => {
    await serve("www.bseindia.com", page("X-Note: fine"));
    const got = await fetchWith("https://www.bseindia.com/corporates/ann.html", ["bseindia.com"]);
    expect(new TextDecoder().decode(got.bytes)).toBe("hi");
    expect(hits).toEqual([{ host: "www.bseindia.com", lenient: false }]);
  });

  it("without the list, the invalid header fails the strict attempt (the premise of the test server)", async () => {
    await serve("www.bseindia.com", page(BAD_VALUE));
    await expect(transport([])({ url: new URL("https://www.bseindia.com/a"), addresses: PUBLIC, signal: new AbortController().signal })).rejects.toMatchObject({
      code: "HPE_INVALID_HEADER_TOKEN",
    });
  });
});

describe("a listed host", () => {
  it("is retried once with the lenient parser and then read", async () => {
    await serve("www.bseindia.com", page(BAD_VALUE));
    const got = await fetchWith("https://www.bseindia.com/corporates/ann.html", ["bseindia.com"]);
    expect(got).toMatchObject({ contentType: "text/html", finalUrl: "https://www.bseindia.com/corporates/ann.html" });
    expect(new TextDecoder().decode(got.bytes)).toBe("hi");
    expect(hitsOn("www.bseindia.com")).toEqual([{ host: "www.bseindia.com", lenient: false }, { host: "www.bseindia.com", lenient: true }]);
  });

  it("is retried at most once: a response the lenient parser also refuses fails after two attempts, not three", async () => {
    await serve("www.bseindia.com", page(BAD_NAME));
    await expect(fetchWith("https://www.bseindia.com/a", ["bseindia.com"])).rejects.toMatchObject({ code: "link-failed" });
    expect(hitsOn("www.bseindia.com")).toHaveLength(2);
  });

  it("keeps the other rules on the retry: the https-only, vetted-address and size rules still refuse", async () => {
    await serve("www.bseindia.com", page(BAD_VALUE));
    await expect(safeFetch("https://www.bseindia.com/a", { resolve: async () => [{ address: "10.0.0.5", family: 4 }], transport: transport(["bseindia.com"]) })).rejects.toMatchObject({
      code: "link-blocked",
    });
    await expect(safeFetch("http://www.bseindia.com/a", { resolve, transport: transport(["bseindia.com"]) })).rejects.toMatchObject({ code: "link-invalid" });
    expect(hits).toEqual([]); // neither reached the transport
    await expect(safeFetch("https://www.bseindia.com/a", { resolve, transport: transport(["bseindia.com"]), maxBytes: 1 })).rejects.toMatchObject({ code: "link-too-large" });
    expect(hitsOn("www.bseindia.com").map((h) => h.lenient)).toEqual([false, true]);
  });

  // Only the one strict-parser refusal buys a retry: any other failure of a listed host is the same single strict attempt as for any host.
  it("is not retried when the connection is reset: one strict attempt, the same failure and log line as an unlisted host", async () => {
    await serveReset("www.bseindia.com");
    const error = await fetchWith("https://www.bseindia.com/a", ["bseindia.com"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DocumentError);
    expect(error).toMatchObject({ code: "link-failed" });
    expect(hitsOn("www.bseindia.com")).toEqual([{ host: "www.bseindia.com", lenient: false }]);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("link fetch failed", "Error", "ECONNRESET");
  });

  it("is not retried when the answer has LF-only line endings (a different strict refusal, HPE_CR_EXPECTED)", async () => {
    const lfOnly = "HTTP/1.1 200 OK\nContent-Length: 2\n\nhi";
    await serve("www.bseindia.com", lfOnly);
    await serve("strict.example", lfOnly);
    // The premise: the strict parser does refuse it, and with a code other than the one that is retried.
    await expect(transport([])({ url: new URL("https://strict.example/a"), addresses: PUBLIC, signal: new AbortController().signal })).rejects.toMatchObject({
      code: "HPE_CR_EXPECTED",
    });
    hits = [];
    const error = await fetchWith("https://www.bseindia.com/a", ["bseindia.com"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DocumentError);
    expect(error).toMatchObject({ code: "link-failed" });
    expect(hitsOn("www.bseindia.com")).toEqual([{ host: "www.bseindia.com", lenient: false }]);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("link fetch failed", "Error", "HPE_CR_EXPECTED");
  });

  it("a status outside 2xx on the retry is still a failure", async () => {
    await serve("www.bseindia.com", page(BAD_VALUE, "404 Not Found"));
    await expect(fetchWith("https://www.bseindia.com/a", ["bseindia.com"])).rejects.toMatchObject({ code: "link-failed" });
  });
});

describe("a host that is not listed", () => {
  it("fails on the strict attempt with the same fixed message as before, and is never retried", async () => {
    await serve("example.org", page(BAD_VALUE));
    const error = await fetchWith("https://example.org/a", ["bseindia.com"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DocumentError);
    expect(error).toMatchObject({ code: "link-failed" });
    expect(hitsOn("example.org")).toEqual([{ host: "example.org", lenient: false }]);
    // The server log keeps what it kept before: the class and the code, no address.
    expect(console.error).toHaveBeenCalledWith("link fetch failed", "Error", "HPE_INVALID_HEADER_TOKEN");
  });

  it("a look-alike name is not listed", async () => {
    await serve("notbseindia.com", page(BAD_VALUE));
    await expect(fetchWith("https://notbseindia.com/a", ["bseindia.com"])).rejects.toMatchObject({ code: "link-failed" });
    expect(hitsOn("notbseindia.com")).toHaveLength(1);
  });
});

describe("a redirect", () => {
  it("from a listed host to another host is not lenient: the next hop is strict, and fails there", async () => {
    await serve("www.bseindia.com", page(BAD_VALUE, "302 Found", "Location: https://other.example/next\r\n"));
    await serve("other.example", page(BAD_VALUE));
    await expect(fetchWith("https://www.bseindia.com/a", ["bseindia.com"])).rejects.toMatchObject({ code: "link-failed" });
    expect(hitsOn("www.bseindia.com").map((h) => h.lenient)).toEqual([false, true]);
    expect(hitsOn("other.example")).toEqual([{ host: "other.example", lenient: false }]);
  });

  it("from a listed host to a clean host is followed, and the clean host is read strictly", async () => {
    await serve("www.bseindia.com", page(BAD_VALUE, "302 Found", "Location: https://other.example/next\r\n"));
    await serve("other.example", page("X-Note: fine"));
    const got = await fetchWith("https://www.bseindia.com/a", ["bseindia.com"]);
    expect(got.finalUrl).toBe("https://other.example/next");
    expect(hitsOn("other.example")).toEqual([{ host: "other.example", lenient: false }]);
  });

  it("from an unlisted host to a listed host gets the listed host's retry on that hop only", async () => {
    await serve("other.example", page("X-Note: fine", "301 Moved Permanently", "Location: https://www.bseindia.com/b\r\n"));
    await serve("www.bseindia.com", page(BAD_VALUE));
    const got = await fetchWith("https://other.example/a", ["bseindia.com"]);
    expect(got.finalUrl).toBe("https://www.bseindia.com/b");
    expect(hitsOn("other.example")).toEqual([{ host: "other.example", lenient: false }]);
    expect(hitsOn("www.bseindia.com").map((h) => h.lenient)).toEqual([false, true]);
  });
});
