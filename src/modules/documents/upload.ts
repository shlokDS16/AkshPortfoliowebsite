import { z } from "zod";
import { InvalidInputError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { isUniqueViolation } from "@/lib/supabase/errors";
import { DocumentError } from "./errors";
import { MAX_UPLOAD_BYTES, STORAGE_BYTES, STORAGE_REFUSE } from "./limits";
import type { DocumentsRepo } from "./repo";
import type { DocumentRow, StartUploadInput } from "./types";

const PDF_MIME = "application/pdf";
const PDF_NAME = /\.pdf$/i;
const TITLE_MAX = 160;

/**
 * The browser's claim about a file, checked at the boundary (R24). Strict: a client cannot pass a path or
 * any other key. Size and type limits are checked afterwards so they produce their own message codes.
 */
export const startUploadInputSchema = z.strictObject({
  fileName: z.string().trim().min(1).max(255),
  bytes: z.int().min(1),
  mime: z.string().max(255),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  companyId: z.guid().nullable(),
  filedOn: z.iso.date().nullable(),
  sourceUrl: z.url({ protocol: /^https?$/ }).regex(/^https?:\/\//).max(2000).nullable(),
});

type StartUploadClaim = z.infer<typeof startUploadInputSchema>;

/** Title = file name without `.pdf`, trimmed to 160 characters (documents.title check). */
export function titleFromFileName(fileName: string): string {
  const title = fileName.trim().replace(PDF_NAME, "").trim().slice(0, TITLE_MAX).trim();
  return title.length > 0 ? title : "Untitled PDF";
}

/**
 * Checks the claim, records the document as `uploading` and signs an upload for `<id>.pdf` (a path the server
 * chooses). The claimed size and type are checked again against the stored object in finishUpload.
 */
export async function startUpload(
  repo: DocumentsRepo,
  input: StartUploadInput,
  newId: () => string,
): Promise<{ documentId: string; path: string; token: string }> {
  const claim = startUploadInputSchema.parse(input);
  if (claim.mime !== PDF_MIME || !PDF_NAME.test(claim.fileName)) throw new DocumentError("upload-not-pdf");
  if (claim.bytes > MAX_UPLOAD_BYTES) throw new DocumentError("upload-too-large");

  const earlier = await repo.findBySha(claim.sha256);
  if (earlier) {
    // An upload that never finished (tab closed, network drop) would otherwise lock this file out for ever:
    // sign a fresh upload for the same row, after clearing any partial object at its path.
    if (earlier.status === "uploading") return resume(repo, earlier.id, claim);
    throw new DocumentError("upload-duplicate", { id: earlier.id, createdAt: earlier.createdAt });
  }

  await assertRoomFor(repo, claim.bytes);

  const documentId = newId();
  const path = `${documentId}.pdf`;
  try {
    await repo.insertUploading({
      id: documentId,
      title: titleFromFileName(claim.fileName),
      storagePath: path,
      sha256: claim.sha256,
      bytes: claim.bytes,
      companyId: claim.companyId,
      filedOn: claim.filedOn,
      sourceUrl: claim.sourceUrl,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await repo.findBySha(claim.sha256);
    if (!winner) throw error;
    throw new DocumentError("upload-duplicate", { id: winner.id, createdAt: winner.createdAt });
  }
  const signed = await repo.signUpload(path);
  return { documentId, path: signed.path, token: signed.token };
}

/** Uploads are refused when they would take storage above 90% (spec s9). */
async function assertRoomFor(repo: DocumentsRepo, bytes: number): Promise<void> {
  const { storageBytes } = await repo.usage();
  if (storageBytes + bytes > STORAGE_REFUSE * STORAGE_BYTES) throw new DocumentError("upload-storage-full");
}

/** The same file again: the partial object goes, the room is checked, and this attempt's company, date and link replace the old ones. */
async function resume(repo: DocumentsRepo, documentId: string, claim: StartUploadClaim) {
  const doc = await repo.get(documentId);
  if (!doc?.storagePath) throw new InvalidInputError();
  if (await repo.objectInfo(doc.storagePath)) await repo.removeObject(doc.storagePath);
  await assertRoomFor(repo, claim.bytes);
  await repo.update(documentId, { companyId: claim.companyId, filedOn: claim.filedOn, sourceUrl: claim.sourceUrl });
  const signed = await repo.signUpload(doc.storagePath);
  return { documentId, path: signed.path, token: signed.token };
}

/**
 * Activates a document once its object is really there: the stored size must equal the size recorded at start
 * and the stored type must be PDF. Never moves a document that is already past `uploading`.
 */
export async function finishUpload(repo: DocumentsRepo, documentId: string): Promise<DocumentRow> {
  if (!isUuid(documentId)) throw new InvalidInputError();
  const doc = await repo.get(documentId);
  if (!doc) throw new InvalidInputError();
  if (doc.status !== "uploading") return doc;
  if (!doc.storagePath) throw new DocumentError("upload-missing");

  const object = await repo.objectInfo(doc.storagePath);
  if (!object) throw new DocumentError("upload-missing");
  if (object.size !== doc.bytes || object.mimetype !== PDF_MIME) {
    // Clear what arrived, so the same file can be chosen again and starts from nothing.
    await repo.removeObject(doc.storagePath);
    throw new DocumentError("upload-missing");
  }

  await repo.update(documentId, { status: "active" });
  return { ...doc, status: "active" };
}
