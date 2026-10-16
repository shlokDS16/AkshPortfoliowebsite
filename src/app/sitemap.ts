import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { getSnapshot, sitemapEntries } from "@/modules/showcase";

export const revalidate = 3600;

/** Spec s4.6: from the cached public snapshot, so a publish or an unpublish refreshes it with the pages. Snapshot down: the static routes. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const snapshot = await getSnapshot();
  return sitemapEntries(snapshot.status === "ok" ? snapshot.data : null, publicEnv().NEXT_PUBLIC_SITE_URL);
}
