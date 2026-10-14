import { addDays, istDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import {
  entrySetText, LEDGER_CLOSE_REASON_TEXT, LEDGER_EXPECTS_TEXT, LEDGER_KIND_TEXT, LEDGER_NO_RESULT_TEXT, LEDGER_PROCESS_TEXT, LEDGER_RESULT_SO_FAR, LEDGER_RESULT_WORD, LEDGER_TAG_TEXT,
} from "@/lib/messages-ledger";
import { endedAsExpected, needsCheck } from "./flags";
import { formatMove, formatPoints, horizonText } from "./figures";
import { restatements, scoreMarks, type Mark, type Restated } from "./marks";
import type { CloseReason, Expects, Idea, IdeaEvent, IdeaEventKind, IdeaScore, IdeaStatus, MistakeTag, ProcessCall, ScoreChange, Summary } from "./types";

// View models for the Ledger screens (pure). Two kinds, kept apart as the screens keep them apart: `IdeaLine` is the
// machine's side (figures, marks, restatements) next to his choices (direction, horizon, close reason, process call);
// `EventLine` is his side only (his words as typed, his choices as labels, the seal). Neither holds the other's fields.

export type IdeaLine = {
  id: string;
  name: string;
  symbol: string | null;
  expects: Expects;
  expectsText: string;
  horizonText: string;
  /** The day the horizon ends (India date), counted from the entry date, or from the day it was sealed until the entry is fixed (as the summary counts it). */
  horizonEnds: string;
  status: IdeaStatus;
  openedOn: string;
  closedOn: string | null;
  closeReasonText: string | null;
  /** Closed ideas only: has he written what he learned. */
  lesson: "written" | "missing" | null;
  processText: string | null;
  /** `check`: a flag asks for a look; `waiting`: no entry close yet; `figures`: there is a result to show. */
  state: "check" | "waiting" | "figures";
  /** The flag's sentence, shown in place of the result when the state is `check` or `waiting`. */
  headline: string | null;
  entryDate: string | null;
  markDate: string | null;
  daysHeld: number | null;
  shareMove: string | null;
  indexMove: string | null;
  result: string | null;
  resultWord: string | null;
  isFinal: boolean;
  /** Every mark except the one used as the headline. */
  marks: Mark[];
  restated: Restated[];
  pastHorizon: boolean;
};

const has = (table: object, key: string): boolean => Object.hasOwn(table, key);

export function ideaLine(idea: Idea, score: IdeaScore | null, changes: readonly ScoreChange[], pastHorizon: boolean): IdeaLine {
  const all = scoreMarks(score);
  const flagged = score !== null && needsCheck(score);
  // An open idea counts only once it has been held a day (summary.ts), so until then its row says the entry is set and waits.
  const notHeldYet = idea.status === "open" && score !== null && score.entryDate !== null && (score.holdingDays ?? 0) <= 0;
  const waiting = !flagged && (score === null || score.entryDate === null || score.excess === null || notHeldYet);
  const headlineMark = flagged ? all.find((m) => m.check) : waiting ? all.find((m) => m.key === "entry_pending") : undefined;
  const showFigures = !flagged && !waiting && score !== null && score.excess !== null;
  const opened = istDate(idea.openedAt);
  return {
    id: idea.id,
    name: idea.companyName,
    symbol: idea.symbol,
    expects: idea.expects,
    expectsText: LEDGER_EXPECTS_TEXT[idea.expects],
    horizonText: horizonText(idea.horizonDays),
    horizonEnds: addDays(score?.entryDate ?? opened, idea.horizonDays),
    status: idea.status,
    openedOn: opened,
    closedOn: idea.closedAt ? istDate(idea.closedAt) : null,
    closeReasonText: idea.closeReason && has(LEDGER_CLOSE_REASON_TEXT, idea.closeReason) ? LEDGER_CLOSE_REASON_TEXT[idea.closeReason] : null,
    lesson: idea.status === "closed" ? (idea.processCall ? "written" : "missing") : null,
    processText: idea.processCall && has(LEDGER_PROCESS_TEXT, idea.processCall) ? LEDGER_PROCESS_TEXT[idea.processCall] : null,
    state: flagged ? "check" : showFigures ? "figures" : "waiting",
    headline: showFigures ? null : (headlineMark?.text ?? (notHeldYet && score?.entryDate ? entrySetText(score.entryDate) : LEDGER_NO_RESULT_TEXT)),
    entryDate: score?.entryDate ?? null,
    markDate: score?.markDate ?? null,
    daysHeld: score?.holdingDays ?? null,
    shareMove: showFigures && score.ideaReturn !== null ? formatMove(score.ideaReturn) : null,
    indexMove: showFigures && score.indexReturn !== null ? formatMove(score.indexReturn) : null,
    result: showFigures ? formatPoints(score.excess as number) : null,
    resultWord: showFigures ? (score.isFinal ? LEDGER_RESULT_WORD : LEDGER_RESULT_SO_FAR)[endedAsExpected(score.excess as number) ? "yes" : "no"] : null,
    isFinal: score?.isFinal ?? false,
    marks: all.filter((m) => m.key !== headlineMark?.key),
    restated: restatements(changes.filter((c) => c.ideaId === idea.id)),
    pastHorizon,
  };
}

export type EventLine = {
  id: string;
  seq: number;
  kind: IdeaEventKind;
  kindText: string;
  recordedAt: string;
  /** The first 8 characters of the entry's hash: enough to recognise it, not a claim about it. */
  hashShort: string;
  /** His words exactly as sealed. */
  body: string;
  /** His choices on this entry, as labels. Never a price, a date or a return. */
  choices: string[];
};

const HELD_TEXT = { open: { true: "You hold a position", false: "You hold no position" }, downsize: { true: "You still hold some", false: "You hold none now" } } as const;

function choicesOf(kind: IdeaEventKind, stance: Record<string, unknown>): string[] {
  const out: string[] = [];
  const str = (key: string): string | null => (typeof stance[key] === "string" ? (stance[key] as string) : null);
  if (kind === "open") {
    const expects = str("expects");
    if (expects && has(LEDGER_EXPECTS_TEXT, expects)) out.push(LEDGER_EXPECTS_TEXT[expects as Expects]);
  }
  if ((kind === "open" || kind === "revise") && typeof stance.horizon_days === "number") out.push(`Horizon: ${horizonText(stance.horizon_days)}`);
  if ((kind === "open" || kind === "downsize") && typeof stance.held === "boolean") out.push(HELD_TEXT[kind][String(stance.held) as "true" | "false"]);
  if (kind === "close") {
    const reason = str("reason");
    if (reason && has(LEDGER_CLOSE_REASON_TEXT, reason)) out.push(`Reason: ${LEDGER_CLOSE_REASON_TEXT[reason as CloseReason]}`);
  }
  if (kind === "review") {
    const process = str("process");
    if (process && has(LEDGER_PROCESS_TEXT, process)) out.push(LEDGER_PROCESS_TEXT[process as ProcessCall]);
    const tags = Array.isArray(stance.tags) ? stance.tags.filter((t): t is string => typeof t === "string" && has(LEDGER_TAG_TEXT, t)) : [];
    if (tags.length > 0) out.push(`Tags: ${tags.map((t) => LEDGER_TAG_TEXT[t as MistakeTag]).join(", ")}`);
  }
  return out;
}

export function eventLine(e: IdeaEvent): EventLine {
  return {
    id: e.id,
    seq: e.seq,
    kind: e.kind,
    kindText: has(LEDGER_KIND_TEXT, e.kind) ? LEDGER_KIND_TEXT[e.kind] : e.kind,
    recordedAt: e.recordedAt,
    hashShort: e.hash.slice(0, 8),
    body: e.bodyMd,
    choices: choicesOf(e.kind, e.stance),
  };
}

export type NeedsYou = { kind: "check" | "lesson" | "horizon"; ideaId: string; name: string; body: string };

/** One card per idea that needs a look, in the order: checks, lessons, horizons. `summary` carries the idea ids. */
export function needsYou(ideas: readonly Idea[], scores: readonly IdeaScore[], summary: Pick<Summary, "needsCheck" | "noLesson" | "pastHorizon">): NeedsYou[] {
  const byId = new Map(ideas.map((i) => [i.id, i] as const));
  const scoreById = new Map(scores.map((s) => [s.ideaId, s] as const));
  const cards: NeedsYou[] = [];
  for (const id of summary.needsCheck) {
    const idea = byId.get(id);
    if (!idea) continue;
    const mark = scoreMarks(scoreById.get(id) ?? null).find((m) => m.check);
    cards.push({ kind: "check", ideaId: id, name: idea.companyName, body: mark?.text ?? "Needs a check." });
  }
  for (const id of summary.noLesson) {
    const idea = byId.get(id);
    if (!idea) continue;
    const closed = idea.closedAt ? formatDate(idea.closedAt) : "";
    cards.push({ kind: "lesson", ideaId: id, name: idea.companyName, body: `Closed ${closed}. Write what you learned while it is fresh.` });
  }
  for (const id of summary.pastHorizon) {
    const idea = byId.get(id);
    if (!idea) continue;
    const ends = formatDate(addDays(scoreById.get(id)?.entryDate ?? istDate(idea.openedAt), idea.horizonDays));
    cards.push({ kind: "horizon", ideaId: id, name: idea.companyName, body: `Its horizon of ${horizonText(idea.horizonDays)} ended on ${ends}. Close the idea or revise the horizon.` });
  }
  return cards;
}
