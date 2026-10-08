"use server";

import { revalidatePath } from "next/cache";
import { serverEnv } from "@/lib/env.server";
import { createLlmPort } from "@/lib/providers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseDocumentsRepo } from "@/modules/documents";
import { requireAdmin } from "@/modules/identity";
import { createSupabaseInboxRepo } from "../inbox-repo";
import { createQueueRepo } from "../queue-repo";
import { previewReread, rereadPage, type RereadCost } from "../reread";
import { actionFailure, type ActionFailure } from "../upload-flow";
import { createUsageRepo } from "../usage-repo";

// "Re-read this page" (Plan 2b Task 8, R3). One action, two steps: without `confirmed` it only says what the re-read would cost;
// with it, the page's unchecked figures are rejected and the next pass is queued. Runs on Aksh's own session (RLS and grants apply).

export type RereadResult = { ok: true; cost: RereadCost } | { ok: true; queued: true } | ActionFailure;

/** The measured median tokens of a recent reading, or null: a price is not worth a broken button. */
async function medianTokens(db: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<number | null> {
  try {
    return (await createUsageRepo(db).totals(serverEnv().GROQ_MODEL_TEXT)).medianPerCall;
  } catch (error) {
    console.error("reread: could not read the usage median", error instanceof Error ? error.name : typeof error);
    return null;
  }
}

export async function rereadPageAction(documentId: string, pageNo: number, confirmed: boolean): Promise<RereadResult> {
  await requireAdmin();
  const db = await createSupabaseServerClient();
  const ports = { docs: createSupabaseDocumentsRepo(db), inbox: createSupabaseInboxRepo(db), queue: createQueueRepo(db) };
  const aiOn = createLlmPort(serverEnv()) !== null;
  try {
    if (confirmed !== true) return { ok: true, cost: await previewReread(ports, documentId, pageNo, aiOn, await medianTokens(db)) };
    await rereadPage(ports, documentId, pageNo, aiOn);
  } catch (error) {
    return actionFailure(error);
  }
  revalidatePath("/desk/inbox");
  revalidatePath(`/desk/inbox/${documentId}/review`);
  return { ok: true, queued: true };
}
