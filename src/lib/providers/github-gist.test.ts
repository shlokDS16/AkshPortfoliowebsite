import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createGithubGistAnchor, GIST_HOST } from "./github-gist";

const GIST = "aa11bb22cc33dd44ee55ff6677889900";
const TOKEN = "github_pat_11ABCDEFG0123456789_secretsecretsecretsecret";
const URL_OF = `https://api.github.com/gists/${GIST}`;
const FILE = "ledger-2026.jsonl";
const V1 = "1111111111111111111111111111111111111111";
const V2 = "2222222222222222222222222222222222222222";
const V0 = "0000000000000000000000000000000000000000";

const json = (value: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" }, ...init });
const gist = (files: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: GIST,
  files,
  history: [{ version: V1, committed_at: "2026-10-13T00:00:00Z" }, { version: V0, committed_at: "2026-10-12T00:00:00Z" }],
  ...extra,
});
const fileEntry = (content: string, extra: Record<string, unknown> = {}) => ({ filename: FILE, content, truncated: false, ...extra });

function port(fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createGithubGistAnchor>[0]> = {}) {
  return createGithubGistAnchor({ token: TOKEN, gistId: GIST, fetch: fetchImpl, ...extra });
}
const respondWith = (...makers: Array<() => Response | Promise<Response>>) => {
  let i = 0;
  return vi.fn<typeof fetch>(async () => makers[Math.min(i++, makers.length - 1)]());
};
const everything = (value: unknown) => JSON.stringify(value);

