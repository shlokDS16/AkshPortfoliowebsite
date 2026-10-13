import { type AnchorMiss, type AnchorPort, type AnchorRead, type AnchorWrite, anchorFileProblem, anchorWriteGate } from "./anchor";
import { readCapped } from "./read-capped";

// The GitHub Gist adapter (spec s9, ADR-005 s2 and s3.3, Plan 3a Task 8). It reads and writes ONE file of ONE public gist
// the owner created by hand, so a reader who kept a copy of a line can see if it was changed later.
//
// Outbound rules: the host is fixed in code and the only path is `/gists/<id>` with an id this file validated (lowercase
// hex), so nothing else can ever shape the address; https only; `redirect: "error"`; `cache: "no-store"`; a timeout on
// every call; the body is read through a counter that stops at a byte cap (never Content-Length). Every outcome is a typed
// result, never a throw. The token travels only in the Authorization header. Nothing is logged, and no outcome carries the
// token, the gist id, an address, or any part of GitHub's answer: messages are fixed text (a status number at most).
//
// Facts relied on, read 2026-10-13 (docs.github.com/en/rest/gists/gists, .../using-the-rest-api/rate-limits-for-the-rest-api,
// .../best-practices-for-using-the-rest-api): GET and PATCH /gists/{id}; PATCH takes `files: { name: { content } }`; the
// API returns up to one megabyte of a file's content and marks a larger one `truncated`; the history items carry `version`
// and `committed_at`; rate limits answer 403 or 429 with `retry-after` or `x-ratelimit-remaining: 0`; PATCH has NO
// conditional header (no If-Match, no ETag use), so `write` is read-check-then-write, not atomic.

export const GIST_HOST = "api.github.com";
const GIST_ID = /^[0-9a-f]{20,40}$/;
/** Classic and fine-grained tokens are letters, digits, underscore and (defensively) dot and hyphen; never a space or a control character. */
const TOKEN_SHAPE = /^[A-Za-z0-9_.-]{20,255}$/;
const VERSION = /^[0-9a-f]{7,64}$/;
const DEFAULT_CALL_MS = 7_000;
const DEFAULT_READ_BUDGET_MS = 7_000;
const DEFAULT_WRITE_BUDGET_MS = 15_000;
const MAX_MS = 60_000;
/**
 * The most the adapter will receive in one answer. The file is at most about 1 MB, but the answer also lists the gist's
 * revisions (up to 3,000, each carrying a user object), and the anchor commits once a day, so the list alone grows by
 * roughly half a megabyte a year. THAT SIZE IS AN UNMEASURED ESTIMATE (no request was made when this was written), and the
 * answer may also list forks (anyone can fork a public gist), which the owner does not control. 8 MB leaves years of
 * room; passing it is `too_large` (fail closed: nothing is written). On the first live use, compare this cap with the
 * real response size and record the figure in ADR-005 s2.
 */
const RESPONSE_CAP_BYTES = 8 * 1024 * 1024;
const HINT_BYTES = 8 * 1024;
const NO_TIME: AnchorMiss = { kind: "provider_error", message: "no time left for the GitHub call" };

