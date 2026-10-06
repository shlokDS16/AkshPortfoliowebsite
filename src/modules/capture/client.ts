// Browser-safe entry point: no server-only imports may be added here (client.test.ts enforces it).
export { parseCapture, type CaptureKind, type ParsedCapture } from "./parse";
export {
  createCaptureQueue,
  createMemoryStorage,
  QUEUE_KEY,
  REJECTED_KEY,
  resolveStorage,
  resolveStorageInfo,
  type CaptureQueue,
  type FlushResult,
  type LockRunner,
  type QueuedCapture,
  type QueueOptions,
  type RejectedCapture,
  type SendOutcome,
  type SendVerdict,
  type StorageLike,
} from "./queue";
export { rejectionText, submitErrorText, type SubmitErrorCode } from "./messages";
export type { CaptureSource } from "./types";
