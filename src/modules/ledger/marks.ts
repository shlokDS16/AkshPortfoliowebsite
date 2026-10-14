import { formatDate } from "@/lib/format";
import {
  entryLateText, exitLateText, LEDGER_FIELD_TEXT, LEDGER_FLAG_TEXT, LEDGER_OTHER_CHANGE_TEXT, LEDGER_REMOVED_TEXT, LEDGER_UNKNOWN_FLAG_TEXT, restatedText,
} from "@/lib/messages-ledger";
import { BENIGN_FLAGS } from "./constants";
import { formatClose, formatMove, formatPoints } from "./figures";
import type { IdeaScore, ScoreChange, ScoreFlag } from "./types";

// What must be visible wherever a score is shown (Task 10): the flags in plain words, the days an entry or exit was taken
// late, and the restatement log with the old and the new figure. Pure. Machine facts only: nothing here is his text.

/** `check` marks mean "look at this before trusting the figure"; the others are notes about what the figure rests on. */
export type Mark = { key: string; text: string; check: boolean };
export type Restated = { id: number; headline: string; lines: string[] };

const NOTES: readonly ScoreFlag[] = ["entry_pending", "exit_pending", "hand_price", "attested", "stale"];

const flagText = (flag: string): string => (Object.hasOwn(LEDGER_FLAG_TEXT, flag) ? LEDGER_FLAG_TEXT[flag as ScoreFlag] : LEDGER_UNKNOWN_FLAG_TEXT);

export function scoreMarks(score: IdeaScore | null): Mark[] {
  if (!score) return [{ key: "entry_pending", text: LEDGER_FLAG_TEXT.entry_pending, check: false }];
  const marks: Mark[] = [];
  for (const flag of score.flags) {
    if (!BENIGN_FLAGS.includes(flag)) marks.push({ key: flag, text: flagText(flag), check: true });
  }
  for (const flag of NOTES) {
    if (score.flags.includes(flag)) marks.push({ key: flag, text: flagText(flag), check: false });
  }
  if ((score.entrySkippedDays ?? 0) > 0) marks.push({ key: "entry_late", text: entryLateText(score.entrySkippedDays as number), check: false });
  if ((score.exitSkippedDays ?? 0) > 0) marks.push({ key: "exit_late", text: exitLateText(score.exitSkippedDays as number), check: false });
  return marks;
}

function figure(field: string, value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string") return field.endsWith("_date") ? formatDate(value) : "changed";
  if (typeof value !== "number") return "changed";
  if (field === "idea_return" || field === "index_return") return formatMove(value);
  if (field === "excess") return formatPoints(value);
  if (field === "holding_days" || field === "factor") return String(value);
  return formatClose(value);
}

/** The restatement log of one idea or of all, in the order given. A field it has no words for is named once as "another part changed"; the old and new raw values are never printed. */
export function restatements(changes: readonly ScoreChange[]): Restated[] {
  return changes.map((c) => {
    const lines = c.changed.flatMap((field) => {
      if (field === "void") return [LEDGER_REMOVED_TEXT];
      if (!Object.hasOwn(LEDGER_FIELD_TEXT, field)) return [];
      return [`${LEDGER_FIELD_TEXT[field as keyof typeof LEDGER_FIELD_TEXT]}: was ${figure(field, c.was[field])}, now ${figure(field, c.became[field])}.`];
    });
    if (c.changed.some((f) => f !== "void" && !Object.hasOwn(LEDGER_FIELD_TEXT, f))) lines.push(LEDGER_OTHER_CHANGE_TEXT);
    return { id: c.id, headline: restatedText(c.changedAt), lines };
  });
}
