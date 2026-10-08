// Server-side entry: the job engine, run by src/modules/ops/drain.ts on the Db ops hands it.
// Browser code imports caps and types from "./client"; server actions live in "./actions".
import "server-only";

export * from "./caps";
export type { NewStep, Step, StepContext, StepHandler, StepKind, StepOutcome, StepStatus, WaitReason } from "./types";
export { machineDocuments, type DrainDeps, type StepDeps, type MachineDocumentsRepo, type MachineRepos, type MachineResearch } from "./deps";
export { createDigestsRepo, type DigestRow, type DigestsRepo } from "./digests-repo";
export { createProposalsRepo, type NewExtraction, type ProposalRow, type ProposalsRepo } from "./proposals-repo";
export { llmTimeoutMs } from "./deadline";
export { callWithinBudget, estimateTokens, type BudgetResult } from "./governor";
export { createUsageRepo, pruneUsage, type Block, type BlockReason, type Caps, type UsageRepo } from "./usage-repo";
export { aiPagesToday } from "./allowance";
export { estimateReadyBy, formatReadyBy, type Eta, type EtaInput } from "./eta";
export { createQueueRepo, type FinishPatch, type QueueRepo } from "./queue-repo";
export { drain, STOPPED_TWICE, type DrainSummary } from "./runner";
export { HANDLERS } from "./steps";
export { countInbox, listCompanyOptions, listInbox, type InboxDoc } from "./inbox";
export { listNeedsYou, needsYouFrom, type NeedsYouDoc } from "./needs-you";
export { readSelected, setPageSelected, type InboxPorts } from "./inbox-ops";
export { runInbox } from "./inbox-run";
export { trayFor, type DocState, type Tray, type TrayView } from "./trays";
export { getReview } from "./review";
export { listStagedForItem, type StagedRow } from "./staging";
export { factDiffers, parseStaging, provenanceForItem, recordFiledFacts, type FactProvenance, type Staging } from "./provenance";
