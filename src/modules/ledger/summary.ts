import { addDays, istDate } from "@/lib/dates";
import { MIN_CLOSED_FOR_PERCENT } from "./constants";
import { isAhead, needsCheck } from "./flags";
import type { Idea, IdeaScore, ScoreChange, Summary } from "./types";

// Pure arithmetic over rows the database computed (spec s6). Nothing here calls a model, reads a clock or writes a
// number into a field that holds Aksh's words: the result is a set of counts, medians and lists of idea ids.

/** The middle value; the mean of the two middle values for an even count. Rounded to 9 places to shed float noise. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const m = sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  return Math.round(m * 1e9) / 1e9;
}

function pastHorizon(idea: Idea, score: IdeaScore | undefined, today: string): boolean {
  const start = score?.entryDate ?? istDate(idea.openedAt);
  return addDays(start, idea.horizonDays) < today;
}

/**
 * The private figures. Rules, in the order they are applied to each idea:
 * - withdrawn (void) ideas are counted apart and take part in nothing;
 * - an idea past its horizon or a closed idea without a lesson is listed, whatever its score says;
 * - an idea with no score, or whose entry close is not in yet, is `waiting` and in no figure;
 * - an idea whose score is flagged for a check is `needsCheck` and in no figure;
 * - a closed idea whose exit is not fixed is `exitPending` and counts in `all` (marked to the latest close), not in `closed`;
 * - hand-entered marks (flags hand_price and attested, treated alike) and stale marks are counted and named.
 * `changes` is the restatement log: every idea with an entry in it is listed in `restated`.
 */
export function summarise(ideas: readonly Idea[], scores: readonly IdeaScore[], today: string, changes: readonly ScoreChange[] = []): Summary {
  const scoreById = new Map(scores.map((s) => [s.ideaId, s] as const));
  const restatedIds = new Set(changes.map((c) => c.ideaId));
  const out: Summary = {
    closed: { ahead: 0, total: 0, showPercent: false },
    all: { ahead: 0, total: 0 },
    medianExcessClosed: null,
    medianExcessAll: null,
    holdingDays: null,
    pastHorizon: [],
    noLesson: [],
    needsCheck: [],
    waiting: [],
    exitPending: [],
    handEntered: [],
    stale: [],
    restated: [],
    withdrawn: 0,
  };
  const excessAll: number[] = [];
  const excessClosed: number[] = [];
  const held: number[] = [];

  for (const idea of ideas) {
    if (idea.status === "void") {
      out.withdrawn += 1;
      continue;
    }
    const score = scoreById.get(idea.id);
    if (restatedIds.has(idea.id)) out.restated.push(idea.id);
    if (idea.status === "open" && pastHorizon(idea, score, today)) out.pastHorizon.push(idea.id);
    if (idea.status === "closed" && idea.processCall === null) out.noLesson.push(idea.id);

    if (!score) {
      out.waiting.push(idea.id);
      continue;
    }
    if (needsCheck(score)) {
      out.needsCheck.push(idea.id);
      continue;
    }
    if (score.excess === null) {
      out.waiting.push(idea.id);
      continue;
    }
    if (score.flags.includes("hand_price") || score.flags.includes("attested")) out.handEntered.push(idea.id);
    if (score.flags.includes("stale")) out.stale.push(idea.id);

    out.all.total += 1;
    if (isAhead(score.excess)) out.all.ahead += 1;
    excessAll.push(score.excess);

    if (idea.status === "closed" && !score.isFinal) {
      out.exitPending.push(idea.id);
    } else if (idea.status === "closed") {
      out.closed.total += 1;
      if (isAhead(score.excess)) out.closed.ahead += 1;
      excessClosed.push(score.excess);
      if (score.holdingDays !== null) held.push(score.holdingDays);
    }
  }

  out.closed.showPercent = out.closed.total >= MIN_CLOSED_FOR_PERCENT;
  out.medianExcessAll = median(excessAll);
  out.medianExcessClosed = median(excessClosed);
  const mid = median(held);
  out.holdingDays = mid === null ? null : { median: mid, min: Math.min(...held), max: Math.max(...held) };
  return out;
}
