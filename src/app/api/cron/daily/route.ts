import { runDaily, withCronAuth } from "@/modules/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel cron, once a day on Hobby (vercel.json). Backstop clock (ADR-001 s8.2). */
export const GET = withCronAuth((repo) => runDaily(repo));
