"use server";

import { after } from "next/server";
import { DRAIN_MS } from "@/modules/ingestion/client";
import { requireAdmin } from "@/modules/identity";
import { drainFor } from "@/modules/ops/jobs";

// The inbox's pumps (plan E1): the admin's own click or open tab moves the queue between the 15-minute clocks. The
// upload kick is an action; the open tab's slice is the POST route in ./pump (an action would queue behind clicks).
// Both re-check the admin; the drain itself runs on the secret-key client that ops hands the runner.

/** After an upload: answer at once, then drain in the background of this request. */
export async function kickReadingAction(): Promise<void> {
  await requireAdmin();
  after(async () => {
    try {
      await drainFor(DRAIN_MS.kick);
    } catch (error) {
      // Name only: a database message can carry row data. The next pump retries.
      console.error("inbox: kick drain failed", error instanceof Error ? error.name : typeof error);
    }
  });
}
