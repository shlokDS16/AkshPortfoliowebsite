// The anchor port (spec s9, ADR-005 s3.3, Plan 3a Task 8). Types and two tiny shared pieces only; the adapters are
// github-gist.ts (the real one), fixture-anchor.ts (local e2e and CI) and the "off" adapter below.
//
// What the port is for: the daily step compares the WHOLE published file with the database before it adds a line, so
// the port reads the whole file and writes the whole file. Nothing here compares anything (that is Task 9).
//
// What the port gives, and does not give (be exact; the anchor step is built on this):
//  - `read` returns the complete current text of one file, or a typed reason it could not.
//  - `write(file, text, { expected })` replaces the file with `text` ONLY IF the file, read again just before the write,
//    is still exactly `expected` (null means "the file does not exist yet"). Otherwise it writes nothing and answers
//    `changed` with what it found.
//  - GitHub offers NO conditional update for gists (no If-Match, no ETag on PATCH: docs.github.com/en/rest/gists/gists,
//    read 2026-10-13). So the GitHub adapter's check is a second read followed by a write: a window of a few hundred
//    milliseconds remains in which someone else could commit and be overwritten. It is NOT atomic. After the write the
//    adapter compares the revision list GitHub returns with the revision it checked and reports `continuity`:
//    "interrupted" means a commit slipped in between (GitHub keeps it in the gist's history).
//  - A timeout or a lost connection DURING the write is `provider_error` and means "unknown whether it was applied".
//  - The gist's owner can rewrite or delete the gist; the port proves nothing about that (ADR-005 s6).

/** Why a call produced nothing. Messages are fixed text: no address, no token, no gist id, no response body. */
export type AnchorMiss =
  /** No token or no gist id is set: the anchor is sealed in the database and simply not published. The default. */
  | { kind: "not_configured" }
  /** The gist (or, for `read` only, the file in it) does not exist. */
  | { kind: "absent"; what: "gist" | "file" }
  /** 401, or 403 that is not a rate limit: the token is wrong, expired, or lacks "Gists: write". */
  | { kind: "unauthorized" }
  /** 429, or 403 carrying a rate-limit sign (retry-after, remaining 0, or the words in the answer). */
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  /** The file is larger than the API returns whole (the API marks it truncated), or the answer passed the byte cap. */
  | { kind: "too_large" }
  /** Timeout, network failure, a redirect, 5xx or any other status, or an answer that is not what GitHub sends. */
  | { kind: "provider_error"; message: string }
  /** The caller asked for something the port refuses before any request: a bad file name, empty or oversize text. */
  | { kind: "invalid_request"; message: string };

export type AnchorRead = { kind: "ok"; text: string; version: string | null } | AnchorMiss;

export type AnchorWrite =
  | {
      kind: "ok";
      /** The gist's newest revision after the write, when GitHub said. */
      version: string | null;
      /** False when the file already held exactly `text`: nothing was sent. */
      wrote: boolean;
      /** Whether the revision before ours was the one that was checked. "unknown" when GitHub's list was not readable. */
      continuity: "unbroken" | "interrupted" | "unknown";
    }
  /** The precondition failed: nothing was written. `found` is the file as it stands now (null: no such file). */
  | { kind: "changed"; found: string | null; version: string | null }
  | AnchorMiss;

export interface AnchorPort {
  readonly name: "github-gist" | "fixture" | "off";
  /** Where a reader can see the file; null when nothing is published. */
  readonly publicUrl: string | null;
  read(file: string, opts?: { timeoutMs?: number }): Promise<AnchorRead>;
  write(file: string, text: string, opts: { expected: string | null; timeoutMs?: number }): Promise<AnchorWrite>;
}

/** The largest file the port reads or writes whole: the Gist API returns up to one megabyte of a file's content. */
export const MAX_ANCHOR_FILE_BYTES = 1_000_000;

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** A name the port will use as a key in a gist: plain characters, no path, no leading dot, no "..". */
export function anchorFileProblem(file: string): string | null {
  return FILE_NAME.test(file) && !file.includes("..") ? null : "the anchor file name is not allowed";
}

/** The problem with text to be written, or null. */
export function anchorTextProblem(text: string): string | null {
  if (text.length === 0) return "the anchor file cannot be empty";
  if (new TextEncoder().encode(text).byteLength > MAX_ANCHOR_FILE_BYTES) return "the anchor file is larger than the gist API returns whole";
  return null;
}

/** Nothing is configured: every call answers `not_configured` and nothing leaves the process. */
export function createOffAnchor(): AnchorPort {
  const off: AnchorMiss = { kind: "not_configured" };
  return {
    name: "off",
    publicUrl: null,
    read: async () => off,
    write: async () => off,
  };
}
