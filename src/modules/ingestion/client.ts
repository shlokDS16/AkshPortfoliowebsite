// Browser-safe entry point (the inbox screens, the ops health rules). No server-only imports, no node:crypto.
export * from "./caps";
export { estimateReadyBy, formatReadyBy, type Eta, type EtaInput } from "./eta";
export type { NewStep, Step, StepKind, StepOutcome, StepStatus, WaitReason } from "./types";
export type { InboxDoc } from "./inbox";
export type { DocState, Tray, TrayView } from "./trays";
export { UPLOAD_NOT_FINISHED } from "./trays";
export type { ActionFailure, ActionResult, FinishUploadResult, StartUploadResult } from "./upload-flow";
