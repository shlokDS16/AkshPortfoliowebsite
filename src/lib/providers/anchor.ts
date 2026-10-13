// The anchor port (spec s9 and s26, ADR-005 s3.3, Plan 3a Task 8 and its fix round 1). Types and a few tiny shared pieces;
// the adapters are github-gist.ts (the real one), fixture-anchor.ts (local e2e and CI) and the "off" adapter below.
//
// What the port is for: the daily step compares the WHOLE published file with the database before it adds a line, so
// the port reads the whole file and APPENDS to it. Nothing here compares anything with the database (that is Task 9).
//
// THE CONTRACT, exactly (the anchor step is built on this):
//  - `read` returns the complete current text of one file, or a typed reason it could not. It never returns part of a file.
//  - `write(file, text, { expected })` is APPEND-ONLY. `text` must begin with `expected` (null means "the file does not
//    exist yet" and allows any text). Anything else is `invalid_request` and nothing is sent: the port never removes or
//    alters a byte that was published. `text === expected` is `nothing_to_add` and nothing is sent.
//  - The write is sent only if the file, read again just before the write, is still exactly `expected`. Otherwise
//    `changed` (with what was found) and nothing is written.
//  - GitHub offers NO conditional update for gists (no If-Match, no ETag on PATCH: docs.github.com/en/rest/gists/gists,
//    read 2026-10-13). So the check is a second read followed by a write. It is NOT atomic: between the answer to the check
//    and the PATCH being applied another writer could commit and be overwritten. That window is normally well under a
//    second; it is bounded only by the operation's time budget (15 s by default, 60 s at most). After a write the adapter
//    compares the revision list GitHub returns with the revision it checked: if another commit sits between, the outcome
//    is `interrupted`. The newest-first order of GitHub's `history` list is assumed (not verified), so `interrupted`
//    and the `continuity` field are advisory.
//  - The gist's owner can rewrite or delete the gist; the port proves nothing about that (ADR-005 s6).
//
// WHAT EACH WRITE OUTCOME MEANS FOR THE FILE ON THE SERVER:
//    ok               written, and GitHub's answer holds exactly the text sent.
//    interrupted      written (the answer holds our text), BUT another commit was seen between the check and the write
//                     and may have been overwritten. Record the publish and fail the step.
//    unconfirmed      the PATCH was sent and the result is UNKNOWN (it may be applied or not). Read before anything else.
//    nothing_to_add   not sent (text equals expected).
//    changed          not written (precondition failed).
//    every other kind NOT written, and not sent, or refused by GitHub: `provider_error`, `unauthorized`, `rate_limited`,
//                     `too_large`, `absent`, `cannot_write`, `invalid_request`, `not_configured`. In particular a
//                     `provider_error` from `write` ALWAYS means nothing was written.

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
  /** The file is not returned whole (the API does not say `truncated: false`), or the answer passed the byte cap. */
  | { kind: "too_large" }
  /** Timeout, network failure, a redirect, 5xx or any other status, or an answer that is not what GitHub sends. For `write`: NOTHING was written. */
  | { kind: "provider_error"; message: string }
  /** The caller asked for something the port refuses before any request: a bad file name, empty or oversize text, text that does not begin with `expected`. */
  | { kind: "invalid_request"; message: string };

export type AnchorRead = { kind: "ok"; text: string; version: string | null } | AnchorMiss;

export type AnchorWrite =
  | {
      kind: "ok";
      /** The gist's newest revision after the write, when GitHub said. */
      version: string | null;
      /** "unbroken": the revision before ours is the one checked. "unknown": GitHub's revision list was not readable. */
      continuity: "unbroken" | "unknown";
    }
  /** Written, but another commit was seen between the check and the write (GitHub keeps it in the gist's history). */
  | { kind: "interrupted"; version: string | null }
  /** The PATCH was sent and it is NOT KNOWN whether GitHub applied it. Read the file again before doing anything else. */
  | { kind: "unconfirmed"; message: string }
  /** Nothing was written: the file is not what was expected. `found` is the file as it stands now (null: no such file). */
  | { kind: "changed"; found: string | null; version: string | null }
  /** Nothing was sent: the new text equals the expected text, so there is nothing to append. */
  | { kind: "nothing_to_add" }
  /** The gist was read a moment ago but GitHub refused the update as "not found": the token most likely lacks "Gists: write" or the gist is not the owner's. Nothing was written. */
  | { kind: "cannot_write" }
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

/** Append-only: the new text must begin with what is published (`null`: nothing is, any text may start the file). */
export function anchorAppendProblem(text: string, expected: string | null): string | null {
  return expected === null || text.startsWith(expected) ? null : "the new text must begin with the text already published";
}

/**
 * What a write may do before any request is made: a refusal, a no-op, or null (go on). Shared by both adapters so they
 * cannot disagree.
 */
export function anchorWriteGate(file: string, text: string, expected: string | null): AnchorWrite | null {
  const problem = anchorFileProblem(file) ?? anchorTextProblem(text) ?? anchorAppendProblem(text, expected);
  if (problem) return { kind: "invalid_request", message: problem };
  return text === expected ? { kind: "nothing_to_add" } : null;
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
