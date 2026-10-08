import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentError, type DocumentErrorCode } from "./errors";
import { LINK_MAX_BYTES } from "./limits";
import { safeFetch, type Address, type Resolver, type Transport, type TransportRequest, type TransportResponse } from "./safe-fetch";

// No test here touches the network: DNS is a table and the transport is a function. The fakes record every call so the tests can
// say what was resolved, what was connected to, and what was never asked for.

const PUBLIC: Address = { address: "93.184.216.34", family: 4 };
const enc = (text: string) => new TextEncoder().encode(text);

function body(...chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
}

const reply = (status: number, headers: Record<string, string> = {}, chunks: Uint8Array[] = []): TransportResponse => ({
  status,
  headers,
  body: body(...chunks),
  close: vi.fn(),
});

/** A DNS table: a host maps to its addresses, or to an error; one that is not listed does not exist. */
function dns(table: Record<string, Address[] | Error>) {
  const asked: string[] = [];
  const resolve: Resolver = async (host) => {
    asked.push(host);
    const answer = table[host];
    if (!answer) throw new Error("ENOTFOUND");
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { resolve, asked };
}

/** A transport that serves one canned response per call, in order, and remembers what it was asked. */
function server(...responses: (TransportResponse | ((request: TransportRequest) => Promise<TransportResponse>))[]) {
  const calls: TransportRequest[] = [];
  const transport: Transport = async (request) => {
    calls.push(request);
    const next = responses[calls.length - 1];
    if (!next) throw new Error("unexpected request");
    return typeof next === "function" ? next(request) : next;
  };
  return { transport, calls };
}

async function refusal(promise: Promise<unknown>): Promise<DocumentErrorCode> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DocumentError);
  return (error as DocumentError).code;
}

afterEach(() => vi.useRealTimers());

describe("the link itself", () => {
  it.each([
    ["http", "http://example.com/a.pdf"],
    ["ftp", "ftp://example.com/a.pdf"],
    ["file", "file:///etc/passwd"],
    ["javascript", "javascript:alert(1)"],
    ["a user name", "https://user@example.com/"],
    ["a user name and password", "https://user:secret@example.com/"],
    ["a password only", "https://:secret@example.com/"],
    ["a port", "https://example.com:8443/"],
    ["port 80 on https", "https://example.com:80/"],
    ["no host", "https://"],
    ["nothing", ""],
    ["words", "not a link"],
    ["a very long link", `https://example.com/${"a".repeat(2000)}`],
  ])("refuses %s before any lookup or request", async (_what, link) => {
    const d = dns({ "example.com": [PUBLIC] });
    const s = server(reply(200));
    expect(await refusal(safeFetch(link, { resolve: d.resolve, transport: s.transport }))).toBe("link-invalid");
    expect(d.asked).toEqual([]);
    expect(s.calls).toEqual([]);
  });

  it("accepts https on the default port, spelled out or not", async () => {
    for (const link of ["https://example.com/a", "https://example.com:443/a"]) {
      const s = server(reply(200, { "content-type": "text/plain" }, [enc("ok")]));
      await safeFetch(link, { resolve: dns({ "example.com": [PUBLIC] }).resolve, transport: s.transport });
      expect(s.calls[0].url.href).toBe("https://example.com/a");
    }
  });
});

describe("addresses written into the link are checked the same way as resolved ones", () => {
  it.each([
    "https://127.0.0.1/",
    "https://10.0.0.5/",
    "https://169.254.169.254/latest/meta-data/",
    "https://192.168.1.1/",
    "https://100.64.0.1/",
    "https://0.0.0.0/",
    "https://[::1]/",
    "https://[fe80::1]/",
    "https://[fd00::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://[::ffff:7f00:1]/",
    "https://[::ffff:a9fe:a9fe]/",
    "https://[64:ff9b::7f00:1]/",
    "https://2130706433/", // 127.0.0.1 as one number
    "https://0x7f.1/", // 127.0.0.1 in hex
    "https://017700000001/", // 127.0.0.1 in octal
    "https://127.1/",
  ])("refuses %s without resolving or connecting", async (link) => {
    const d = dns({});
    const s = server(reply(200));
    expect(await refusal(safeFetch(link, { resolve: d.resolve, transport: s.transport }))).toBe("link-blocked");
    expect(d.asked).toEqual([]);
    expect(s.calls).toEqual([]);
  });

  it("connects to a public address written into the link", async () => {
    const s = server(reply(200, { "content-type": "text/plain" }, [enc("ok")]));
    await safeFetch("https://93.184.216.34/a", { resolve: dns({}).resolve, transport: s.transport });
    expect(s.calls[0].address).toEqual({ address: "93.184.216.34", family: 4 });
  });
});

