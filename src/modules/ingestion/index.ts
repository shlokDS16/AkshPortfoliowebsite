// Server-side entry: the job engine, run by src/modules/ops/drain.ts on the Db ops hands it.
// Browser code imports caps and types from "./client"; server actions live in "./actions".
import "server-only";

export * from "./caps";
export type { NewStep, Step, StepContext, StepHandler, StepKind, StepOutcome, StepStatus, WaitReason } from "./types";
export { machineDocuments, type DrainDeps, type MachineDocumentsRepo, type MachineRepos } from "./deps";
export { llmTimeoutMs } from "./deadline";
export { estimateReadyBy, formatReadyBy, type Eta, type EtaInput } from "./eta";
export { createQueueRepo, type FinishPatch, type QueueRepo } from "./queue-repo";
export { drain, STOPPED_TWICE, type DrainSummary } from "./runner";
export { HANDLERS } from "./steps";
