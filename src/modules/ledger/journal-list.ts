import { eventLine, type EventLine } from "./lines";
import type { Idea, IdeaEvent } from "./types";

// The Journal's list: the lessons he wrote when closing ideas, newest first, each with its idea. His words are the event's text,
// untouched; his choices (the process call and the tags) come from the same sealed entry. Pure.

export type LessonLine = { ideaId: string; name: string; symbol: string | null; entry: EventLine };

/** `lessons` are the "what I learned" entries as the repo returns them (newest first); the order is kept, and a lesson whose idea is unknown is left out. */
export function lessonLines(lessons: readonly IdeaEvent[], ideas: readonly Idea[]): LessonLine[] {
  const byId = new Map(ideas.map((i) => [i.id, i] as const));
  return lessons.flatMap((e) => {
    const idea = byId.get(e.ideaId);
    return e.kind === "review" && idea ? [{ ideaId: idea.id, name: idea.companyName, symbol: idea.symbol, entry: eventLine(e) }] : [];
  });
}
