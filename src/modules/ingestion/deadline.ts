import { DEADLINE_MARGIN_MS, LLM_MIN_LEFT_MS, LLM_TIMEOUT_MAX_MS } from "./caps";

/**
 * How long an LLM call inside a step may wait (ruling R3): min(90 s, time to the drain deadline less 10 s).
 * Null when under 20 s remain: the step defers (no failure counted) instead of starting a call the
 * function might not live to finish.
 */
export function llmTimeoutMs(deadline: number, clock: () => number): number | null {
  const left = deadline - clock();
  if (left < LLM_MIN_LEFT_MS) return null;
  return Math.min(LLM_TIMEOUT_MAX_MS, left - DEADLINE_MARGIN_MS);
}
