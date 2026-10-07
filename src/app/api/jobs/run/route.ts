import { runPump, withCronAuth } from "@/modules/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Phase 2 drains jobs for <= 240 s here (spec s8)

/** Called every 15 minutes by .github/workflows/pump.yml. */
export const POST = withCronAuth((repo) => runPump(repo));
