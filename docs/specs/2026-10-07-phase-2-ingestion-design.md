# Phase 2 spec: Ingestion inbox

Status: DRAFT for Shlok, 2026-10-07 (desk-architect). Depends on ADR-001 (binding), ADR-002, ADR-003 and ADR-004 (Proposed). Built by `docs/plans/2026-10-07-phase-2a-ingestion.md` (16 tasks) then `docs/plans/2026-10-07-phase-2b-ingestion.md` (9 tasks). Progress items 2.7 (XLSX valuation) moves to its own spec (2c).
Exit criterion (2a): Aksh uploads one real annual report on the preview, reviews and files at least 15 figures into a company file in under 20 minutes of his own time, and the private file shows the provenance of each; rubric rows R1 2-3, R2 3-4 and 7, R3 1-7 score at least 4.

## 1. Purpose
Turn "I read the annual report" into cited, dated figures in a company file without retyping, without letting the machine speak for Aksh, and without breaking a free quota silently. First, give him the manual path he already half has (Notes sources, topics, a document open beside the editor) so value lands before any AI is wired.

## 2. Users and surfaces
- **Aksh (admin), phone and desktop:** `/desk/inbox` (new tab between Capture and Items): drop bar, trays, page chooser, budget meters. `/desk/inbox/[documentId]/review`: one flagged value at a time, then the list of values, then "File under". The item editor gains a document pane and staged rows.
- **Public reader:** nothing new in 2a. Public fact tables may group by topic (Task 2). The public provenance line is 2b.
- **Shlok:** env vars, uptime monitor, the first-report measurement.

## 3. The rule this phase protects
ADR-004 s4.2 is binding: the machine proposes facts, sources, (2b) exhibits and readings; it never writes `body_md`, `change_reason`, any judgement field, or a revision. Proposals reach a file only through the existing editor save, authored `aksh`.

## 4. Data model (migrations `20261007000006_documents_jobs.sql`, `20261007000007_extraction.sql`)
Full SQL in Plan 2a Tasks 3 and 10. Conventions as Phase 1: uuid keys, `created_at`, RLS on, admin policies via `private.is_admin()`, explicit grants (default privileges revoke everything), `service_role` grants only where job code needs them.

```
documents        company_id fk null, title, kind ('pdf'; 2b adds 'image','audio','url','text'), storage_path unique null,
                 sha256 unique, bytes (<= 50 MB), page_count, status ('uploading','active','done','skipped'),
                 llm_page_budget (1-40, default 20), basis ('consolidated','standalone'), filed_on, source_url,
                 original_deleted_at, updated_at
document_pages   (document_id, page_no) pk, text (immutable once written), char_count generated, is_scan generated (< 50 chars),
                 kind ('pl','bs','cf','notes','segment','mdna','other'), basis, score, selected, selected_by ('rule','aksh'),
                 search tsvector generated (simple config)
jobs             kind ('ingest_pdf'), document_id fk, cancelled_at; one live job per document
job_steps        job_id, kind ('pdf_text','select_pages','extract_page'), page_no, args, status ('queued','running','done',
                 'skipped','needs_attention'), schema_failures, provider_failures, lease_expiries, not_before, wait_reason
                 ('groq_minute','groq_day','ai_off'), locked_until, lease_owner, last_error (<= 500 chars), result
extractions      append-only: document_id, page_no, model, prompt_version, input_hash, output jsonb, tokens_used
proposals        document_id, page_no, extraction_id, dedupe_key (unique per document), machine_value jsonb (immutable),
                 accepted_value jsonb, flags text[], reason ('core','label_match','moved'), status ('pending','accepted',
                 'edited','rejected','filed'), item_id fk null (set at File under), revision_id fk null (set when filed)
fact_provenance  append-only: revision_id, fact_id ('F12'), proposal_id, edited
provider_usage   bucket (model id), kind ('reservation','observation','rate_limited'), tokens_est, tokens_used, status
                 ('reserved','used','released'), remaining_tokens, remaining_requests, retry_after_s, at
```
Functions (EXECUTE `service_role` only): `claim_job_step(p_owner, p_lease_seconds)`, `reserve_usage(p_bucket, p_tokens, p_tpm, p_tpd, p_rpm, p_rpd)`, `prune_provider_usage()`. Admin-callable: `storage_usage()` (bucket and database bytes, admin check inside). Anon: `queue_age()` (seconds only, for `/api/health`). `service_role` also gets column SELECT on `items (id, company_id, kind, title)` and `item_revisions (id, item_id, rev_no, structured, created_at)`: facts, never Aksh's words. Trigger `item_revisions_no_machine_author`. Storage bucket `documents` (private, 50 MB, `application/pdf` in 2a).

