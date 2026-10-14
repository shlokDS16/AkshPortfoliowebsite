import { errorShape } from "@/lib/errors";
import { errorCode, errorText, userWasTold } from "@/lib/messages";
import { DocumentError, finishUpload, startUpload, VOICE_SECONDS_SANITY, type DocumentKind, type DocumentsRepo, type StartUploadInput, type StartUploadOptions } from "@/modules/documents";
import type { QueueRepo } from "./queue-repo";
import type { JobKind, NewStep } from "./types";

export type ActionFailure = { ok: false; code: string; message: string; earlier?: { id: string; createdAt: string } };
export type StartUploadResult = { ok: true; documentId: string; path: string; token: string } | ActionFailure;
export type FinishUploadResult = { ok: true } | ActionFailure;
/** What every inbox action returns: it worked, or a fixed code with its fixed text. */
export type ActionResult = { ok: true } | ActionFailure;

/**
 * The job and first step of each kind (ruling R12): a PDF's text layer from page 1 (spec s5); a photo goes to the scan
 * reader first, as its one page; a voice note is typed out from its page 1; a web page and pasted text are cut into pages from page 1.
 */
export const FIRST_STEP: Partial<Record<DocumentKind, { job: JobKind; step: NewStep }>> = {
  pdf: { job: "ingest_pdf", step: { kind: "pdf_text", pageNo: 1 } },
  image: { job: "ingest_image", step: { kind: "ocr_page", pageNo: 1 } },
  audio: { job: "ingest_audio", step: { kind: "transcribe", pageNo: 1 } },
  // A fetched web page and pasted text are stored as text and cut into pages (ruling R1); a fetched PDF is a pdf.
  url: { job: "ingest_url", step: { kind: "text_pages", pageNo: 1 } },
  text: { job: "ingest_text", step: { kind: "text_pages", pageNo: 1 } },
};

/** A recording's length as the browser measured it, kept on its first step to size the reservation. A claim, so only a plain positive number passes. */
function withSeconds(step: NewStep, seconds: unknown): NewStep {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 && seconds <= VOICE_SECONDS_SANITY ? { ...step, args: { seconds: Math.ceil(seconds) } } : step;
}

/** A fixed code and its fixed text (src/lib/messages.ts); never a database message. Unexpected failures are logged by shape. */
export function actionFailure(error: unknown): ActionFailure {
  if (!userWasTold(error)) console.error("upload action failed", errorShape(error));
  const code = errorCode(error);
  const out: ActionFailure = { ok: false, code, message: errorText(code) ?? "" };
  if (error instanceof DocumentError && error.earlier) out.earlier = error.earlier;
  return out;
}

export async function runStartUpload(docs: DocumentsRepo, input: StartUploadInput, newId: () => string, options: StartUploadOptions = {}): Promise<StartUploadResult> {
  try {
    return { ok: true, ...(await startUpload(docs, input, newId, options)) };
  } catch (error) {
    return actionFailure(error);
  }
}

/** Activates the document, then creates its job and first step (idempotent: a second call reuses the live job). */
export async function runFinishUpload(docs: DocumentsRepo, queue: QueueRepo, documentId: string, seconds?: number | null): Promise<FinishUploadResult> {
  try {
    const doc = await finishUpload(docs, documentId);
    // Only an active document gets a job: done and skipped are Aksh's and stay still.
    const first = FIRST_STEP[doc.kind];
    if (doc.status === "active" && first) await queue.createJob(doc.id, first.job, doc.kind === "audio" ? withSeconds(first.step, seconds) : first.step);
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}
