import { publicEnv } from "@/lib/env";
import { getAdmin } from "@/modules/identity";
import { DRAIN_MS } from "@/modules/ingestion/client";
import { drainFor } from "@/modules/ops/jobs";
import { createPumpHandler } from "./handler";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // the tab slice drains for 50 s; the Hobby maximum leaves room for a slow step (spec s8)

/** While the inbox tab is open and visible: drain for a short slice. POST only. */
export const POST = createPumpHandler({
  getAdmin: () => getAdmin(),
  drain: () => drainFor(DRAIN_MS.tab),
  siteUrl: () => publicEnv().NEXT_PUBLIC_SITE_URL,
});