## 5. Modules
```
src/lib/providers/     llm.ts (LlmPort), ocr.ts (OcrPort, 2b), transcriber.ts (TranscriberPort, 2b), groq.ts, fixture-llm.ts, json-schema.ts
src/modules/documents/ schema.ts, repo.ts, upload.ts (+ actions.ts), selector.ts (pure), budget.ts (pure ETA), pages.ts, index.ts, client.ts
src/modules/ingestion/ steps/ (pdf-text.ts, select-pages.ts, extract-page.ts), runner.ts, queue-repo.ts, governor.ts, prompts.ts,
                       verbatim.ts (pure), relevance.ts (pure), proposals.ts, review.ts (+ actions.ts), provenance.ts,
                       trays.ts (pure), index.ts, client.ts, ingestion.graph.test.ts
src/modules/ops/       drain.ts (new, server-only) builds DrainDeps and the LLM port and adds ingestion:drain (pump) and ingestion:sweep (daily); health.ts gains queue
src/app/desk/inbox/    page.tsx, [documentId]/review/page.tsx
src/components/desk/private/inbox/  drop-bar, inbox-section, budget-meter, page-chooser, document-card
src/components/desk/private/review/ review-one-at-a-time, page-text, values-list, file-under
src/components/desk/private/doc-pane/ document pane beside the editor
```
Dependency direction: `app` → `documents`, `ingestion`; `ingestion` → `documents`, `casefile/client`, `lib/providers`; `ops` → `ingestion`; `casefile/actions` → `ingestion` (one function). `documents` and `ingestion` never import `research` write functions or `casefile/actions` (ADR-004 s4.2, graph test).

## 6. Flows

### 6.1 Manual first (2a Tasks 1, 2, 8)
- Source type `Notes` ("my notes from a call or meeting"): a fact with no PDF still cites honestly; URL optional; quotes from a source without a URL are linted like prose (existing rule).
- Topic per fact (optional, 40 chars, form combobox of existing topics). Sheet row `G | Working capital | F4 F5 F6`. A fact in two groups or an unknown id is a sheet error on that line.
- Document pane in the editor: pick one of this company's documents, step or jump pages, search the text, "Use as source" adds or reuses the `S` row; a typed quote shows "found on p. 131" or "not on p. 131" (advice only for manual rows).

### 6.2 Upload (Tasks 4, 5, 7)
1. Drop bar: choose a PDF, optional `$SYMBOL` (existing companies suggested), optional filed-on date and public link. Browser computes SHA-256 (`crypto.subtle`).
2. `startUploadAction` (admin): refuses duplicates by hash ("You uploaded this on 3 Oct: open it"), files over 50 MB, non-PDF, and uploads when storage is above 90%; inserts `documents` (`uploading`) and returns a signed upload path and token.
3. Browser uploads straight to Storage (`uploadToSignedUrl`), then calls `finishUploadAction`, which checks the stored object's size and content type, sets `active`, creates the job and its `pdf_text` step, and schedules `after(() => drain(200 s))` through `@/modules/ops/jobs`.

### 6.3 Reading (Tasks 5-6)
- `pdf_text`: download once; `extractText(pdf, { mergePages: false })` is not used for the whole file at once; pages are read one by one through `getDocumentProxy` so the step can stop at 180 s and re-enqueue from the next page. Writes `document_pages` with `on conflict do nothing` (idempotent). Encrypted or corrupt PDFs end in `needs_attention` ("This PDF could not be opened").
- `select_pages` (pure selector, Task 6): headings ("Statement of Profit and Loss", "Balance Sheet as at", "Cash Flow Statement", "Notes forming part", "Segment information", "Management Discussion and Analysis"), number density, consolidated preferred unless the document's basis says standalone, scans excluded in 2a (2b OCRs them). Picks up to the budget, writes `selected_by = 'rule'`, enqueues `extract_page` steps if AI is on.
- Aksh can tick or untick pages at any time; unticking skips a queued step; ticking past the budget is refused unless he raises the budget (max 40) after seeing the new ETA.

