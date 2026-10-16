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

/** The link as it is saved: trimmed, `http` upgraded to `https`, otherwise as typed. Null when `urlKey` refuses it. */
export function cleanSourceUrl(raw: string): string | null {
  if (urlKey(raw) === null) return null;
  return raw.trim().replace(/^http:/i, "https:");
}
