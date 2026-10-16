import { readCapped } from "./read-capped";

// The one HTTP call both Resend adapters make (the 2.9 alert mailer, resend-mailer.ts, and the Phase 5c letters adapter,
// resend-letters.ts). No host lives here: each adapter fixes its own addresses. Plain fetch, no SDK, never throws.
//
// The key travels only in the Authorization header. Every request: `redirect: "error"`, `cache: "no-store"`, a timeout, bodies read
// through a byte counter. A refusal keeps Resend's `name` (its error type, e.g. rate_limit_exceeded, daily_quota_exceeded) and its
// `message` cleaned (control characters become spaces, the key is removed) and the `retry-after` seconds, never anything else.

const ERROR_BODY_CAP_BYTES = 8 * 1024;
const NAME = /^[a-z_]{1,64}$/;

export type ResendRequest = {
  method: "GET" | "POST" | "DELETE";
  url: string;
  /** Sent as JSON when present. */
  body?: unknown;
  idempotencyKey?: string;
  /** Read and parse a 2xx body (up to `okBodyCapBytes`). Off: the body is discarded unread. */
  readBody?: boolean;
};

export type ResendReply =
  | { ok: true; status: number; json: unknown }
  | { ok: false; status: number | null; timedOut: boolean; name: string | null; said: string | null; retryAfterSeconds: number | null };

export type ResendClient = {
  call(request: ResendRequest): Promise<ResendReply>;
  /** One line of plain text, the key removed. */
  clean(text: string): string;
};

export function createResendClient(opts: { apiKey: string; fetch: typeof fetch; timeoutMs: number; okBodyCapBytes?: number }): ResendClient {
  const { apiKey, fetch: doFetch, timeoutMs } = opts;
  const okCap = opts.okBodyCapBytes ?? 256 * 1024;
  const clean = (text: string): string => text.replaceAll(apiKey, "[removed]").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

  async function json(response: Response, cap: number): Promise<unknown> {
    try {
      const bytes = await readCapped(response, cap);
      return bytes === "too_big" ? null : (JSON.parse(new TextDecoder().decode(bytes)) as unknown);
    } catch {
      return null;
    }
  }

  return {
    clean,
    async call(request) {
      const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` };
      if (request.body !== undefined) headers["content-type"] = "application/json";
      if (request.idempotencyKey !== undefined) headers["idempotency-key"] = request.idempotencyKey;
      let response: Response;
      try {
        response = await doFetch(request.url, {
          method: request.method,
          headers,
          ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        // The error's kind only: its text can echo the address or a header.
        return { ok: false, status: null, timedOut: error instanceof Error && error.name === "TimeoutError", name: null, said: null, retryAfterSeconds: null };
      }
      if (response.ok) {
        if (!request.readBody) {
          await response.body?.cancel().catch(() => undefined);
          return { ok: true, status: response.status, json: null };
        }
        return { ok: true, status: response.status, json: await json(response, okCap) };
      }
      const retry = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
      const parsed = await json(response, ERROR_BODY_CAP_BYTES);
      const body = typeof parsed === "object" && parsed !== null ? (parsed as { message?: unknown; name?: unknown }) : {};
      const said = typeof body.message === "string" && clean(body.message) ? clean(body.message) : null;
      return {
        ok: false,
        status: response.status,
        timedOut: false,
        name: typeof body.name === "string" && NAME.test(body.name) ? body.name : null,
        said,
        retryAfterSeconds: Number.isFinite(retry) && retry >= 0 && retry <= 86_400 ? retry : null,
      };
    },
  };
}

/** The words a refusal is shown in: fixed text for a timeout or a network error, else the status and Resend's own message. */
export function replyMessage(reply: Extract<ResendReply, { ok: false }>, limit = 160): string {
  if (reply.timedOut) return "Resend did not answer in time";
  if (reply.status === null) return "could not reach Resend";
  return `Resend answered ${reply.status}${reply.said ? `: ${reply.said}` : ""}`.slice(0, limit);
}