describe("the Gist adapter: read", () => {
  it("asks the one fixed address with the fixed headers, no redirect, no cache, a timeout; the token only in Authorization", async () => {
    const fetchMock = respondWith(() => json(gist({ [FILE]: fileEntry('{"d":1}\n') })));
    const out = await port(fetchMock).read(FILE);
    expect(out).toEqual({ kind: "ok", text: '{"d":1}\n', version: V1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL_OF);
    expect(GIST_HOST).toBe("api.github.com");
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.body).toBeUndefined();
    const headers = init?.headers as Record<string, string>;
    expect(headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "aksh-research-desk",
    });
    expect(Object.entries(headers).filter(([k, v]) => k !== "authorization" && v.includes(TOKEN))).toEqual([]);
    expect(String(url)).not.toContain(TOKEN);
  });

  it("the gist exists but the file does not: absent file (a normal first run)", async () => {
    const out = await port(respondWith(() => json(gist({ "other.txt": fileEntry("x") })))).read(FILE);
    expect(out).toEqual({ kind: "absent", what: "file" });
  });

  it("a name that is also an Object property is not read from the prototype", async () => {
    const out = await port(respondWith(() => json(gist({})))).read("constructor");
    expect(out).toEqual({ kind: "absent", what: "file" });
  });

  it("a gist that does not exist (404): absent gist", async () => {
    const fetchMock = respondWith(() => new Response('{"message":"Not Found"}', { status: 404 }));
    expect(await port(fetchMock).read(FILE)).toEqual({ kind: "absent", what: "gist" });
  });

  it("a truncated file is too_large, never half a file", async () => {
    const out = await port(respondWith(() => json(gist({ [FILE]: fileEntry("partial", { truncated: true }) })))).read(FILE);
    expect(out).toEqual({ kind: "too_large" });
  });

  it("a truncated file LIST that does not hold the file cannot be called absent", async () => {
    const out = await port(respondWith(() => json(gist({ "a.txt": fileEntry("x") }, { truncated: true })))).read(FILE);
    expect(out).toEqual({ kind: "too_large" });
  });

  it("an answer past the byte cap is cut and is too_large", async () => {
    const huge = new Response(new Uint8Array(9 * 1024 * 1024), { status: 200 });
    expect(await port(respondWith(() => huge)).read(FILE)).toEqual({ kind: "too_large" });
  });

  it("a version that is not a revision id reads as null; a missing history too", async () => {
    const odd = json({ id: GIST, files: { [FILE]: fileEntry("x\n") }, history: [{ version: "not a hash" }] });
    expect(await port(respondWith(() => odd)).read(FILE)).toEqual({ kind: "ok", text: "x\n", version: null });
    const none = json({ id: GIST, files: { [FILE]: fileEntry("x\n") } });
    expect(await port(respondWith(() => none)).read(FILE)).toEqual({ kind: "ok", text: "x\n", version: null });
  });

  it("an answer that is not what GitHub sends is a provider error", async () => {
    for (const make of [
      () => new Response("<html>hi</html>", { status: 200 }),
      () => json({ id: GIST }),
      () => json({ files: { [FILE]: { content: 5 } } }),
      () => json([1, 2]),
      () => new Response("", { status: 200 }),
    ]) {
      expect(await port(respondWith(make)).read(FILE)).toMatchObject({ kind: "provider_error" });
    }
  });

  it("refuses a file name that is not plain before any request", async () => {
    const fetchMock = respondWith(() => json(gist({})));
    for (const bad of ["", "../x", "a/b", ".hidden", "a b", "x".repeat(101), "a..b", "a\nb"]) {
      expect(await port(fetchMock).read(bad)).toMatchObject({ kind: "invalid_request" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the Gist adapter: how errors are told apart", () => {
  const read = (make: () => Response | Promise<Response>) => port(respondWith(make)).read(FILE);
  const status = (code: number, headers: Record<string, string> = {}, text = "") => () => new Response(text === "" ? null : text, { status: code, headers });

  it("401 is unauthorized", async () => {
    expect(await read(status(401, {}, '{"message":"Bad credentials"}'))).toEqual({ kind: "unauthorized" });
  });
  it("403 with nothing about a rate limit is unauthorized (a token without Gists: write, or revoked)", async () => {
    expect(await read(status(403, {}, '{"message":"Resource not accessible by personal access token"}'))).toEqual({ kind: "unauthorized" });
  });
  it("429 is rate_limited, with retry-after when sent and only when it is a sensible whole number", async () => {
    expect(await read(status(429, { "retry-after": "60" }))).toEqual({ kind: "rate_limited", retryAfterSeconds: 60 });
    expect(await read(status(429))).toEqual({ kind: "rate_limited", retryAfterSeconds: null });
    expect(await read(status(429, { "retry-after": "soon" }))).toEqual({ kind: "rate_limited", retryAfterSeconds: null });
    expect(await read(status(429, { "retry-after": "-5" }))).toEqual({ kind: "rate_limited", retryAfterSeconds: null });
    expect(await read(status(429, { "retry-after": "99999999" }))).toEqual({ kind: "rate_limited", retryAfterSeconds: null });
  });
  it("the secondary-limit shapes: 403 with retry-after; 403 with remaining 0; 403 that says so in words", async () => {
    expect(await read(status(403, { "retry-after": "30" }))).toEqual({ kind: "rate_limited", retryAfterSeconds: 30 });
    expect(await read(status(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1790000000" }))).toEqual({ kind: "rate_limited", retryAfterSeconds: null });
    expect(await read(status(403, {}, '{"message":"You have exceeded a secondary rate limit. Please wait a few minutes"}'))).toEqual({ kind: "rate_limited", retryAfterSeconds: null });
    expect(await read(status(403, { "x-ratelimit-remaining": "4999" }))).toEqual({ kind: "unauthorized" });
  });
  it("5xx and any other status are provider errors naming only the status", async () => {
    for (const code of [500, 502, 503, 504, 418, 304, 302]) {
      expect(await read(status(code))).toEqual({ kind: "provider_error", message: `GitHub answered HTTP ${code}` });
    }
  });
  it("a network failure and a timeout are provider errors with fixed text", async () => {
    const reset = vi.fn<typeof fetch>(async () => {
      throw new TypeError(`fetch failed for ${URL_OF} with ${TOKEN}`);
    });
    expect(await port(reset).read(FILE)).toEqual({ kind: "provider_error", message: "could not reach GitHub" });
    const late = vi.fn<typeof fetch>(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect(await port(late).read(FILE)).toEqual({ kind: "provider_error", message: "GitHub did not answer in time" });
  });
  it("a redirect (refused by redirect: error, which makes fetch reject) is a provider error", async () => {
    const redirected = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed", { cause: new Error("unexpected redirect") });
    });
    expect(await port(redirected).read(FILE)).toMatchObject({ kind: "provider_error" });
  });
  it("a 403 whose body is huge is still unauthorized and reads only a little of it", async () => {
    const out = await read(() => new Response(new Uint8Array(5 * 1024 * 1024), { status: 403 }));
    expect(out).toEqual({ kind: "unauthorized" });
  });
});

describe("the Gist adapter: write", () => {
  const OLD = '{"d":1}\n';
  const NEW = '{"d":1}\n{"d":2}\n';
  const checkRead = () => json(gist({ [FILE]: fileEntry(OLD) }));
  const patched = (history = [{ version: V2 }, { version: V1 }]) => () => json({ id: GIST, files: { [FILE]: fileEntry(NEW) }, history });

  it("checks the file again, then sends one PATCH holding only that one file's full new text", async () => {
    const fetchMock = respondWith(checkRead, patched());
    const out = await port(fetchMock).write(FILE, NEW, { expected: OLD });
    expect(out).toEqual({ kind: "ok", version: V2, wrote: true, continuity: "unbroken" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [getUrl, getInit] = fetchMock.mock.calls[0];
    const [patchUrl, patchInit] = fetchMock.mock.calls[1];
    expect(getInit?.method).toBe("GET");
    expect(patchUrl).toBe(getUrl);
    expect(patchUrl).toBe(URL_OF);
    expect(patchInit?.method).toBe("PATCH");
    expect(patchInit?.redirect).toBe("error");
    expect(patchInit?.cache).toBe("no-store");
    expect(JSON.parse(String(patchInit?.body))).toEqual({ files: { [FILE]: { content: NEW } } });
    expect((patchInit?.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect((patchInit?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("creating the file when it does not exist yet: expected null", async () => {
    const fetchMock = respondWith(() => json(gist({ "other.txt": fileEntry("x") })), patched([{ version: V2 }, { version: V1 }]));
    expect(await port(fetchMock).write(FILE, NEW, { expected: null })).toMatchObject({ kind: "ok", wrote: true });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ files: { [FILE]: { content: NEW } } });
  });

  it("a failed precondition writes nothing and answers what it found", async () => {
    const fetchMock = respondWith(() => json(gist({ [FILE]: fileEntry("somebody else's text\n") })));
    const out = await port(fetchMock).write(FILE, NEW, { expected: OLD });
    expect(out).toEqual({ kind: "changed", found: "somebody else's text\n", version: V1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("the file gone when a file was expected, and a file there when none was expected, are both 'changed'", async () => {
    const gone = respondWith(() => json(gist({})));
    expect(await port(gone).write(FILE, NEW, { expected: OLD })).toEqual({ kind: "changed", found: null, version: V1 });
    const there = respondWith(checkRead);
    expect(await port(there).write(FILE, NEW, { expected: null })).toEqual({ kind: "changed", found: OLD, version: V1 });
    expect(there).toHaveBeenCalledTimes(1);
  });

  it("a one-byte difference (trailing newline, CRLF) fails the precondition", async () => {
    for (const found of [OLD.trimEnd(), OLD.replace("\n", "\r\n"), `${OLD}\n`, ` ${OLD}`]) {
      const out = await port(respondWith(() => json(gist({ [FILE]: fileEntry(found) })))).write(FILE, NEW, { expected: OLD });
      expect(out).toMatchObject({ kind: "changed", found });
    }
  });

  it("when the file already holds exactly the new text nothing is sent", async () => {
    const fetchMock = respondWith(() => json(gist({ [FILE]: fileEntry(NEW) })));
    expect(await port(fetchMock).write(FILE, NEW, { expected: NEW })).toEqual({ kind: "ok", version: V1, wrote: false, continuity: "unbroken" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a commit that slipped in between the check and the write is reported as interrupted", async () => {
    const fetchMock = respondWith(checkRead, patched([{ version: V2 }, { version: "3333333333333333333333333333333333333333" }, { version: V1 }]));
    expect(await port(fetchMock).write(FILE, NEW, { expected: OLD })).toEqual({ kind: "ok", version: V2, wrote: true, continuity: "interrupted" });
  });

  it("an unreadable revision list is 'unknown', not a failure", async () => {
    const fetchMock = respondWith(checkRead, () => json({ id: GIST, files: { [FILE]: fileEntry(NEW) } }));
    expect(await port(fetchMock).write(FILE, NEW, { expected: OLD })).toEqual({ kind: "ok", version: null, wrote: true, continuity: "unknown" });
  });

  it("an answer that does not hold what was sent is not trusted as success", async () => {
    const fetchMock = respondWith(checkRead, () => json({ id: GIST, files: { [FILE]: fileEntry("something else") }, history: [{ version: V2 }, { version: V1 }] }));
    const out = await port(fetchMock).write(FILE, NEW, { expected: OLD });
    expect(out).toMatchObject({ kind: "provider_error" });
    expect((out as { message: string }).message).toMatch(/may or may not/);
  });

  it("the errors of the check read are the errors of the write, and no PATCH follows", async () => {
    for (const [code, expected] of [
      [401, { kind: "unauthorized" }],
      [404, { kind: "absent", what: "gist" }],
      [429, { kind: "rate_limited", retryAfterSeconds: null }],
    ] as const) {
      const fetchMock = respondWith(() => new Response("", { status: code }));
      expect(await port(fetchMock).write(FILE, NEW, { expected: OLD })).toEqual(expected);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("errors of the PATCH itself", async () => {
    const patch = (make: () => Response) => port(respondWith(checkRead, make)).write(FILE, NEW, { expected: OLD });
    expect(await patch(() => new Response("", { status: 401 }))).toEqual({ kind: "unauthorized" });
    expect(await patch(() => new Response("", { status: 403 }))).toEqual({ kind: "unauthorized" });
    expect(await patch(() => new Response("", { status: 404 }))).toEqual({ kind: "absent", what: "gist" });
    expect(await patch(() => new Response("", { status: 429, headers: { "retry-after": "61" } }))).toEqual({ kind: "rate_limited", retryAfterSeconds: 61 });
    expect(await patch(() => new Response("", { status: 403, headers: { "retry-after": "5" } }))).toEqual({ kind: "rate_limited", retryAfterSeconds: 5 });
    expect(await patch(() => new Response("", { status: 422 }))).toEqual({ kind: "provider_error", message: "GitHub rejected the update (HTTP 422)" });
    expect(await patch(() => new Response("", { status: 503 }))).toEqual({ kind: "provider_error", message: "GitHub answered HTTP 503; the update may or may not have been applied" });
  });

  it("a PATCH that dies in flight says plainly that the write may have been applied", async () => {
    let n = 0;
    const fetchMock = vi.fn<typeof fetch>(async () => {
      if (n++ === 0) return checkRead();
      throw new DOMException("timeout", "TimeoutError");
    });
    const out = await port(fetchMock).write(FILE, NEW, { expected: OLD });
    expect(out).toMatchObject({ kind: "provider_error" });
    expect((out as { message: string }).message).toMatch(/may or may not have been applied/);
  });

  it("refuses bad input before any request: file name, empty text, text over the whole-file limit", async () => {
    const fetchMock = respondWith(checkRead);
    expect(await port(fetchMock).write("../x", NEW, { expected: OLD })).toMatchObject({ kind: "invalid_request" });
    expect(await port(fetchMock).write(FILE, "", { expected: OLD })).toMatchObject({ kind: "invalid_request" });
    expect(await port(fetchMock).write(FILE, "x".repeat(1_000_001), { expected: OLD })).toMatchObject({ kind: "invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the whole operation shares one budget: a spent budget sends nothing; the PATCH gets what the check left", async () => {
    const fetchMock = respondWith(checkRead, patched());
    expect(await port(fetchMock).write(FILE, NEW, { expected: OLD, timeoutMs: 0 })).toEqual({ kind: "provider_error", message: "no time left for the GitHub call" });
    expect(await port(fetchMock).read(FILE, { timeoutMs: -3 })).toEqual({ kind: "provider_error", message: "no time left for the GitHub call" });
    expect(await port(fetchMock).read(FILE, { timeoutMs: Number.NaN })).toMatchObject({ kind: "provider_error" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("creation is strict", () => {
  it("rejects a gist id that could alter the URL path, and a token that could alter a header, without echoing either", () => {
    const hostile = ["../../users/x", "abc/def", `${GIST}?x=1`, `${GIST}#`, "ABCDEF0123456789ABCDEF0123456789", "short", `${GIST}${GIST}`, "", " ", `${GIST}\n`, "%2e%2e"];
    for (const gistId of hostile) {
      let message = "";
      try {
        createGithubGistAnchor({ token: TOKEN, gistId });
      } catch (error) {
        message = String((error as Error).message);
      }
      expect(message, gistId).not.toBe("");
      expect(message).not.toContain(TOKEN);
      if (gistId.length > 3) expect(message).not.toContain(gistId);
    }
    for (const token of ["", "short", `${TOKEN}\r\nX-Evil: 1`, `${TOKEN} extra`, "ghp_" + "a".repeat(300)]) {
      let message = "";
      try {
        createGithubGistAnchor({ token, gistId: GIST });
      } catch (error) {
        message = String((error as Error).message);
      }
      expect(message, "token").not.toBe("");
      expect(message).not.toContain("Evil");
    }
  });
  it("the per-call timeout must be a whole number of milliseconds from 1 to 60,000", () => {
    for (const callTimeoutMs of [0, -1, 1.5, 60_001, Number.NaN]) {
      expect(() => createGithubGistAnchor({ token: TOKEN, gistId: GIST, callTimeoutMs })).toThrow(/timeout/);
    }
    expect(createGithubGistAnchor({ token: TOKEN, gistId: GIST, callTimeoutMs: 1 }).name).toBe("github-gist");
  });
  it("the public address is the gist page, built from the validated id only", () => {
    expect(createGithubGistAnchor({ token: TOKEN, gistId: GIST }).publicUrl).toBe(`https://gist.github.com/${GIST}`);
  });
});

describe("no secret, no gist id and no response body in any outcome or log", () => {
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
  afterEach(() => spies.forEach((s) => s.mockClear()));
  afterAll(() => spies.forEach((s) => s.mockRestore()));

  const REFLECTED = "REFLECTED-DETAIL-9f3a";
  it("every failing shape, read and write", async () => {
    const outcomes: unknown[] = [];
    const bodies = `{"message":"Bad credentials ${REFLECTED}","request":"${URL_OF} Bearer ${TOKEN}"}`;
    for (const code of [401, 403, 404, 422, 429, 500, 502]) {
      const make = () => new Response(bodies, { status: code, headers: { "x-detail": REFLECTED } });
      outcomes.push(await port(respondWith(make)).read(FILE));
      outcomes.push(await port(respondWith(() => json(gist({ [FILE]: fileEntry("a\n") })), make)).write(FILE, "a\nb\n", { expected: "a\n" }));
      outcomes.push(await port(respondWith(make)).write(FILE, "a\nb\n", { expected: "a\n" }));
    }
    const boom = vi.fn<typeof fetch>(async () => {
      throw new TypeError(`connect ECONNRESET ${URL_OF} ${TOKEN}`, { cause: new Error(`${TOKEN} ${GIST}`) });
    });
    outcomes.push(await port(boom).read(FILE), await port(boom).write(FILE, "a\n", { expected: null }));
    outcomes.push(await port(respondWith(() => new Response(`<html>${TOKEN} ${GIST} ${REFLECTED}</html>`, { status: 200 }))).read(FILE));
    outcomes.push(await port(respondWith(() => json({ id: GIST, files: { [FILE]: { content: 5 } }, note: REFLECTED }))).read(FILE));
    const text = everything(outcomes);
    expect(outcomes.length).toBeGreaterThan(20);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("github_pat_");
    expect(text).not.toContain(GIST);
    expect(text).not.toContain("api.github.com");
    expect(text).not.toContain(REFLECTED);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("the Gist adapter against a real local HTTP server (the behaviour the mocks only imitate)", () => {
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
  const aimed: typeof fetch = (url, init) => fetch(String(url).replace("https://api.github.com", origin), init);
  const local = (extra: Partial<Parameters<typeof createGithubGistAnchor>[0]> = {}) => createGithubGistAnchor({ token: TOKEN, gistId: GIST, fetch: aimed, ...extra });

  it("a 302 is not followed and is a provider error", async () => {
    let hits = 0;
    handler = (_req, res) => {
      hits++;
      res.writeHead(302, { location: "http://127.0.0.1:1/elsewhere" }).end();
    };
    expect(await local().read(FILE)).toMatchObject({ kind: "provider_error" });
    expect(hits).toBe(1);
  });

  it("a body that drips is cut by the timeout", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      const timer = setInterval(() => res.write(" "), 20);
      res.on("close", () => clearInterval(timer));
    };
    const started = Date.now();
    expect(await local({ callTimeoutMs: 300 }).read(FILE)).toMatchObject({ kind: "provider_error" });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("a body that is not JSON is a provider error; one larger than the cap is cut at the cap (counted from the stream)", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" }).end("x".repeat(100));
    };
    expect(await local().read(FILE)).toMatchObject({ kind: "provider_error" });
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      const chunk = Buffer.alloc(1024 * 1024, 32);
      let sent = 0;
      const push = () => {
        while (sent < 40 && res.write(chunk)) sent++;
        if (sent < 40) res.once("drain", push);
        else res.end();
      };
      push();
    };
    expect(await local().read(FILE)).toEqual({ kind: "too_large" });
  });

  it("a read and a conditional write round-trip through a real socket", async () => {
    let content = "one\n";
    let version = V1;
    handler = (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        if (req.method === "PATCH") {
          content = (JSON.parse(Buffer.concat(chunks).toString()) as { files: Record<string, { content: string }> }).files[FILE].content;
          version = V2;
        }
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: GIST, files: { [FILE]: { content, truncated: false } }, history: [{ version }, { version: V1 }] }));
      });
    };
    const anchor = local();
    expect(await anchor.read(FILE)).toEqual({ kind: "ok", text: "one\n", version: V1 });
    expect(await anchor.write(FILE, "one\ntwo\n", { expected: "one\n" })).toMatchObject({ kind: "ok", wrote: true, version: V2 });
    expect(await anchor.write(FILE, "one\nTWO\n", { expected: "one\n" })).toEqual({ kind: "changed", found: "one\ntwo\n", version: V2 });
    expect(content).toBe("one\ntwo\n");
  });
});
