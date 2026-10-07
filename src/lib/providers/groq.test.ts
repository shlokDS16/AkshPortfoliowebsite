import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createGroqLlm } from "./groq";
import type { LlmRequest } from "./llm";

// Tests never call Groq: every case runs against a fake fetch.
const KEY = `gsk_${"s3cr3t".repeat(8)}`;
const schema = z.object({ ok: z.boolean(), note: z.string().nullable() });
const req: LlmRequest<z.infer<typeof schema>> = {
  model: "openai/gpt-oss-120b",
  system: "Answer in JSON.",
  user: "Is this fine?",
  schema,
  schemaName: "check",
  maxCompletionTokens: 600,
  reasoningEffort: "low",
};
const USAGE = { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 };
const RATE_HEADERS = { "x-ratelimit-remaining-tokens": "5400", "x-ratelimit-remaining-requests": "998" };

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, { status, headers: { "content-type": "application/json", ...headers } });
}
const answer = (content: string, finish = "stop") => ({ choices: [{ finish_reason: finish, message: { content } }], usage: USAGE });

function setup(response: Response | (() => Promise<Response>)) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => (typeof response === "function" ? response() : response));
  return { fetch, llm: createGroqLlm({ apiKey: KEY, fetch }) };
}

describe("createGroqLlm: the request (API reference + structured outputs + reasoning docs)", () => {
  it("POSTs a strict JSON-schema chat completion with the key as a bearer token", async () => {
    const { fetch, llm } = setup(reply(200, answer('{"ok":true,"note":null}'), RATE_HEADERS));
    await llm.complete(req);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "openai/gpt-oss-120b",
      temperature: 0,
      max_completion_tokens: 600,
      reasoning_effort: "low",
      include_reasoning: false,
      response_format: { type: "json_schema", json_schema: { name: "check", strict: true } },
      messages: [
        { role: "system", content: "Answer in JSON." },
        { role: "user", content: "Is this fine?" },
      ],
    });
    expect(body.response_format.json_schema.schema).toMatchObject({ additionalProperties: false, required: ["ok", "note"] });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends no reasoning fields when the request sets no effort", async () => {
    const { fetch, llm } = setup(reply(200, answer('{"ok":true,"note":null}')));
    await llm.complete({ ...req, reasoningEffort: undefined });
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body).not.toHaveProperty("include_reasoning");
  });
});

describe("createGroqLlm: the result", () => {
  it("returns ok with the parsed data, usage and rate headers", async () => {
    const { llm } = setup(reply(200, answer('{"ok":true,"note":"fine"}'), RATE_HEADERS));
    expect(await llm.complete(req)).toEqual({
      kind: "ok",
      data: { ok: true, note: "fine" },
      usage: { promptTokens: 120, completionTokens: 30, totalTokens: 150 },
      rate: { remainingTokens: 5400, remainingRequests: 998, retryAfterSeconds: null },
    });
  });

  it("calls an answer cut off at max_completion_tokens invalid", async () => {
    const { llm } = setup(reply(200, answer('{"ok":tr', "length")));
    const out = await llm.complete(req);
    expect(out).toMatchObject({ kind: "invalid", usage: { totalTokens: 150 } });
    expect(out.kind === "invalid" && out.issues[0]).toMatch(/cut off/);
  });

  it("calls a non-JSON answer invalid", async () => {
    const { llm } = setup(reply(200, answer("Sure! Here you go")));
    expect(await llm.complete(req)).toMatchObject({ kind: "invalid", raw: "Sure! Here you go", issues: ["The answer was not JSON."] });
  });

  it("calls JSON that fails the Zod schema invalid, naming the paths", async () => {
    const { llm } = setup(reply(200, answer('{"ok":"yes","note":null}')));
    const out = await llm.complete(req);
    expect(out.kind).toBe("invalid");
    expect(out.kind === "invalid" && out.issues.join("|")).toMatch(/^ok: /);
  });

  it("returns rate_limited with retry-after in seconds on a 429", async () => {
    const { llm } = setup(reply(429, { error: { message: "Rate limit reached", type: "tokens" } }, { "retry-after": "7.5" }));
    expect(await llm.complete(req)).toEqual({
      kind: "rate_limited",
      rate: { remainingTokens: null, remainingRequests: null, retryAfterSeconds: 7.5 },
    });
  });

  it("calls a 400 json_validate_failed invalid, without echoing the failed generation", async () => {
    const body = { error: { message: "Generated JSON does not match the expected schema.", code: "json_validate_failed", failed_generation: "SECRET-TEXT" } };
    const out = await setup(reply(400, body)).llm.complete(req);
    expect(out).toMatchObject({ kind: "invalid", raw: "", usage: null, issues: ["Generated JSON does not match the expected schema."] });
    expect(JSON.stringify(out)).not.toContain("SECRET-TEXT");
  });

  it("returns provider_error with the status on a 500", async () => {
    const out = await setup(reply(500, { error: { message: "boom", type: "internal" } })).llm.complete(req);
    expect(out).toMatchObject({ kind: "provider_error", status: 500 });
  });

  it("returns provider_error with a null status when fetch throws", async () => {
    const { llm } = setup(() => Promise.reject(new TypeError("fetch failed")));
    expect(await llm.complete(req)).toEqual({
      kind: "provider_error",
      status: null,
      message: "TypeError",
      rate: { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null },
    });
  });

  it("aborts after the request's timeoutMs (ruling R3) and reports a timeout", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const out = await createGroqLlm({ apiKey: KEY, fetch }).complete({ ...req, timeoutMs: 20 });
    expect(out).toMatchObject({ kind: "provider_error", status: null, message: "TimeoutError" });
  });

  it("never puts the key in any result", async () => {
    const replies = [
      reply(200, answer('{"ok":true,"note":null}')),
      reply(200, answer("nope")),
      reply(401, { error: { message: `Invalid API Key ${KEY}`, code: "invalid_api_key" } }),
      reply(429, {}, { "retry-after": "2" }),
      reply(400, { error: { message: "bad", code: "json_validate_failed" } }),
    ];
    for (const r of replies) {
      const out = await setup(r).llm.complete(req);
      expect(JSON.stringify(out)).not.toContain(KEY);
    }
  });
});
