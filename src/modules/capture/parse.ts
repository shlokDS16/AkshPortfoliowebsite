// Quick-capture grammar (spec s5). Pure: runs in the browser and again on the server.
import { truncateUnits } from "./text";

export const CAPTURE_KINDS = ["note", "thesis", "learning", "process"] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export type ParsedCapture = {
  kind: CaptureKind;
  symbols: string[];
  themes: string[];
  urls: string[];
  title: string;
  firstLine: string;
  body: string;
};

const PREFIXES: Record<string, CaptureKind> = { t: "thesis", l: "learning", p: "process" };
const PREFIX_RE = /^\s*([tlp]):\s*/i;
// Tokens start the text or follow whitespace, an opening bracket, a quote, "," or "/". The character
// before is deliberately not a word character, so "user$x", "C#" and "a#b" are not tokens.
// Max length is enforced by the lookahead: an over-long token is rejected, not truncated.
const CURLY_QUOTES = String.fromCharCode(0x201c, 0x2018);
// Regex fragments come from literals so no backslash has to be escaped inside a string.
const WS = /\s/.source;
const DOLLAR = /\$/.source;
const START = `(^|[${WS}([{"'${CURLY_QUOTES},/])`;
const SYMBOL_RE = new RegExp(`${START}${DOLLAR}([A-Za-z0-9][A-Za-z0-9&-]{0,19})(?![A-Za-z0-9&-])`, "g");
const THEME_RE = new RegExp(`${START}#([A-Za-z][A-Za-z0-9-]{0,47})(?![A-Za-z0-9-])`, "g");
const URL_RE = /https?:\/\/[^\s<>"']+/g;
// Digits plus only a money or magnitude suffix ("$5M", "$500cr") are amounts, not symbols.
const AMOUNT_RE = /^\d+(K|M|MN|MM|B|BN|CR|CRS|L|LAKH|LAKHS|T|TN)$/;
// UTF-16 units, like the item schema's .max(); the schema allows 200, the title keeps well inside it.
const TITLE_MAX = 120;

function unique(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))];
}

// Linear end-trim (a regex like /[.,]+$/ is quadratic on long runs). A closing bracket is kept
// when it balances an opening one, so Wikipedia-style ".../Moat_(economics)" survives.
function trimUrl(url: string): string {
  let end = url.length;
  let parens = 0;
  let squares = 0;
  for (const c of url) {
    if (c === "(") parens++;
    else if (c === ")") parens--;
    else if (c === "[") squares++;
    else if (c === "]") squares--;
  }
  // parens/squares are now (opens - closes); a negative value means unbalanced closers to trim.
  while (end > 0) {
    const c = url[end - 1];
    if (".,;:!?".includes(c)) {
      end--;
    } else if (c === ")" && parens < 0) {
      end--;
      parens++;
    } else if (c === "]" && squares < 0) {
      end--;
      squares++;
    } else {
      break;
    }
  }
  const trimmed = url.slice(0, end);
  // A bare scheme ("https://", or "https://..." trimmed down) is not a URL.
  return /^https?:\/\/$/i.test(trimmed) ? "" : trimmed;
}

export type CaptureSpanKind = "prefix" | "symbol" | "theme" | "url";
/** A token exactly as parseCapture reads it, placed in the raw text (start inclusive, end exclusive). */
export type CaptureSpan = { kind: CaptureSpanKind; start: number; end: number; value: string };

// One scanner for parseCapture and the highlighter, so colour and filing can never disagree.
function scan(raw: string): { kind: CaptureKind; body: string; spans: CaptureSpan[] } {
  const prefix = PREFIX_RE.exec(raw);
  const kind: CaptureKind = prefix ? (PREFIXES[prefix[1].toLowerCase()] ?? "note") : "note";
  const rest = prefix ? raw.slice(prefix[0].length) : raw;
  const bodyStart = raw.length - rest.length + (rest.length - rest.trimStart().length);
  const body = rest.trim();
  const spans: CaptureSpan[] = [];
  if (prefix) {
    const at = prefix[0].indexOf(prefix[1]);
    spans.push({ kind: "prefix", start: at, end: at + 2, value: prefix[1].toLowerCase() });
  }
  // Mask URLs (same length) so a "#fragment" or "$" inside one is never read as a token.
  const masked = body.replace(URL_RE, (m) => " ".repeat(m.length));
  for (const m of masked.matchAll(SYMBOL_RE)) {
    const token = m[2].replace(/[&-]+$/, "");
    const value = token.toUpperCase();
    // NSE symbols may start with a digit (5PAISA, 360ONE) but must contain a letter, so "$500" is a price.
    if (!/[A-Z]/.test(value) || AMOUNT_RE.test(value)) continue;
    const start = bodyStart + m.index + m[1].length;
    spans.push({ kind: "symbol", start, end: start + 1 + token.length, value });
  }
  for (const m of masked.matchAll(THEME_RE)) {
    const token = m[2].replace(/-+$/, "");
    const start = bodyStart + m.index + m[1].length;
    spans.push({ kind: "theme", start, end: start + 1 + token.length, value: token.toLowerCase() });
  }
  for (const m of body.matchAll(URL_RE)) {
    const url = trimUrl(m[0]);
    if (url) spans.push({ kind: "url", start: bodyStart + m.index, end: bodyStart + m.index + url.length, value: url });
  }
  return { kind, body, spans: spans.sort((a, b) => a.start - b.start) };
}

export function captureSpans(raw: string): CaptureSpan[] {
  return scan(raw).spans;
}

export function parseCapture(raw: string): ParsedCapture {
  const { kind, body, spans } = scan(raw);
  const values = (k: CaptureSpanKind) => unique(spans.filter((s) => s.kind === k).map((s) => s.value));
  const firstLine = (body.split(/\r?\n/)[0] ?? "").trim();
  const title = truncateUnits(firstLine.replace(URL_RE, "").replace(/\s+/g, " ").trim(), TITLE_MAX) || "Untitled capture";
  return { kind, symbols: values("symbol"), themes: values("theme"), urls: values("url"), title, firstLine, body };
}
