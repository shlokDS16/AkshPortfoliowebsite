import { createHash } from "node:crypto";
import { isUniqueViolation } from "@/lib/supabase/errors";
import { InvalidInputError } from "@/lib/errors";
import { DocumentError } from "./errors";
import { PDF_MIME, TEXT_MIME } from "./kinds";
import { MAX_UPLOAD_BYTES } from "./limits";
import type { DocumentsRepo } from "./repo";
import { assertRoomFor } from "./upload";

// A document whose bytes the server already holds: a PDF that a link answered with, a web page reduced to its text, or text Aksh
// pasted (Plan 2b Task 5, ruling R1). It takes the same road as a browser upload: the hash of the bytes decides "you uploaded
// this before", storage must have room (90%), the row is `uploading` until the object is really there, and the path is chosen
// here. It runs on Aksh's own session, so RLS and the bucket policies apply.

export type StoreInput = {
  /** A PDF is stored as <id>.pdf; a fetched web page (url) and pasted text (text) as <id>.txt. */
  kind: "pdf" | "url" | "text";
  title: string;
  bytes: Uint8Array;
  companyId: string | null;
  filedOn: string | null;
  /** The document's public link (documents.source_url): for a fetched page or PDF, the link that was pasted. */
  sourceUrl: string | null;
  /** The https link that was fetched; null for pasted text. Set at insert and never changed. */
  fetchedFrom: string | null;
};

const PDF_MAGIC = "%PDF-";
const TITLE_MAX = 160;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Stores the bytes and leaves the document `uploading`; the caller finishes it (finishUpload / runFinishUpload). */
export async function storeDocument(repo: DocumentsRepo, input: StoreInput, newId: () => string): Promise<{ documentId: string }> {
  if (input.bytes.byteLength === 0) throw new InvalidInputError();
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) throw new DocumentError("upload-too-large");
  // A link that says PDF but sends something else is not stored as one: the stored bytes are what pdf_text will open.
  if (input.kind === "pdf" && Buffer.from(input.bytes.subarray(0, PDF_MAGIC.length)).toString("latin1") !== PDF_MAGIC) {
    throw new DocumentError("link-unsupported");
  }
  const mime = input.kind === "pdf" ? PDF_MIME : TEXT_MIME;
  const digest = sha256(input.bytes);

  const earlier = await repo.findBySha(digest);
  if (earlier && earlier.status !== "uploading") throw new DocumentError("upload-duplicate", { id: earlier.id, createdAt: earlier.createdAt });
  if (earlier) return resume(repo, earlier.id, input, mime);

  await assertRoomFor(repo, input.bytes.byteLength);
  const documentId = newId();
  const path = `${documentId}.${input.kind === "pdf" ? "pdf" : "txt"}`;
  try {
    await repo.insertUploading({
      id: documentId,
      title: input.title.trim().slice(0, TITLE_MAX).trim() || "Untitled",
      kind: input.kind,
      storagePath: path,
      sha256: digest,
      bytes: input.bytes.byteLength,
      companyId: input.companyId,
      filedOn: input.filedOn,
      sourceUrl: input.sourceUrl,
      fetchedFrom: input.fetchedFrom,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await repo.findBySha(digest);
    if (!winner) throw error;
    throw new DocumentError("upload-duplicate", { id: winner.id, createdAt: winner.createdAt });
  }
  await repo.putObject(path, input.bytes, mime);
  return { documentId };
}

/** The same bytes again after an attempt that never finished: clear any partial object, check the room, and store them again. */
async function resume(repo: DocumentsRepo, documentId: string, input: StoreInput, mime: string): Promise<{ documentId: string }> {
  const doc = await repo.get(documentId);
  if (!doc?.storagePath) throw new InvalidInputError();
  if (await repo.objectInfo(doc.storagePath)) await repo.removeObject(doc.storagePath);
  await assertRoomFor(repo, input.bytes.byteLength);
  await repo.update(documentId, { companyId: input.companyId, filedOn: input.filedOn, sourceUrl: input.sourceUrl });
  await repo.putObject(doc.storagePath, input.bytes, mime);
  return { documentId };
}
