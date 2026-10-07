# Phase 2B Ingestion (scans, photos, voice, links, classifier, digest, readings, public provenance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** written with Plan 2a on 2026-10-07; **run a pre-flight against the code Plan 2a actually shipped before Task 1** (file paths, interface names and the Task 16 measurements will have moved). Code is given where a decision is load-bearing; everything else names the interface, the tests and the commands.

**Goal:** Extend the Plan 2a pipeline to the other things Aksh drops: scanned PDFs (OCR.space), photos and screenshots of tables (OCR.space for page text + Groq `qwen` vision for structure, one image per call), voice notes (Whisper, into a capture Aksh confirms), links and pasted text; add the ambiguous-page classifier, the private document digest, "re-read this page", test-reading proposals, and the public provenance line on a file.

**Architecture:** Same queue, governor, proposals, review and staging as 2a. New step kinds (`ocr_page`, `vision_page`, `transcribe`, `fetch_url`, `classify_pages`, `digest_page`) register in `ingestion/steps/index.ts`; new provider ports (`OcrPort`, `TranscriberPort`) and adapters in `src/lib/providers/`; a second governor bucket family for OCR.space (requests, not tokens). Every new machine output still lands in `extractions`/`proposals`/`document_digests` and reaches a file only through the editor save.

**Spec:** `docs/specs/2026-10-07-phase-2-ingestion-design.md` (s9 quotas, s10 degradation). ADR: `docs/architecture/ADR-004-ingestion.md` (s4.2 binding; s4.11 scope). Plan 2a's Global Constraints apply unchanged.

**Scope:** progress 2.5 (scans, images, voice, URL, text paste), the 2b items of ADR-004 s4.11. Out: XLSX valuation (2.7, own spec 2c), paid burst, pgvector.

## Global Constraints (in addition to Plan 2a's)
- **One image per vision call** (ADR-004 amends ADR-001 s9.1): 3 images × 2,048 tokens would breach the 6,000-token minute cap on their own.
- **OCR.space is counted in requests** (75%: 375/day, 18,750/month). Its free limit is per IP, and Vercel egress IPs are shared and dynamic, so OCR.space may refuse before our ledger says so: a refusal is a defer (`ocr_day`), never a failure.
- **Voice is Aksh's words.** A transcript is never a fact and never saved by the machine: it is shown to Aksh, who edits and saves it through the existing capture path (`saveCapture`), so `captures.raw_text` stays his. Task 4 waits for Aksh's consent to send recordings to Groq (ADR-004 s8).
- **Links are fetched safely:** https only, no credentials in URLs, DNS-resolved addresses outside private, loopback, link-local and metadata ranges, 2 redirects max (each re-checked), 50 MB max, 30 s timeout.
- No new runtime dependency without its version and licence verified on npm the day it is added and recorded in the task report (candidates named below are not yet verified).

## Before Task 1 (controller)
- Pre-flight this plan against Plan 2a's final code (conflict table at the end is a starting point, not a substitute).
- Re-verify spec s9 for OCR.space, Groq vision (base64 size limit is not in our research), Whisper (the models page lists a 100 MB file limit; the research from 2026-10-04 said 25 MB: confirm which applies to the free tier).

## New environment variables
| Task | Variable | Where | Value |
|---|---|---|---|
| 2 | `OCRSPACE_API_KEY` [SECRET] | Vercel Preview + Production, `.env.local` | free key from https://ocr.space/ocrapi/freekey (already in `.env.example` as `[REQUIRED-P2]`; make it optional in `env.server.ts`: unset means scans wait with "Scan reading is off") |
| 3 | `GROQ_MODEL_VISION` | optional | default `qwen/qwen3.8-27b` (already in `.env.example`) |
| 4 | `GROQ_MODEL_WHISPER` | optional | default `whisper-large-v3-turbo` (already in `.env.example`) |
| 6 | `GROQ_MODEL_CLASSIFY` | optional, new in `.env.example` | default `openai/gpt-oss-20b` |

---

### Task 1: Migration 0008: new document kinds, step kinds, wait reasons, digests, readings, bucket types

Executed by `desk-backend`. Local stack only.

**Files:** Create `supabase/migrations/20261007000008_ingestion_more.sql`, `supabase/tests/0008_ingestion_more.test.sql`; modify the 0006/0007 allowlist tests as needed; regenerate types.

