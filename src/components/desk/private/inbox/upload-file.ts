import { errorText } from "@/lib/messages";
import { MAX_UPLOAD_BYTES, VOICE_MAX_BYTES, VOICE_MAX_SECONDS, type StartUploadInput } from "@/modules/documents/client";
import { UPLOAD_NOT_FINISHED, type FinishUploadResult, type StartUploadResult } from "@/modules/ingestion/client";
import { measureAudioSeconds } from "./audio-duration";
import { downscaleImage, type DownscaleResult } from "./downscale";
import { claimedMime, kindOfFile } from "./file-kinds";

// The browser's half of an upload (spec s6.2): check, shrink a photo or measure a voice note, hash, ask for a signed path, send the bytes straight
// to Storage, tell the server it arrived, nudge the reader. Pure of React: every call is injected, so a test can follow it.

export type UploadDeps = {
  hash: (file: Blob) => Promise<string>;
  start: (input: StartUploadInput) => Promise<StartUploadResult>;
  /** `contentType` is the bare type (no ;charset= or ;codecs=). */
  put: (path: string, token: string, file: File, contentType: string) => Promise<{ error: { message: string } | null }>;
  /** `seconds` is a voice note's measured length, kept on its first step to size the reservation. */
  finish: (documentId: string, seconds?: number | null) => Promise<FinishUploadResult>;
  kick: () => Promise<void>;
  /** Shrinks a photo to at most 1,600 px and 1 MB; the default draws on a canvas. */
  shrink?: (file: File) => Promise<DownscaleResult>;
  /** Voice notes are taken only while the server's switch is on (VOICE_NOTES); the server refuses them otherwise. */
  voiceOn?: boolean;
  /** A voice note's length in seconds as the browser hears it, or null; the default plays the metadata in an <audio> element. */
  measure?: (file: File) => Promise<number | null>;
};

export type UploadStage = "checking" | "uploading" | "saving";
export type UploadOutcome =
  | { ok: true; documentId: string }
  | { ok: false; message: string; earlier?: { id: string; createdAt: string } };

export type UploadExtras = Pick<StartUploadInput, "companyId" | "filedOn" | "sourceUrl">;

type Refusal = "upload-unsupported" | "upload-too-large" | "voice-off" | "voice-too-large" | "voice-too-long";
const refuse = (code: Refusal): UploadOutcome => ({ ok: false, message: errorText(code) ?? "" });

/**
 * The check that needs no network: kind and size, so a wrong file never starts an upload. A photo's size is checked after it
 * is shrunk. A voice note is refused while the switch is off, whatever its size.
 */
export function checkFile(file: Pick<File, "name" | "size" | "type">, voiceOn = false): UploadOutcome | null {
  const kind = kindOfFile(file);
  if (!kind) return refuse("upload-unsupported");
  if (kind === "audio" && !voiceOn) return refuse("voice-off");
  if (kind === "pdf" && file.size > MAX_UPLOAD_BYTES) return refuse("upload-too-large");
  if (kind === "audio" && file.size > VOICE_MAX_BYTES) return refuse("voice-too-large");
  return null;
}

export async function uploadFile(file: File, extras: UploadExtras, deps: UploadDeps, onStage: (stage: UploadStage) => void): Promise<UploadOutcome> {
  const refused = checkFile(file, deps.voiceOn);
  if (refused) return refused;
  const kind = kindOfFile(file);
  if (!kind) return refuse("upload-unsupported");

  onStage("checking");
  let toSend = file;
  if (kind === "image") {
    const shrunk = await (deps.shrink ?? downscaleImage)(file);
    if (!shrunk.ok) return { ok: false, message: shrunk.message };
    toSend = shrunk.file;
  }
  // A voice note's length, if the browser can tell: it sizes the allowance held back and refuses one that cannot fit the hour.
  let seconds: number | null = null;
  if (kind === "audio") {
    seconds = await (deps.measure ?? measureAudioSeconds)(file).catch(() => null);
    if (seconds !== null && seconds > VOICE_MAX_SECONDS) return refuse("voice-too-long");
  }
  const mime = claimedMime(kind, toSend);
  const sha256 = await deps.hash(toSend);
  const started = await deps.start({ kind, fileName: toSend.name, bytes: toSend.size, mime, sha256, ...extras, ...(kind === "audio" ? { seconds } : {}) });
  if (!started.ok) return { ok: false, message: started.message, earlier: started.earlier };

  onStage("uploading");
  const put = await deps.put(started.path, started.token, toSend, mime).catch(() => ({ error: { message: "network" } }));
  if (put.error) return { ok: false, message: UPLOAD_NOT_FINISHED };

  onStage("saving");
  const finished = await (kind === "audio" ? deps.finish(started.documentId, seconds) : deps.finish(started.documentId));
  if (!finished.ok) return { ok: false, message: finished.message };
  await deps.kick().catch(() => undefined); // the 15-minute pump reads the document anyway
  return { ok: true, documentId: started.documentId };
}
