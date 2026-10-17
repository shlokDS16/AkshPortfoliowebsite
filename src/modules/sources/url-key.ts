import { parseYoutubeUrl } from "@/modules/distribution/client";

// The identity of a saved link (spec s6.2, D105): the same page saved twice is one source. Pure; no network, no database.

/** The same bound as source_links.url (migration 0026). */
export const MAX_SOURCE_URL = 2000;

export type UrlKey = { key: string; kind: "youtube" | "web"; youtubeId: string | null };

/** Tracking parameters that never change what the page is (names compared in lower case; any `utm_` name too). */
const TRACKING = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src", "igshid", "si"]);

function parse(raw: string): URL | null {
  const text = raw.trim();
  if (text.length === 0 || text.length > MAX_SOURCE_URL) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  // A link with a user name or password is never stored: it would be shown on a public file and sent on every read.
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username !== "" || url.password !== "" || url.hostname === "") return null;
  return url;
}

function isTracking(pair: string): boolean {
  const eq = pair.indexOf("=");
  let name = eq === -1 ? pair : pair.slice(0, eq);
  try {
    name = decodeURIComponent(name);
  } catch {
    // an undecodable name is compared as written
  }
  name = name.toLowerCase();
  return name.startsWith("utm_") || TRACKING.has(name);
}

/** The key, the kind and (for YouTube) the video id of a link, or null when it is not a link the desk will store. */
export function urlKey(raw: string): UrlKey | null {
  const url = parse(raw);
  if (!url) return null;
  const id = parseYoutubeUrl(url.href);
  if (id !== null) return { key: `yt:${id}`, kind: "youtube", youtubeId: id };
  const host = url.host.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  const pairs = url.search
    .slice(1)
    .split("&")
    .filter((pair) => pair !== "" && !isTracking(pair))
    .sort();
  return { key: `${host}${path}${pairs.length > 0 ? `?${pairs.join("&")}` : ""}`, kind: "web", youtubeId: null };
}

/** Share and player parameters that YouTube adds to a link (compared in lower case); dropped on a YouTube link only. */
const YOUTUBE_SHARE = new Set(["si", "feature", "pp"]);
/** Dropped on every link when it is saved: `utm_*`, `fbclid`, `gclid`. */
const SAVED_TRACKING = new Set(["fbclid", "gclid"]);

function paramName(pair: string): string {
  const eq = pair.indexOf("=");
  let name = eq === -1 ? pair : pair.slice(0, eq);
  try {
    name = decodeURIComponent(name);
  } catch {
    // an undecodable name is compared as written
  }
  return name.toLowerCase();
}

/**
 * The link as it is saved, as the browser normalises it (lower-case scheme and host, spaces and non-ASCII percent-encoded), `http` upgraded to `https`,
 * without tracking parameters (`utm_*`, `fbclid`, `gclid` anywhere; `si`, `feature`, `pp` on a YouTube link). Everything else, in its order and
 * encoding, is kept. Null when `urlKey` refuses it or the normalised address is over 2,000 characters.
 */
export function cleanSourceUrl(raw: string): string | null {
  if (urlKey(raw) === null) return null;
  const url = new URL(raw.trim());
  url.protocol = "https:";
  const youtube = parseYoutubeUrl(url.href) !== null;
  if (url.search.length > 1) {
    const kept = url.search
      .slice(1)
      .split("&")
      .filter((pair) => {
        const name = paramName(pair);
        return !(name.startsWith("utm_") || SAVED_TRACKING.has(name) || (youtube && YOUTUBE_SHARE.has(name)));
      });
    url.search = kept.join("&");
  }
  return url.href.length <= MAX_SOURCE_URL ? url.href : null;
}
