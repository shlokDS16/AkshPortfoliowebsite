import type { KnownTokens } from "./highlight";
import { parseCapture } from "./parse";

export type ReceiptChip = { kind: "kind" | "company" | "company-new" | "theme" | "theme-new"; label: string };
export type CaptureReceiptModel = { empty: boolean; chips: ReceiptChip[]; warning: string | null };
export type TokenKey = "$" | "#" | "t:" | "l:" | "p:";

const KIND_LABEL = { note: "Today, as a private note", thesis: "Thesis", learning: "Learning note, private", process: "Process note, private" } as const;

/** "Will go to …" (design-dna 13.2). Captures are private by default; the receipt never says publish. */
export function captureReceipt(raw: string, known: KnownTokens): CaptureReceiptModel {
  if (!raw.trim()) return { empty: true, chips: [], warning: null };
  const parsed = parseCapture(raw);
  const symbol = parsed.symbols.find((s) => !known.ignoredSymbols.has(s));
  const theme = parsed.themes.find((t) => !known.ignoredThemes.has(t));
  const chips: ReceiptChip[] = [{ kind: "kind", label: KIND_LABEL[parsed.kind] }];
  if (symbol) chips.push(known.symbols.has(symbol) ? { kind: "company", label: `$${symbol}` } : { kind: "company-new", label: `$${symbol} → New names` });
  if (theme) chips.push(known.themes.has(theme) ? { kind: "theme", label: `#${theme}` } : { kind: "theme-new", label: `#${theme} → New names` });
  // Plan 1A files a thesis without a company as a private draft (decision D32 adjusts the design copy to match).
  const warning = parsed.kind === "thesis" && !symbol ? "A thesis belongs to one company. Add $SYMBOL, or this saves as a private draft without one." : null;
  return { empty: false, chips, warning };
}

/** The toast's "{company or private note}". */
export function receiptLabel(model: CaptureReceiptModel): string {
  const company = model.chips.find((c) => c.kind === "company" || c.kind === "company-new");
  return company ? company.label.split(" ")[0] : "private note";
}

export function insertToken(value: string, caret: number, token: TokenKey): { value: string; caret: number } {
  if (token === "t:" || token === "l:" || token === "p:") {
    const body = value.replace(/^\s*[tlp]:\s*/i, "");
    const next = `${token} ${body}`;
    return { value: next, caret: Math.max(token.length + 1, caret + (next.length - value.length)) };
  }
  const before = value.slice(0, caret);
  const pad = before && !/\s$/.test(before) ? " " : "";
  return { value: `${before}${pad}${token}${value.slice(caret)}`, caret: before.length + pad.length + token.length };
}
