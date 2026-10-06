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
// Max length is enforced by the lookahead: an over-long token is rejected, not truncated.
const SYMBOL_RE = /(^|\s)\$([A-Za-z][A-Za-z0-9&-]{0,19})(?![A-Za-z0-9&-])/g;
const THEME_RE = /(^|\s)#([A-Za-z][A-Za-z0-9-]{0,47})(?![A-Za-z0-9-])/g;
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const TRAILING_URL_PUNCTUATION = /[.,;:!?)\]]+$/;
const TITLE_MAX = 120;

function unique(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))];
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

export function parseCapture(raw: string): ParsedCapture {
  const prefix = PREFIX_RE.exec(raw);
  const kind: CaptureKind = prefix ? (PREFIXES[prefix[1].toLowerCase()] ?? "note") : "note";
  const body = (prefix ? raw.slice(prefix[0].length) : raw).trim();
  const firstLine = (body.split("\n")[0] ?? "").trim();
  const symbols = unique([...body.matchAll(SYMBOL_RE)].map((m) => m[2].replace(/[&-]+$/, "").toUpperCase()));
  const themes = unique([...body.matchAll(THEME_RE)].map((m) => m[2].replace(/-+$/, "").toLowerCase()));
  const urls = unique([...body.matchAll(URL_RE)].map((m) => m[0].replace(TRAILING_URL_PUNCTUATION, "")));
  const title = truncate(firstLine.replace(URL_RE, "").replace(/\s+/g, " ").trim(), TITLE_MAX) || "Untitled capture";
  return { kind, symbols, themes, urls, title, firstLine, body };
}
