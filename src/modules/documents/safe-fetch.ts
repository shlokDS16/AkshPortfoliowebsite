import { isIP } from "node:net";
import { DocumentError } from "./errors";
import { isBlockedAddress } from "./ip-guard";
import { bareMime } from "./kinds";
import { LINK_MAX_BYTES, LINK_MAX_REDIRECTS, LINK_TIMEOUT_MS } from "./limits";
import { httpsTransport, systemResolver } from "./safe-fetch-transport";

// Fetches a link Aksh pasted, on the server, so that a link can never reach anything inside the host (Plan 2b Task 5, rulings R1
// and R10). It is the only place the desk requests a user-supplied address. The rules, each tested in safe-fetch.test.ts:
//  - https only, port 443, no user name or password in the link;
//  - the host name is resolved here, every address must be public (ip-guard.ts), and the connection is made to that vetted
//    address (the transport gets the address, never the name to look up again), so DNS rebinding cannot swap it;
//  - at most 2 redirects, each one checked again from scratch;
//  - 50 MB at most, counted while the body streams (a Content-Length is only an early exit); 30 s for everything;
//  - the request carries no cookie and no authorization header (the transport sets its own three headers).

export type Address = { address: string; family: 4 | 6 };
export type Resolver = (hostname: string) => Promise<Address[]>;
/** What the transport may use: the page to GET, the vetted address to connect to, and the abort signal. Nothing else. */
export type TransportRequest = { url: URL; address: Address; signal: AbortSignal };
export type TransportResponse = {
  status: number;
  /** Lower-case header names. */
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
  close: () => void;
};
export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

export type SafeFetchDeps = { resolve?: Resolver; transport?: Transport; timeoutMs?: number; maxBytes?: number };
/** `contentType` is the bare type, lower case; `finalUrl` is the address that answered after any redirects. */
export type FetchedLink = { contentType: string; bytes: Uint8Array; finalUrl: string };

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_LINK_CHARS = 2000;

/** The link as a URL the desk is willing to request, or the refusal. Used for the pasted link and again for every redirect. */
function parseLink(raw: string): URL {
  if (raw.length > MAX_LINK_CHARS) throw new DocumentError("link-invalid");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new DocumentError("link-invalid");
  }
  // The URL parser drops the default port, so any port left is not 443.
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "" || url.hostname === "") {
    throw new DocumentError("link-invalid");
  }
  return url;
}

/** The address to connect to: the host's own address when it is one, else the resolver's answer. Every address must be public. */
async function vetHost(url: URL, resolve: Resolver, signal: AbortSignal): Promise<Address> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const kind = isIP(host);
  const answers = kind === 0 ? await raceAbort(resolve(host), signal) : [{ address: host, family: kind === 6 ? (6 as const) : (4 as const) }];
  if (answers.length === 0) throw new DocumentError("link-failed");
  // One private answer refuses the host, whatever the other answers are.
  if (answers.some((a) => isBlockedAddress(a.address))) throw new DocumentError("link-blocked");
  return answers[0];
}

function aborted(): Error {
  return new DOMException("aborted", "AbortError");
}

/** Settles with `promise`, or rejects as soon as the signal aborts (a DNS lookup or a stalled read cannot be cancelled itself). */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(aborted());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(aborted());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => (signal.removeEventListener("abort", onAbort), resolve(value)),
      (error: unknown) => (signal.removeEventListener("abort", onAbort), reject(error)),
    );
  });
}

/** The body, counted as it arrives: past the cap the read stops and the connection is closed. */
async function readCapped(res: TransportResponse, signal: AbortSignal, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    res.close();
    throw new DocumentError("link-too-large");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const iterator = res.body[Symbol.asyncIterator]();
  try {
    for (;;) {
      const next = await raceAbort(iterator.next(), signal);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw new DocumentError("link-too-large");
      chunks.push(next.value);
    }
  } finally {
    res.close();
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

/** Fetches `link` under the rules above. Throws a DocumentError (fixed text, never the address) for every refusal and failure. */
export async function safeFetch(link: string, deps: SafeFetchDeps = {}): Promise<FetchedLink> {
  const resolve = deps.resolve ?? systemResolver;
  const transport = deps.transport ?? httpsTransport;
  const maxBytes = deps.maxBytes ?? LINK_MAX_BYTES;
  const controller = new AbortController();
  const { signal } = controller;
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? LINK_TIMEOUT_MS);
  try {
    let url = parseLink(link);
    for (let redirects = 0; ; redirects += 1) {
      const address = await vetHost(url, resolve, signal);
      const res = await raceAbort(transport({ url, address, signal }), signal);
      if (REDIRECTS.has(res.status)) {
        res.close();
        if (redirects >= LINK_MAX_REDIRECTS) throw new DocumentError("link-redirects");
        const location = res.headers.location;
        if (!location) throw new DocumentError("link-failed");
        let next: string;
        try {
          next = new URL(location, url).href;
        } catch {
          throw new DocumentError("link-failed");
        }
        url = parseLink(next); // from scratch: scheme, credentials, port, then the address on the next loop
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        res.close();
        throw new DocumentError("link-failed");
      }
      return { contentType: bareMime(res.headers["content-type"] ?? ""), bytes: await readCapped(res, signal, maxBytes), finalUrl: url.href };
    }
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    // The reason (a refused connection, a bad certificate, a reset) is not shown: it can name an address.
    throw new DocumentError(signal.aborted ? "link-timeout" : "link-failed");
  } finally {
    clearTimeout(timer);
    controller.abort(); // nothing may linger after the answer: an unread body, a pending lookup
  }
}
