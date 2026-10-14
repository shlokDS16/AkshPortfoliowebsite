import { DeskError } from "@/lib/errors";
import { LINK_MAX_BYTES, LINK_TIMEOUT_MS, TEXT_MAX_CHARS, TEXT_MIN_CHARS, VOICE_MAX_MB, VOICE_MAX_MINUTES } from "./limits";

/**
 * Fixed text per code (errata R11): equal to the entries in src/lib/messages.ts (a test keeps them equal).
 * Messages never carry data; a duplicate's earlier upload travels as `earlier` and the screen formats it.
 */
export const DOCUMENT_ERROR_TEXT = {
  "upload-duplicate": "You uploaded this file before. Open the earlier copy.",
  "upload-too-large": "Over 50 MB. Upload the financial statements section, or compress the file.",
  "upload-unsupported": "Drop a PDF, a photo or a voice note.",
  "upload-image-too-large": "This photo is still over 1 MB after shrinking; crop it to the table.",
  "upload-storage-full": "Storage is over 90% full. Mark finished documents as done to free space.",
  "upload-missing": "The upload did not arrive complete. Upload the file again.",
  "voice-off": "Voice notes are not switched on yet.",
  "voice-too-large": `This voice note is over ${VOICE_MAX_MB} MB. Record a shorter one.`,
  "voice-too-long": `This voice note is longer than ${VOICE_MAX_MINUTES} minutes. Record a shorter one.`,
  // Links and pasted text (Plan 2b Task 5; wording pending Shlok approval, spec s16.10). None of these quotes the link or an address.
  "link-invalid": "Use a full link that starts with https:// and has no user name, password or port number.",
  "link-blocked": "That link points somewhere the desk will not open.",
  "link-failed": "The desk could not open that link. Check it, or paste the text instead.",
  "link-redirects": "That link sends the desk through too many other links. Open it in your browser and paste the final link.",
  "link-too-large": `That link is over ${LINK_MAX_BYTES / 1_048_576} MB. Download the part you need and upload it.`,
  "link-timeout": `That link took longer than ${LINK_TIMEOUT_MS / 1000} seconds to answer. Try again, or paste the text instead.`,
  "link-unsupported": "That link is not a web page or a PDF. Upload the file instead.",
  "link-empty": "No readable text was found at that link. Paste the text instead.",
  "text-too-short": `Paste a little more, at least ${TEXT_MIN_CHARS} characters.`,
  "text-too-long": `That is over ${TEXT_MAX_CHARS.toLocaleString("en-US")} characters. Paste the part with the figures.`,
} as const;

export type DocumentErrorCode = keyof typeof DOCUMENT_ERROR_TEXT;

export class DocumentError extends DeskError {
  readonly code: DocumentErrorCode;
  constructor(
    code: DocumentErrorCode,
    readonly earlier?: { id: string; createdAt: string },
  ) {
    super(DOCUMENT_ERROR_TEXT[code]);
    this.code = code;
    this.name = "DocumentError";
  }
}
