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

// "Re-read this page" (Plan 2b Task 8, R3). One action, two steps: without `confirmed` it only says what the re-read would cost;
// with it, the page's unchecked figures are rejected and the next pass is queued. Runs on Aksh's own session (RLS and grants apply).

export type RereadResult = { ok: true; cost: RereadCost } | { ok: true; queued: true } | ActionFailure;

export async function rereadPageAction(documentId: string, pageNo: number, confirmed: boolean): Promise<RereadResult> {
  await requireAdmin();
  const db = await createSupabaseServerClient();
  const ports = { docs: createSupabaseDocumentsRepo(db), inbox: createSupabaseInboxRepo(db), queue: createQueueRepo(db) };
  const aiOn = createLlmPort(serverEnv()) !== null;
  try {
    if (confirmed !== true) return { ok: true, cost: await previewReread(ports, documentId, pageNo, aiOn) };
    await rereadPage(ports, documentId, pageNo, aiOn);
  } catch (error) {
    return actionFailure(error);
  }
  revalidatePath("/desk/inbox");
  revalidatePath(`/desk/inbox/${documentId}/review`);
  return { ok: true, queued: true };
}
