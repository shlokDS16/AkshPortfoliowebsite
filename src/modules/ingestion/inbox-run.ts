import "server-only";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseDocumentsRepo } from "@/modules/documents";
import type { InboxPorts } from "./inbox-ops";
import { createSupabaseInboxRepo } from "./inbox-repo";
import { createQueueRepo } from "./queue-repo";
import { actionFailure, type ActionResult } from "./upload-flow";

/**
 * Runs one inbox button on the admin's cookie session (RLS and the column grants apply) and turns a failure into
 * a fixed code and text. Callers check requireAdmin first; this never builds a client for anyone else.
 */
export async function runInbox(op: (ports: InboxPorts) => Promise<void>): Promise<ActionResult> {
  const db = await createSupabaseServerClient();
  try {
    await op({ docs: createSupabaseDocumentsRepo(db), inbox: createSupabaseInboxRepo(db), queue: createQueueRepo(db) });
  } catch (error) {
    return actionFailure(error);
  }
  revalidatePath("/desk/inbox");
  return { ok: true };
}
