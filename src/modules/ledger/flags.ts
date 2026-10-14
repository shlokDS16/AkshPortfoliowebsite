import { BENIGN_FLAGS } from "./constants";
import type { IdeaScore } from "./types";

/**
 * True when the score carries a flag that means "check this before trusting it" (a jump, an ISIN change, an implausible
 * return, or any flag this build does not know). Fail closed: an unknown flag is never read as harmless.
 */
export function needsCheck(score: Pick<IdeaScore, "flags">): boolean {
  return score.flags.some((flag) => !BENIGN_FLAGS.includes(flag));
}

/**
 * True when the call ended as expected. `excess` is the result for the call: the database flips its sign for an idea that
 * expects to do worse than the Nifty 50, so a positive figure means the call was right, not that the share beat the index.
 * Exactly zero is not as expected.
 */
export function endedAsExpected(excess: number): boolean {
  return excess > 0;
}
