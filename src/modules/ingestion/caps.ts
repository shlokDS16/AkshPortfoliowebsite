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

/** pdf_text reads pages for at most this long per step, then enqueues itself from the next page (spec s6.3). */
export const PDF_TEXT_MS = 180_000;
/** pdf_text writes page text in batches of this many pages, so a step that dies keeps what it read. */
export const PDF_TEXT_BATCH = 25;
/** document_pages.page_no and documents.page_count allow 1-5,000 (migration 0006). */
export const MAX_PDF_PAGES = 5_000;

/** Groq free tier per bucket (model id), at 75% of 30 RPM, 1K RPD, 8K TPM, 200K TPD (spec s9, verified 2026-10-07). */
export const GROQ_CAPS = { tpm: 6_000, tpd: 150_000, rpm: 22, rpd: 750 } as const;
/** Characters of one statement page sent to the model; with a 700-char system prompt and EXTRACT_MAX_COMPLETION, one call is about 5,100 tokens. */
export const PAGE_CHAR_LIMIT = 12_000;
export const EXTRACT_MAX_COMPLETION = 1_500;
/** A document proposes at most this many figures; past it extract_page reads nothing more (spec s6.4). */
export const MAX_PROPOSALS_PER_DOCUMENT = 60;
/** Tokens one statement page costs (spec s9 estimate until Task 16 measures the median). */
export const TOKENS_PER_PAGE_DEFAULT = 3_400;
/** The GitHub pump runs every 15 minutes (spec s8); each run drains for DRAIN_MS.pump. */
export const PUMP_EVERY_MIN = 15;