**Changes (draft; finalise in the pre-flight):**
- `documents.kind in ('pdf','image','audio','url','text')`; `storage_path` check widened to `^[0-9a-f-]{36}\.(pdf|jpg|png|webp|mp3|m4a|webm)$`; new nullable `fetched_from text` (the original link) and `transcript_status text check in ('pending','saved','discarded')`.
- `job_steps.kind` adds `ocr_page`, `vision_page`, `transcribe`, `fetch_url`, `classify_pages`, `digest_page`; `wait_reason` adds `ocr_day`, `ocr_month`, `ocr_off`; the page-number check becomes `(kind in ('select_pages','classify_pages','transcribe','fetch_url')) = (page_no is null)`.
- `jobs.kind` adds `ingest_image`, `ingest_audio`, `ingest_url`, `ingest_text`.
- `document_pages` adds `ocr boolean not null default false` (text came from OCR, shown on the page view).
- `provider_usage.kind` stays; buckets `ocrspace` (requests counted as `tokens_est = 1`) and the whisper bucket (audio seconds in `tokens_est`); a second function `reserve_requests(p_bucket, p_day_cap, p_month_cap)` with the same advisory-lock pattern as `reserve_usage`, returning `ocr_day` / `ocr_month`.
- `document_digests` (append-only): `document_id`, `page_no`, `section text`, `claim text` (<= 400), `line text` (<= 600), `on_page boolean`, `extraction_id`, admin read, service_role insert.
- `proposals.kind text not null default 'fact' check (kind in ('fact','reading'))`, `proposals.test_id text check (test_id ~ '^T\d{1,3}$')` for reading proposals (Task 8); the insert guard is unchanged.
- Bucket `documents`: `allowed_mime_types` adds `image/jpeg`, `image/png`, `image/webp`, `audio/mpeg`, `audio/mp4`, `audio/webm`.

**Tests:** each widened check accepts the new values and still refuses others; `reserve_requests` day and month caps; `document_digests` append-only; a `reading` proposal needs a `test_id`; anon holds nothing.

- [ ] Steps: failing pgTAP → migration → `pnpm db:reset && pnpm db:test` → `pnpm db:types` → commit `feat(db): document kinds, step kinds and digests for scans, photos, voice and links (migration 0008)`.

---

### Task 2: `OcrPort`, the OCR.space adapter and scanned PDF pages

Executed by `desk-backend`. **New env var: `OCRSPACE_API_KEY`.**

**Files:** Create `src/lib/providers/ocr.ts`, `ocrspace.ts`, `ocrspace.test.ts`, `src/modules/ingestion/steps/ocr-page.ts`, `src/modules/documents/split.ts`; modify `src/lib/providers/index.ts` (`createOcrPort`), `src/lib/env.server.ts`, `ingestion/caps.ts` (`OCR_CAPS = { day: 375, month: 18_750 }`, `OCR_MAX_BYTES = 1_048_576`), `steps/select-pages.ts` (selected scan pages get `ocr_page` first, then `extract_page`), `ingestion/trays.ts` (paused copy for `ocr_day`, `ocr_month`, `ocr_off`).

**Interfaces:**

```ts
// ocr.ts
export type OcrResult =
  | { kind: "ok"; text: string }
  | { kind: "refused"; reason: "day" | "month" | "size" | "pages"; message: string } // quota or limits: defer or attention, never a crash
  | { kind: "provider_error"; message: string };
export interface OcrPort { readonly name: "ocrspace" | "fixture"; read(file: { bytes: Uint8Array; filetype: "PDF" | "JPG" | "PNG" | "WEBP" }, opts: { table: boolean }): Promise<OcrResult> }
```
- Request: `POST https://api.ocr.space/parse/image` (verified 2026-10-07), multipart with the file, `filetype`, `isTable=true` for statement pages, `OCREngine=2`, `scale=true`; the key as the `apikey` header (confirm header vs form field on the API page in Step 0). Response: `IsErroredOnProcessing`, `ErrorMessage`, `ParsedResults[].ParsedText`.
- `split.ts`: one PDF page as its own PDF. Candidate dependency `pdf-lib` (verify version, licence and maintenance on npm first; if unsuitable, record the alternative chosen). A single page over 1 MB → attention "This scanned page is over the free reader's 1 MB limit. Enter it manually or skip."
- `ocr-page.ts`: reserve one request (`reserve_requests`), split, OCR, write the OCR text over the scan page's stored text (migration 0006 already lets a page under 50 characters be filled once, and grants `service_role` UPDATE on `text`), set `ocr = true`, then the page flows into `extract_page` like a digital one.

**Tests:** adapter (fake fetch): ok text; `IsErroredOnProcessing` with a quota message → `refused day`; HTTP 403 → `refused day`; a 1.2 MB file is refused locally (`size`) without a request; network error → `provider_error`. Step: defers `ocr_day` when the ledger refuses; OCR text over 50 characters makes the page selectable; an OCR refusal never increments failure counters.

