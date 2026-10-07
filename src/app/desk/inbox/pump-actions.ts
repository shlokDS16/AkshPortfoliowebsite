"use server";

import { after } from "next/server";
import { DRAIN_MS } from "@/modules/ingestion/client";
import { requireAdmin } from "@/modules/identity";
import { drainFor } from "@/modules/ops/jobs";

// The inbox's two pumps (plan E1): the admin's own click or open tab moves the queue between the 15-minute
// clocks. Both re-check the admin; the drain itself runs on the secret-key client that ops hands the runner.

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

/** While the inbox tab is open: drain for a short slice; `more` tells the tab whether to ask again. */
export async function keepReadingAction(): Promise<{ more: boolean }> {
  await requireAdmin();
  try {
    const summary = await drainFor(DRAIN_MS.tab);
    return { more: summary.ran > 0 };
  } catch (error) {
    console.error("inbox: tab drain failed", error instanceof Error ? error.name : typeof error);
    return { more: false };
  }
}
