"use server";

import { revalidatePath } from "next/cache";
import { FETCH_STEP_LABEL } from "@/lib/messages-closes";
import type { FetchState } from "@/components/desk/private/ledger/fetch-closes";
import { requireAdmin } from "@/modules/identity";
import { runLedgerNow } from "@/modules/ops/jobs";

// "Fetch closes now" (Task 11): the closing prices, then the scores, with the same code and the same heartbeats the daily cron
// uses. It NEVER runs the public-copy step (ledger:anchor): only the daily cron does, because a manual run that overlapped it at
// midnight could corrupt the published copy's bookkeeping (Q35). One run at a time: a second click while one is running is told so.
// The results shown are the steps' own result strings (counts, dates, the port's safe messages), as the desk already shows them.

const labelOf = (job: string): string => (Object.hasOwn(FETCH_STEP_LABEL, job) ? FETCH_STEP_LABEL[job as keyof typeof FETCH_STEP_LABEL] : job);

export async function fetchClosesNowAction(): Promise<FetchState> {
  await requireAdmin();
  const results = await runLedgerNow();
  if (results === null) return { error: "ledger-fetch-busy", steps: null };
  revalidatePath("/desk/ledger", "layout");
  return { error: null, steps: results.map((r) => ({ job: r.job, label: labelOf(r.job), ok: r.ok, detail: r.detail })) };
}
