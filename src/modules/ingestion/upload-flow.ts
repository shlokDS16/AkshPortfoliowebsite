import { errorShape } from "@/lib/errors";
import { errorCode, errorText, userWasTold } from "@/lib/messages";
import { DocumentError, finishUpload, startUpload, type DocumentsRepo, type StartUploadInput } from "@/modules/documents";
import type { QueueRepo } from "./queue-repo";
import type { NewStep } from "./types";

export type ActionFailure = { ok: false; code: string; message: string; earlier?: { id: string; createdAt: string } };
export type StartUploadResult = { ok: true; documentId: string; path: string; token: string } | ActionFailure;
export type FinishUploadResult = { ok: true } | ActionFailure;

/** The first step of every PDF job: read the text layer from page 1 (spec s5). */
export const FIRST_STEP: NewStep = { kind: "pdf_text", pageNo: 1 };

/** A fixed code and its fixed text (src/lib/messages.ts); never a database message. Unexpected failures are logged by shape. */
function failure(error: unknown): ActionFailure {
  if (!userWasTold(error)) console.error("upload action failed", errorShape(error));
  const code = errorCode(error);
  const out: ActionFailure = { ok: false, code, message: errorText(code) ?? "" };
  if (error instanceof DocumentError && error.earlier) out.earlier = error.earlier;
  return out;
}

export async function runStartUpload(docs: DocumentsRepo, input: StartUploadInput, newId: () => string): Promise<StartUploadResult> {
  try {
    return { ok: true, ...(await startUpload(docs, input, newId)) };
  } catch (error) {
    return failure(error);
  }
}

/** Activates the document, then creates its job and first step (idempotent: a second call reuses the live job). */
export async function runFinishUpload(docs: DocumentsRepo, queue: QueueRepo, documentId: string): Promise<FinishUploadResult> {
  try {
    const doc = await finishUpload(docs, documentId);
    // Only an active document gets a job: done and skipped are Aksh's and stay still.
    if (doc.status === "active") await queue.createJob(doc.id, FIRST_STEP);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
