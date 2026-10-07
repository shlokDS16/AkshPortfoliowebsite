import { runDaily, SERVER_DAILY_STEPS, withCronAuth } from "@/modules/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // the heartbeat, then the ingestion sweep for <= 200 s (Fluid compute, Hobby)

/** Vercel cron, once a day on Hobby (vercel.json). Backstop clock (ADR-001 s8.2). */
export const GET = withCronAuth((repo) => runDaily(repo, SERVER_DAILY_STEPS));
