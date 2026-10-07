import "server-only";
import type { LlmPort, LlmRequest, LlmResult, LlmUsage, RateHeaders } from "./llm";
import { strictJsonSchema } from "./strict-schema";

// The Groq adapter (ADR-004 s3.5, spec s9). Verified 2026-10-07 against:
//   https://console.groq.com/docs/api-reference   (endpoint, max_completion_tokens, include_reasoning, usage)
//   https://console.groq.com/docs/structured-outputs (response_format json_schema, strict: true on gpt-oss-120b)
//   https://console.groq.com/docs/reasoning        (gpt-oss: reasoning_effort low|medium|high, include_reasoning)
//   https://console.groq.com/docs/rate-limits      (x-ratelimit-* headers; retry-after in seconds, on 429 only)
// Never logs: the key, the request body and the answer stay out of every log line and every returned message.

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 90_000;
const NO_RATE: RateHeaders = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };
const num = (v: string | null): number | null => (v === null || v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function readRate(h: Headers): RateHeaders {
  return {
    remainingTokens: num(h.get("x-ratelimit-remaining-tokens")),
    remainingRequests: num(h.get("x-ratelimit-remaining-requests")),
    retryAfterSeconds: num(h.get("retry-after")),
  };
}

function readUsage(u: unknown): LlmUsage | null {
  const o = u as { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown } | null;
  return o && typeof o.total_tokens === "number"
    ? { promptTokens: Number(o.prompt_tokens ?? 0), completionTokens: Number(o.completion_tokens ?? 0), totalTokens: o.total_tokens }
    : null;
}

type Body = {
  error?: { code?: string; message?: string };
  usage?: unknown;
  choices?: { finish_reason?: string; message?: { content?: unknown } }[];
};

export function createGroqLlm(opts: { apiKey: string; fetch?: typeof fetch; timeoutMs?: number }): LlmPort {
  const doFetch = opts.fetch ?? fetch;
  return {
    name: "groq",
    async complete<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
      const body = {
        model: req.model,
        temperature: 0,
        max_completion_tokens: req.maxCompletionTokens,
        ...(req.reasoningEffort ? { reasoning_effort: req.reasoningEffort, include_reasoning: false } : {}),
        response_format: { type: "json_schema", json_schema: { name: req.schemaName, schema: strictJsonSchema(req.schema), strict: true } },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      };
      let res: Response;
      try {
        res = await doFetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          // The step's remaining budget wins, so a call never outlives its function (ruling R3).
          signal: AbortSignal.timeout(req.timeoutMs ?? opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
      } catch (error) {
        // The error's name only (TypeError, TimeoutError): messages can carry the URL or request details.
        return { kind: "provider_error", status: null, message: error instanceof Error ? error.name : "network", rate: NO_RATE };
      }
      const rate = readRate(res.headers);
      if (res.status === 429) return { kind: "rate_limited", rate };
      const json = (await res.json().catch(() => null)) as Body | null;
      if (!res.ok) {
        // Strict mode can still refuse a generation (400 json_validate_failed; Groq community reports, 2026).
        // failed_generation is the model's text: never returned.
        if (res.status === 400 && json?.error?.code === "json_validate_failed") {
          return { kind: "invalid", raw: "", issues: [String(json.error.message ?? "json_validate_failed").slice(0, 300)], usage: null, rate };
        }
        // The code, never the message: a 401 message can quote the key it refused.
        return { kind: "provider_error", status: res.status, message: String(json?.error?.code ?? res.statusText).slice(0, 200), rate };
      }
      const usage = readUsage(json?.usage);
      const choice = json?.choices?.[0];
      const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
      if (choice?.finish_reason === "length") {
        return { kind: "invalid", raw: content.slice(0, 2000), issues: ["The answer was cut off at max_completion_tokens."], usage, rate };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return { kind: "invalid", raw: content.slice(0, 2000), issues: ["The answer was not JSON."], usage, rate };
      }
      const checked = req.schema.safeParse(parsed);
      if (!checked.success) {
        const issues = checked.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`);
        return { kind: "invalid", raw: content.slice(0, 2000), issues, usage, rate };
      }
      return { kind: "ok", data: checked.data, usage: usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, rate };
    },
  };
}
