import { AUDIO_MIMES, bareMime, PDF_MIME, UPLOAD_KINDS, type UploadKind } from "@/modules/documents/client";

// What the drop bar takes (ruling R12): a PDF, a photo or screenshot, and (only while VOICE_NOTES is on) a voice note.
// Links join with their own task.

const BASE_ACCEPT = "application/pdf,.pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const VOICE_ACCEPT = "audio/mpeg,audio/mp4,audio/x-m4a,audio/webm,.mp3,.m4a,.webm";

/** The file picker's filter. Voice notes are offered only while the switch is on. */
export const acceptFor = (voiceOn: boolean): string => (voiceOn ? `${BASE_ACCEPT},${VOICE_ACCEPT}` : BASE_ACCEPT);

/** A browser may call a .webm recording "video/webm", or an .m4a "audio/m4a"; the name decides, the type only has to be sound-like. */
const soundLike = (type: string) => type === "" || type.startsWith("audio/") || type === "video/webm";

/**
 * What a chosen file is, by the end of its name and its type. Some systems hand over a PDF with no type at all, so an empty
 * type passes here; the server and the bucket check the stored object again.
 */
export function kindOfFile(file: Pick<File, "name" | "type">): UploadKind | null {
  const type = bareMime(file.type);
  for (const kind of ["pdf", "image"] as const) {
    const rule = UPLOAD_KINDS[kind];
    if (rule.name.test(file.name) && (type === "" || rule.mimes.includes(type))) return kind;
  }
  return UPLOAD_KINDS.audio.name.test(file.name) && soundLike(type) ? "audio" : null;
}

const AUDIO_BY_EXTENSION: Record<string, (typeof AUDIO_MIMES)[number]> = { mp3: "audio/mpeg", m4a: "audio/mp4", webm: "audio/webm" };

/**
 * The type the upload claims, always bare (never "audio/webm;codecs=opus"): a PDF's is the PDF type, a shrunk photo's is its own
 * type, a voice note's is its own when the desk lists it and otherwise the one its extension names (audio/x-m4a stays as it is).
 */
export function claimedMime(kind: UploadKind, file: Pick<File, "name" | "type">): string {
  if (kind === "pdf") return PDF_MIME;
  const type = bareMime(file.type);
  if (kind === "image") return type;
  if ((AUDIO_MIMES as readonly string[]).includes(type)) return type;
  return AUDIO_BY_EXTENSION[/\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? ""] ?? type;
}
