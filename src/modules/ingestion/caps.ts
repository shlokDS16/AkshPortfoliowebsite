// Job engine limits (spec s8, s9). Quotas are facts: a changed number needs a spec s9 edit with a source.

/** Lease on a claimed step; claim_job_step accepts 30-290 s, and a function lives at most 300 s. */
export const LEASE_SECONDS = 270;
/** Do not claim a step with less than this left (ruling R3: raised from 30 s so a 90 s LLM wait fits). */
export const MIN_STEP_MS = 45_000;
export const SCHEMA_FAILURE_LIMIT = 2;
export const PROVIDER_FAILURE_LIMIT = 3;
export const LEASE_EXPIRY_LIMIT = 2;
/** The queue is unhealthy when a runnable step has waited longer than this. */
export const QUEUE_STALE_SECONDS = 6 * 60 * 60;
/** How long each caller drains: the pump route, the daily cron, the inbox kick and a keep-reading tab. */
export const DRAIN_MS = { pump: 240_000, daily: 200_000, kick: 200_000, tab: 50_000 } as const;

/** The longest one LLM call may wait (ruling R3). */
export const LLM_TIMEOUT_MAX_MS = 90_000;
/** Kept free before the drain deadline for writing the step's result. */
export const DEADLINE_MARGIN_MS = 10_000;
/** Under this much time to the deadline an LLM step defers instead of starting a call. */
export const LLM_MIN_LEFT_MS = 20_000;
