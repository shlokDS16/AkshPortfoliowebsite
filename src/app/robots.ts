import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { robotsFor } from "@/modules/showcase";

/** Spec s4.6. The one read of VERCEL_ENV (a name, not a secret): only production is crawled. */
export default function robots(): MetadataRoute.Robots {
  return robotsFor(serverEnv().VERCEL_ENV, publicEnv().NEXT_PUBLIC_SITE_URL);
}
