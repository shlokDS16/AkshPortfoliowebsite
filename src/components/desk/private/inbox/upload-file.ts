import { errorText } from "@/lib/messages";
import { MAX_UPLOAD_BYTES, type StartUploadInput } from "@/modules/documents/client";
import { UPLOAD_NOT_FINISHED, type FinishUploadResult, type StartUploadResult } from "@/modules/ingestion/client";

// The browser's half of an upload (spec s6.2): check, hash, ask for a signed path, send the bytes straight to
// Storage, tell the server it arrived, nudge the reader. Pure of React: every call is injected, so a test can follow it.

export type UploadDeps = {
  hash: (file: Blob) => Promise<string>;
  start: (input: StartUploadInput) => Promise<StartUploadResult>;
  put: (path: string, token: string, file: File) => Promise<{ error: { message: string } | null }>;
  finish: (documentId: string) => Promise<FinishUploadResult>;
  kick: () => Promise<void>;
};

export type UploadStage = "checking" | "uploading" | "saving";
export type UploadOutcome =
  | { ok: true; documentId: string }
  | { ok: false; message: string; earlier?: { id: string; createdAt: string } };

export type UploadExtras = Pick<StartUploadInput, "companyId" | "filedOn" | "sourceUrl">;

const PDF_MIME = "application/pdf";
const refuse = (code: "upload-not-pdf" | "upload-too-large"): UploadOutcome => ({ ok: false, message: errorText(code) ?? "" });

/** The check that needs no network: type and size, so a wrong file never starts an upload. */
export function checkFile(file: Pick<File, "name" | "size" | "type">): UploadOutcome | null {
  // Some systems hand over a PDF with no type at all; the server and the bucket check the stored object again.
  if (!/\.pdf$/i.test(file.name) || (file.type !== PDF_MIME && file.type !== "")) return refuse("upload-not-pdf");
  if (file.size > MAX_UPLOAD_BYTES) return refuse("upload-too-large");
  return null;
}

export async function uploadPdf(file: File, extras: UploadExtras, deps: UploadDeps, onStage: (stage: UploadStage) => void): Promise<UploadOutcome> {
  const refused = checkFile(file);
  if (refused) return refused;

  onStage("checking");
  const sha256 = await deps.hash(file);
  const started = await deps.start({ fileName: file.name, bytes: file.size, mime: PDF_MIME, sha256, ...extras });
  if (!started.ok) return { ok: false, message: started.message, earlier: started.earlier };

  onStage("uploading");
  const put = await deps.put(started.path, started.token, file).catch(() => ({ error: { message: "network" } }));
  if (put.error) return { ok: false, message: UPLOAD_NOT_FINISHED };

  onStage("saving");
  const finished = await deps.finish(started.documentId);
  if (!finished.ok) return { ok: false, message: finished.message };
  await deps.kick().catch(() => undefined); // the 15-minute pump reads the document anyway
  return { ok: true, documentId: started.documentId };
}