describe("the host name is resolved and every answer must be public", () => {
  it.each([
    ["10.0.0.5"], ["172.16.0.1"], ["172.31.255.255"], ["192.168.0.10"], ["127.0.0.1"], ["169.254.169.254"], ["100.64.0.1"],
    ["0.0.0.0"], ["192.0.0.8"], ["192.0.2.1"], ["198.18.0.1"], ["198.51.100.1"], ["203.0.113.1"], ["224.0.0.1"], ["240.0.0.1"], ["255.255.255.255"],
  ])("refuses a name that resolves to %s, and connects to nothing", async (address) => {
    const d = dns({ "internal.example": [{ address, family: 4 }] });
    const s = server(reply(200));
    expect(await refusal(safeFetch("https://internal.example/x", { resolve: d.resolve, transport: s.transport }))).toBe("link-blocked");
    expect(s.calls).toEqual([]);
  });

  it.each(["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1", "2001:db8::1"])(
    "refuses a name that resolves to the IPv6 address %s",
    async (address) => {
      const d = dns({ "v6.example": [{ address, family: 6 }] });
      const s = server(reply(200));
      expect(await refusal(safeFetch("https://v6.example/", { resolve: d.resolve, transport: s.transport }))).toBe("link-blocked");
      expect(s.calls).toEqual([]);
    },
  );

  it("refuses a name when any one of its answers is private (a public answer does not excuse it)", async () => {
    for (const answers of [[PUBLIC, { address: "10.0.0.1", family: 4 as const }], [{ address: "::1", family: 6 as const }, PUBLIC]]) {
      const s = server(reply(200));
      expect(await refusal(safeFetch("https://mixed.example/", { resolve: dns({ "mixed.example": answers }).resolve, transport: s.transport }))).toBe("link-blocked");
      expect(s.calls).toEqual([]);
    }
  });

  it("says the link failed when the name does not exist, has no address, or the lookup breaks", async () => {
    const s = server(reply(200));
    const d = dns({ "empty.example": [], "broken.example": new Error("ESERVFAIL at 10.0.0.2") });
    for (const host of ["gone.example", "empty.example", "broken.example"]) {
      expect(await refusal(safeFetch(`https://${host}/`, { resolve: d.resolve, transport: s.transport }))).toBe("link-failed");
    }
    expect(s.calls).toEqual([]);
  });

  it("connects to the address it checked, with the original name, and asks DNS once for the hop", async () => {
    const d = dns({ "www.bseindia.com": [PUBLIC] });
    const s = server(reply(200, { "content-type": "text/plain" }, [enc("ok")]));
    await safeFetch("https://www.bseindia.com/a?b=1", { resolve: d.resolve, transport: s.transport });
    expect(d.asked).toEqual(["www.bseindia.com"]);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].address).toEqual(PUBLIC);
    expect(s.calls[0].url.hostname).toBe("www.bseindia.com");
    expect(s.calls[0].url.search).toBe("?b=1");
  });

  it("DNS rebinding: a name that answers public once and private afterwards is connected to the public answer, and never asked twice", async () => {
    const answers: Address[][] = [[PUBLIC], [{ address: "127.0.0.1", family: 4 }], [{ address: "169.254.169.254", family: 4 }]];
    let asks = 0;
    const resolve: Resolver = async () => answers[Math.min(asks++, answers.length - 1)];
    const s = server(reply(200, { "content-type": "text/plain" }, [enc("ok")]));
    await safeFetch("https://rebind.example/", { resolve, transport: s.transport });
    expect(asks).toBe(1);
    expect(s.calls.map((c) => c.address.address)).toEqual(["93.184.216.34"]);
  });

  it("the transport is handed a vetted address and no name to look up: its request has no cookie, header or resolver slot", async () => {
    const s = server(reply(200, {}, [enc("ok")]));
    await safeFetch("https://example.com/", { resolve: dns({ "example.com": [PUBLIC] }).resolve, transport: s.transport });
    expect(Object.keys(s.calls[0]).sort()).toEqual(["address", "signal", "url"]);
  });
});

