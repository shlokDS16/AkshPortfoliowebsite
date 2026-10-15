import { isRecord } from "@/lib/records";
import { isIsoDate } from "./lag";

// The ledger record of a case study, version 1 (spec s33.2). The database builds it (the ledger's record builder, migration 0018); the desk copies
// it into `structured.ledger` verbatim and the publish gate rebuilds it and requires an exact match. This file only READS it:
// the field names are the record's own (snake_case), and a value this parser does not recognise gives null, never a partial
// record, so a page shows a whole record or nothing. Public-safe: no database, no server-only import.

export type CaseEventKind = "open" | "revise" | "close" | "review";
export type CaseExpects = "outperform" | "underperform";
export type CaseCloseReason = "played_out" | "thesis_broken" | "horizon_reached" | "better_use" | "other";
export type CaseProcessCall = "sound" | "flawed";
export type CaseMistakeTag = "thesis" | "valuation" | "timing" | "sizing" | "process" | "behaviour" | "luck" | "none";

/** One revealed entry. `words` are his; every other field is the machine's (hashes, times, listing). */
export type CaseEvent = {
  seq: number;
  kind: CaseEventKind;
  at: string;
  words: string;
  stance: Record<string, unknown>;
  prev_hash: string;
  hash: string;
  canonical: string;
  listed_on: string | null;
};

export type CasePoint = { d: string; share: number; index: number };

export type CaseRecordV1 = {
  v: 1;
  idea: string;
  company_id: string;
  symbol: string;
  company: string;
  expects: CaseExpects;
  benchmark: string;
  horizon_days: number;
  close_reason: CaseCloseReason;
  process: CaseProcessCall;
  tags: CaseMistakeTag[];
  entry_date: string;
  exit_date: string;
  holding_days: number;
  events: CaseEvent[];
  chart: { points: CasePoint[] } | null;
  figures_to: string;
};

/** Public words for what the ledger can seal (s33.5). A test keeps the keys equal to the ledger's own lists. */
export const CASE_CLOSE_REASON_LABEL: Record<CaseCloseReason, string> = {
  played_out: "played out",
  thesis_broken: "thesis broken",
  horizon_reached: "period reached",
  better_use: "a better use for the money",
  other: "other",
};
export const CASE_PROCESS_LABEL: Record<CaseProcessCall, string> = { sound: "sound", flawed: "flawed" };
export const CASE_MISTAKE_TAG_LABEL: Record<CaseMistakeTag, string> = {
  thesis: "thesis", valuation: "valuation", timing: "timing", sizing: "sizing", process: "process", behaviour: "behaviour", luck: "luck", none: "none",
};

/** Where the public copy of the fingerprints lives, once Shlok answers Q26 and Q35 (a one-line change; D39). Null: not switched on. */
export const PUBLIC_FINGERPRINT_FILE: { url: string; since: string } | null = null;

const MAX_EVENTS = 200;
const MAX_POINTS = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const SEALED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const KINDS: readonly string[] = ["open", "revise", "close", "review"];
const EXPECTS: readonly string[] = ["outperform", "underperform"];
const CLOSE_REASONS = Object.keys(CASE_CLOSE_REASON_LABEL);
const PROCESS_CALLS = Object.keys(CASE_PROCESS_LABEL);
const TAGS = Object.keys(CASE_MISTAKE_TAG_LABEL);

const RECORD_KEYS = [
  "v", "idea", "company_id", "symbol", "company", "expects", "benchmark", "horizon_days", "close_reason", "process", "tags", "entry_date",
  "exit_date", "holding_days", "events", "chart", "figures_to",
];
const EVENT_KEYS = ["seq", "kind", "at", "words", "stance", "prev_hash", "hash", "canonical", "listed_on"];

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((k) => Object.hasOwn(value, k));
};
const isText = (value: unknown): value is string => typeof value === "string";
const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const isOneOf = (value: unknown, allowed: readonly string[]): boolean => typeof value === "string" && allowed.includes(value);

function parseEvent(value: unknown): CaseEvent | null {
  if (!isRecord(value) || !exactKeys(value, EVENT_KEYS)) return null;
  const { seq, kind, at, words, stance, prev_hash: prev, hash, canonical, listed_on: listedOn } = value;
  if (!isInt(seq) || seq < 1 || !isOneOf(kind, KINDS) || !isText(at) || !SEALED_AT.test(at) || !isText(words) || !isRecord(stance)) return null;
  if (!isText(prev) || !HASH.test(prev) || !isText(hash) || !HASH.test(hash) || !isText(canonical)) return null;
  if (listedOn !== null && !isIsoDate(listedOn)) return null;
  return { seq, kind: kind as CaseEventKind, at, words, stance, prev_hash: prev, hash, canonical, listed_on: listedOn };
}