### 6.4 Extraction (Tasks 9-12)
- One page per call to `GROQ_MODEL_TEXT` (`openai/gpt-oss-120b`), `reasoning_effort: "low"`, `temperature: 0`, `max_completion_tokens: 1500`, strict `json_schema` generated from Zod (all fields required, nullable via union, closed objects).
- Output per page: `{ page_kind, basis, unit_header, current_header, prior_header, rows: [{ label, current_text, prior_text, line }] }`. Code maps headers to `FY26` / `2026-03-31` (`fiscalYearEnd`), units to `₹ cr` / `₹ lakh` / `₹ mn` / `%` / raw, parses printed numbers, runs the verbatim check, then the relevance filter: (a) about 15 core lines (revenue from operations, total income, finance costs, depreciation, profit before tax, profit for the year, net cash from operating activities, purchase of property plant and equipment, total borrowings, cash and cash equivalents, trade receivables, inventories, trade payables, total equity, segment revenue); (b) labels already in the target company's file; (c) lines that moved at least 20% year on year (top 3 per page). Each proposal gets a code-assigned topic (P&L, Balance sheet, Cash flow, Working capital, Segments). Cap 60 proposals per document.
- Cached by `(sha256 of page text, model, prompt_version)`.

### 6.5 Review and filing (Tasks 13-14)
- Review screen: flags first, one at a time (segment 4 C, `ReviewOneAtATime`): the machine's reading, why it is flagged ("not found on p. 131"), the page line, choices "Type the value from the page" or "Drop it" (keys 1/2). Then the values list: verified rows pre-ticked, grouped by topic, each with page and line, untick or edit any. Standalone duplicates collapsed under the preferred basis.
- "File under": the company's file (or "Start a file for X", which calls the existing `createItemAction` with the company; Aksh's click, empty revision). The document's `S` row is confirmed once (title, type, filed on, link).
- Editor: staged rows appear in the Facts form marked "from <doc> p. 131"; a banner names how many are waiting; Aksh edits, deletes, writes the change reason and saves. Provenance and `filed` status are recorded after the revision insert. The private desk shows a chip "read from p. 131; you changed 1,248 to 1,284".
- "Done with this document" sets `done` and deletes the stored original (page text and link stay).

## 7. States Aksh sees (InboxSection trays, segment 4 C)
Derived, never stored (`ingestion/trays.ts`):

| Tray | Condition | Card message |
|---|---|---|
| Ready for you | pending proposals and no runnable extract step | "24 figures ready to check." Action: Review |
| Needs attention | any step `needs_attention` | "Pages 142-147 could not be read." Actions: Enter manually, Skip, Try again |
| Being read | runnable steps, none waiting on quota | "Reading page 88 of 312" / "Reading figures: 7 of 20 pages" + ETA |
| Paused, nothing lost | steps waiting with `wait_reason` | "Today's free AI allowance is used up. It carries on by itself: ready by Thu 10:00." |
| Waiting to start | `active` with no step claimed yet | "Queued. Starts within 15 minutes, sooner while this page is open." |
| (hidden) | `done`, `skipped` | listed under "Finished" (collapsed) |

## 8. Pumps
- `after()` on finish upload (200 s), the GitHub pump step `ingestion:drain` (240 s, every 15 min), the inbox tab loop (`keepReadingAction`, 50 s per call while runnable work exists and the tab is visible), the daily cron step `ingestion:sweep` (200 s; daily `maxDuration` raised to 300).
- Lease 270 s; an expired lease is reclaimable; the second expiry sends the step to `needs_attention` ("This step stopped twice before finishing").