describe("redirects", () => {
  const page = (text: string) => reply(200, { "content-type": "text/plain" }, [enc(text)]);
  const to = (location: string, status = 302) => reply(status, { location });

  it("follows up to two, resolving and vetting each hop's host again", async () => {
    const d = dns({ "a.example": [PUBLIC], "b.example": [{ address: "93.184.216.35", family: 4 }], "c.example": [{ address: "93.184.216.36", family: 4 }] });
    const s = server(to("https://b.example/two"), to("/three", 301), page("done"));
    const out = await safeFetch("https://a.example/one", { resolve: d.resolve, transport: s.transport });
    expect(new TextDecoder().decode(out.bytes)).toBe("done");
    expect(out.finalUrl).toBe("https://b.example/three");
    expect(d.asked).toEqual(["a.example", "b.example", "b.example"]);
    expect(s.calls.map((c) => c.address.address)).toEqual(["93.184.216.34", "93.184.216.35", "93.184.216.35"]);
  });

  it("refuses a third redirect", async () => {
    const d = dns({ "a.example": [PUBLIC] });
    const s = server(to("/1"), to("/2"), to("/3"), page("never"));
    expect(await refusal(safeFetch("https://a.example/", { resolve: d.resolve, transport: s.transport }))).toBe("link-redirects");
    expect(s.calls).toHaveLength(3);
  });

  it.each([303, 307, 308])("treats %i as a redirect too", async (status) => {
    const s = server(to("/next", status), page("ok"));
    await safeFetch("https://a.example/", { resolve: dns({ "a.example": [PUBLIC] }).resolve, transport: s.transport });
    expect(s.calls).toHaveLength(2);
  });

  it("refuses a redirect to a name that resolves to a private address, and never connects to it", async () => {
    const d = dns({ "a.example": [PUBLIC], "evil.example": [{ address: "10.0.0.7", family: 4 }] });
    const s = server(to("https://evil.example/steal"), page("never"));
    expect(await refusal(safeFetch("https://a.example/", { resolve: d.resolve, transport: s.transport }))).toBe("link-blocked");
    expect(s.calls).toHaveLength(1);
  });

  it("DNS rebinding on a redirect: the second name answers private the moment it is looked up", async () => {
    const d = dns({ "a.example": [PUBLIC], "rebind.example": [{ address: "169.254.169.254", family: 4 }] });
    const s = server(to("https://rebind.example/"), page("never"));
    expect(await refusal(safeFetch("https://a.example/", { resolve: d.resolve, transport: s.transport }))).toBe("link-blocked");
    expect(s.calls.map((c) => c.url.hostname)).toEqual(["a.example"]);
  });

  it.each([
    ["an address written as a number", "https://127.0.0.1/", "link-blocked"],
    ["the metadata address", "https://169.254.169.254/latest/meta-data/", "link-blocked"],
    ["an IPv6 loopback", "https://[::1]/", "link-blocked"],
    ["http", "http://a.example/", "link-invalid"],
    ["a link with a password", "https://u:p@a.example/", "link-invalid"],
    ["another port", "https://a.example:8080/", "link-invalid"],
    ["another scheme", "ftp://a.example/", "link-invalid"],
  ] as const)("refuses a redirect to %s", async (_what, location, code) => {
    const d = dns({ "a.example": [PUBLIC] });
    const s = server(to(location), page("never"));
    expect(await refusal(safeFetch("https://a.example/", { resolve: d.resolve, transport: s.transport }))).toBe(code);
    expect(s.calls).toHaveLength(1);
  });

  it("fails a redirect that has no place to go", async () => {
    const s = server(reply(302), page("never"));
    expect(await refusal(safeFetch("https://a.example/", { resolve: dns({ "a.example": [PUBLIC] }).resolve, transport: s.transport }))).toBe("link-failed");
  });

  it("closes the redirect's connection before it goes on", async () => {
    const first = to("/next");
    const s = server(first, page("ok"));
    await safeFetch("https://a.example/", { resolve: dns({ "a.example": [PUBLIC] }).resolve, transport: s.transport });
    expect(first.close).toHaveBeenCalled();
  });
});

describe("the answer", () => {
  const ok = { resolve: dns({ "a.example": [PUBLIC] }).resolve };

  it("returns the bare, lower-case content type and every byte, in order", async () => {
    const s = server(reply(200, { "content-type": "Text/HTML; charset=UTF-8" }, [enc("<p>one"), enc(" two</p>")]));
    const out = await safeFetch("https://a.example/", { ...ok, transport: s.transport });
    expect(out.contentType).toBe("text/html");
    expect(new TextDecoder().decode(out.bytes)).toBe("<p>one two</p>");
    expect(out.finalUrl).toBe("https://a.example/");
  });

  it("returns an empty type when the server names none", async () => {
    const s = server(reply(200, {}, [enc("x")]));
    expect((await safeFetch("https://a.example/", { ...ok, transport: s.transport })).contentType).toBe("");
  });

  it.each([304, 400, 403, 404, 410, 429, 500, 503])("fails on HTTP %i with a fixed sentence that names no address", async (status) => {
    const s = server(reply(status));
    const code = await refusal(safeFetch("https://a.example/", { ...ok, transport: s.transport }));
    expect(code).toBe("link-failed");
  });

  it("fails, without the reason, when the connection cannot be made", async () => {
    const transport: Transport = async () => {
      throw new Error("connect ECONNREFUSED 10.1.2.3:443");
    };
    const error = await safeFetch("https://a.example/", { ...ok, transport }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DocumentError);
    expect((error as DocumentError).code).toBe("link-failed");
    expect((error as DocumentError).message).not.toMatch(/10\.1\.2\.3|ECONNREFUSED/);
  });
});

