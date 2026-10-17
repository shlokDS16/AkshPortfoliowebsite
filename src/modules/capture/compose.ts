import type { KnownTokens } from "./highlight";
import { parseYoutubeUrl } from "@/modules/distribution/client";
import { cleanSourceUrl } from "@/modules/sources/client";
import { filingErrorText } from "./messages";
import { MAX_LINKED_CONCEPTS, parseCapture } from "./parse";

export type ReceiptChip = { kind: "kind" | "company" | "company-new" | "theme" | "theme-new"; label: string };
export type CaptureReceiptModel = { empty: boolean; chips: ReceiptChip[]; warning: string | null };
export type TokenKey = "$" | "#" | "t:" | "l:" | "p:" | "r:" | "v:" | "s:";

const KIND_LABEL = {
  note: "Today, as a private note",
  thesis: "Thesis",
  learning: "Learning note, private",
  process: "Process note, private",
  reading_note: "Reading log, private",
  video: "Video, private",
  // Phase 5d: a saved link is not an item. Pending Shlok's approval.
  source: "Source, private",
} as const;
const CONCEPTS_DROPPED = `Only the first ${MAX_LINKED_CONCEPTS} concepts were linked.`;

/** "Will go to …" (design-dna 13.2). Captures are private by default; the receipt never says publish. */
export function captureReceipt(raw: string, known: KnownTokens): CaptureReceiptModel {
  if (!raw.trim()) return { empty: true, chips: [], warning: null };
  const parsed = parseCapture(raw);
  const symbol = parsed.symbols.find((s) => !known.ignoredSymbols.has(s));
  const themes = parsed.themes.filter((t) => !known.ignoredThemes.has(t));
  const chips: ReceiptChip[] = [{ kind: "kind", label: KIND_LABEL[parsed.kind] }];
  if (symbol) chips.push(known.symbols.has(symbol) ? { kind: "company", label: `$${symbol}` } : { kind: "company-new", label: `$${symbol} → New names` });
  for (const theme of themes.slice(0, MAX_LINKED_CONCEPTS)) {
    chips.push(known.themes.has(theme) ? { kind: "theme", label: `#${theme}` } : { kind: "theme-new", label: `#${theme} → New names` });
  }
  // Plan 1A files a thesis without a company as a private draft (decision D32 adjusts the design copy to match).
  const notes = [
    parsed.kind === "thesis" && !symbol ? "A thesis belongs to one company. Add $SYMBOL, or this saves as a private draft without one." : null,
    themes.length > MAX_LINKED_CONCEPTS ? CONCEPTS_DROPPED : null,
    // Phase 5b: a v: capture needs a YouTube video address; saying so now saves a trip to the "not filed" card.
    parsed.kind === "video" && !parsed.urls.some((url) => parseYoutubeUrl(url) !== null) ? filingErrorText("not-youtube-link") : null,
    // Phase 5d: an s: capture needs a link a source can be; v: needs one too while it files as a source, but its own note above stays the one it shows.
    parsed.kind === "source" && !parsed.urls.some((url) => cleanSourceUrl(url) !== null) ? filingErrorText("no-source-link") : null,
  ].filter((note) => note !== null);
  return { empty: false, chips, warning: notes.length > 0 ? notes.join(" ") : null };
}

/** The toast's "{company or private note}". */
export function receiptLabel(model: CaptureReceiptModel): string {
  const company = model.chips.find((c) => c.kind === "company" || c.kind === "company-new");
  return company ? company.label.split(" ")[0] : "private note";
}

export function insertToken(value: string, caret: number, token: TokenKey): { value: string; caret: number } {
  if (token === "t:" || token === "l:" || token === "p:" || token === "r:" || token === "v:" || token === "s:") {
    const body = value.replace(/^\s*[tlprvs]:\s*/i, "");
    const next = `${token} ${body}`;
    return { value: next, caret: Math.max(token.length + 1, caret + (next.length - value.length)) };
  }
  const before = value.slice(0, caret);
  const pad = before && !/\s$/.test(before) ? " " : "";
  return { value: `${before}${pad}${token}${value.slice(caret)}`, caret: before.length + pad.length + token.length };
}
