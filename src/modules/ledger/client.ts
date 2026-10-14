// Browser-safe entry point: types, constants, copy and the pure arithmetic. No database client, no server-only import.
export type {
  ActionKind, AddActionCall, AddEventCall, AnchorReason, AnchorStatus, ChainCheckRows, ChainProblem, ChainSource, ChainStatus, CloseReason, ClosesStatus, CorporateAction, EnterCloseCall, EnterCloseResult, Expects, GridCell,
  Idea, IdeaEvent, IdeaEventKind, IdeaScore, IdeaStatus, LedgerRepo, MarketDay, MistakeTag, OpenIdeaCall, PickCompany, ProcessCall, ScoreChange, ScoreFlag, StoredClose, Summary, UploadRecord,
} from "./types";
export {
  ACTION_AHEAD_DAYS, ACTION_FIRST_DATE, ACTION_KINDS, CLOSE_LOOKBACK_DAYS, ACTION_NOTE_MAX, ADD_EVENT_KINDS, BENIGN_FLAGS, FACTOR_MAX, FACTOR_MIN, BODY_MAX, CLOSE_REASONS, EVENT_KINDS, EXPECTS, HORIZON_CHOICES, HORIZON_MAX_DAYS, HORIZON_MIN_DAYS,
  MIN_CLOSED_FOR_PERCENT, MISTAKE_TAGS, PROCESS_CALLS,
} from "./constants";
export { needsCheck } from "./flags";
export { windowOf, WINDOW_MAX } from "./window";
export { UPLOAD_LIMITS, UPLOAD_REFUSALS, type UploadRefusal, type UploadResult } from "./upload";
export { summarise } from "./summary";
export { journalGrid } from "./journal";
export { lessonLines, type LessonLine } from "./journal-list";
export {
  buildClosesView, DAYS_SHOWN, RECENT_DAYS, trackedIdeas, type ActionGroup, type ActionLine, type ClosesView, type DayLine, type DayState, type HandCloseLine, type UploadLine,
  type RestatedLine,
} from "./closes";
export { datesToFetch, FETCH_WINDOW_DAYS, isWeekday, lastOpenDate, unsettledWeekdays, weekdaysBehind, type MarketDayRow } from "./trading-days";
export { chainLines, chainReport, combineChecks, type ChainReport } from "./chain";
export { LEDGER_ERROR_TEXT, type LedgerErrorCode } from "./errors";
export {
  CHAIN_LIMIT_TEXT, closedNotCountedText, LEDGER_CLOSE_REASON_TEXT, LEDGER_EXPECTS_TEXT, LEDGER_FLAG_TEXT, LEDGER_GRID_TEXT, LEDGER_KIND_TEXT,
  LEDGER_OUTCOME_TEXT, LEDGER_PROCESS_TEXT, LEDGER_TAG_TEXT, LEDGER_UNKNOWN_FLAG_TEXT,
} from "@/lib/messages-ledger";
export type { ChainState, IdeaPage, LedgerHome, AddKind } from "./queries";
export { eventLine, ideaLine, needsYou, type EventLine, type IdeaLine, type NeedsYou } from "./lines";
export { restatements, scoreMarks, type Mark, type Restated } from "./marks";
export { formatClose, formatMove, formatPoints, horizonText, voidDeadline } from "./figures";
export {
  CHAIN_CHECK_LABEL, CHAIN_UNREADABLE_TEXT, closesLineText, LEDGER_ACTION_TEXT, LEDGER_CLOSE_HINT, LEDGER_SEALED_WARNING, LEDGER_SUBMIT_TEXT,
  LEDGER_WORDS_LABEL, voidHintText, copyLineText, LEDGER_ALL_OUTCOME_TEXT, LEDGER_DIRECTION_NOTE, LEDGER_EMPTY_TEXT,
  LEDGER_JOB_LABEL, LEDGER_NO_RESULT_TEXT, LEDGER_PLAIN_FIGURES_NOTE, LEDGER_PRICE_ONLY_TEXT, LEDGER_RESULT_SO_FAR, LEDGER_RESULT_WORD, LEDGER_SOURCE_TEXT, sealedLineText,
} from "@/lib/messages-ledger";
