// Browser-safe entry point (the inbox screens, the ops health rules). No server-only imports, no node:crypto.
export * from "./caps";
export { aiPagesToday } from "./allowance";
export { estimateReadyBy, formatReadyBy, type Eta, type EtaInput } from "./eta";
export type { NewStep, Step, StepKind, StepOutcome, StepStatus, WaitReason } from "./types";
export type { InboxDoc } from "./inbox";
export type { DocState, Tray, TrayView } from "./trays";
export { UPLOAD_NOT_FINISHED } from "./trays";
export { TRANSCRIPT_READY } from "./voice-copy";
export type { ActionFailure, ActionResult, FinishUploadResult, StartUploadResult } from "./upload-flow";
export type { StartDocumentResult } from "./link-flow";
export type { RereadCost } from "./reread";
export { FLAGS, machineFactSchema, proposedFactSchema, type Flag, type MachineFact, type ProposedFact } from "./proposed-fact";
export type {
  EditFields, FileUnderInput, FileUnderResult, ProposalStatus, ProposalView, ReadingView, ResolveInput, ResolveResult, ReviewCounts, ReviewData, SaveValuesResult, ValueDecision,
} from "./review-types";
export { whyFor } from "./review-types";
export { groupValues, isListed } from "./review-values";
export type { StagedReading, StagedRow } from "./staging";
export { machineReadingSchema, type MachineReading } from "./readings";
export type { FactProvenance } from "./provenance";
export { factDiffers, likePrinted } from "./fact-differs";
export * from "./digest-view";
