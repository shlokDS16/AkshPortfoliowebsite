import { describe, expect, it, vi } from "vitest";
import { createGroqWhisper } from "./groq-whisper";

const KEY = `gsk_${"w".repeat(40)}`;
const FILE = { bytes: new Uint8Array([1, 2, 3, 4]), mime: "audio/mp4", name: "voice.m4a" };
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

function adapter(answer: () => Response | Promise<Response>) {
  const fetchFake = vi.fn<typeof fetch>(async () => answer());
  return { port: createGroqWhisper({ apiKey: KEY, model: "whisper-large-v3-turbo", fetch: fetchFake }), fetchFake };
}

describe("createGroqWhisper: the request", () => {
  it("posts multipart to the OpenAI-compatible endpoint with the file, the model and English, and the key as a bearer header only", async () => {
    const { port, fetchFake } = adapter(() => json({ text: "hello", duration: 3.2 }));
    await port.transcribe(FILE);
    const [url, init] = fetchFake.mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("en");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.get("temperature")).toBe("0");
    const file = form.get("file") as File;
    expect(file.name).toBe("voice.m4a");
    expect(file.type).toBe("audio/mp4");
    expect(file.size).toBe(4);
    // The key is in the header and nowhere else.
    expect([...form.keys()].join(",")).not.toContain("key");
    expect(String(form.get("model"))).not.toContain(KEY);
  });

  it("follows no redirect (the key rides in a header) and sets a timeout", async () => {
    const { port, fetchFake } = adapter(() => json({ text: "x" }));
    await port.transcribe(FILE, { timeoutMs: 5_000 });
    const init = fetchFake.mock.calls[0]![1]!;
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("createGroqWhisper: the answer", () => {
  it("reads the text and the reported duration", async () => {
    const { port } = adapter(() => json({ text: "  Dealers say orders are up.  ", duration: 12.4 }));
    expect(await port.transcribe(FILE)).toEqual({ kind: "ok", text: "Dealers say orders are up.", seconds: 12.4 });
  });

  it("falls back to the end of the last segment, then to null, when no duration is reported", async () => {
    const withSegments = adapter(() => json({ text: "a b", segments: [{ end: 2 }, { end: 7.5 }] }));
    expect(await withSegments.port.transcribe(FILE)).toEqual({ kind: "ok", text: "a b", seconds: 7.5 });
    const bare = adapter(() => json({ text: "a b" }));
    expect(await bare.port.transcribe(FILE)).toEqual({ kind: "ok", text: "a b", seconds: null });
    const odd = adapter(() => json({ text: "a b", duration: -4 }));
    expect(await odd.port.transcribe(FILE)).toEqual({ kind: "ok", text: "a b", seconds: null });
  });

  it("an answer with no text is a provider error, not an empty transcript", async () => {
    const { port } = adapter(() => json({ nope: true }));
    expect(await port.transcribe(FILE)).toEqual({ kind: "provider_error", message: "unreadable answer" });
    const garbled = adapter(() => new Response("<html>", { status: 200 }));
    expect(await garbled.port.transcribe(FILE)).toEqual({ kind: "provider_error", message: "unreadable answer" });
  });
});

describe("createGroqWhisper: refusals are typed results", () => {
  it("a 429 is rate_limited with the retry-after seconds (null when absent)", async () => {
    const withHeader = adapter(() => new Response("{}", { status: 429, headers: { "retry-after": "42" } }));
    expect(await withHeader.port.transcribe(FILE)).toEqual({ kind: "rate_limited", retryAfterSeconds: 42 });
    const without = adapter(() => new Response("{}", { status: 429 }));
    expect(await without.port.transcribe(FILE)).toEqual({ kind: "rate_limited", retryAfterSeconds: null });
  });

  it.each([400, 401, 413, 500, 503])("HTTP %i is a provider error that names the status only", async (status) => {
    const { port } = adapter(() => json({ error: { message: `bad key ${KEY}`, type: "invalid_request_error" } }, { status }));
    const out = await port.transcribe(FILE);
    expect(out).toEqual({ kind: "provider_error", message: `HTTP ${status}` });
    expect(JSON.stringify(out)).not.toContain(KEY);
  });

  it("a network failure or timeout is a provider error carrying the error's name, never its message", async () => {
    const { port } = adapter(() => {
      throw Object.assign(new TypeError(`fetch failed for ${KEY}`), { name: "TypeError" });
    });
    const out = await port.transcribe(FILE);
    expect(out).toEqual({ kind: "provider_error", message: "TypeError" });
    expect(JSON.stringify(out)).not.toContain(KEY);
  });
});
