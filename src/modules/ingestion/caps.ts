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

/** The Whisper bucket in provider_usage. reserve_units derives the day wait (voice_day) from the name containing 'whisper'. */
export const WHISPER_BUCKET = "groq-whisper";
/**
 * Whisper turbo free tier at 75% of 20 RPM, 2K RPD, 7.2K audio seconds an hour and 28.8K a day (spec s9, rate-limits page,
 * verified 2026-10-07). One unit is one second of audio.
 */
export const WHISPER_CAPS = { rpm: 15, rpd: 1_500, secondsHour: 5_400, secondsDay: 21_600 } as const;
/** Groq bills at least this many audio seconds a request (spec s16.6, https://console.groq.com/docs/speech-to-text). */
export const WHISPER_MIN_BILLED_SECONDS = 10;
/**
 * The densest audio the desk accepts, in bytes a second (a 320 kbps MP3 is 40,000). A file cannot hold more seconds than
 * its size at the thinnest sound divided by this, so bytes / this is a floor on the seconds to reserve when the browser could
 * not measure the length (a webm from MediaRecorder reports Infinity).
 */
export const WHISPER_BYTES_PER_SECOND = 40_000;
/** One Whisper call waits at most this long (a 25 MB file on the free tier can take a while). */
export const WHISPER_TIMEOUT_MS = 90_000;
/** A Whisper 429 with no retry-after waits this long; over the first threshold it is the hour allowance, over the second the day's. */
export const WHISPER_WAIT = { defaultSeconds: 60, hourAfterSeconds: 600, dayAfterSeconds: 3_600 } as const;
/** A transcript the card can save as one capture: captures.raw_text allows 20,000 characters (capture/service.ts). */
export const TRANSCRIPT_SAVE_MAX_CHARS = 20_000;

/** Pasted text and a web page's text are cut into pages of about this many characters (Plan 2b Task 5, spec s6.3 / s16.10). */
export const TEXT_PAGE_CHARS = 8_000;
/** text_pages writes this many pages a step, then enqueues itself from the next page (like pdf_text). */
export const TEXT_PAGES_PER_STEP = 25;

/**
 * The ambiguous-page classifier on gpt-oss-20b (Plan 2b Task 6). Its own bucket (the model id) under GROQ_CAPS, the same 30 RPM,
 * 1K RPD, 8K TPM and 200K TPD per model as the extractor (spec s9, https://console.groq.com/docs/rate-limits, read 2026-10-08).
 * A batch of 10 pages x 600 characters is about 2,000 input tokens and 400 out, well under the 6,000 a minute.
 */
export const CLASSIFY_BATCH = 10;
/** Characters from the top of each page; the heading and the first rows are enough to tell a statement from a schedule. */
export const CLASSIFY_PAGE_CHARS = 600;
export const CLASSIFY_MAX_COMPLETION = 400;
/** A model verdict under this confidence is ignored and the rule's verdict ('other') stands (ruling R16). */
export const CLASSIFY_MIN_CONFIDENCE = 0.6;

/**
 * The private digest of a commentary page (Plan 2b Task 7, rulings R20 and R6). One call per page on the text model, the same
 * bucket and caps as extract_page. A page's claims are few on purpose: eight claims, each a short sentence of the machine's and a
 * line copied from the page, fit in 1,500 completion tokens, which keeps one call near the 5,100 tokens of a statement page.
 */
export const DIGEST_MAX_COMPLETION = 1_500;
export const DIGEST_MAX_CLAIMS = 8;
/** Stored lengths: migration 0008 allows section 1-300, claim 1-400 and line 1-600 characters. */
export const DIGEST_SECTION_MAX = 300;
export const DIGEST_CLAIM_MAX = 400;
export const DIGEST_LINE_MAX = 600;
/** A line shorter than this is not a quote worth confirming: it is on almost any page, so it counts as not confirmed. */
export const DIGEST_MIN_LINE_CHARS = 20;
