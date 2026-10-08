"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/modules/identity";
import { runInbox } from "../inbox-run";
import type { ActionResult } from "../upload-flow";
import { finishTranscript } from "../voice-ops";

// A typed-out voice note is Aksh's words. The transcript card saves them itself through the capture box's own path
// (ruling R7), then calls the first action to close the document; discarding calls the second and saves nothing.
// Neither imports the capture module, and neither can file an item: they set documents.transcript_status and finish the document.

/** After the card saved his words as a capture: record it and close the voice note (its recording is deleted). */
export async function markTranscriptSavedAction(documentId: string): Promise<ActionResult> {
  await requireAdmin();
  const result = await runInbox((ports) => finishTranscript(ports, documentId, "saved"));
  if (result.ok) revalidatePath("/desk");
  return result;
}

/** Throw the transcript away: no capture is made, the voice note moves to Finished and its recording is deleted. */
export async function discardTranscriptAction(documentId: string): Promise<ActionResult> {
  await requireAdmin();
  const result = await runInbox((ports) => finishTranscript(ports, documentId, "discarded"));
  if (result.ok) revalidatePath("/desk");
  return result;
}
