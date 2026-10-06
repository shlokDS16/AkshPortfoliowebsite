import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countNamesToReview, listKnownTokens, type KnownTokenLists } from "@/modules/catalog";

/** Read once per request (layout badge and home tray). A failed read shows 0; the name only is logged. */
export const namesToReview = cache(async (): Promise<number> => {
  try {
    return await countNamesToReview(await createSupabaseServerClient());
  } catch (error) {
    console.error("desk: could not count new names", error instanceof Error ? error.name : typeof error);
    return 0;
  }
});

const NO_TOKENS: KnownTokenLists = { symbols: [], themes: [], ignoredSymbols: [], ignoredThemes: [] };

/** Read once per request (layout dock and home bar). A failed read colours every token as new; the name only is logged. */
export const knownTokens = cache(async (): Promise<KnownTokenLists> => {
  try {
    return await listKnownTokens(await createSupabaseServerClient());
  } catch (error) {
    console.error("desk: could not read known tokens", error instanceof Error ? error.name : typeof error);
    return NO_TOKENS;
  }
});
