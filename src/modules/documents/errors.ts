import { DeskError } from "@/lib/errors";

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
  "voice-too-large": "This voice note is over 25 MB. Record a shorter one.",
  "voice-too-long": "This voice note is longer than 90 minutes. Record a shorter one.",
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