## 9. Quotas (verified 2026-10-07; re-verify before changing any number)
| Limit | Value | Cap used | Source |
|---|---|---|---|
| Groq `gpt-oss-120b` / `gpt-oss-20b` / `qwen3.8-27b` | 30 RPM, 1K RPD, 8K TPM, 200K TPD each; "organization level" | 75%: 22 RPM, 750 RPD, 6K TPM, 150K TPD per bucket | https://console.groq.com/docs/rate-limits |
| Groq headers | `x-ratelimit-remaining-tokens` (TPM), `x-ratelimit-remaining-requests` (RPD), `retry-after` (s) on 429 | reconciled | same |
| Groq strict JSON | all fields required, `additionalProperties: false`, no streaming/tools | Zod `strictObject` | https://console.groq.com/docs/structured-outputs |
| Groq vision (2b) | `qwen/qwen3.8-27b` (preview), up to 3 images, 2,048 tokens each | 1 image per call | https://console.groq.com/docs/vision |
| Whisper turbo (2b) | 20 RPM, 2K RPD, 7.2K audio s/h, 28.8K audio s/day | 75% | rate-limits page |
| OCR.space free (2b) | 25,000/month, 500/day per IP, 1 MB file, 3 PDF pages | 75%: 18,750/month, 375/day | https://ocr.space/ocrapi |
| Supabase Free | 50 MB per file (fixed), 1 GB storage, 5 GB egress, 500 MB DB | refuse uploads above 90% storage | https://supabase.com/docs/guides/storage/uploads/file-limits ; tooling landscape s6 |
| Signed upload URL | valid 2 hours | start → finish within 2 h | https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl |
| Vercel Hobby | 300 s, 2 GB, 4.5 MB request body | 240 s per drain | https://vercel.com/docs/functions/limitations |
| `unpdf` | 1.8.1, MIT, no dependencies | text only in 2a | https://registry.npmjs.org/unpdf/latest |

Throughput estimate (assumption until Task 16 measures it): about 3,400 tokens per statement page; at 6K TPM, about 7 pages per 240-s pump run; a 20-page document in about 45 min with the tab closed, about 12 min with it open; about 44 pages a day per bucket (two annual reports).

## 10. Degradation (what Aksh sees, and how he is told)
| Limit hit | Inbox | Desk strip / email |
|---|---|---|
| Groq minute cap | card stays in Being read; ETA moves | none |
| Groq day cap or 429 with long retry | Paused tray, "ready by <time>" | none (not a failure) |
| `GROQ_API_KEY` unset | banner "AI reading is off. Pages are still read and searchable; open a document beside your file to enter figures." | none |
| Schema/provider failures | Needs attention with Enter manually / Skip / Try again | none |
| Pumps not running (runnable step older than 6 h) | cards unchanged | red strip "Documents have not moved for 6 h; your uploads are safe"; `/api/health` 500 → monitor emails Shlok and Aksh |
| Storage above 70% / 90% | meter warns / upload refused with "Mark finished documents as done to free space" | none |
| Supabase unreachable | existing desk banner | existing health check |
| PDF over 50 MB | refused before upload: "Over 50 MB. Upload the financial statements section, or compress the file." | none |

## 11. Measurement (replaces the estimates)
Plan 2a Task 16: ingest one real annual report on the preview; record pages, selected pages, tokens per page (median, p90), wall clock, proposals, flags and Aksh's review minutes in `docs/trials/2026-10-xx-first-report.md`; update s9 and the ETA constants.

## 12. Compliance
- No new publish path; staged rows go through the editor and every revision of a public item through `publish_revision()`.
- Rule 3a still applies: staged figures newer than a public file's Figures-to stop the gate; the editor's existing note explains (Q11).
- Rule 8 (whole public surface linted): nothing machine-written is public in 2a. In 2b the public provenance line is fixed copy plus dates and page numbers.
- Document originals and page text are private (admin RLS; private bucket). Page text of third-party filings is never rendered publicly; a fact's quote is, as today, under the source.

## 13. Testing
Vitest for every pure unit (selector, ETA, verbatim, relevance, trays, sheet G rows, staging merge, schema-to-JSON-schema strictness), the Groq adapter against recorded responses, the runner with a fake clock and fake repo; pgTAP for every table, grant, trigger and both functions; Playwright: upload a fixture PDF → pages read → fixture LLM → review → file → save → provenance chip, at 375 and 1280; graph test for the machine boundary. No test calls Groq (`LLM_ADAPTER=fixture`).

## 14. Out of scope
Public provenance line, OCR, images, voice, links, digest, classifier (2b); XLSX valuation (2c); paid burst; pgvector; client accounts.

## 15. Open items
- Q11 interaction (s12): no change in Phase 2; ADR-005 after the trial.
- Voice notes to Groq (2b): Aksh's consent to send his recordings to a third party.
- Deploying Slice A changes the editor Aksh is trialling: the controller decides whether to ship it during or after the 3-day trial.
