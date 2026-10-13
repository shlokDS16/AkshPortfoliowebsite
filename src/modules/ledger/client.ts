// Browser-safe entry point: types, constants, copy and the pure arithmetic. No database client, no server-only import.
export type {
  AddEventCall, AnchorReason, AnchorStatus, ChainCheckRows, ChainProblem, ChainSource, ChainStatus, CloseReason, ClosesStatus, Expects, GridCell,
  Idea, IdeaEvent, IdeaEventKind, IdeaScore, IdeaStatus, LedgerRepo, MistakeTag, OpenIdeaCall, ProcessCall, ScoreChange, ScoreFlag, Summary,
} from "./types";
export {
  ADD_EVENT_KINDS, BENIGN_FLAGS, BODY_MAX, CLOSE_REASONS, EVENT_KINDS, EXPECTS, HORIZON_CHOICES, HORIZON_MAX_DAYS, HORIZON_MIN_DAYS,
  MIN_CLOSED_FOR_PERCENT, MISTAKE_TAGS, PROCESS_CALLS,
} from "./constants";
export { needsCheck } from "./flags";
export { summarise } from "./summary";
export { journalGrid } from "./journal";
export { chainLines, combineChecks } from "./chain";
export { LEDGER_ERROR_TEXT, type LedgerErrorCode } from "./errors";
export {
  CHAIN_LIMIT_TEXT, LEDGER_CLOSE_REASON_TEXT, LEDGER_EXPECTS_TEXT, LEDGER_FLAG_TEXT, LEDGER_GRID_TEXT, LEDGER_KIND_TEXT, LEDGER_PROCESS_TEXT,
  LEDGER_TAG_TEXT, LEDGER_UNKNOWN_FLAG_TEXT,
} from "@/lib/messages-ledger";
