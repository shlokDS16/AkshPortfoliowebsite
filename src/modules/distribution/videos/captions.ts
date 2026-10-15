import { MAX_CAPTION_BYTES, MAX_CUES, MAX_SEGMENT_CHARS, MAX_SEGMENTS, type Segment } from "./types";

// Caption files from YouTube Studio (Subtitles, Download, .vtt or .srt) to transcript segments (spec s7.5). Pure: bytes in, a
// result out, no network and no database. The words are the machine's record of what was said; this file only removes markup and
// repeated lines and groups cues, it never changes a word. The text is stored and printed as text, never as markup.

export const NOT_A_CAPTION_FILE = "This is not a caption file. In YouTube Studio choose Subtitles, then Download, then .vtt or .srt.";
export const CAPTION_FILE_TOO_BIG = "This file is too big for a caption file (1 MB at most).";
export const CAPTION_FILE_TOO_LONG = `This caption file is too long (${MAX_CUES.toLocaleString("en-US")} cues at most).`;

export type CaptionsResult = { ok: true; segments: Segment[] } | { ok: false; reason: string };

/** Cues are merged until a segment is about this many seconds long. */
const SEGMENT_SECONDS = 30;
const TIME = String.raw`((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})`;
const TIMING = new RegExp(String.raw`^[ \t]*${TIME}[ \t]*-->[ \t]*${TIME}(?:[ \t].*)?$`);
const SRT_START = new RegExp(String.raw`^\s*(?:\d+[ \t]*\n)?[ \t]*${TIME}[ \t]*-->`);
const VTT_START = /^WEBVTT(?:[ \t\n]|$)/;
const TAG = /<\/?[A-Za-z][^>]*>|<\d{1,2}:\d{2}(?:[:.]\d+)*>/g;
const STYLE_OVERRIDE = /\{\\[^}]*\}/g;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", amp: "&" };

const refuse = (reason: string): CaptionsResult => ({ ok: false, reason });

function toSeconds(stamp: string): number {
  const parts = stamp.replace(",", ".").split(":");
  const [h, m, s] = parts.length === 3 ? parts : ["0", ...parts];
  return Number(h) * 3600 + Number(m) * 60 + Math.floor(Number(s));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d{1,7});/g, (whole, n: string) => (Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : whole))
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (whole, n: string) => (parseInt(n, 16) <= 0x10ffff ? String.fromCodePoint(parseInt(n, 16)) : whole))
    .replace(/&(lt|gt|quot|apos|nbsp|amp);/g, (_whole, name: string) => ENTITIES[name] ?? "");
}

/** One cue line as plain text: markup and style overrides removed first, entities decoded after, spaces collapsed. */
function cleanLine(line: string): string {
  return decodeEntities(line.replace(TAG, "").replace(STYLE_OVERRIDE, "")).replace(CONTROL, "").replace(/\s+/g, " ").trim();
}

/** A line over the segment limit is cut at the last space inside it, else exactly at the limit. */
function pieces(line: string): string[] {
  const out: string[] = [];
  let rest = line;
  while (rest.length > MAX_SEGMENT_CHARS) {
    const cut = rest.lastIndexOf(" ", MAX_SEGMENT_CHARS);
    const at = cut > 0 ? cut : MAX_SEGMENT_CHARS;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

type Line = { start: number; text: string };

export function parseCaptions(bytes: Uint8Array, name: string): CaptionsResult {
  if (bytes.byteLength > MAX_CAPTION_BYTES) return refuse(CAPTION_FILE_TOO_BIG);
  if (!/\.(vtt|srt)$/i.test(name.trim())) return refuse(NOT_A_CAPTION_FILE);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return refuse(NOT_A_CAPTION_FILE);
  }
  if (text.includes("\u0000")) return refuse(NOT_A_CAPTION_FILE);
  text = text.replace(/\r\n?/g, "\n");
  if (text.trimStart().startsWith("<")) return refuse(NOT_A_CAPTION_FILE);
  if (!VTT_START.test(text) && !SRT_START.test(text)) return refuse(NOT_A_CAPTION_FILE);

  const kept: Line[] = [];
  let cue: { start: number; lines: string[] } | null = null;
  let cues = 0;
  const finish = () => {
    if (!cue) return;
    for (const raw of cue.lines) {
      const line = cleanLine(raw);
      // Automatic captions repeat the previous line in the next cue; a repeat right after itself is dropped.
      if (line && line !== kept.at(-1)?.text) kept.push({ start: cue.start, text: line });
    }
    cue = null;
  };
  for (const line of text.split("\n")) {
    const timing = TIMING.exec(line);
    if (timing) {
      finish();
      cues += 1;
      if (cues > MAX_CUES) return refuse(CAPTION_FILE_TOO_LONG);
      cue = { start: toSeconds(timing[1] as string), lines: [] };
    } else if (line === "") {
      finish();
    } else if (cue) {
      cue.lines.push(line);
    }
  }
  finish();
  if (kept.length === 0) return refuse(NOT_A_CAPTION_FILE);

  const segments: Segment[] = [];
  let floor = 0;
  for (const { start, text: line } of kept) {
    // A start never goes back, whatever order the file lists its cues in.
    const s = Math.max(Math.floor(start), floor);
    floor = s;
    for (const piece of pieces(line)) {
      const last = segments.at(-1);
      if (last && s - last.s < SEGMENT_SECONDS && last.t.length + 1 + piece.length <= MAX_SEGMENT_CHARS) last.t += ` ${piece}`;
      else segments.push({ s, t: piece });
    }
  }
  return segments.length > MAX_SEGMENTS ? refuse(CAPTION_FILE_TOO_LONG) : { ok: true, segments };
}