- [ ] Steps: Step 0 verify the API page → failing tests → implement → `rtk pnpm vitest run` → e2e with a fixture OCR adapter (`LLM_ADAPTER=fixture` also selects the OCR fixture) on a one-page scanned fixture PDF (an image-only page generated by `scripts/make-fixture-pdf.mjs --scan`) → `defenso guard_code` on the adapter → commit `feat(ingestion): read scanned pages with OCR.space inside a request budget`.

---

### Task 3: Photos and screenshots: browser downscale, OCR text, `qwen` vision structure

Executed by `desk-backend` (step, adapter) then `desk-ui` reviews the drop bar change. **New env var: `GROQ_MODEL_VISION`** (optional).

**Files:** Create `src/modules/ingestion/steps/vision-page.ts`, `src/components/desk/private/inbox/downscale.ts`, `downscale.test.ts`; modify `src/lib/providers/llm.ts` (`LlmRequest.image?: { mime: "image/jpeg" | "image/png" | "image/webp"; base64: string }`), `groq.ts` (user content becomes `[{ type: "text" }, { type: "image_url", image_url: { url: "data:<mime>;base64,..." } }]` when an image is present), `drop-bar.tsx` (accept images), `ingestion/actions.ts` (`kind: "image"` uploads), `documents/upload.ts` (image mime types, 1 MB after downscale).

- Browser: `createImageBitmap` → canvas at most 1,600 px on the long side → `toBlob("image/jpeg", 0.85)`, stepping quality down to 0.6 until under 1 MB; refuse with "This photo is still over 1 MB after shrinking; crop it to the table." if it never fits.
- Pipeline: one page; `ocr_page` (page text for search and the verbatim check) then `vision_page` (`qwen`, one image, the 2a extraction schema and prompt with "from this image" wording, `PROMPT_VERSION "extract-image-v1"`, estimate = text + 2,048 image tokens + completion) then proposals as 2a (verbatim against the OCR text; values the OCR missed are flagged `value_not_on_page`, which is the honest outcome for a photo).

**Tests:** downscale keeps aspect ratio and stays under 1 MB (jsdom canvas mock); the Groq adapter sends exactly one image; the estimate includes 2,048 for the image; a vision call never carries two images (a test fails if `image` is an array).

- [ ] Steps: Step 0 verify the base64 image size limit on https://console.groq.com/docs/vision → failing tests → implement → e2e (fixture PNG with a three-row table) → commit `feat(ingestion): photos and screenshots read with OCR text and one-image vision calls`.

---

### Task 4: Voice notes into captures Aksh confirms

Executed by `desk-backend`, then `desk-ui` for the transcript card. **Blocked until Aksh agrees to send his recordings to Groq.** **New env var: `GROQ_MODEL_WHISPER`** (optional).

