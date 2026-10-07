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
