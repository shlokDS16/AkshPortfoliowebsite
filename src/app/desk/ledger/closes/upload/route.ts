import { publicEnv } from "@/lib/env";
import { getAdmin } from "@/modules/identity";
import { buildUploadDeps, uploadOfficialCloses } from "@/modules/ops/jobs";
import { createUploadHandler } from "./handler";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** The owner's drop of NSE's official file (the fallback when NSE does not answer the desk). POST only; see handler.ts. */
export const POST = createUploadHandler({
  getAdmin: () => getAdmin(),
  siteUrl: () => publicEnv().NEXT_PUBLIC_SITE_URL,
  upload: (input) => uploadOfficialCloses(buildUploadDeps(), input),
});
