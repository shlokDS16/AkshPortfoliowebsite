import { InvalidInputError } from "@/lib/errors";
import { documentOf, markDone, type InboxPorts } from "./inbox-ops";

// What Aksh's two buttons on a typed-out voice note do to the document (Plan 2b Task 4, ruling R7). Neither saves the words:
// the card has already saved them through the capture box's own path (clientId = the document's id, so a second press is a no-op)
// before it calls here. This only records the decision and finishes the document, so nothing here can file an item or a capture.

export type TranscriptDecision = "saved" | "discarded";

/**
 * Sets the document's transcript status, then does what Done does: the job stops, the stored recording is deleted and the
 * document moves to Finished. The recording is a third party's data once it left the desk, so it is not kept after Aksh has decided.
 * Safe to press again after a failure part-way, and again after it worked. A decision already made the other way is not undone.
 */
export async function finishTranscript(p: InboxPorts, documentId: string, decision: TranscriptDecision): Promise<void> {
  const doc = await documentOf(p, documentId, ["active", "done"]);
  if (doc.kind !== "audio") throw new InvalidInputError();
  if (doc.transcriptStatus !== null && doc.transcriptStatus !== "pending" && doc.transcriptStatus !== decision) throw new InvalidInputError();
  if (doc.transcriptStatus !== decision) await p.docs.update(doc.id, { transcriptStatus: decision });
  await markDone(p, doc.id);
}
