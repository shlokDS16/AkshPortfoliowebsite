import { runDaily, SERVER_DAILY_STEPS, withCronAuth } from "@/modules/ops/jobs";

export const dynamic = "force-dynamic";
// Worst case: the heartbeat, then the ledger steps (closes 25 s + score 5 s + anchor 15 s = 45 s), then the ingestion sweep
// for <= 200 s, then the alert email (a send is cut at 10 s): about 260 s at most inside Hobby's 300 s (Fluid compute). A failing
// ledger step never stops the steps after it.
export const maxDuration = 300;

/** Vercel cron, once a day on Hobby (vercel.json). Backstop clock (ADR-001 s8.2). */
export const GET = withCronAuth((repo) => runDaily(repo, SERVER_DAILY_STEPS));
