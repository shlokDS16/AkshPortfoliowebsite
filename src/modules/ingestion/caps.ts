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

/** The OCR.space bucket in provider_usage. reserve_units derives the day wait (ocr_day) from the 'ocr' prefix. */
export const OCR_BUCKET = "ocrspace";
/**
 * OCR.space free tier at 75% of 500 a day and 25,000 a month (spec s9, https://ocr.space/ocrapi). One unit is one request.
 * No month counter is kept (the ledger is pruned after 48 hours): 375 a day times 31 days is below the month cap, so the day cap binds.
 */
export const OCR_CAPS = { day: 375, month: 18_750 } as const;
/** The free tier takes files up to 1 MB (spec s9). Read as 1,048,576 bytes; a response that says otherwise is a size refusal. */
export const OCR_MAX_BYTES = 1_048_576;
/** One OCR.space call waits at most this long; a timeout is a provider retry, never a failure of the page. */
export const OCR_TIMEOUT_MS = 30_000;
/** When OCR.space says the quota is spent and the ledger cannot say when it frees, ask again after this long. */
export const OCR_BLOCK_FALLBACK_MS = 60 * 60 * 1000;
/** The third refusal in a row while our own ledger is under the daily cap reads as a key problem, not a quota (ruling R9). */
export const OCR_KEY_REFUSALS = 3;
/** A scanned document is read whole when at least this share of its pages are scans and they fit its page budget (ruling R6). */
export const OCR_WHOLE_SHARE = 0.8;
/** A scan step whose scan reader is off asks again after this long; a key and a redeploy need no touch of the step. */
export const OCR_OFF_RETRY_MS = 6 * 60 * 60 * 1000;
/** A step that finds under 20 s left tries again almost at once (no failure is counted); groq_minute reads as a short wait. */
export const SHORT_WAIT_MS = 5_000;
/** document_pages.is_scan: a page with under this many characters is a scan. */
export const READABLE_CHARS = 50;

/** Input tokens one image costs on Groq vision (spec s9, https://console.groq.com/docs/vision, read 2026-10-08). */
export const IMAGE_TOKENS = 2_048;
