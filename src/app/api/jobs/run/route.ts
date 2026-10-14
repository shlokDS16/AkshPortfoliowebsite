import { runPump, SERVER_PUMP_STEPS, withCronAuth } from "@/modules/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // the heartbeat, then the ingestion drain for <= 240 s (spec s8)

/** Called every 15 minutes by .github/workflows/pump.yml. */
export const POST = withCronAuth((repo) => runPump(repo, SERVER_PUMP_STEPS));
