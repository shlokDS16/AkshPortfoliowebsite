import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countNamesToReview, listKnownTokens, type KnownTokenLists } from "@/modules/catalog";
import { countInbox, listNeedsYou, type NeedsYouDoc } from "@/modules/ingestion";

/** Read once per request (layout badge and home tray). A failed read shows 0; the name only is logged. */
export const namesToReview = cache(async (): Promise<number> => {
  try {
    return await countNamesToReview(await createSupabaseServerClient());
  } catch (error) {
    console.error("desk: could not count new names", error instanceof Error ? error.name : typeof error);
    return 0;
  }
});

/** Documents waiting on Aksh (Ready for you plus Needs attention), read once per request for the Inbox tab's count. */
export const inboxToReview = cache(async (): Promise<number> => {
  try {
    return await countInbox(await createSupabaseServerClient(), new Date());
  } catch (error) {
    console.error("desk: could not count inbox documents", error instanceof Error ? error.name : typeof error);
    return 0;
  }
});

/** The documents waiting on Aksh, for the home's Needs you tray, read once per request. A failed read shows none; the name only is logged. */
export const needsYouDocs = cache(async (): Promise<NeedsYouDoc[]> => {
  try {
    return await listNeedsYou(await createSupabaseServerClient(), new Date());
  } catch (error) {
    console.error("desk: could not list documents that need you", error instanceof Error ? error.name : typeof error);
    return [];
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
