import { createHash } from "node:crypto";
import { z } from "zod";
import { DocumentError, safeFetch, type SafeFetchDeps } from "@/modules/documents";
import { readPageMeta, SITE_MAX, tidyMachineText, TITLE_MAX } from "./page-meta";

// The three outbound reads (spec s6.3), server only. Each goes through the documents module's `safeFetch` (https and port 443, public
// addresses only, DNS pinned, two redirects at most, a byte cap, a timeout, no cookies), takes its dependencies as an argument and never
// throws: a refusal or a failure comes back as a code. Nothing here names the address it was asked for, in a result or in a log; the
// real transport and resolver are only ever supplied by `createLinkFetchDeps(env)` (the graph test keeps them out of this module).
// What is kept: a title, a channel or site name, a channel address, and a YouTube picture. Never article text, never a page image.

export const READ_TIMEOUT_MS = 10_000;
export const OEMBED_MAX_BYTES = 64 * 1024;
/** The picture bucket's file_size_limit (migration 0026): 200 KB. */
export const THUMB_MAX_BYTES = 200 * 1024;
export const PAGE_PREFIX_BYTES = 512 * 1024;
const CHANNEL_URL_MAX = 300;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The codes of source_links.fetch_problem that a read can end with (`purged` is the database's own). */
export type ReadFailure = "not_found" | "not_embeddable" | "not_page" | "too_big_image" | "refused" | "timeout" | "unavailable";
export type Failed = { result: ReadFailure };

export type YoutubeRead = { result: "ok"; title: string; channelName: string | null; channelUrl: string | null } | Failed;
export type ThumbRead = { result: "ok"; bytes: Uint8Array; sha256: string } | Failed;
export type PageRead = { result: "ok"; title: string | null; siteName: string } | Failed;

const OembedBody = z.object({ title: z.string(), author_name: z.unknown().optional(), author_url: z.unknown().optional() }).loose();
const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/** The code for a safeFetch refusal. The text of the error is never used: it is fixed, but only the class of failure matters here. */
function failureOf(error: unknown): ReadFailure {
  if (!(error instanceof DocumentError)) return "unavailable";
  switch (error.code) {
    case "link-invalid":
    case "link-blocked":
      return "refused";
    case "link-timeout":
      return "timeout";
    default:
      return "unavailable";
  }
}

/** The channel address, only when it is an https address on www.youtube.com of at most 300 characters (the column's check). */
function channelAddress(value: string | undefined): string | null {
  if (!value || value.length > CHANNEL_URL_MAX || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.youtube.com" && url.port === "" && url.username === "" && url.password === "" ? value : null;
  } catch {
    return null;
  }
}

export async function readYoutube(id: string, deps: SafeFetchDeps): Promise<YoutubeRead> {
  if (!YOUTUBE_ID.test(id)) return { result: "refused" };
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const link = `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
  try {
    const got = await safeFetch(link, { ...deps, timeoutMs: READ_TIMEOUT_MS, maxBytes: OEMBED_MAX_BYTES, prefixOnly: false, passStatuses: [401, 403, 404] });
    if (got.status === 404) return { result: "not_found" };
    if (got.status === 401 || got.status === 403) return { result: "not_embeddable" };
    if (got.contentType !== "application/json") return { result: "unavailable" };
    const body = OembedBody.safeParse(JSON.parse(new TextDecoder().decode(got.bytes)));
    if (!body.success) return { result: "unavailable" };
    const title = tidyMachineText(body.data.title, TITLE_MAX);
    if (title === null) return { result: "unavailable" };
    return {
      result: "ok",
      title,
      channelName: tidyMachineText(text(body.data.author_name) ?? "", SITE_MAX),
      channelUrl: channelAddress(text(body.data.author_url)),
    };
  } catch (error) {
    return { result: failureOf(error) };
  }
}

/** The picture, built from the id (oEmbed's own thumbnail address is never followed): a JPEG of at most 200 KB. */
export async function readThumbnail(id: string, deps: SafeFetchDeps): Promise<ThumbRead> {
  if (!YOUTUBE_ID.test(id)) return { result: "refused" };
  try {
    const got = await safeFetch(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`, { ...deps, timeoutMs: READ_TIMEOUT_MS, maxBytes: THUMB_MAX_BYTES, prefixOnly: false, passStatuses: undefined });
    const b = got.bytes;
    if (got.contentType !== "image/jpeg" || b.byteLength < 3 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return { result: "unavailable" };
    return { result: "ok", bytes: b, sha256: createHash("sha256").update(b).digest("hex") };
  } catch (error) {
    if (error instanceof DocumentError && error.code === "link-too-large") return { result: "too_big_image" };
    return { result: failureOf(error) };
  }
}

const PAGE_TYPES = new Set(["text/html", "application/xhtml+xml"]);

/** The title and site name of a saved link: the first 512 KB of the page, nothing else kept. */
export async function readPage(link: string, deps: SafeFetchDeps): Promise<PageRead> {
  try {
    const got = await safeFetch(link, { ...deps, timeoutMs: READ_TIMEOUT_MS, maxBytes: PAGE_PREFIX_BYTES, prefixOnly: true, passStatuses: undefined });
    if (!PAGE_TYPES.has(got.contentType)) return { result: "not_page" };
    const meta = readPageMeta(new TextDecoder().decode(got.bytes));
    const host = new URL(got.finalUrl).hostname.replace(/^www\./, "");
    return { result: "ok", title: meta.title, siteName: meta.siteName ?? tidyMachineText(host, SITE_MAX) ?? host };
  } catch (error) {
    return { result: failureOf(error) };
  }
}
