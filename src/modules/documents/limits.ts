// Browser-safe. Numbers from spec s9 (verified 2026-10-07); a change needs a spec s9 edit with a source URL.

/** Supabase Free: 50 MB per file (also the bucket's file_size_limit and the documents.bytes check). */
export const MAX_UPLOAD_BYTES = 52_428_800;
/** Supabase Free: 1 GB storage. */
export const STORAGE_BYTES = 1_073_741_824;
/** The meter warns above this share of STORAGE_BYTES. */
export const STORAGE_WARN = 0.7;
/** Uploads are refused when they would take storage above this share of STORAGE_BYTES. */
export const STORAGE_REFUSE = 0.9;
/** Supabase Free: 500 MB database. */
export const DATABASE_BYTES = 524_288_000;
/** Pages the AI reads per document unless Aksh changes it (documents.llm_page_budget default). */
export const DEFAULT_PAGE_BUDGET = 20;
/** documents.llm_page_budget check: between 1 and 40. */
export const MAX_PAGE_BUDGET = 40;

/**
 * A photo or screenshot after the browser has shrunk it: the free scan reader takes 1 MB (spec s9; ingestion's OCR_MAX_BYTES
 * is this number, and a test keeps them equal).
 */
export const IMAGE_MAX_BYTES = 1_048_576;
/** The browser shrinks a photo to at most this many pixels on its long side before it is sent (Plan 2b Task 3). */
export const IMAGE_LONG_SIDE = 1_600;
/** JPEG quality: the first try, then steps down to the floor until the file is under IMAGE_MAX_BYTES. */
export const IMAGE_QUALITY = { start: 0.85, step: 0.05, floor: 0.6 } as const;

/** PostgREST returns at most this many rows a request (Supabase default max_rows): a longer read goes in ranges. */
export const POSTGREST_ROWS = 1_000;
