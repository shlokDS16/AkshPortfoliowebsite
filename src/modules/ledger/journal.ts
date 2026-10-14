import { endedAsExpected, needsCheck } from "./flags";
import type { GridCell, Idea, IdeaScore } from "./types";

/**
 * His process call against the machine's outcome, for closed ideas only (spec s6). Sound and as expected is "earned", flawed
 * and as expected "lucky", sound and not as expected "unlucky", flawed and not as expected "deserved". "As expected" holds
 * for an idea that expected to do worse than the Nifty 50 as much as for one that expected to do better: the database
 * flips the sign of the excess for the former. The call is his, the outcome is the scorer's; they meet only here. An idea
 * is in no cell until it is closed with its exit fixed, reviewed, and not flagged for a check. Level counts as not as
 * expected. Ideas keep the order they were given.
 */
export function journalGrid(ideas: readonly Idea[], scores: readonly IdeaScore[]): Record<GridCell, string[]> {
  const scoreById = new Map(scores.map((s) => [s.ideaId, s] as const));
  const grid: Record<GridCell, string[]> = { earned: [], lucky: [], unlucky: [], deserved: [] };
  for (const idea of ideas) {
    if (idea.status !== "closed" || idea.processCall === null) continue;
    const score = scoreById.get(idea.id);
    if (!score || !score.isFinal || score.excess === null || needsCheck(score)) continue;
    const asExpected = endedAsExpected(score.excess);
    const cell: GridCell = idea.processCall === "sound" ? (asExpected ? "earned" : "unlucky") : asExpected ? "lucky" : "deserved";
    grid[cell].push(idea.id);
  }
  return grid;
}
