import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countNamesToReview } from "@/modules/catalog";

/** Read once per request (layout badge and home tray). A failed read shows 0; the name only is logged. */
export const namesToReview = cache(async (): Promise<number> => {
  try {
    return await countNamesToReview(await createSupabaseServerClient());
  } catch (error) {
    console.error("desk: could not count new names", error instanceof Error ? error.name : typeof error);
    return 0;
  }
});
