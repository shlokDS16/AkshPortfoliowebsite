// Quick-capture grammar (spec s5). Pure: runs in the browser and again on the server.
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
const SYMBOL_RE = new RegExp(`${START}${DOLLAR}([A-Za-z][A-Za-z0-9&-]{0,19})(?![A-Za-z0-9&-])`, "g");
const THEME_RE = new RegExp(`${START}#([A-Za-z][A-Za-z0-9-]{0,47})(?![A-Za-z0-9-])`, "g");
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const TITLE_MAX = 120;

function unique(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))];
}

// Code-point aware, so an emoji at the boundary is never split.
function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 3).join("").trimEnd()}...` : text;
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
  return url.slice(0, end);
}

export function parseCapture(raw: string): ParsedCapture {
  const prefix = PREFIX_RE.exec(raw);
  const kind: CaptureKind = prefix ? (PREFIXES[prefix[1].toLowerCase()] ?? "note") : "note";
  const body = (prefix ? raw.slice(prefix[0].length) : raw).trim();
  const firstLine = (body.split(/\r?\n/)[0] ?? "").trim();
  // Mask URLs (same length) so a "#fragment" or "$" inside one is never read as a token.
  const masked = body.replace(URL_RE, (m) => " ".repeat(m.length));
  const symbols = unique([...masked.matchAll(SYMBOL_RE)].map((m) => m[2].replace(/[&-]+$/, "").toUpperCase()));
  const themes = unique([...masked.matchAll(THEME_RE)].map((m) => m[2].replace(/-+$/, "").toLowerCase()));
  const urls = unique([...body.matchAll(URL_RE)].map((m) => trimUrl(m[0])));
  const title = truncate(firstLine.replace(URL_RE, "").replace(/\s+/g, " ").trim(), TITLE_MAX) || "Untitled capture";
  return { kind, symbols, themes, urls, title, firstLine, body };
}
