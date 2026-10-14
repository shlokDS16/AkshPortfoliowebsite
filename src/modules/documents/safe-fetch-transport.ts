import dns from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { pipeline, type Readable } from "node:stream";
import type { Address, Resolver, Transport, TransportRequest, TransportResponse } from "./safe-fetch";

// The two things safeFetch cannot test without a network: the system's DNS answer and the HTTPS request. Both are tiny and
// take everything from safeFetch's already vetted request, so they cannot be pointed anywhere else.

/** The operating system's answer for a host name, every address of it (the caller refuses the host if any one is private). */
export const systemResolver: Resolver = async (hostname) => {
  const answers = await dns.lookup(hostname, { all: true });
  return answers.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
};

type LookupCallback = (error: Error | null, address: string | { address: string; family: number }[], family?: number) => void;

/**
 * A `lookup` for net.connect that ignores the name it is asked about and answers with the vetted addresses, in whichever shape
 * the caller asks for (`all` is set when Node tries several families, and then falls back to the next one). The socket therefore
 * connects only to addresses that were checked: no second resolution can swap them (DNS rebinding).
 */
export function pinnedLookup(pinned: Address[]) {
  return (_hostname: string, options: { all?: boolean } | undefined, callback: LookupCallback): void => {
    if (options?.all) callback(null, pinned.map((a) => ({ address: a.address, family: a.family })));
    else callback(null, pinned[0].address, pinned[0].family);
  };
}

/** Only these request headers are ever sent: no cookie, no authorization, nothing from Aksh's session. */
const REQUEST_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; AkshResearchDesk/1.0)",
  accept: "text/html, application/pdf, text/plain;q=0.9, */*;q=0.1",
  "accept-encoding": "gzip, deflate, br",
} as const;

/** The decoded body: the decoder's output is what the byte cap counts, so a compressed bomb is cut at the cap too. */
function decoded(res: Readable, encoding: string | undefined): Readable | null {
  const name = (encoding ?? "identity").trim().toLowerCase();
  if (name === "" || name === "identity") return res;
  // pipeline passes a failure of the response on to the decoder, so a dropped connection ends the read instead of hanging it.
  if (name === "gzip" || name === "x-gzip") return pipeline(res, createGunzip(), () => undefined);
  if (name === "deflate") return pipeline(res, createInflate(), () => undefined);
  if (name === "br") return pipeline(res, createBrotliDecompress(), () => undefined);
  return null;
}

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * Hosts whose responses Node's strict HTTP parser is known to reject (www.bseindia.com answers with header bytes it refuses:
 * HPE_INVALID_HEADER_TOKEN). A fixed list in code, never user input. A host matches when it is one of these or a sub-domain of
 * one, on a dot boundary ("notbseindia.com" does not match).
 *
 * `insecureHTTPParser` is not limited to a bad header byte: Node has no switch for one rule. Measured on Node 24.14.0 (llhttp 9.3.0),
 * it also admits LF-only line endings (a bare LF inside a header value starts a new header), `Content-Length` together with
 * `Transfer-Encoding: chunked`, obs-fold continuation lines, and any HTTP version. The set follows the Node release in production.
 * What contains it: the size cap and the time cap of safeFetch, the pinned vetted address, one connection per attempt
 * (`agent: false`), and a strict parser again on every redirect hop. See Q24 in docs/project-memory/unanswered-questions.md.
 */
export const LENIENT_PARSER_HOSTS: readonly string[] = ["bseindia.com"];

/** The error Node's strict parser raises for a header it will not accept; the only failure that is ever retried. */
const STRICT_PARSER_REFUSAL = "HPE_INVALID_HEADER_TOKEN";

/** The entry of `allowed` that `hostname` is or sits under, or null. Exact suffix match on a dot boundary, lower case. */
export function lenientHostFor(hostname: string, allowed: readonly string[]): string | null {
  const host = hostname.toLowerCase();
  return allowed.find((entry) => host === entry || host.endsWith(`.${entry}`)) ?? null;
}

export type HttpsTransportDeps = {
  /** The request function (default node:https, looked up at each call). Tests point it at a local server. */
  request?: typeof https.request;
  /** Hosts that may be retried once with the lenient header parser after the strict parser refuses them. */
  lenientHosts?: readonly string[];
};

/**
 * One GET over TLS to port 443 of the vetted address. Certificates are checked as Node does by default. The strict HTTP parser is
 * always used first. Only when it refuses the response headers (HPE_INVALID_HEADER_TOKEN, and no other error: a reset connection or
 * an LF-only answer is not retried) AND the host is on the lenient list is the same request made once more with
 * `insecureHTTPParser`, which admits more than a bad header byte (see LENIENT_PARSER_HOSTS); every other rule (https, the pinned vetted address, the signal, the
 * three request headers, the checks safeFetch makes on the answer) is the same for the retry, and a redirect to another host is
 * a new call of this function, strict again.
 */
export function createHttpsTransport(deps: HttpsTransportDeps = {}): Transport {
  const lenientHosts = deps.lenientHosts ?? LENIENT_PARSER_HOSTS;
  const attempt = ({ url, addresses, signal }: TransportRequest, lenient: boolean) =>
    new Promise<TransportResponse>((resolve, reject) => {
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const request = (deps.request ?? https.request)(
        {
          host,
          port: 443,
          path: `${url.pathname}${url.search}`,
          method: "GET",
          headers: REQUEST_HEADERS,
          lookup: pinnedLookup(addresses),
          // The name goes in the TLS handshake (SNI) and the Host header; an address literal has no name to send.
          servername: isIP(host) ? undefined : host,
          agent: false,
          signal,
          ...(lenient ? { insecureHTTPParser: true } : {}),
        },
        (res) => {
          const body = decoded(res, first(res.headers["content-encoding"]));
          if (!body) {
            res.destroy();
            reject(new Error("unsupported content-encoding"));
            return;
          }
          const headers: Record<string, string | undefined> = {};
          for (const [name, value] of Object.entries(res.headers)) headers[name] = first(value);
          resolve({ status: res.statusCode ?? 0, headers, body, close: () => res.destroy() });
        },
      );
      request.on("error", reject);
      request.end();
    });
  return async (req) => {
    try {
      return await attempt(req, false);
    } catch (error) {
      const entry = (error as { code?: unknown } | null)?.code === STRICT_PARSER_REFUSAL ? lenientHostFor(req.url.hostname, lenientHosts) : null;
      if (entry === null) throw error;
      // The listed domain only, never the link or an address (the log rule of safeFetch).
      console.warn("link fetch: strict header parser refused a listed host, retrying once leniently", entry);
      return attempt(req, true);
    }
  };
}

export const httpsTransport: Transport = createHttpsTransport();
