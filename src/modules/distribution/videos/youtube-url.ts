// The four YouTube address shapes the capture box accepts (spec s7.1): youtu.be/<id>, youtube.com/watch?v=<id>,
// /shorts/<id> and /live/<id>. No other host: a lookalike is refused, never "close enough". Pure; no network.

const ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_URL = 2000;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);

/** The eleven-character video id in a YouTube address, or null when the text is not one of the four shapes. */
export function parseYoutubeUrl(text: string): string | null {
  const raw = text.trim();
  if (raw.length === 0 || raw.length > MAX_URL) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter((p, i) => p !== "" || i === 0);
  // parts[0] is "" for the leading slash; a single trailing slash is dropped by the filter above.
  const segments = parts.slice(1);
  let id: string | null = null;
  if (host === "youtu.be") {
    if (segments.length === 1) id = segments[0] ?? null;
  } else if (HOSTS.has(host)) {
    if (segments.length === 1 && segments[0] === "watch") {
      const values = url.searchParams.getAll("v");
      if (values.length === 1) id = values[0] ?? null;
    } else if (segments.length === 2 && (segments[0] === "shorts" || segments[0] === "live")) {
      id = segments[1] ?? null;
    }
  }
  return id !== null && ID.test(id) ? id : null;
}
