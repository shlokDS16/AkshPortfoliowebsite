import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createResendLetters, letterSettingsProblem, RESEND_LETTERS_BASE } from "./resend-letters";

// Phase 5c Task 11: the Resend letters transport, with an injected fetch only (spec s9.4). Nothing here can reach Resend: the
// global fetch refuses api.resend.com (src/test/no-outbound.ts) and every test below passes its own stub.

const KEY = "re_lettersKEY_1234567890secretsecret";
const FROM = "Aksh Agrawal <letters@akshagrawal.example>";
const SEG = "78261eea-8f8b-4381-83c6-79fa7120f1cf";
const BID = "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794";
const READER = "reader@example.org";

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
const stub = (...replies: Reply[]) => {
  let i = 0;
  return vi.fn<typeof fetch>(async () => {
    const r = replies[Math.min(i++, replies.length - 1)];
    const body = r.body === undefined ? null : typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return new Response(body, { status: r.status, headers: r.headers });
  });
};
const letters = (fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createResendLetters>[0]> = {}) =>
  createResendLetters({ apiKey: KEY, from: FROM, segmentId: SEG, fetch: fetchImpl, minGapMs: 0, ...extra });
const call = (f: ReturnType<typeof stub>, n = 0) => {
  const [url, init] = f.mock.calls[n];
  return { url: String(url), init: init ?? {}, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(init.body as string) : undefined };
};
const common = (c: ReturnType<typeof call>) => {
  expect(c.headers.authorization).toBe(`Bearer ${KEY}`);
  expect(c.init.redirect).toBe("error");
  expect(c.init.cache).toBe("no-store");
  expect(c.init.signal).toBeInstanceOf(AbortSignal);
};