function parseEvents(value: unknown): CaseEvent[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVENTS) return null;
  const events: CaseEvent[] = [];
  for (const raw of value) {
    const event = parseEvent(raw);
    const previous = events.at(-1);
    if (!event || (previous && event.seq <= previous.seq)) return null;
    events.push(event);
  }
  return events[0]?.kind === "open" ? events : null;
}

function parseChart(value: unknown): { points: CasePoint[] } | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !exactKeys(value, ["points"]) || !Array.isArray(value.points) || value.points.length > MAX_POINTS) return undefined;
  const points: CasePoint[] = [];
  for (const raw of value.points) {
    if (!isRecord(raw) || !exactKeys(raw, ["d", "share", "index"])) return undefined;
    const { d, share, index } = raw;
    if (!isIsoDate(d) || typeof share !== "number" || !Number.isFinite(share) || typeof index !== "number" || !Number.isFinite(index)) return undefined;
    points.push({ d, share, index });
  }
  return { points };
}

/** The record, or null when anything about it is unknown, missing, extra or malformed. Returns the same values it was given (copied, not changed). */
export function parseCaseRecord(value: unknown): CaseRecordV1 | null {
  if (!isRecord(value) || !exactKeys(value, RECORD_KEYS) || value.v !== 1) return null;
  const { idea, company_id: companyId, symbol, company, expects, benchmark, horizon_days: horizon, close_reason: reason, process } = value;
  const { tags, entry_date: entry, exit_date: exit, holding_days: held, figures_to: figuresTo } = value;
  if (!isText(idea) || !UUID.test(idea) || !isText(companyId) || !UUID.test(companyId)) return null;
  if (!isText(symbol) || symbol === "" || !isText(company) || company === "" || !isText(benchmark) || benchmark === "") return null;
  if (!isOneOf(expects, EXPECTS) || !isOneOf(reason, CLOSE_REASONS) || !isOneOf(process, PROCESS_CALLS)) return null;
  if (!isInt(horizon) || horizon < 30 || horizon > 3650 || !isInt(held) || held < 0) return null;
  if (!Array.isArray(tags) || tags.length > TAGS.length || !tags.every((t) => isOneOf(t, TAGS))) return null;
  if (!isIsoDate(entry) || !isIsoDate(exit) || !isIsoDate(figuresTo)) return null;
  const events = parseEvents(value.events);
  const chart = parseChart(value.chart);
  if (!events || chart === undefined) return null;
  return {
    v: 1, idea, company_id: companyId, symbol, company, expects: expects as CaseExpects, benchmark, horizon_days: horizon,
    close_reason: reason as CaseCloseReason, process: process as CaseProcessCall, tags: tags as CaseMistakeTag[], entry_date: entry, exit_date: exit,
    holding_days: held, events, chart, figures_to: figuresTo,
  };
}

/** True when the structured data of a revision carries a ledger record (the gate asks the same: the key is there). */
export function isLedgerCase(structured: unknown): boolean {
  return isRecord(structured) && Object.hasOwn(structured, "ledger");
}

/** "6 months", "1 year", "3 years"; a whole number of years otherwise ("2 years"); else the days. */
export function horizonPhrase(days: number): string {
  if (days === 182) return "6 months";
  if (days > 0 && days % 365 === 0) return days === 365 ? "1 year" : `${days / 365} years`;
  return `${days} days`;
}

/** The first line under "What he expected" (s33.5). */
export function expectationSentence(company: string, expects: CaseExpects, horizonDays: number): string {
  return `Expected ${company} to do ${expects === "outperform" ? "better" : "worse"} than the Nifty 50 over ${horizonPhrase(horizonDays)}.`;
}

/** "Kinds of mistake he named: timing, valuation." or "He named no mistake." (`none` is the absence of a tag). */
export function mistakeTagsSentence(tags: readonly CaseMistakeTag[]): string {
  const named = tags.filter((t) => t !== "none").map((t) => CASE_MISTAKE_TAG_LABEL[t]);
  return named.length === 0 ? "He named no mistake." : `Kinds of mistake he named: ${named.join(", ")}.`;
}
