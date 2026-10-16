import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdmin } from "@/modules/identity";
import { deskThumbnail } from "@/modules/sources";
import { createThumbHandler } from "./handler";

export const dynamic = "force-dynamic";

/** A saved source's picture for the desk page: read with the admin's own session from the private bucket. See handler.ts. */
export const GET = createThumbHandler({
  getAdmin: () => getAdmin(),
  thumb: async (id) => deskThumbnail(await createSupabaseServerClient(), id),
});
