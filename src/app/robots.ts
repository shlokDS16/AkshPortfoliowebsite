import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { robotsFor } from "@/modules/showcase";

// Rendered per request, not at build: a preview build that is promoted to production must answer as production (an unchanged build would
// keep the "disallow all" it was given), and the answer must follow the environment the code is running in.
export const dynamic = "force-dynamic";

/** Spec s4.6. The one read of VERCEL_ENV (a name, not a secret): only production is crawled. */
export default function robots(): MetadataRoute.Robots {
  return robotsFor(serverEnv().VERCEL_ENV, publicEnv().NEXT_PUBLIC_SITE_URL);
}
