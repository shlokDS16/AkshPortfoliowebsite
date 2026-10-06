import type { HeartbeatRepo } from "./heartbeat";
import { runSteps, type Step, type StepResult } from "./steps";

// Phase 1: each clock only proves it is alive. Later phases append steps (each its own heartbeat).
export const DAILY_STEPS: readonly Step[] = [{ job: "heartbeat:daily", run: async () => "alive" }];
export const PUMP_STEPS: readonly Step[] = [{ job: "heartbeat:pump", run: async () => "alive; the job queue arrives in Phase 2" }];

/** One runner for both clocks: only the default step list differs. */
const runnerFor =
  (defaults: readonly Step[]) =>
  (repo: HeartbeatRepo, steps: readonly Step[] = defaults): Promise<StepResult[]> =>
    runSteps(steps, (beat) => repo.record(beat));

export const runDaily = runnerFor(DAILY_STEPS);
export const runPump = runnerFor(PUMP_STEPS);
