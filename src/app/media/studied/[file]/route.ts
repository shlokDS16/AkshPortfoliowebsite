import { createSupabasePublicClient } from "@/lib/supabase/public";
import { serveStudiedPicture } from "@/modules/showcase/studied-media";

/**
 * Phase 5d (spec s7): the pictures of the outside sources a public file shows. Anon client only (rule 10): no cookie, no session, no secret key.
 * A request asks storage as the anonymous role, and the database answers only for a picture a public entry shows; every other name is a 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  return serveStudiedPicture(file, {
    async download(path) {
      const { data, error } = await createSupabasePublicClient().storage.from("source-thumbs").download(path);
      return error || !data ? null : { bytes: new Uint8Array(await data.arrayBuffer()) };
    },
  });
}
