import "server-only";
import { serverEnv } from "@/lib/env.server";
import { isAuthorizedBearer } from "./auth";
import type { HeartbeatRepo } from "./heartbeat";
import { createJobHeartbeatRepo } from "./job-deps";
import type { StepResult } from "./steps";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The one handler body behind both bearer-protected job routes (daily cron, 15-minute pump):
 * constant-time bearer check, run the steps, 500 if any failed, never cached.
 */
export function withCronAuth(run: (repo: HeartbeatRepo) => Promise<StepResult[]>) {
  return async (request: Request): Promise<Response> => {
    if (!isAuthorizedBearer(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
      return new Response("Unauthorized", { status: 401, headers: NO_STORE });
    }
    try {
      const results = await run(createJobHeartbeatRepo());
      const ok = results.every((r) => r.ok);
      return Response.json({ ok, results }, { status: ok ? 200 : 500, headers: NO_STORE });
    } catch (error) {
      // Name only: a database message can carry row data.
      console.error("cron: job runner failed", error instanceof Error ? error.name : typeof error);
      return Response.json({ ok: false, error: "job runner failed" }, { status: 500, headers: NO_STORE });
    }
  };
}
