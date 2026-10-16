// Browser-safe entry of the sources module: pure shapes, the link key and the desk's fixed words. No server-only import, no database, no node API.
export { cleanSourceUrl, urlKey, MAX_SOURCE_URL, type UrlKey } from "./url-key";
export { GONE_TEXT, longDate, NO_LINK_ANSWER, noteDateLine, PROBLEM_TEXT, repeatAnswer, SAVED_ANSWER } from "./copy";
export { MAX_READ_ATTEMPTS, MAX_SOURCE_COMPANIES, MAX_SOURCE_CONCEPTS, MAX_STUDIED, NOTE_MAX, STUDIED_NOTE_MAX, PROBLEM_CODES, type NewSource, type ProblemCode, type SourceFilter, type SourceKind, type SourceRecord } from "./types";
