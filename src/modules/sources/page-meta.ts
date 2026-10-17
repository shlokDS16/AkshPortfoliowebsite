import { decodeEntities } from "@/modules/documents";

// The title and the site name of a web page, and nothing else (spec s6.3, Shlok's decision 4: no article text, no images). One linear
// scan over the page's head, no parser dependency and no regular expression over the whole page, so a hostile page cannot make it slow.
// The same approach as documents/html-text.ts. Pure.

export const TITLE_MAX = 300;
export const SITE_MAX = 120;
export type PageMeta = { title: string | null; siteName: string | null };

/** Elements whose content is never markup the page means: skipped with everything inside them. */
const RAW = new Set(["script", "style", "noscript", "template", "svg", "iframe", "object", "canvas"]);
const isLetter = (c: string | undefined): boolean => c !== undefined && /[A-Za-z]/.test(c);
/** Control characters, and the invisible marks that reorder or hide text (direction overrides, zero-width characters, the byte-order mark). */
const INVISIBLE = new RegExp("[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]", "g");

/** Decoded, invisible marks turned to spaces, spaces collapsed, cut to `max` characters at a word boundary (marked with …); null when nothing is left. */
export function tidyMachineText(raw: string, max: number): string | null {
  const text = decodeEntities(raw).replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
  if (text === "") return null;
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const head = chars.slice(0, max - 1).join("");
  const space = head.lastIndexOf(" ");
  // A single enormous word has no boundary to cut at: it is cut where it stands.
  return `${(space > 0 ? head.slice(0, space) : head).trimEnd()}…`;
}

/** Index just past the `>` that ends the tag starting at `from`, or -1. A `>` inside a quoted attribute value does not end it. */
function tagEnd(html: string, from: number): number {
  let quote = "";
  for (let i = from; i < html.length; i += 1) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i + 1;
  }
  return -1;
}

/** The attributes of one tag (`text` is what lies between the tag name and the `>`), names in lower case, the first of a name wins. */
function attributes(text: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /[\s/]/.test(text[i])) i += 1;
    const nameStart = i;
    while (i < text.length && !/[\s=/>]/.test(text[i])) i += 1;
    const name = text.slice(nameStart, i).toLowerCase();
    while (i < text.length && /\s/.test(text[i])) i += 1;
    let value = "";
    if (text[i] === "=") {
      i += 1;
      while (i < text.length && /\s/.test(text[i])) i += 1;
      const q = text[i];
      if (q === '"' || q === "'") {
        const close = text.indexOf(q, i + 1);
        value = text.slice(i + 1, close === -1 ? text.length : close);
        i = close === -1 ? text.length : close + 1;
      } else {
        const valueStart = i;
        while (i < text.length && !/\s/.test(text[i])) i += 1;
        value = text.slice(valueStart, i);
      }
    }
    if (name !== "" && !out.has(name)) out.set(name, value);
    if (i === nameStart) i += 1; // a character that is none of the above cannot stall the scan
  }
  return out;
}

export function readPageMeta(html: string): PageMeta {
  // An ASCII-only fold keeps every index the same as in `html` (toLowerCase changes the length of some letters).
  const lower = html.replace(/[A-Z]+/g, (s) => s.toLowerCase());
  let ogTitle: string | null = null;
  let ogSite: string | null = null;
  let titleTag: string | null = null;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;
    i = lt;
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      if (end === -1) break;
      i = end + 3;
      continue;
    }
    if (html[i + 1] === "!" || html[i + 1] === "?") {
      const end = html.indexOf(">", i);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    const closing = html[i + 1] === "/";
    const nameAt = i + (closing ? 2 : 1);
    if (!isLetter(html[nameAt])) {
      i += 1;
      continue;
    }
    let nameEnd = nameAt;
    while (nameEnd < html.length && /[A-Za-z0-9]/.test(html[nameEnd])) nameEnd += 1;
    const name = lower.slice(nameAt, nameEnd);
    const end = tagEnd(html, nameEnd);
    if (end === -1) break;
    // The head is all that is read: the body is the page's own text, where a title or a meta tag is not the page's.
    if ((closing && name === "head") || (!closing && name === "body")) break;
    i = end;
    if (closing) continue;
    if (name === "title") {
      const close = lower.indexOf("</title", i);
      const stop = close === -1 ? html.length : close;
      titleTag ??= html.slice(i, stop);
      i = stop;
      continue;
    }
    if (RAW.has(name)) {
      const close = lower.indexOf(`</${name}`, i);
      if (close === -1) break;
      const after = tagEnd(html, close + 2);
      if (after === -1) break;
      i = after;
      continue;
    }
    if (name === "meta") {
      const attrs = attributes(html.slice(nameEnd, end - 1));
      const key = (attrs.get("property") ?? attrs.get("name") ?? "").trim().toLowerCase();
      const content = attrs.get("content");
      if (content !== undefined && key === "og:title" && tidyMachineText(content, TITLE_MAX) !== null) ogTitle ??= content;
      else if (content !== undefined && key === "og:site_name" && tidyMachineText(content, SITE_MAX) !== null) ogSite ??= content;
    }
  }
  const title = ogTitle ?? titleTag;
  return {
    title: title === null ? null : tidyMachineText(title, TITLE_MAX),
    siteName: ogSite === null ? null : tidyMachineText(ogSite, SITE_MAX),
  };
}
