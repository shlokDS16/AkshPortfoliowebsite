import type { TransportResponse } from "./safe-fetch";

// The made-up answers of the three hosts the sources read (Phase 5d, spec s6.3): YouTube's oEmbed, YouTube's picture server and a blog.
// Served only under LLM_ADAPTER=fixture off Vercel (fixture-link.ts), through the real guard like every other fixture site.
//
// A video's id picks what the fixture says (any other id is a clean video): fxBuyTitle1 has a title with "buy" (rule 1), fxPriceTtl1 a
// title with a rupee price (rule 3), fxMissing01 does not exist, fxNoEmbed01 refuses oEmbed, fxBigThumb1 has a 201 KB picture and
// fxBadThumb1 a "picture" that is not a JPEG. A blog post's name does the same on blog.test: /post/buy, /post/price, /post/plain
// (no title at all), /post/long (a title, then more than 1 MB), /post/<anything else> (clean), and /doc.pdf (not a page).

export const enc = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
export const reply = (status: number, headers: Record<string, string>, body: Uint8Array = new Uint8Array(0)): TransportResponse => ({
  status,
  headers,
  body: (async function* () {
    yield body;
  })(),
  close: () => undefined,
});

export const SOURCE_FIXTURE_HOSTS: ReadonlySet<string> = new Set(["www.youtube.com", "i.ytimg.com"]);

/** A JPEG of one pixel (the usual smallest one), with a comment segment carrying `tag` so each video's picture has its own bytes. */
export function fixtureJpeg(tag: string): Uint8Array {
  const base = Uint8Array.from(
    Buffer.from(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
      "base64",
    ),
  );
  const comment = enc(tag);
  const length = comment.length + 2;
  const out = new Uint8Array(base.length + comment.length + 4);
  out.set(base.subarray(0, 2), 0); // the start-of-image marker
  out.set([0xff, 0xfe, length >> 8, length & 0xff], 2);
  out.set(comment, 6);
  out.set(base.subarray(2), 6 + comment.length);
  return out;
}

const TITLES: Record<string, string> = {
  fxBuyTitle1: "Five stocks to buy now",
  fxPriceTtl1: "Why it was trading at Rs 450 a share",
};
const json = (value: unknown) => reply(200, { "content-type": "application/json; charset=utf-8" }, enc(JSON.stringify(value)));

function oembed(url: URL): TransportResponse {
  const nested = url.searchParams.get("url") ?? "";
  const id = /[?&]v=([A-Za-z0-9_-]{11})(?:&|$)/.exec(nested)?.[1];
  if (url.searchParams.get("format") !== "json" || !id) return reply(400, { "content-type": "text/plain" }, enc("bad request"));
  if (id === "fxMissing01") return reply(404, { "content-type": "text/plain" }, enc("Not Found"));
  if (id === "fxNoEmbed01") return reply(401, { "content-type": "text/plain" }, enc("Unauthorized"));
  return json({
    title: TITLES[id] ?? `Fixture video ${id}: how to read a balance sheet`,
    author_name: "Fixture Channel",
    author_url: "https://www.youtube.com/@fixturechannel",
    // oEmbed's own picture address: the desk never follows it (it builds the address from the id), so a test can tell.
    thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    provider_name: "YouTube",
    type: "video",
  });
}

function thumbnail(id: string): TransportResponse {
  const headers = { "content-type": "image/jpeg" };
  if (id === "fxMissing01") return reply(404, { "content-type": "text/plain" }, enc("Not Found"));
  if (id === "fxBadThumb1") return reply(200, headers, enc("<html>this is not a picture</html>"));
  if (id === "fxBigThumb1") {
    const big = new Uint8Array(201 * 1024);
    big.set([0xff, 0xd8, 0xff]);
    return reply(200, headers, big);
  }
  return reply(200, headers, fixtureJpeg(id));
}

const HTML = { "content-type": "text/html; charset=utf-8" };

function post(name: string): TransportResponse {
  if (name === "plain") return reply(200, HTML, enc("<html><head></head><body><p>No title here.</p></body></html>"));
  const title = name === "buy" ? "Five stocks to buy now" : name === "price" ? "Trading at Rs 450 a share, a look" : `A reading of the annual report: ${name}`;
  const head = `<html><head><title>${title} | The Fixture Blog</title><meta property="og:title" content="${title}"><meta property="og:site_name" content="The Fixture Blog"></head><body>`;
  const padding = name === "long" ? "<p>padding padding padding padding padding</p>".repeat(30_000) : "<p>Body text the desk never reads.</p>";
  return reply(200, HTML, enc(`${head}${padding}</body></html>`));
}

/** The reply of a source fixture host, or null when the address is not one of theirs (fixture-link.ts then goes on to the other sites). */
export function sourceFixture(url: URL): TransportResponse | null {
  if (url.hostname === "www.youtube.com" && url.pathname === "/oembed") return oembed(url);
  if (url.hostname === "i.ytimg.com") {
    const id = /^\/vi\/([A-Za-z0-9_-]{11})\/mqdefault\.jpg$/.exec(url.pathname)?.[1];
    return id ? thumbnail(id) : reply(404, { "content-type": "text/plain" }, enc("not found"));
  }
  if (url.hostname === "blog.test") {
    const [first, name = "x"] = url.pathname.split("/").filter(Boolean);
    if (first === "post") return post(name);
    if (first === "doc.pdf") return reply(200, { "content-type": "application/pdf" }, enc("%PDF-1.4 fixture"));
  }
  return null;
}
