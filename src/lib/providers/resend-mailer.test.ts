import { describe, expect, it, vi } from "vitest";
import { createFixtureAlertMailer } from "./fixture-alert-mailer";
import { createResendMailer, RESEND_URL } from "./resend-mailer";

const KEY = "re_abcdEFGH_1234567890secretsecret";
const FROM = "Aksh Research Desk <onboarding@resend.dev>";
const MESSAGE = { subject: "Aksh Research Desk: something needs a look", text: "The daily job last ran 40 h ago", idempotencyKey: "incident-3-open" };

const mailer = (fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createResendMailer>[0]> = {}) =>
  createResendMailer({ apiKey: KEY, from: FROM, to: ["shlok@example.com"], fetch: fetchImpl, ...extra });
const answer = (status: number, body?: unknown) =>
  vi.fn<typeof fetch>(async () => new Response(body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body), { status }));

describe("the Resend adapter: the request", () => {
  it("POSTs JSON {from, to, subject, text} to the one fixed address with the key and the idempotency key in headers only", async () => {
    const fetchMock = answer(200, { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
    expect(await mailer(fetchMock).send(MESSAGE)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(RESEND_URL);
    expect(RESEND_URL).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["idempotency-key"]).toBe("incident-3-open");
    expect(JSON.parse(init?.body as string)).toEqual({ from: FROM, to: ["shlok@example.com"], subject: MESSAGE.subject, text: MESSAGE.text });
    expect(init?.body as string).not.toContain(KEY);
    expect(init?.redirect).toBe("error");
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends to a list of addresses as an array", async () => {
    const fetchMock = answer(200, { id: "x" });
    await mailer(fetchMock, { to: ["a@example.com", "b@example.org"] }).send(MESSAGE);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).to).toEqual(["a@example.com", "b@example.org"]);
  });

  it("refuses an idempotency key Resend would refuse (empty, over 256 characters, a line break) without calling out", async () => {
    const fetchMock = answer(200, { id: "x" });
    for (const idempotencyKey of ["", "k".repeat(257), "incident-1\r\nx-evil: 1"]) {
      const out = await mailer(fetchMock).send({ ...MESSAGE, idempotencyKey });
      expect(out.ok).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the Resend adapter: outcomes (never throws, never the key)", () => {
  it("a non-2xx answer is { ok: false } with the status and Resend's own message", async () => {
    const out = await mailer(
      answer(403, { statusCode: 403, name: "validation_error", message: "You can only send testing emails to your own email address." }),
    ).send(MESSAGE);
    expect(out).toEqual({ ok: false, message: "Resend answered 403: You can only send testing emails to your own email address." });
  });

  it("an answer that is not JSON still gives the status", async () => {
    expect(await mailer(answer(502, "<html>Bad gateway</html>")).send(MESSAGE)).toEqual({ ok: false, message: "Resend answered 502" });
    expect(await mailer(answer(500)).send(MESSAGE)).toEqual({ ok: false, message: "Resend answered 500" });
  });

  it("a 409 for a reused idempotency key is a failure, not a success", async () => {
    const out = await mailer(answer(409, { statusCode: 409, name: "invalid_idempotent_request", message: "same key, different body" })).send(MESSAGE);
    expect(out).toMatchObject({ ok: false });
  });

  it("a 2xx without an id is still ok (Resend's body is not trusted for anything but its message)", async () => {
    expect(await mailer(answer(200, {})).send(MESSAGE)).toEqual({ ok: true });
  });

  it("removes the key if Resend's message echoes it, and cuts the message at 160 characters", async () => {
    const echoed = await mailer(answer(401, { message: `API key ${KEY} is invalid` })).send(MESSAGE);
    expect(JSON.stringify(echoed)).not.toContain(KEY);
    const long = await mailer(answer(422, { message: "x".repeat(500) })).send(MESSAGE);
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.message.length).toBeLessThanOrEqual(160);
  });

  it("flattens line breaks and control characters in Resend's message", async () => {
    const out = await mailer(answer(400, { message: "line one\r\nline two\u0000" })).send(MESSAGE);
    expect(out).toEqual({ ok: false, message: "Resend answered 400: line one line two" });
  });

  it("a network error is { ok: false } with fixed text, not the error's own text", async () => {
    const out = await mailer(vi.fn<typeof fetch>(async () => { throw new TypeError(`connect failed ${KEY}`); })).send(MESSAGE);
    expect(out).toEqual({ ok: false, message: "could not reach Resend" });
  });

  it("times out: the signal is aborted after the timeout and the answer says so", async () => {
    const hang = vi.fn<typeof fetch>(
      (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
    );
    const out = await mailer(hang, { timeoutMs: 25 }).send(MESSAGE);
    expect(out).toEqual({ ok: false, message: "Resend did not answer in time" });
  });

  it("uses a 10 second timeout by default", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    await mailer(answer(200, {})).send(MESSAGE);
    expect(spy).toHaveBeenCalledWith(10_000);
    spy.mockRestore();
  });

  it("reads at most a small part of a huge answer", async () => {
    const big = "y".repeat(2_000_000);
    const out = await mailer(answer(500, big)).send(MESSAGE);
    expect(out).toEqual({ ok: false, message: "Resend answered 500" });
  });
});

describe("the Resend adapter: creation refuses a bad setting, naming it and never its value", () => {
  const cases: [string, Partial<Parameters<typeof createResendMailer>[0]>, RegExp][] = [
    ["a key that is not a Resend key", { apiKey: "sk_live_notresendatall" }, /RESEND_API_KEY/],
    ["a key with a line break", { apiKey: "re_abcdefgh\r\nx-evil: 1" }, /RESEND_API_KEY/],
    ["a sender with a line break", { from: "a@b.co\r\nBcc: x@y.z" }, /RESEND_FROM/],
    ["a sender with no address", { from: "Aksh Research Desk" }, /RESEND_FROM/],
    ["no recipients", { to: [] }, /ALERT_EMAIL/],
    ["a recipient that is not an address", { to: ["not-an-address"] }, /ALERT_EMAIL/],
    ["a recipient with a space", { to: ["a b@example.com"] }, /ALERT_EMAIL/],
    ["more than 50 recipients", { to: Array.from({ length: 51 }, (_, i) => `u${i}@example.com`) }, /ALERT_EMAIL/],
  ];
  for (const [label, extra, setting] of cases) {
    it(`refuses ${label}`, () => {
      let message = "";
      try {
        createResendMailer({ apiKey: KEY, from: FROM, to: ["a@example.com"], ...extra });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(setting);
      for (const value of [KEY, ...(extra.to ?? []), extra.from ?? "", extra.apiKey ?? ""].filter(Boolean)) expect(message).not.toContain(value);
    });
  }

  it("accepts a bare sender address and a name-and-address sender", () => {
    expect(() => createResendMailer({ apiKey: KEY, from: "desk@example.com", to: ["a@example.com"] })).not.toThrow();
    expect(createResendMailer({ apiKey: KEY, from: FROM, to: ["a@example.com"] }).name).toBe("resend");
  });
});

describe("the fixture mailer", () => {
  it("records what it was asked to send, and can be told to fail", async () => {
    const fake = createFixtureAlertMailer();
    expect(await fake.send(MESSAGE)).toEqual({ ok: true });
    expect(fake.sent).toEqual([MESSAGE]);
    const failing = createFixtureAlertMailer({ fail: "Resend answered 500" });
    expect(await failing.send(MESSAGE)).toEqual({ ok: false, message: "Resend answered 500" });
    expect(failing.sent).toEqual([]);
    expect(failing.attempts).toBe(1);
  });
});
