import type { Address, Resolver, SafeFetchDeps, Transport, TransportResponse } from "./safe-fetch";

// The link fetch's stand-in for local e2e and CI (Plan 2b Task 5, rulings R18 and R27): a DNS table and a transport that serve a
// few made-up sites, so a test can follow a link without a network. It replaces only the two things safeFetch takes as inputs;
// the guard (https only, public addresses only, redirects, the byte cap) runs on the fixture's answers exactly as in production.
// createLinkFetchDeps refuses it on a Vercel preview or production deployment.

const PUBLIC: Address = { address: "93.184.216.34", family: 4 };
const PRIVATE: Address = { address: "10.0.0.5", family: 4 };
const enc = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/** Made-up hosts: every name ends in .test; `internal.test` answers a private address (to see the guard refuse it); others do not exist. */
export const fixtureResolver: Resolver = async (host) => {
  if (host === "internal.test") return [PRIVATE];
  if (host.endsWith(".test")) return [PUBLIC];
  throw new Error("ENOTFOUND");
};

/** A one-page text PDF (Helvetica, no escapes needed: the lines hold no parentheses or backslashes). */
function fixturePdf(lines: string[]): Uint8Array {
  const content = ["BT", "/F1 10 Tf", "14 TL", "40 800 Td", ...lines.map((l) => `(${l}) Tj T*`), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc(out);
}

const reply = (status: number, headers: Record<string, string>, body: Uint8Array = new Uint8Array(0)): TransportResponse => ({
  status,
  headers,
  body: (async function* () {
    yield body;
  })(),
  close: () => undefined,
});

/**
 * What the made-up sites say. `/<anything>.pdf` on bse.test is a one-page results PDF carrying that name (so a test makes its own
 * bytes); `/q/<name>` on results.test is a results page with a table; `/go/<name>` on redirect.test sends on to it.
 */
export const fixtureTransport: Transport = async ({ url }) => {
  const [first, name = "x"] = url.pathname.split("/").filter(Boolean);
  if (url.hostname === "bse.test" && first?.endsWith(".pdf")) {
    const lines = [
      "Consolidated Statement of Profit and Loss", "for the year ended March 31, 2026", "(Rs. in crore)",
      "Revenue from operations 1,284.00 1,102.00", "Finance costs 41.20 38.90", "Profit for the year 152.60 118.30", `Fixture link ${first.replace(/[^A-Za-z0-9.-]/g, "")}`,
    ];
    return reply(200, { "content-type": "application/pdf" }, fixturePdf(lines));
  }
  if (url.hostname === "results.test" && first === "q") {
    const page = `<html><head><title>Quarterly results ${name}</title><style>td { color: red }</style><script>var hidden = "Revenue 9,999.00";</script></head>
      <body><h1>Quarterly results table ${name}</h1><p>All figures in Rs. crore.</p><table>
      <tr><th>Particulars</th><th>Quarter ended June 30, 2026</th><th>Quarter ended June 30, 2025</th></tr>
      <tr><td>Revenue from operations</td><td>412.60</td><td>371.20</td></tr>
      <tr><td>Finance costs</td><td>12.40</td><td>13.10</td></tr>
      <tr><td>Profit for the quarter</td><td>38.90</td><td>31.50</td></tr></table></body></html>`;
    return reply(200, { "content-type": "text/html; charset=utf-8" }, enc(page));
  }
  if (url.hostname === "redirect.test" && first === "go") return reply(302, { location: `https://results.test/q/${name}` });
  return reply(404, { "content-type": "text/plain" }, enc("not found"));
};

/** The slice of the server env that picks the link fetch's inputs (passed in; this file never reads process.env). */
export type LinkFetchEnv = { LLM_ADAPTER?: "groq" | "fixture"; VERCEL_ENV?: string };

const DEPLOYED = new Set(["preview", "production"]);

/**
 * The real DNS and HTTPS (an empty object), or, when LLM_ADAPTER=fixture off Vercel, the made-up sites. On a Vercel deployment the
 * fixture is refused (ruling R27): a stray variable must never put made-up pages on Aksh's desk, so links stay real.
 */
export function createLinkFetchDeps(env: LinkFetchEnv): SafeFetchDeps {
  if (env.LLM_ADAPTER !== "fixture") return {};
  if (env.VERCEL_ENV && DEPLOYED.has(env.VERCEL_ENV)) {
    console.error("links: LLM_ADAPTER=fixture is refused on a Vercel deployment; links are fetched for real");
    return {};
  }
  return { resolve: fixtureResolver, transport: fixtureTransport };
}
