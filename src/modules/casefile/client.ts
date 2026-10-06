// Browser-safe entry point (the editor's live facts-sheet check). No server-only imports here.
export { parseFactsSheet, serializeFactsSheet, SHEET_LEGEND, type SheetError } from "./sheet";
export { checkCaseFile } from "./check";
export {
  CASEFILE_SCHEMA, PERIOD_RE, scenarioBreaksRule9, caseFileSchema, EMPTY_CASEFILE, validateCaseFile, readCaseFile,
  type CaseFile, type CfExhibit, type CfFact, type CfScenario, type CfSource, type CfTest,
} from "./schema";
export { KILL_HEADING_RE, inlineText, parseInline, parseProse, splitThesisBody, type Condition, type Inline, type ProseBlock } from "./body";
export { fiscalYearEnd, formatFigure, parseNumber } from "./figures";
export { isIsoDate, isLagged, withheldUntil } from "./lag";
export { figureDates, latestFigureDate } from "./figure-dates";
