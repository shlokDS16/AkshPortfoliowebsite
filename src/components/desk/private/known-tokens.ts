import type { KnownTokens } from "@/modules/capture/client";
import type { KnownTokenLists } from "@/modules/catalog";

/** The lists the server sends, as the sets the highlighter and the receipt read. Pure: server and client both use it. */
export function toKnownTokens(lists: KnownTokenLists): KnownTokens {
  return {
    symbols: new Set(lists.symbols),
    themes: new Set(lists.themes),
    ignoredSymbols: new Set(lists.ignoredSymbols),
    ignoredThemes: new Set(lists.ignoredThemes),
  };
}