describe("each endpoint's request", () => {
  it("sendOne: POST /emails with the idempotency key in a header, the address as a one-entry list", async () => {
    const f = stub({ status: 200, body: { id: "e-1" } });
    const out = await letters(f).sendOne({ to: READER, subject: "Please confirm", text: "Open the link.", html: "<p>Hi</p>", idempotencyKey: "confirm-1-2" });
    expect(out).toEqual({ ok: true, value: { id: "e-1" } });
    const c = call(f);
    expect(c.url).toBe(`${RESEND_LETTERS_BASE}/emails`);
    expect(RESEND_LETTERS_BASE).toBe("https://api.resend.com");
    expect(c.init.method).toBe("POST");
    common(c);
    expect(c.headers["content-type"]).toBe("application/json");
    expect(c.headers["idempotency-key"]).toBe("confirm-1-2");
    expect(c.body).toEqual({ from: FROM, to: [READER], subject: "Please confirm", text: "Open the link.", html: "<p>Hi</p>" });
  });

  it("sendOne without html sends text only; a 2xx without an id is still sent", async () => {
    const f = stub({ status: 200, body: {} });
    expect(await letters(f).sendOne({ to: READER, subject: "s", text: "t", idempotencyKey: "k" })).toEqual({ ok: true, value: { id: null } });
    expect(call(f).body).toEqual({ from: FROM, to: [READER], subject: "s", text: "t" });
  });

  it("createBroadcast: POST /broadcasts, always a draft, to the configured segment, no idempotency header", async () => {
    const f = stub({ status: 200, body: { object: "broadcast", id: BID } });
    const out = await letters(f).createBroadcast({ name: "letter-1", subject: "Subject", html: "<p>h</p>", text: "t" });
    expect(out).toEqual({ ok: true, value: { id: BID } });
    const c = call(f);
    expect([c.url, c.init.method]).toEqual([`${RESEND_LETTERS_BASE}/broadcasts`, "POST"]);
    common(c);
    expect(c.headers["idempotency-key"]).toBeUndefined();
    expect(c.body).toEqual({ segment_id: SEG, from: FROM, subject: "Subject", html: "<p>h</p>", text: "t", name: "letter-1", send: false });
  });

  it("createBroadcast: a 2xx without a usable id is unavailable (a lost draft is harmless: drafts do not send)", async () => {
    expect(await letters(stub({ status: 200, body: { id: "../x" } })).createBroadcast({ name: "n", subject: "s", html: "h", text: "t" }))
      .toMatchObject({ ok: false, kind: "unavailable" });
  });

  it("getBroadcast: GET /broadcasts/{id} with no body, read into a small view", async () => {
    const f = stub({ status: 200, body: { object: "broadcast", id: BID, name: "letter-1", segment_id: SEG, status: "draft", html: "<p>x</p>" } });
    expect(await letters(f).getBroadcast(BID)).toEqual({ ok: true, value: { id: BID, name: "letter-1", segmentId: SEG, status: "draft" } });
    const c = call(f);
    expect([c.url, c.init.method, c.init.body, c.headers["content-type"]]).toEqual([`${RESEND_LETTERS_BASE}/broadcasts/${BID}`, "GET", undefined, undefined]);
    common(c);
  });

  it("getBroadcast: an unknown status reads as unknown, and a missing broadcast is not_found", async () => {
    const odd = await letters(stub({ status: 200, body: { id: BID, status: "paused" } })).getBroadcast(BID);
    expect(odd).toEqual({ ok: true, value: { id: BID, name: null, segmentId: null, status: "unknown" } });
    expect(await letters(stub({ status: 404, body: { name: "not_found", message: "Broadcast not found" } })).getBroadcast(BID))
      .toEqual({ ok: false, kind: "not_found", message: "Resend answered 404: Broadcast not found" });
  });

  it("sendBroadcast: POST /broadcasts/{id}/send with an empty JSON body (no schedule)", async () => {
    const f = stub({ status: 200, body: { id: BID } });
    expect(await letters(f).sendBroadcast(BID)).toEqual({ ok: true, value: null });
    const c = call(f);
    expect([c.url, c.init.method, c.body]).toEqual([`${RESEND_LETTERS_BASE}/broadcasts/${BID}/send`, "POST", {}]);
    common(c);
  });

  it("refuses an id that could change the address, without calling out", async () => {
    const f = stub({ status: 200, body: {} });
    for (const id of ["", "../emails", "a/b", "a?b", "x".repeat(101)]) {
      expect(await letters(f).getBroadcast(id)).toMatchObject({ ok: false, kind: "invalid" });
      expect(await letters(f).sendBroadcast(id)).toMatchObject({ ok: false, kind: "invalid" });
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses a bad address, subject or idempotency key without calling out", async () => {
    const f = stub({ status: 200, body: {} });
    const ok = { to: READER, subject: "s", text: "t", idempotencyKey: "k" };
    for (const bad of [{ to: "not-an-address" }, { to: "a@b.c, d@e.f" }, { subject: "" }, { subject: "a\r\nBcc: x@y.z" }, { idempotencyKey: "" }, { idempotencyKey: "a b" }, { text: "" }]) {
      expect(await letters(f).sendOne({ ...ok, ...bad })).toMatchObject({ ok: false, kind: "invalid" });
    }
    expect(await letters(f).createBroadcast({ name: "n", subject: "x".repeat(201), html: "h", text: "t" })).toMatchObject({ ok: false, kind: "invalid" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("contacts", () => {
  const contact = (n: number) => ({ id: `c-${n}`, email: `R${n}@Example.org`, unsubscribed: n === 2, created_at: "2026-10-06" });

  it("listContacts: GET /contacts?segment_id=..&limit=100, following `after` while has_more", async () => {
    const f = stub(
      { status: 200, body: { object: "list", has_more: true, data: [contact(1), contact(2)] } },
      { status: 200, body: { object: "list", has_more: false, data: [contact(3)] } },
    );
    expect(await letters(f).listContacts()).toEqual({
      ok: true,
      value: [
        { id: "c-1", email: "r1@example.org", unsubscribed: false },
        { id: "c-2", email: "r2@example.org", unsubscribed: true },
        { id: "c-3", email: "r3@example.org", unsubscribed: false },
      ],
    });
    expect(call(f, 0).url).toBe(`${RESEND_LETTERS_BASE}/contacts?segment_id=${SEG}&limit=100`);
    expect(call(f, 1).url).toBe(`${RESEND_LETTERS_BASE}/contacts?segment_id=${SEG}&limit=100&after=c-2`);
    expect(call(f, 1).init.method).toBe("GET");
  });

  it("listContacts: a page it cannot read, or one that never ends, is unavailable, never a partial list", async () => {
    expect(await letters(stub({ status: 200, body: { has_more: false, data: [{ id: "c-1" }] } })).listContacts()).toMatchObject({ ok: false, kind: "unavailable" });
    expect(await letters(stub({ status: 200, body: "<html>" })).listContacts()).toMatchObject({ ok: false, kind: "unavailable" });
    let pages = 0;
    const endless = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ has_more: true, data: [contact(++pages)] })));
    expect(await letters(endless).listContacts()).toMatchObject({ ok: false, kind: "unavailable" });
    expect(endless.mock.calls.length).toBeLessThanOrEqual(20);
    const stuck = stub({ status: 200, body: { has_more: true, data: [] } });
    expect(await letters(stuck).listContacts()).toMatchObject({ ok: false, kind: "unavailable" });
    expect(stuck).toHaveBeenCalledTimes(1);
  });

  it("upsertContact: adds an existing contact to the segment by address (encoded), one call", async () => {
    const f = stub({ status: 200, body: { id: SEG } });
    expect(await letters(f).upsertContact("a+b@Example.org")).toEqual({ ok: true, value: null });
    const c = call(f);
    expect([c.url, c.init.method]).toEqual([`${RESEND_LETTERS_BASE}/contacts/a%2Bb%40example.org/segments/${SEG}`, "POST"]);
    common(c);
  });

  it("upsertContact: a contact Resend does not have is created in the segment; `unsubscribed` is never sent", async () => {
    const f = stub({ status: 404, body: { name: "not_found", message: "Contact not found" } }, { status: 200, body: { id: "c-9" } });
    expect(await letters(f).upsertContact(READER)).toEqual({ ok: true, value: null });
    const c = call(f, 1);
    expect([c.url, c.init.method]).toEqual([`${RESEND_LETTERS_BASE}/contacts`, "POST"]);
    expect(c.body).toEqual({ email: READER, segments: [{ id: SEG }] });
  });

  it("deleteContact: DELETE /contacts/{address}; already gone is a success", async () => {
    const f = stub({ status: 200, body: { deleted: true } });
    expect(await letters(f).deleteContact(READER)).toEqual({ ok: true, value: null });
    expect([call(f).url, call(f).init.method]).toEqual([`${RESEND_LETTERS_BASE}/contacts/reader%40example.org`, "DELETE"]);
    expect(await letters(stub({ status: 404, body: { name: "not_found" } })).deleteContact(READER)).toEqual({ ok: true, value: null });
  });

  it("never updates a contact: the file has no PATCH, so a reader's unsubscribe cannot be undone from here", () => {
    expect(readFileSync(join(__dirname, "resend-letters.ts"), "utf8")).not.toMatch(/PATCH/);
  });
});

describe("failures are typed results, never throws, and never carry the key or an address", () => {
  const send = (f: typeof fetch) => letters(f).sendBroadcast(BID);

  it("429 is rate_limited with Resend's retry-after; a used-up quota is quota", async () => {
    expect(await send(stub({ status: 429, body: { name: "rate_limit_exceeded", message: "Too many requests" }, headers: { "retry-after": "2" } })))
      .toEqual({ ok: false, kind: "rate_limited", message: "Resend answered 429: Too many requests", retryAfterSeconds: 2 });
    expect(await send(stub({ status: 429, body: { name: "daily_quota_exceeded", message: "Daily quota" } })))
      .toEqual({ ok: false, kind: "quota", message: "Resend answered 429: Daily quota" });
    expect(await send(stub({ status: 429, body: { name: "monthly_quota_exceeded" } }))).toMatchObject({ ok: false, kind: "quota" });
  });

  it("5xx is unavailable, another 4xx is refused", async () => {
    expect(await send(stub({ status: 503 }))).toEqual({ ok: false, kind: "unavailable", message: "Resend answered 503" });
    expect(await send(stub({ status: 500, body: "<html>oops</html>" }))).toEqual({ ok: false, kind: "unavailable", message: "Resend answered 500" });
    expect(await send(stub({ status: 403, body: { name: "validation_error", message: "You have reached your contacts quota." } })))
      .toEqual({ ok: false, kind: "refused", message: "Resend answered 403: You have reached your contacts quota." });
  });

  it("a timeout and a network error are unavailable with fixed words, not the error's own text", async () => {
    const timeout = vi.fn<typeof fetch>(async () => { throw new DOMException(`timed out ${KEY}`, "TimeoutError"); });
    expect(await send(timeout)).toEqual({ ok: false, kind: "unavailable", message: "Resend did not answer in time" });
    const down = vi.fn<typeof fetch>(async () => { throw new TypeError(`fetch failed ${KEY} ${READER}`); });
    expect(await send(down)).toEqual({ ok: false, kind: "unavailable", message: "could not reach Resend" });
  });

  it("removes the key and any address Resend echoes, flattens control characters and cuts at 160", async () => {
    const echoed = await letters(stub({ status: 422, body: { message: `Bad key ${KEY} for ${READER}\nline two` } })).deleteContact(READER);
    expect(echoed).toEqual({ ok: false, kind: "refused", message: "Resend answered 422: Bad key [removed] for [address] line two" });
    const long = await send(stub({ status: 400, body: { message: "x".repeat(500) } }));
    expect(!long.ok && long.message.length).toBe(160);
  });

  it("uses a 10 second timeout by default", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    await send(stub({ status: 200, body: {} }));
    expect(spy).toHaveBeenCalledWith(10_000);
    spy.mockRestore();
  });

  it("without an injected fetch, a call meets the test setup's guard and fails as a typed result", async () => {
    const real = createResendLetters({ apiKey: KEY, from: FROM, segmentId: SEG, minGapMs: 0 });
    expect(await real.sendBroadcast(BID)).toEqual({ ok: false, kind: "unavailable", message: "could not reach Resend" });
    await expect(fetch(`${RESEND_LETTERS_BASE}/broadcasts/${BID}/send`, { method: "POST" })).rejects.toThrow(/no outbound call in a test/);
  });
});

describe("pacing and settings", () => {
  it("keeps calls at least minGapMs apart (Resend allows 10 requests a second per team, shared with the alert email)", async () => {
    let clock = 1_000;
    const sleep = vi.fn(async (ms: number) => { clock += ms; });
    const adapter = letters(stub({ status: 200, body: {} }), { minGapMs: 120, now: () => clock, sleep });
    await adapter.sendBroadcast(BID);
    clock += 20;
    await adapter.sendBroadcast(BID);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it.each([
    ["the key", { apiKey: "sk_live_x" }, /RESEND_LETTERS_KEY/],
    ["a sender with a line break", { from: "A <a@b.example>\r\nBcc: x@y.z" }, /LETTERS_FROM/],
    ["the unverified Resend sender", { from: "Desk <onboarding@resend.dev>" }, /LETTERS_FROM/],
    ["a segment that is not an id", { segmentId: "../contacts" }, /LETTERS_SEGMENT_ID/],
  ])("refuses %s, naming the setting and never the value", (_label, bad, setting) => {
    const settings = { apiKey: KEY, from: FROM, segmentId: SEG, ...bad };
    const problem = letterSettingsProblem(settings);
    expect(problem).toMatch(setting);
    let thrown = "";
    try {
      createResendLetters({ ...settings, fetch: stub({ status: 200 }) });
    } catch (error) {
      thrown = (error as Error).message;
    }
    expect(thrown).toBe(problem);
    for (const value of Object.values(bad)) expect(thrown).not.toContain(value);
    expect(thrown).not.toContain(KEY);
  });

  it("accepts good settings", () => {
    expect(letterSettingsProblem({ apiKey: KEY, from: FROM, segmentId: SEG })).toBeNull();
    expect(letterSettingsProblem({ apiKey: KEY, from: "letters@akshagrawal.example", segmentId: SEG })).toBeNull();
  });
});

describe("the one place that names Resend's letters endpoints", () => {
  it("api.resend.com appears only in the alert adapter and this adapter (tests and the test setup aside)", () => {
    const SRC = join(__dirname, "..", "..");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    const naming = walk(SRC)
      .map((path) => relative(SRC, path).replaceAll("\\", "/"))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith("test/"))
      .filter((f) => readFileSync(join(SRC, f), "utf8").includes("api.resend.com"));
    expect(naming.sort()).toEqual(["lib/providers/resend-letters.ts", "lib/providers/resend-mailer.ts"]);
  });
});
