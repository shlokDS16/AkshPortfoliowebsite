import { describe, expect, it, vi } from "vitest";
import { createGithubGistAnchor } from "./github-gist";

// readAll: every file of the gist from ONE request (Plan 3a Task 9 fix round 1, review M-4). Same fixed request, same typed
// outcomes and the same no-secret rules as `read`.

const GIST = "aa11bb22cc33dd44ee55ff6677889900";
const TOKEN = "github_pat_11ABCDEFG0123456789_secretsecretsecretsecret";
const URL_OF = `https://api.github.com/gists/${GIST}`;
const FILE = "ledger-2026.jsonl";
const V1 = "1111111111111111111111111111111111111111";
const V0 = "0000000000000000000000000000000000000000";

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
const gist = (files: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: GIST,
  files,
  history: [{ version: V1 }, { version: V0 }],
  ...extra,
});
const entry = (content: string, extra: Record<string, unknown> = {}) => ({ content, truncated: false, ...extra });
const port = (fetchImpl: typeof fetch) => createGithubGistAnchor({ token: TOKEN, gistId: GIST, fetch: fetchImpl });
const respondWith = (make: () => Response) => vi.fn<typeof fetch>(async () => make());

describe("the Gist adapter: readAll", () => {
  it("one GET returns every file with the newest revision, as the same fixed request as read", async () => {
    const fetchMock = respondWith(() => json(gist({ [FILE]: entry("a\n"), "ledger-2027.jsonl": entry("b\n"), "README.md": entry("hi") })));
    const out = await port(fetchMock).readAll();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ kind: "ok", version: V1 });
    if (out.kind !== "ok") throw new Error("expected ok");
    expect([...out.files.entries()]).toEqual([[FILE, "a\n"], ["ledger-2027.jsonl", "b\n"], ["README.md", "hi"]]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL_OF);
    expect(init).toMatchObject({ method: "GET", redirect: "error", cache: "no-store" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.body).toBeUndefined();
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("a gist with no file yet is an ok answer holding none", async () => {
    const out = await port(respondWith(() => json(gist({})))).readAll();
    expect(out).toMatchObject({ kind: "ok" });
    if (out.kind === "ok") expect(out.files.size).toBe(0);
  });

  it("a name that is also an Object property is an ordinary key", async () => {
    const out = await port(respondWith(() => json(gist({ constructor: entry("y") })))).readAll();
    if (out.kind !== "ok") throw new Error("expected ok");
    expect(out.files.get("constructor")).toBe("y");
  });

  it("any file that is not whole, or a truncated file list, is too_large: a short answer is never called complete", async () => {
    expect(await port(respondWith(() => json(gist({ [FILE]: entry("a\n"), other: entry("p", { truncated: true }) })))).readAll()).toEqual({ kind: "too_large" });
    expect(await port(respondWith(() => json(gist({ [FILE]: entry("a\n") }, { truncated: true })))).readAll()).toEqual({ kind: "too_large" });
    for (const truncated of [undefined, null, "false", 0]) {
      const e: Record<string, unknown> = { content: "x" };
      if (truncated !== undefined) e.truncated = truncated;
      expect(await port(respondWith(() => json(gist({ [FILE]: e })))).readAll(), String(truncated)).toEqual({ kind: "too_large" });
    }
  });

  it("the same typed outcomes as read: 404, 401, 429, 5xx, a bad body, the byte cap, a timeout, no time", async () => {
    const status = (code: number, headers: Record<string, string> = {}) => () => new Response(null, { status: code, headers });
    expect(await port(respondWith(status(404))).readAll()).toEqual({ kind: "absent", what: "gist" });
    expect(await port(respondWith(status(401))).readAll()).toEqual({ kind: "unauthorized" });
    expect(await port(respondWith(status(429, { "retry-after": "60" }))).readAll()).toEqual({ kind: "rate_limited", retryAfterSeconds: 60 });
    expect(await port(respondWith(status(503))).readAll()).toEqual({ kind: "provider_error", message: "GitHub answered HTTP 503" });
    for (const make of [() => new Response("<html>", { status: 200 }), () => json({ id: GIST }), () => json({ files: { [FILE]: { content: 5, truncated: false } } }), () => json([1])]) {
      expect(await port(respondWith(make)).readAll()).toMatchObject({ kind: "provider_error" });
    }
    expect(await port(respondWith(() => new Response(new Uint8Array(9 * 1024 * 1024), { status: 200 }))).readAll()).toEqual({ kind: "too_large" });
    const slow = vi.fn<typeof fetch>((_u, init) => new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("t", "TimeoutError")))));
    expect(await port(slow).readAll({ timeoutMs: 30 })).toEqual({ kind: "provider_error", message: "GitHub did not answer in time" });
    const fetchMock = respondWith(() => json(gist({})));
    expect(await port(fetchMock).readAll({ timeoutMs: 0 })).toMatchObject({ kind: "provider_error" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no outcome carries the token or the gist id", async () => {
    const hostile = await port(respondWith(() => new Response(`{"message":"${TOKEN} ${GIST}"}`, { status: 500 }))).readAll();
    const fine = await port(respondWith(() => json(gist({ [FILE]: entry("a\n") })))).readAll();
    const text = JSON.stringify([hostile, fine.kind === "ok" ? { ...fine, files: [...fine.files.keys()] } : fine]);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(GIST);
  });
});
