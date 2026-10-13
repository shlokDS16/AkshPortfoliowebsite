import { BENIGN_FLAGS } from "./constants";
import type { IdeaScore } from "./types";

/**
 * True when the score carries a flag that means "check this before trusting it" (a jump, an ISIN change, an implausible
 * return, or any flag this build does not know). Fail closed: an unknown flag is never read as harmless.
 */
export function needsCheck(score: Pick<IdeaScore, "flags">): boolean {
  return score.flags.some((flag) => !BENIGN_FLAGS.includes(flag));
}

export function isAhead(excess: number): boolean {
  return excess > 0;
}
