import dns from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { pipeline, type Readable } from "node:stream";
import type { Address, Resolver, Transport, TransportResponse } from "./safe-fetch";

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

/** One GET over TLS to port 443 of the vetted address. Certificates are checked as Node does by default. */
export const httpsTransport: Transport = ({ url, addresses, signal }) =>
  new Promise<TransportResponse>((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const request = https.request(
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
