import { runDaily, SERVER_DAILY_STEPS, withCronAuth } from "@/modules/ops/jobs";

export const dynamic = "force-dynamic";
// Worst case: the heartbeat, then the ledger steps (closes 25 s + score 5 s + anchor 15 s = 45 s), then the ingestion sweep
// for <= 200 s, then the source re-check (no read is started that could run past 35 s), then the alert email (about 15 s): 45 + 200 + 35 + 15
// = 295 s at most inside Hobby's 300 s (Fluid compute), while the video and letter steps are off (they report "off" until set up). A failing
// ledger step never stops the steps after it.
export const maxDuration = 300;

/** Vercel cron, once a day on Hobby (vercel.json). Backstop clock (ADR-001 s8.2). */
export const GET = withCronAuth((repo) => runDaily(repo, SERVER_DAILY_STEPS));
