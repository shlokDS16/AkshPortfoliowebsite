import { isAhead, needsCheck } from "./flags";
import type { GridCell, Idea, IdeaScore } from "./types";

/**
 * His process call against the machine's outcome, for closed ideas only (spec s6). Sound and ahead is "earned", flawed
 * and ahead "lucky", sound and behind "unlucky", flawed and behind "deserved". The call is his, the outcome is the
 * scorer's; they meet only here. An idea is in no cell until it is closed with its exit fixed, reviewed, and not flagged
 * for a check. Level with the index counts as behind. Ideas keep the order they were given.
 */
export function journalGrid(ideas: readonly Idea[], scores: readonly IdeaScore[]): Record<GridCell, string[]> {
  const scoreById = new Map(scores.map((s) => [s.ideaId, s] as const));
  const grid: Record<GridCell, string[]> = { earned: [], lucky: [], unlucky: [], deserved: [] };
  for (const idea of ideas) {
    if (idea.status !== "closed" || idea.processCall === null) continue;
    const score = scoreById.get(idea.id);
    if (!score || !score.isFinal || score.excess === null || needsCheck(score)) continue;
    const ahead = isAhead(score.excess);
    const cell: GridCell = idea.processCall === "sound" ? (ahead ? "earned" : "unlucky") : ahead ? "lucky" : "deserved";
    grid[cell].push(idea.id);
  }
  return grid;
}
