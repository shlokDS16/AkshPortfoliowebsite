// What the desk accepts as an upload, per kind (ruling R12). Browser-safe: the drop bar and the server read the same table.
// A pasted text or a link's answer (kinds url and text) is stored by the desk itself, never uploaded by the browser (store.ts).

import { IMAGE_MAX_BYTES, MAX_UPLOAD_BYTES, VOICE_MAX_BYTES } from "./limits";

export type DocumentKind = "pdf" | "image" | "audio" | "url" | "text";
/** The kinds a browser can upload today. */
export type UploadKind = "pdf" | "image" | "audio";

export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];
export const PDF_MIME = "application/pdf";
/** A pasted text, or a web page reduced to its text, is stored as <id>.txt with this bare type. */
export const TEXT_MIME = "text/plain";
/** Voice notes (ruling R23): bare types, `audio/x-m4a` included (some phones and Chrome name an .m4a that way). */
export const AUDIO_MIMES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/webm"] as const;
export type AudioMime = (typeof AUDIO_MIMES)[number];
const AUDIO_EXT: Record<AudioMime, "mp3" | "m4a" | "webm"> = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/webm": "webm" };

const IMAGE_EXT: Record<ImageMime, "jpg" | "png" | "webp"> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const UPLOAD_KINDS: Record<UploadKind, { mimes: readonly string[]; name: RegExp; maxBytes: number; fallbackTitle: string }> = {
  pdf: { mimes: [PDF_MIME], name: /\.pdf$/i, maxBytes: MAX_UPLOAD_BYTES, fallbackTitle: "Untitled PDF" },
  image: { mimes: IMAGE_MIMES, name: /\.(jpe?g|png|webp)$/i, maxBytes: IMAGE_MAX_BYTES, fallbackTitle: "Untitled photo" },
  audio: { mimes: AUDIO_MIMES, name: /\.(mp3|m4a|webm)$/i, maxBytes: VOICE_MAX_BYTES, fallbackTitle: "Untitled voice note" },
};

/** A type with its parameters removed and in lower case: "image/jpeg;charset=x" and "Image/JPEG" are "image/jpeg". */
export const bareMime = (type: string): string => (type.split(";")[0] ?? "").trim().toLowerCase();

/** The path the server chooses for an upload: the document's id and an extension that follows the (already checked) type. */
export function storageExtension(kind: UploadKind, mime: string): string {
  if (kind === "pdf") return "pdf";
  return kind === "image" ? IMAGE_EXT[mime as ImageMime] : AUDIO_EXT[mime as AudioMime];
}

/** The type an image has by the extension of its stored path, or null when the path is not an image's. */
export function imageMimeOfPath(path: string): ImageMime | null {
  const ext = /\.([a-z0-9]+)$/.exec(path)?.[1];
  return IMAGE_MIMES.find((m) => IMAGE_EXT[m] === ext) ?? null;
}

/** The type a voice note has by the extension of its stored path (what the transcriber is told), or null when the path is not a voice note's. */
export function audioMimeOfPath(path: string): AudioMime | null {
  const ext = /\.([a-z0-9]+)$/.exec(path)?.[1];
  // The first of the types that share an extension: .m4a is sent as audio/mp4.
  return AUDIO_MIMES.find((m) => AUDIO_EXT[m] === ext) ?? null;
}

/** The types a stored object may have, by its path's extension (what finishUpload compares the stored object with). An .m4a has two names. */
export function mimesOfStoragePath(path: string): readonly string[] {
  if (path.endsWith(".pdf")) return [PDF_MIME];
  if (path.endsWith(".txt")) return [TEXT_MIME];
  const image = imageMimeOfPath(path);
  if (image) return [image];
  const ext = /\.([a-z0-9]+)$/.exec(path)?.[1];
  return AUDIO_MIMES.filter((m) => AUDIO_EXT[m] === ext);
}
