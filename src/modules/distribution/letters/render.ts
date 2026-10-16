import {
  ARCHIVE_LABEL, CONFIRMATION_BODY, CONFIRMATION_SUBJECT, DISCLOSURE_LINE, KIND_LABEL, POSITION_LABEL, POSITION_WORD, UNSUBSCRIBE_LABEL,
  UNSUBSCRIBE_PLACEHOLDER, WHY_YOU_GET_THIS,
} from "./copy";
import { PAGE_PATH } from "./structured";
import type { LetterEntry, LetterView } from "./types";

// Spec s8.7. Pure: a letter and the site address in, `{ subject, html, text }` out. It never re-words anything of his: the subject is his
// title, the preheader his objective, the note his paragraphs (escaped, no links, no markup), and each entry his copied title and change
// reason in his own bytes. The machine adds only the kind label, the page link, its own line and the fixed footer. No image, no pixel, no
// tracking link, no script: open and click tracking are off on the Resend domain (D92). The HTML is one column of inline styles.

export type RenderedLetter = { subject: string; html: string; text: string };
export type RenderOptions = {
  /** What the unsubscribe link points to. Default: Resend's placeholder, replaced per reader when a broadcast is sent. A test copy passes the site's own leave page. */
  unsubscribeUrl?: string;
};

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPES[c] as string);
const baseOf = (siteUrl: string): string => siteUrl.replace(/\/+$/, "");
const hostOf = (siteUrl: string): string => {
  try {
    return new URL(siteUrl).host;
  } catch {
    return siteUrl;
  }
};

/** His note as paragraphs: a blank line starts one, a single line break stays inside it. Whitespace-only paragraphs are dropped; nothing else is changed. */
function paragraphs(note: string): string[] {
  return note.split(/\r?\n(?:[ \t]*\r?\n)+/).filter((p) => /\S/.test(p));
}

/** The entry's page address, or null when its path is not a page of this site (it is then shown without a link). */
const linkOf = (siteUrl: string, entry: LetterEntry): string | null => (PAGE_PATH.test(entry.path) ? `${baseOf(siteUrl)}${entry.path}` : null);

function positionOf(entry: LetterEntry): string | null {
  return entry.companyName === null ? null : POSITION_WORD[entry.holdsPosition ?? "not_disclosed"];
}

const FONT = "font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;";
const MUTED = "font-size:13px;line-height:1.4;color:#555555;";

function entryHtml(siteUrl: string, entry: LetterEntry): string {
  const url = linkOf(siteUrl, entry);
  const title = url ? `<a href="${esc(url)}" style="color:#1a1a1a;text-decoration:underline;">${esc(entry.title)}</a>` : esc(entry.title);
  const position = positionOf(entry);
  return [
    `<tr><td style="padding:18px 0 6px 0;border-top:1px solid #cfcfcf;${FONT}">`,
    `<div style="${MUTED}letter-spacing:0.04em;">${esc(KIND_LABEL[entry.kind])}</div>`,
    `<div style="font-size:19px;line-height:1.35;margin:4px 0;">${title}</div>`,
    entry.changeReason === null ? "" : `<div style="font-size:15px;line-height:1.5;margin:4px 0;">&quot;${esc(entry.changeReason)}&quot;</div>`,
    `<div style="${MUTED}">${esc(entry.detail)}</div>`,
    position === null ? "" : `<div style="${MUTED}">${POSITION_LABEL}: ${position}</div>`,
    "</td></tr>",
  ].join("");
}

function entryText(siteUrl: string, entry: LetterEntry): string {
  const url = linkOf(siteUrl, entry);
  const position = positionOf(entry);
  return [
    `${KIND_LABEL[entry.kind]}: ${entry.title}`,
    ...(url ? [url] : []),
    ...(entry.changeReason === null ? [] : [`"${entry.changeReason}"`]),
    entry.detail,
    ...(position === null ? [] : [`${POSITION_LABEL}: ${position}`]),
  ].join("\n");
}

export function renderLetter(letter: LetterView, siteUrl: string, options: RenderOptions = {}): RenderedLetter {
  const unsubscribe = options.unsubscribeUrl ?? UNSUBSCRIBE_PLACEHOLDER;
  const host = hostOf(siteUrl);
  const archive = `${baseOf(siteUrl)}/letters`;
  const notes = paragraphs(letter.note);

  const text = [
    letter.objective,
    ...notes,
    ...letter.entries.map((e) => entryText(siteUrl, e)),
    [DISCLOSURE_LINE, WHY_YOU_GET_THIS(host), `${UNSUBSCRIBE_LABEL}: ${unsubscribe}`, `${ARCHIVE_LABEL}: ${archive}`].join("\n"),
  ].join("\n\n");

  const body = [
    `<tr><td style="padding:0 0 12px 0;${FONT}font-size:15px;line-height:1.6;">`,
    ...notes.map((p) => `<p style="margin:0 0 14px 0;">${esc(p).replace(/\r?\n/g, "<br>")}</p>`),
    "</td></tr>",
    ...letter.entries.map((e) => entryHtml(siteUrl, e)),
    `<tr><td style="padding:22px 0 0 0;border-top:1px solid #cfcfcf;${FONT}${MUTED}">`,
    `<p style="margin:0 0 8px 0;">${esc(DISCLOSURE_LINE)}</p>`,
    `<p style="margin:0 0 8px 0;">${esc(WHY_YOU_GET_THIS(host))}</p>`,
    `<p style="margin:0 0 8px 0;"><a href="${esc(unsubscribe)}" style="color:#555555;">${UNSUBSCRIBE_LABEL}</a></p>`,
    `<p style="margin:0;">${ARCHIVE_LABEL}: <a href="${esc(archive)}" style="color:#555555;">${esc(archive)}</a></p>`,
    "</td></tr>",
  ].join("");

  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(letter.subject)}</title></head>`,
    '<body style="margin:0;padding:24px 12px;background:#ffffff;">',
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(letter.objective)}</div>`,
    '<table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">',
    body,
    "</table></body></html>",
  ].join("");

  return { subject: letter.subject, html, text };
}

/** The confirmation email (spec s8.5, s15): plain text, transactional, sent only when Aksh presses. The token is encoded, so it can never add a second parameter. */
export function renderConfirmation(siteUrl: string, token: string): { subject: string; text: string } {
  const link = `${baseOf(siteUrl)}/letters/confirm?t=${encodeURIComponent(token)}`;
  return { subject: CONFIRMATION_SUBJECT, text: CONFIRMATION_BODY(hostOf(siteUrl), link) };
}
