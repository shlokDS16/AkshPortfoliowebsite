// What the desk accepts as an upload, per kind (ruling R12). Browser-safe: the drop bar and the server read the same table.
// Audio and links join in later tasks; a pasted text or a link answer is stored by the desk itself, never uploaded.

import { IMAGE_MAX_BYTES, MAX_UPLOAD_BYTES } from "./limits";

export type DocumentKind = "pdf" | "image" | "audio" | "url" | "text";
/** The kinds a browser can upload today. */
export type UploadKind = "pdf" | "image";

export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];
export const PDF_MIME = "application/pdf";

const IMAGE_EXT: Record<ImageMime, "jpg" | "png" | "webp"> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const UPLOAD_KINDS: Record<UploadKind, { mimes: readonly string[]; name: RegExp; maxBytes: number; fallbackTitle: string }> = {
  pdf: { mimes: [PDF_MIME], name: /\.pdf$/i, maxBytes: MAX_UPLOAD_BYTES, fallbackTitle: "Untitled PDF" },
  image: { mimes: IMAGE_MIMES, name: /\.(jpe?g|png|webp)$/i, maxBytes: IMAGE_MAX_BYTES, fallbackTitle: "Untitled photo" },
};

/** A type with its parameters removed and in lower case: "image/jpeg;charset=x" and "Image/JPEG" are "image/jpeg". */
export const bareMime = (type: string): string => (type.split(";")[0] ?? "").trim().toLowerCase();

/** The path the server chooses for an upload: the document's id and an extension that follows the (already checked) type. */
export const storageExtension = (kind: UploadKind, mime: string): string => (kind === "pdf" ? "pdf" : IMAGE_EXT[mime as ImageMime]);

/** The type an image has by the extension of its stored path, or null when the path is not an image's. */
export function imageMimeOfPath(path: string): ImageMime | null {
  const ext = /\.([a-z0-9]+)$/.exec(path)?.[1];
  return IMAGE_MIMES.find((m) => IMAGE_EXT[m] === ext) ?? null;
}

/** The type a stored object must have, by its path's extension (what finishUpload compares the stored object with). */
export function mimeOfStoragePath(path: string): string | null {
  return path.endsWith(".pdf") ? PDF_MIME : imageMimeOfPath(path);
}
