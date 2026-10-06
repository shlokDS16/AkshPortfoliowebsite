// Browser-safe entry point: no server-only imports may be added here (client.test.ts enforces it).
export { parseCapture, type CaptureKind, type ParsedCapture } from "./parse";
export {
  createCaptureQueue,
  CORRUPT_KEY,
  isCaptureStorageKey,
  QUEUE_KEY,
  REJECTED_KEY,
  type CaptureQueue,
  type CorruptCapture,
  type FlushOptions,
  type FlushResult,
  type LockRunner,
  type QueuedCapture,
  type QueueOptions,
  type RejectedCapture,
  type SendOutcome,
  type SendVerdict,
} from "./queue";
export { createMemoryStorage, resolveStorage, resolveStorageInfo, webStorage, type StorageLike } from "./storage";
export { rejectionText, submitErrorText, type SubmitErrorCode } from "./messages";
export type { CaptureSource } from "./types";
