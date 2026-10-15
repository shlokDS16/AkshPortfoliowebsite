import "server-only";
import { after } from "next/server";
import { jobDbError } from "@/lib/supabase/errors";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { SERVER_PUMP_STEPS } from "./drain";
import { createJobHeartbeatRepo } from "./job-deps";
import { runPump } from "./schedule";
import { createTickHandler } from "./tick-handler";

// Job code: the wiring of /api/jobs/tick to the secret-key client and the pump steps (ADR-001 s3).

/** The POST handler of /api/jobs/tick: the database clock's one-use ticket in, the same steps as /api/jobs/run out. */
export const tickPost = createTickHandler({
  redeem: async (token) => {
    const { data, error } = await createSupabaseServiceClient().rpc("redeem_pump_ticket", { p_token: token });
    if (error) throw jobDbError("ops.redeemPumpTicket", error);
    return data === true;
  },
  runPump: () => runPump(createJobHeartbeatRepo(), SERVER_PUMP_STEPS),
  after,
});