export type GithubGistOptions = {
  token: string;
  gistId: string;
  fetch?: typeof fetch;
  /** The most any one HTTP call may take (default 7 s). The whole operation's time comes from `opts.timeoutMs`. */
  callTimeoutMs?: number;
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

function retryAfterSeconds(header: string | null): number | null {
  if (header === null || !/^\d{1,6}$/.test(header.trim())) return null;
  const seconds = Number(header.trim());
  return seconds <= 86_400 ? seconds : null;
}

/** The newest revision ids GitHub listed, newest first; an unreadable one is null. */
function versionsOf(gist: Json): Array<string | null> {
  if (!Array.isArray(gist.history)) return [];
  return gist.history.slice(0, 2).map((item) => (isObject(item) && typeof item.version === "string" && VERSION.test(item.version) ? item.version : null));
}

type Found = { kind: "file"; text: string } | { kind: "absent" } | { kind: "too_large" } | { kind: "bad" };

function fileOf(gist: Json, file: string): Found {
  const files = gist.files;
  if (!isObject(files)) return { kind: "bad" };
  if (!Object.hasOwn(files, file)) return gist.truncated === true ? { kind: "too_large" } : { kind: "absent" };
  const entry = files[file];
  if (!isObject(entry)) return { kind: "bad" };
  // Whole only when the answer says so. A missing or odd `truncated` is never trusted: a short read could let a write pass.
  if (entry.truncated !== false) return { kind: "too_large" };
  return typeof entry.content === "string" ? { kind: "file", text: entry.content } : { kind: "bad" };
}

/** The file's content in a PATCH answer, whatever flags it carries; the caller proves it whole by equality with what it sent. */
function echoedContent(gist: Json, file: string): string | null {
  const files = gist.files;
  if (!isObject(files) || !Object.hasOwn(files, file)) return null;
  const entry = files[file];
  return isObject(entry) && typeof entry.content === "string" ? entry.content : null;
}

export function createGithubGistAnchor(opts: GithubGistOptions): AnchorPort {
  // Neither the token nor the id is ever put in these messages.
  if (!GIST_ID.test(opts.gistId)) throw new Error("the anchor gist id must be 20 to 40 lowercase hex characters");
  if (!TOKEN_SHAPE.test(opts.token)) throw new Error("the GitHub token does not have the shape of a GitHub token");
  const callMs = opts.callTimeoutMs ?? DEFAULT_CALL_MS;
  if (!(Number.isInteger(callMs) && callMs >= 1 && callMs <= MAX_MS)) {
    throw new Error(`the GitHub timeout must be a whole number of milliseconds from 1 to ${MAX_MS}`);
  }
  const doFetch = opts.fetch ?? fetch;
  const address = `https://${GIST_HOST}/gists/${opts.gistId}`;
  const headers = {
    authorization: `Bearer ${opts.token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "aksh-research-desk",
  };

  /** One operation's time: a total (floored, capped; NaN, zero or negative is already spent), shared by its HTTP calls. */
  function clock(total: number | undefined, fallback: number): (() => number | null) | null {
    const ms = Math.min(Math.floor(total ?? fallback), MAX_MS);
    if (!(ms >= 1)) return null;
    const end = performance.now() + ms;
    return () => {
      const left = Math.min(callMs, Math.floor(end - performance.now()));
      return left >= 1 ? left : null;
    };
  }

  const failed = (error: unknown): AnchorMiss => ({
    kind: "provider_error",
    // The error's kind only: its message can echo the address or a header.
    message: error instanceof Error && error.name === "TimeoutError" ? "GitHub did not answer in time" : "could not reach GitHub",
  });

  async function send(method: "GET" | "PATCH", ms: number, body?: string): Promise<Response | AnchorMiss> {
    try {
      return await doFetch(address, {
        method,
        headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
        body,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(ms),
      });
    } catch (error) {
      return failed(error);
    }
  }

  /** What a non-200 answer means. The body is read (a little) only to tell a rate limit from a refusal, and is never kept. */
  async function missFor(response: Response, writing: boolean): Promise<AnchorMiss> {
    const status = response.status;
    if (status === 401) return drop(response, { kind: "unauthorized" });
    if (status === 404) return drop(response, { kind: "absent", what: "gist" });
    if (status === 429) return drop(response, { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response.headers.get("retry-after")) });
    if (status === 403) {
      let hint = "";
      try {
        const bytes = await readCapped(response, HINT_BYTES);
        hint = bytes === "too_big" ? "" : new TextDecoder().decode(bytes).toLowerCase();
      } catch {
        hint = "";
      }
      if (response.headers.has("retry-after") || response.headers.get("x-ratelimit-remaining") === "0" || hint.includes("rate limit")) {
        return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response.headers.get("retry-after")) };
      }
      return { kind: "unauthorized" };
    }
    if (writing && status === 422) return drop(response, { kind: "provider_error", message: "GitHub rejected the update (HTTP 422)" });
    return drop(response, { kind: "provider_error", message: `GitHub answered HTTP ${status}` });
  }

  async function drop<T extends AnchorWrite>(response: Response, miss: T): Promise<T> {
    await response.body?.cancel().catch(() => undefined);
    return miss;
  }

  /** The answer as a JSON object, or why not. A wrapper, so a field GitHub sends can never be mistaken for an outcome. */
  async function parse(response: Response): Promise<{ gist: Json } | { miss: AnchorMiss }> {
    const unexpected = { miss: { kind: "provider_error", message: "the GitHub answer was not what was expected" } } as const;
    let bytes: Uint8Array | "too_big";
    try {
      bytes = await readCapped(response, RESPONSE_CAP_BYTES);
    } catch (error) {
      return { miss: failed(error) };
    }
    if (bytes === "too_big") return { miss: { kind: "too_large" } };
    try {
      const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      return isObject(value) ? { gist: value } : unexpected;
    } catch {
      return unexpected;
    }
  }

  /** The file as the gist holds it now, or why not. */
  async function look(file: string, ms: number): Promise<{ kind: "seen"; text: string | null; version: string | null } | AnchorMiss> {
    const response = await send("GET", ms);
    if (!(response instanceof Response)) return response;
    if (response.status !== 200) return missFor(response, false);
    const parsed = await parse(response);
    if ("miss" in parsed) return parsed.miss;
    const { gist } = parsed;
    const found = fileOf(gist, file);
    if (found.kind === "bad") return { kind: "provider_error", message: "the GitHub answer was not what was expected" };
    if (found.kind === "too_large") return { kind: "too_large" };
    return { kind: "seen", text: found.kind === "file" ? found.text : null, version: versionsOf(gist)[0] ?? null };
  }

  return {
    name: "github-gist",
    publicUrl: `https://gist.github.com/${opts.gistId}`,

    async read(file, call): Promise<AnchorRead> {
      const problem = anchorFileProblem(file);
      if (problem) return { kind: "invalid_request", message: problem };
      const next = clock(call?.timeoutMs, DEFAULT_READ_BUDGET_MS);
      const ms = next?.() ?? null;
      if (next === null || ms === null) return NO_TIME;
      const seen = await look(file, ms);
      if (seen.kind !== "seen") return seen;
      return seen.text === null ? { kind: "absent", what: "file" } : { kind: "ok", text: seen.text, version: seen.version };
    },

    async write(file, text, call): Promise<AnchorWrite> {
      // Append-only and the no-op are decided before any request (anchor.ts): the port cannot shorten or replace a published byte.
      const gate = anchorWriteGate(file, text, call.expected);
      if (gate) return gate;
      const next = clock(call.timeoutMs, DEFAULT_WRITE_BUDGET_MS);
      const checkMs = next?.() ?? null;
      if (next === null || checkMs === null) return NO_TIME;

      // The check. GitHub offers no conditional update, so this second read is as close as the adapter can get.
      // Every outcome up to here means NOTHING was sent.
      const seen = await look(file, checkMs);
      if (seen.kind !== "seen") return seen;
      if (seen.text !== call.expected) return { kind: "changed", found: seen.text, version: seen.version };

      const patchMs = next();
      if (patchMs === null) return NO_TIME;
      // From here the request may have reached GitHub: anything that is not a clear refusal is `unconfirmed`.
      const unconfirmed = (message: string): AnchorWrite => ({ kind: "unconfirmed", message });
      const response = await send("PATCH", patchMs, JSON.stringify({ files: { [file]: { content: text } } }));
      if (!(response instanceof Response)) return unconfirmed(`${response.kind === "provider_error" ? response.message : "the request failed"}; the update was sent and the result is not known`);
      const status = response.status;
      if (status === 404) return drop(response, { kind: "cannot_write" }); // the gist was just read: most likely the token cannot write to it
      if (status >= 400 && status < 500) return missFor(response, true); // refused: 401, 403 (or a rate limit), 422, 429, other 4xx
      if (status !== 200) {
        await response.body?.cancel().catch(() => undefined);
        return unconfirmed(`GitHub answered HTTP ${status} to the update; the result is not known`);
      }
      const parsed = await parse(response);
      if ("miss" in parsed) return unconfirmed("the update was accepted but the answer could not be read; the result is not confirmed");
      if (echoedContent(parsed.gist, file) !== text) return unconfirmed("the update was accepted but the answer does not hold what was sent; the result is not confirmed");
      const [newest, before] = versionsOf(parsed.gist);
      if (before === undefined || before === null || seen.version === null) return { kind: "ok", version: newest ?? null, continuity: "unknown" };
      return before === seen.version ? { kind: "ok", version: newest ?? null, continuity: "unbroken" } : { kind: "interrupted", version: newest ?? null };
    },
  };
}
