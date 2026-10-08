import { bareMime, PDF_MIME, UPLOAD_KINDS, type UploadKind } from "@/modules/documents/client";

// What the drop bar takes (ruling R12): a PDF, or a photo or screenshot. Audio and links join with their own tasks.

/** The file picker's filter. */
export const ACCEPT = "application/pdf,.pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

/**
 * What a chosen file is, by the end of its name and its type. Some systems hand over a PDF with no type at all, so an
 * empty type passes here; the server and the bucket check the stored object again.
 */
export function kindOfFile(file: Pick<File, "name" | "type">): UploadKind | null {
  const type = bareMime(file.type);
  for (const kind of ["pdf", "image"] as const) {
    const rule = UPLOAD_KINDS[kind];
    if (rule.name.test(file.name) && (type === "" || rule.mimes.includes(type))) return kind;
  }
  return null;
}

/** The type the upload claims: a PDF's is always the PDF type, a shrunk photo's is its own bare type (never "image/jpeg;codecs=..."). */
export const claimedMime = (kind: UploadKind, file: Pick<File, "type">): string => (kind === "pdf" ? PDF_MIME : bareMime(file.type));
