import { publicEnv } from "@/lib/env";
import { feedEntries, getSnapshot, renderRss } from "@/modules/showcase";

export const revalidate = 3600;

/**
 * Spec s4.5: the gated revisions as RSS 2.0, from the cached public snapshot (a publish or an unpublish refreshes it with the pages).
 * With the snapshot down it answers 503, so a reader keeps its last copy instead of seeing every item vanish.
 */
export async function GET() {
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") return new Response(null, { status: 503, headers: { "retry-after": "3600" } });
  return new Response(renderRss(feedEntries(snapshot.data), publicEnv().NEXT_PUBLIC_SITE_URL), {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
