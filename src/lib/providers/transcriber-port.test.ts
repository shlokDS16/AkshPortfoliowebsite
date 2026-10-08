import { describe, expect, it, vi } from "vitest";
import { createFixtureTranscriber, FIXTURE_SECONDS, FIXTURE_TRANSCRIPT } from "./fixture-transcriber";
import { createTranscriberPort } from "./index";

const KEY = `gsk_${"k".repeat(40)}`;
const opts = { model: "whisper-large-v3-turbo" };

describe("createTranscriberPort (off unless VOICE_NOTES is on; then the fixture, else Groq, else off)", () => {
  it("is null while the switch is off, whatever else is set: nothing of a recording is ever sent", () => {
    expect(createTranscriberPort({}, opts)).toBeNull();
    expect(createTranscriberPort({ GROQ_API_KEY: KEY }, opts)).toBeNull();
    expect(createTranscriberPort({ GROQ_API_KEY: KEY, LLM_ADAPTER: "groq" }, opts)).toBeNull();
    expect(createTranscriberPort({ LLM_ADAPTER: "fixture" }, opts)).toBeNull();
  });

  it("is null when the switch is on but there is no key", () => {
    expect(createTranscriberPort({ VOICE_NOTES: "on" }, opts)).toBeNull();
  });

  it("is Groq Whisper with a key and the switch on", () => {
    expect(createTranscriberPort({ VOICE_NOTES: "on", GROQ_API_KEY: KEY }, opts)?.name).toBe("groq");
  });

  it("is the fixture when asked (switch on), even with a key", () => {
    expect(createTranscriberPort({ VOICE_NOTES: "on", LLM_ADAPTER: "fixture" }, opts)?.name).toBe("fixture");
    expect(createTranscriberPort({ VOICE_NOTES: "on", LLM_ADAPTER: "fixture", GROQ_API_KEY: KEY, VERCEL_ENV: "development" }, opts)?.name).toBe("fixture");
  });

  it("refuses the fixture on Vercel preview and production (ruling R27), and never logs the key", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const VERCEL_ENV of ["preview", "production"]) {
      expect(createTranscriberPort({ VOICE_NOTES: "on", LLM_ADAPTER: "fixture", GROQ_API_KEY: KEY, VERCEL_ENV }, opts)).toBeNull();
    }
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
    warn.mockRestore();
  });
});

describe("createFixtureTranscriber", () => {
  it("types every recording out as the same sentence and never reads the bytes", async () => {
    const port = createFixtureTranscriber();
    const file = { bytes: new Uint8Array(0), mime: "audio/webm", name: "a.webm" };
    expect(await port.transcribe(file)).toEqual({ kind: "ok", text: FIXTURE_TRANSCRIPT, seconds: FIXTURE_SECONDS });
  });
});
