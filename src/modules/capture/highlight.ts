import { captureSpans, type CaptureSpan } from "./parse";

export type CaptureTokenKind = "plain" | "key" | "company" | "company-new" | "theme" | "theme-new" | "url";
export type CaptureToken = { text: string; kind: CaptureTokenKind };
export type KnownTokens = {
  symbols: ReadonlySet<string>;
  themes: ReadonlySet<string>;
  ignoredSymbols: ReadonlySet<string>;
  ignoredThemes: ReadonlySet<string>;
};

function kindOf(span: CaptureSpan, known: KnownTokens): CaptureTokenKind {
  if (span.kind === "prefix") return "key";
  if (span.kind === "url") return "url";
  if (span.kind === "symbol") return known.ignoredSymbols.has(span.value) ? "plain" : known.symbols.has(span.value) ? "company" : "company-new";
  return known.ignoredThemes.has(span.value) ? "plain" : known.themes.has(span.value) ? "theme" : "theme-new";
}

/** Live colouring (segment 4 A) from the parser's own spans; colour never changes the text. */
export function highlightCapture(raw: string, known: KnownTokens): CaptureToken[] {
  const tokens: CaptureToken[] = [];
  let at = 0;
  for (const span of captureSpans(raw)) {
    if (span.start < at) continue;
    if (span.start > at) tokens.push({ text: raw.slice(at, span.start), kind: "plain" });
    tokens.push({ text: raw.slice(span.start, span.end), kind: kindOf(span, known) });
    at = span.end;
  }
  if (at < raw.length) tokens.push({ text: raw.slice(at), kind: "plain" });
  return tokens;
}
