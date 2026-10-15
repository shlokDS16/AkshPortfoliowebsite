import { tickPost } from "@/modules/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // answers 202 at once; the pump steps then run for <= 240 s of drain plus the other steps (spec s8)

/** Called every 15 minutes by the database clock (pg_cron + pg_net, supabase/migrations/20261014000016_pump_clock.sql). POST only. */
export const POST = tickPost;
