"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseDocumentsRepo, type StartUploadInput } from "@/modules/documents";
import { requireAdmin } from "@/modules/identity";
import { createQueueRepo } from "../queue-repo";
import { runFinishUpload, runStartUpload, type FinishUploadResult, type StartUploadResult } from "../upload-flow";

// Both actions run on the admin's cookie session: RLS (admin only) and the bucket policies apply to every call.

/** Checks the browser's claim and signs an upload to a path the server chooses. */
export async function startUploadAction(input: StartUploadInput): Promise<StartUploadResult> {
  await requireAdmin();
  const result = await runStartUpload(createSupabaseDocumentsRepo(await createSupabaseServerClient()), input, randomUUID);
  if (result.ok) revalidatePath("/desk/inbox");
  return result;
}

/** Activates the document once its object is really there, then queues its job (first step: pdf_text from page 1). */
export async function finishUploadAction(documentId: string): Promise<FinishUploadResult> {
  await requireAdmin();
  const db = await createSupabaseServerClient();
  const result = await runFinishUpload(createSupabaseDocumentsRepo(db), createQueueRepo(db), documentId);
  revalidatePath("/desk/inbox");
  return result;
}
