// Browser-safe entry point (the editor's live facts-sheet check). No server-only imports here.
export { parseFactsSheet, serializeFactsSheet, SHEET_LEGEND, type SheetCaseFile, type SheetError } from "./sheet";
export { checkCaseFile, fileProblems } from "./check";
export {
  CASEFILE_LIMITS, CASEFILE_SCHEMA, PERIOD_RE, SLUG_RE, scenarioBreaksRule9, caseFileSchema, EMPTY_CASEFILE, validateCaseFile, readCaseFile,
  type CaseFile, type CfExhibit, type CfFact, type CfScenario, type CfSource, type CfTest,
} from "./schema";
export { KILL_HEADING_RE, inlineText, parseInline, parseProse, splitThesisBody, type Condition, type Inline, type ProseBlock } from "./body";
export { fiscalYearEnd, formatFigure, parseNumber } from "./figures";
export { isIsoDate, isLagged, withheldUntil } from "./lag";
export { httpUrl } from "./safe";
export { figureDates, latestFigureDate } from "./figure-dates";
export {
  CASE_CLOSE_REASON_LABEL, CASE_MISTAKE_TAG_LABEL, CASE_PROCESS_LABEL, expectationSentence, horizonPhrase, isLedgerCase, mistakeTagsSentence, parseCaseRecord,
  PUBLIC_FINGERPRINT_FILE,
  type CaseCloseReason, type CaseEvent, type CaseEventKind, type CaseExpects, type CaseMistakeTag, type CasePoint, type CaseProcessCall, type CaseRecordV1,
} from "./case-record";
