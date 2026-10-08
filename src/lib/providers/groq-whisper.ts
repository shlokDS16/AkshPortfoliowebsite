import "server-only";
import type { TranscriberPort, TranscriberResult } from "./transcriber";

// The Groq Whisper adapter (spec s9, s16.9). Read 2026-10-08 on https://console.groq.com/docs/speech-to-text and the API
// reference: POST /openai/v1/audio/transcriptions (OpenAI-compatible), multipart `file`, `model`, `language`,
// `response_format` (json | verbose_json | text) and `temperature`; free-tier files up to 25 MB; 10 seconds billed at least.
// verbose_json is asked for because it carries the audio's `duration`, which settles the seconds counted against the hour
// and day allowances; the plain `json` answer has the text only. Every refusal is a typed result, never a throw, and no
// message carries the key, the file or its words.

export const WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const DEFAULT_TIMEOUT_MS = 90_000;

export type GroqWhisperOptions = { apiKey: string; model: string; timeoutMs?: number; fetch?: typeof fetch };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** The reported duration, else the end of the last segment, else null. */
function secondsOf(body: { duration?: unknown; segments?: unknown }): number | null {
  const reported = num(body.duration);
  if (reported !== null) return reported;
  if (!Array.isArray(body.segments)) return null;
  const ends = body.segments.map((s) => num((s as { end?: unknown } | null)?.end)).filter((n): n is number => n !== null);
  return ends.length > 0 ? Math.max(...ends) : null;
}

export function createGroqWhisper(opts: GroqWhisperOptions): TranscriberPort {
  const doFetch = opts.fetch ?? fetch;
  return {
    name: "groq",
    async transcribe(file, callOpts): Promise<TranscriberResult> {
      const form = new FormData();
      form.append("file", new Blob([file.bytes as BlobPart], { type: file.mime }), file.name);
      form.append("model", opts.model);
      form.append("language", "en");
      form.append("response_format", "verbose_json");
      form.append("temperature", "0");

      let res: Response;
      try {
        res = await doFetch(WHISPER_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${opts.apiKey}` },
          body: form,
          // The key rides in a header: a redirect would carry it to another origin, so none is followed.
          redirect: "error",
          signal: AbortSignal.timeout(callOpts?.timeoutMs ?? opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
      } catch (error) {
        // The error's name only (TypeError, TimeoutError): a message can carry the request.
        return { kind: "provider_error", message: error instanceof Error ? error.name : "network" };
      }
      if (res.status === 429) {
        const raw = res.headers.get("retry-after")?.trim();
        const retry = raw ? Number(raw) : Number.NaN;
        return { kind: "rate_limited", retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : null };
      }
      // The status, never the body: a provider message can quote the key or the file name.
      if (!res.ok) return { kind: "provider_error", message: `HTTP ${res.status}` };

      let body: { text?: unknown; duration?: unknown; segments?: unknown };
      try {
        body = (await res.json()) as typeof body;
      } catch {
        return { kind: "provider_error", message: "unreadable answer" };
      }
      if (!body || typeof body.text !== "string") return { kind: "provider_error", message: "unreadable answer" };
      return { kind: "ok", text: body.text.replace(/\u0000/g, "").trim(), seconds: secondsOf(body) };
    },
  };
}