describe("the 50 MB cap is enforced while the body streams", () => {
  const ok = { resolve: dns({ "a.example": [PUBLIC] }).resolve };
  const MB = 1_048_576;

  it("takes a body of exactly the cap and refuses one byte more", async () => {
    const exact = server(reply(200, {}, [new Uint8Array(10), new Uint8Array(10)]));
    expect((await safeFetch("https://a.example/", { ...ok, transport: exact.transport, maxBytes: 20 })).bytes.byteLength).toBe(20);
    const over = server(reply(200, {}, [new Uint8Array(10), new Uint8Array(11)]));
    expect(await refusal(safeFetch("https://a.example/", { ...ok, transport: over.transport, maxBytes: 20 }))).toBe("link-too-large");
  });

  it("stops reading and closes the connection at the cap with no Content-Length at all (an endless body)", async () => {
    let sent = 0;
    const endless = (async function* () {
      for (;;) {
        sent += 1;
        yield new Uint8Array(MB);
      }
    })();
    const res: TransportResponse = { status: 200, headers: { "content-type": "application/pdf" }, body: endless, close: vi.fn() };
    const s = server(res);
    expect(await refusal(safeFetch("https://a.example/", { ...ok, transport: s.transport }))).toBe("link-too-large");
    expect(sent).toBe(LINK_MAX_BYTES / MB + 1); // 50 chunks fit, the 51st crosses the line, and nothing is read after it
    expect(res.close).toHaveBeenCalled();
  });

  it("is not fooled by a Content-Length that undersells the body", async () => {
    const s = server(reply(200, { "content-length": "5" }, [new Uint8Array(30)]));
    expect(await refusal(safeFetch("https://a.example/", { ...ok, transport: s.transport, maxBytes: 20 }))).toBe("link-too-large");
  });

  it("refuses at once when Content-Length already says it is over, reading nothing", async () => {
    const res = reply(200, { "content-length": String(LINK_MAX_BYTES + 1) }, [new Uint8Array(1)]);
    const s = server(res);
    expect(await refusal(safeFetch("https://a.example/", { ...ok, transport: s.transport }))).toBe("link-too-large");
    expect(res.close).toHaveBeenCalled();
  });

  it("the cap is 50 MB (52,428,800 bytes), the same as an upload", () => {
    expect(LINK_MAX_BYTES).toBe(50 * MB);
  });
});

describe("the 30 second limit covers the lookup, the connection and the read", () => {
  const never = <T,>() => new Promise<T>(() => undefined);

  it("cuts off a name server that never answers", async () => {
    vi.useFakeTimers();
    const pending = refusal(safeFetch("https://slow.example/", { resolve: () => never(), transport: server().transport }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toBe("link-timeout");
  });

  it("cuts off a server that never answers", async () => {
    vi.useFakeTimers();
    const pending = refusal(safeFetch("https://slow.example/", { resolve: dns({ "slow.example": [PUBLIC] }).resolve, transport: () => never() }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toBe("link-timeout");
  });

  it("cuts off a body that stalls half way, and closes the connection", async () => {
    vi.useFakeTimers();
    const stalling = (async function* () {
      yield new Uint8Array(10);
      await never<void>();
    })();
    const res: TransportResponse = { status: 200, headers: {}, body: stalling, close: vi.fn() };
    const pending = refusal(safeFetch("https://slow.example/", { resolve: dns({ "slow.example": [PUBLIC] }).resolve, transport: server(res).transport }));
    await vi.advanceTimersByTimeAsync(29_999);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe("link-timeout");
    expect(res.close).toHaveBeenCalled();
  });

  it("one clock for the whole chain: slow hops add up", async () => {
    vi.useFakeTimers();
    const slowHop = (r: TransportResponse) => async () => {
      await new Promise((resolve) => setTimeout(resolve, 12_000));
      return r;
    };
    const s = server(slowHop(reply(302, { location: "/2" })), slowHop(reply(302, { location: "/3" })), slowHop(reply(200, {}, [enc("late")])));
    const pending = refusal(safeFetch("https://slow.example/", { resolve: dns({ "slow.example": [PUBLIC] }).resolve, transport: s.transport }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toBe("link-timeout");
  });

  it("passes the transport a signal that aborts at the deadline", async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    const transport: Transport = (request) => {
      seen = request.signal;
      return never();
    };
    const pending = refusal(safeFetch("https://slow.example/", { resolve: dns({ "slow.example": [PUBLIC] }).resolve, transport }));
    await vi.advanceTimersByTimeAsync(10);
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(seen?.aborted).toBe(true);
    await pending;
  });
});