**Files:** Create `src/lib/providers/transcriber.ts`, `groq-whisper.ts`, `groq-whisper.test.ts`, `src/modules/ingestion/steps/transcribe.ts`, `src/components/desk/private/inbox/transcript-card.tsx`; modify `drop-bar.tsx` (audio), `ingestion/actions.ts` (`saveTranscriptAction` calls the existing `saveCapture` path with Aksh's edited text; `discardTranscriptAction`).

```ts
export type TranscriberResult = { kind: "ok"; text: string; seconds: number } | { kind: "rate_limited"; retryAfterSeconds: number | null } | { kind: "provider_error"; message: string };
export interface TranscriberPort { readonly name: "groq" | "fixture"; transcribe(file: { bytes: Uint8Array; mime: string; name: string }): Promise<TranscriberResult> }
```
- Endpoint `POST https://api.groq.com/openai/v1/audio/transcriptions` (OpenAI-compatible; verify on the API reference in Step 0), multipart `file`, `model`, `response_format=json`, `language=en`.
- Budget: the whisper bucket counts audio seconds against 75% of 7,200 per hour and 28,800 per day; duration measured in the browser (`HTMLMediaElement.duration`) and re-checked from the response.
- The transcript is stored on the document (`document_pages` page 1 text, `ocr = false`, kind `other`) and shown as a card: "Your voice note, typed out. Check it, then save it as a capture." Save runs the existing capture save (verbatim storage, grammar parse) with the text as Aksh edited it; the machine never inserts into `captures`.

**Tests:** adapter (fake fetch); the step never touches `captures` (graph test gains `/\.from\("captures"\)/` for ingestion roots); saving goes through `saveCapture` with the edited text; discard leaves no capture.

- [ ] Steps: consent recorded in `docs/project-memory/timeline.md` → Step 0 verify → failing tests → implement → e2e with a fixture transcriber → commit `feat(ingestion): voice notes typed out for Aksh to confirm as captures`.

---

### Task 5: Links and pasted text

Executed by `desk-backend`, then `desk-ui` for the drop bar and the Today list action.

**Files:** Create `src/modules/ingestion/steps/fetch-url.ts`, `src/modules/documents/safe-fetch.ts`, `safe-fetch.test.ts`; modify `drop-bar.tsx` ("Drop anything, or paste a link" accepts a URL or text), `ingestion/actions.ts` (`startLinkAction`, `startTextAction`), `src/components/desk/private/today-list.tsx` (a capture with a URL shows "Read this link", Aksh's click; never automatic, so no surprise spend).

- `safe-fetch.ts` (load-bearing; complete in the task): resolve DNS with `node:dns/promises` `lookup(host, { all: true })`, refuse any address in 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 100.64/10, 0/8, ::1, fc00::/7, fe80::/10; https only; no userinfo; `redirect: "manual"` and at most 2 hops, each re-checked; abort at 30 s and at 50 MB (stream counting); returns `{ contentType, bytes }`.
- PDF responses become a `pdf` document (2a pipeline, `fetched_from` set, `source_url` prefilled); HTML becomes a `url` document whose text is the visible text (strip `script`, `style`, tags; decode entities), one page per 8,000 characters; pasted text becomes a `text` document the same way. Both go through `select_pages` (MD&A/commentary rules apply) and `extract_page`.

**Tests:** every private range refused; a redirect to a private address refused; http refused; 50 MB cap; a BSE-style PDF link becomes a `pdf` document; pasted text of a results table yields proposals with the fixture LLM.

- [ ] Steps: failing tests → implement → `defenso guard_code` on `safe-fetch.ts` (SSRF) → e2e → commit `feat(ingestion): read links and pasted text, fetched safely`.

---

### Task 6: Ambiguous-page classifier on `gpt-oss-20b`

Executed by `desk-backend`. **New env var: `GROQ_MODEL_CLASSIFY`** (optional; add to `.env.example`).

**Files:** Create `src/modules/ingestion/steps/classify-pages.ts`, `classify.test.ts`; modify `documents/selector.ts` (return `doubtful: number[]`: pages scoring 20-60 with no heading match and number density above 0.15), `steps/select-pages.ts` (enqueue one `classify_pages` step when there are doubtful pages and AI is on; it re-runs selection after), `ingestion/prompts.ts` (`CLASSIFY_PROMPT_VERSION`, schema `{ pages: { page: number; kind: PageKind; confidence: number }[] }`).

- Batches of 10 pages, first 600 characters each (about 2,000 input tokens), `max_completion_tokens` 400, `reasoning_effort: "low"`, bucket = the classify model (its own allowance per the rate-limits table; pooled limits show up through headers, ADR-004 s3.5). Confidence below 0.6 keeps the rule verdict. Classification never spends the document's extraction budget.

**Tests:** batching; low confidence ignored; deferred by the governor like extraction; selection after classification still respects the budget and Aksh's own ticks.

- [ ] Steps: failing tests → implement → commit `feat(ingestion): classify doubtful pages with the small model`.

---

### Task 7: Private document digest (commentary pages)

Executed by `desk-backend`, then `desk-ui` for the digest panel in the document pane.

**Files:** Create `src/modules/ingestion/steps/digest-page.ts`, `digest.test.ts`, `src/components/desk/private/doc-pane/digest-panel.tsx`; modify `steps/select-pages.ts` (selected `mdna` pages get `digest_page` instead of `extract_page`), `ingestion/prompts.ts` (`DIGEST_PROMPT_VERSION`, schema `{ claims: { section: string; claim: string; line: string }[] }`, prompt: "copy claims management makes about the future, capacity, guidance, risks; quote the line; never summarise in your own words beyond 25 words per claim").

- Stored in `document_digests` with `on_page` = `onPage(line, pageText)`; claims whose line is not on the page are hidden by default ("Show 2 claims the page check could not confirm").
- The panel is labelled "Machine-read" in the mono marker style, private only, never linted or published (nothing public reads it). "Use as a fact" opens a new fact row with the quote set to the verified line and the label and value empty for Aksh: the machine's claim text never enters a field.

**Tests:** claims with off-page lines hidden; the panel never renders on public routes (showcase isolation test gains `document_digests`); "Use as a fact" fills only `quote` and `locator`.

- [ ] Steps: failing tests → implement → controller visual QA → commit `feat(desk): private machine-read digest of commentary pages`.

---

### Task 8: Re-read a page; reading proposals for mapped tests

Executed by `desk-backend`, then `desk-ui` (test row mapping field, review list section).

**Files:** Modify `ingestion/actions.ts` (`rereadPageAction`: shows the cost first, "This uses about 3,400 of today's 150,000 AI tokens", then enqueues an `extract_page` with `args.reread = true`, bypassing the cache), `facts-form/test-row.tsx` (optional "Metric to watch" choosing one of the file's fact labels, stored in a new optional `metric` on the test in `casefile/1`: additive, same pattern as `topic`; ADR-002 amendment noted in ADR-004), `ingestion/proposals.ts` (a row whose normalised label equals a test's `metric` also yields a `reading` proposal: `current`, `readingAsOf`, `prior`), `review/values-list.tsx` ("Test readings" section), `facts-form/staged.ts` (a staged reading updates the test draft's `current`, `readingAsOf`, `prior`; it never touches threshold, min, max, direction, status or the condition text in the body).

**Tests:** re-read bypasses the cache and is budgeted; a reading proposal never changes a test's status (Aksh sets status; the form shows the reading beside it); `metric` round-trips through the sheet (`T1 | ... | metric=Revenue from operations` or a new `M | T1 | label` row: decide in the pre-flight, record in ADR-004).

- [ ] Steps: failing tests → implement → e2e → commit `feat(ingestion): re-read pages on request and propose test readings for mapped metrics`.

---

### Task 9: Public provenance line on a file, and close-out

Executed by `desk-ui` (opus) after a segment checkpoint with Shlok.

**Files:** Modify `src/modules/showcase/file.ts` (a per-fact provenance summary for the public view model: "checked against p. 131" plus the filing date; nothing machine-written), `src/components/desk/source-fact-card.tsx` (one line under the quote), `src/components/desk/fact-table.tsx` (optional mark), the share card lint input if the line appears there (rule 8); docs close-out as Plan 2a Task 16.

- Step 0: desk-ui shows Shlok two treatments (a line in the source card only; a small mark in the facts table plus the card line) at 375/1280, light/dark; record the pick in `docs/design/decisions.md`.
- The line is fixed copy plus dates and page numbers, rendered from `fact_provenance` through a public-safe view or a column on the snapshot; anon never reads `proposals`, `extractions` or `fact_provenance` directly (a security-invoker view exposing only `revision_id, fact_id, page_no, edited` for published, lagged revisions, with a pgTAP test).
- "Why this impresses an allocator": the reader sees, on each figure, that a person checked it against a named page of a named filing, which is the four-eyes control of an institutional desk made visible.

**Tests:** the view returns nothing for a private or unlagged item; the public card never shows a machine value that differs from the published fact; axe scans stay green.

- [ ] Steps: checkpoint → failing tests (pgTAP + unit) → implement → e2e/a11y → close-out (progress, timeline, ADR-004 updates, debt, rubric scores) → commit `feat(public): checked-against-page provenance line on filed figures`.

---

## Pre-flight conflict table (starting point; redo against 2a's shipped code)

| Tasks | Shared file / interface | Risk | Resolution |
|---|---|---|---|
| 1 → 2-8 | step kinds, wait reasons, document kinds | a task uses a value 0008 lacks | 0008 lands first; types regenerated |
| 2 → 3 | `OcrPort`, `ocr_page` | vision assumes page text exists | 3 orders `ocr_page` before `vision_page` |
| 2 | `document_pages.text` write-once trigger (2a Task 3) | OCR text must fill a scan page | already allowed by 0006 (a page under 50 characters may be filled once); 2b only adds the `ocr` flag |
| 3 | `LlmRequest`, `groq.ts` (2a Task 9) | image support changes a shared adapter | additive optional field; 2a adapter tests stay green |
| 4 | `captures`, `saveCapture` (Plan 1A) | machine writes a capture | only `saveTranscriptAction` (Aksh's click) calls `saveCapture`; graph test forbids `captures` in steps |
| 5 | `today-list.tsx` (Plan 1B), drop bar (2a Task 7) | Today list behaviour change during daily use | additive action; e2e for the capture screen stays green |
| 6, 7, 8 | `steps/select-pages.ts`, `ingestion/prompts.ts`, `ingestion/proposals.ts` | three tasks edit the same files | sequential; each adds one branch |
| 8 | `casefile/1` (`metric` on tests), `facts-form/test-row.tsx`, `staged.ts` | schema evolution touches the decided segment-3 tests display | additive optional field; ADR-004 amendment; desk-ui check |
| 9 | `showcase/file.ts`, public components, a new public view | a new anon read path | security-invoker view with the full public predicate, pgTAP, isolation test |
