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

## 16. Amendments from the Plan 2a build (2026-10-08, append-only; sections above are unchanged)

### 16.1 s6.5 (review and filing)
- **Start a file reuses an existing file (R13).** `startFileAction` wraps the existing `createItem` and, when the company already has a case file, returns that file instead of creating a second one. It is still Aksh's click on the existing item service; the empty revision rule is unchanged.
- **A document with no company gets a company chooser (Task 13 fix).** In "File under", a document whose upload named no company shows a chooser of existing companies. Choosing one sets `documents.company_id` through the existing documents repo and an admin-only action, then continues to File under. It cannot create a company and cannot relink a document that already has one (debt).
- **Done and Skip close review (Task 14 fix).** Once a document is `done` or `skipped`, its review screen refuses with `document-closed` ("You marked this document done or skipped, so its figures can no longer be reviewed or filed."); no pending figure of a closed document can be filed.
- **Done asks first (Task 14 fix).** "Done with this document" opens a confirmation ("This deletes the stored PDF and cannot be undone. Its page text and the figures you filed stay.") with "Delete the PDF and finish"; it deletes the original once and cancels the document's job.

### 16.2 s7 (what Aksh sees): additions
The Needs-you tray on the desk home (Task 15) lists the inbox's own verdict, one card per document that waits on Aksh, using the same counts as the inbox (the basis-repeat filter included):

| Where | Card or line |
|---|---|
| Desk home, Needs you | Neutral card "Ready to review": the document title, "24 figures ready to check.", action "Review" (its review page). Only for a document with figures to check. |
| Desk home, Needs you | Warn card "Pages could not be read" (or "Could not be read" when the whole file failed): the document title, "Pages 142-147 could not be read.", action "Open the inbox". |
| Inbox, free-plan room | Meters: "AI pages today: 41 of 44" (tokens spent today over `TOKENS_PER_PAGE_DEFAULT`, against 150,000 tokens a day; never red, a spent day is a pause), "Storage 412 MB of 1 GB" (warns from 70%), "Database 360 MB of 500 MB" (warns from 70%). No AI meter while AI is off. |
| Inbox, drop bar | From 90% of storage the bar is disabled: "Storage is 91% full. Mark finished documents as done to free space." |
| Desk strip | A stuck queue has its own clause, rendered once: "Documents have not moved for 7 h; your uploads are safe. The uptime monitor has emailed Shlok and Aksh." With late clocks too, the clock clause comes first and the "notes are safe" sentence is dropped, so the strip says "safe" once. |

Message codes Plan 2a added that s7 did not list (all are fixed strings in `src/lib/messages.ts`, kept equal to the module copies by tests):

| Code | Text |
|---|---|
| `upload-duplicate` | You uploaded this PDF before. Open the earlier copy. (the card adds "You uploaded this on 3 Oct." and an "Open it" link) |
| `upload-too-large` | Over 50 MB. Upload the financial statements section, or compress the file. |
| `upload-not-pdf` | Only PDF files can be uploaded. |
| `upload-storage-full` | Storage is over 90% full. Mark finished documents as done to free space. (the drop bar shows the live percentage instead) |
| `upload-missing` | The upload did not arrive complete. Upload the file again. |
| `page-budget-reached` | This document is at its page limit. Raise the limit to read more pages. |
| `budget-range` | Choose a page limit from 1 to 40. |
| `ai-off` | AI reading is off, so figures cannot be read yet. Pages are still read and searchable. |
| `type-value-first` | Type the value from the page first. |
| `figure-incomplete` | Add the period, the as-of date and the unit. |
| `figure-not-a-number` | Type the figure as printed on the page, for example 41.20. |
| `figure-filed` | This figure is already filed. Change it in the file's Facts form. |
| `filed-on-required` | Add the date the document was filed. |
| `checks-left` | Check the flagged figures first. |
| `not-this-file` | That is not this company's file. Reload and try again. |
| `no-company` | This document is not linked to a company, so there is no file to put its figures in. |
| `nothing-to-file` | Tick at least one figure to file. |
| `document-closed` | You marked this document done or skipped, so its figures can no longer be reviewed or filed. |
| `revision-saved-provenance-missing` | Saved. The record of where some figures came from could not be written; they stay staged and are skipped as duplicates next time. |

Provenance chip and staged-banner strings (s6.5 specified only "read from p. 131; you changed 1,248 to 1,284" and "a banner names how many are waiting"). **Pending Shlok approval** means the build chose the wording and Shlok has not yet read it:
- "Read from p. 4 of <doc>; you kept it." / "...; you changed 41.70 to 41.20." (specified, with "of <doc>" added: **"of {doc}" pending Shlok approval**).
- "...; you checked it." (a flagged figure Aksh typed back as printed): **pending Shlok approval**.
- "...; you edited it." (changed in a way that is not the value): **pending Shlok approval**.
- Banner line 1: "N figures from <doc> are staged below. Check them, write your change reason and save." (names how many wait; as specified).
- Banner line 2: "You removed every staged figure from <doc>. Saving sends them back to the review list.": **pending Shlok approval**.
- Banner line 3: "N more figures from <doc> are not shown: already in this file, or over the 80-fact limit.": **pending Shlok approval**.

### 16.3 s9 (quotas): the measurement is deferred
The throughput line in s9 is still the proposal's estimate. Task 16's live measurement (hosted push, a real report, the cap update) is deferred to after Aksh's Phase 1 trial and the merge, by Shlok's lean-mode ruling of 2026-10-08. The checklist and the empty measurement table are in `docs/trials/2026-10-xx-first-report.md`; the s9 line gets its dated measurement then.

### 16.4 s10 (degradation): the queue sentence
The strip sentence for pumps not running is built from the oldest runnable step's age in whole hours, from `public.queue_age()` (granted to anon and authenticated, numbers only), through the same 6-hour rule as `/api/health`. Waiting on quota is never a stuck queue.

### 16.5 Final-review fix wave (2026-10-08, append-only)
The whole-branch review (`.superpowers/sdd/2026-10-07-phase-2a-ingestion/final-review.md`) found defects in the human loop after review. What changed, and the copy it added (**pending Shlok approval** means the build chose the wording and Shlok has not yet read it):
- **Filing and the editor use one rule (s6.5).** "File under" files exactly the accepted or edited figures the values list shows: a standalone repeat of a consolidated line is not filed (a resolved flagged repeat included, because the list hides it too), and the editor no longer filters a second time. "N figures filed" is the number the editor then shows.
- **A fully checked document still leads to Done (s7).** The inbox card for a read document with decided figures and none waiting says "All figures checked." (**pending Shlok approval**) instead of "Read. No figures matched; open it beside your file.", and keeps its Review link, in the Ready and Needs attention trays alike, because the review screen is where Done lives. The desk home Needs-you card is unchanged (Q15 is still open).
- **No false "upload again" (s7, s10).** A document keeps its hash, so the same PDF is refused as a duplicate for ever; the step messages now point at the card's buttons. All four are **pending Shlok approval**:

| Where | Text |
|---|---|
| pdf_text, stored file differs from the upload | The stored file is not the PDF that was uploaded. Choose Try again, or Skip this document. |
| pdf_text, original gone | The original PDF is no longer stored, so its pages cannot be read. Choose Skip, or Try again. |
| extract_page, page gone | This page is no longer stored, so it cannot be read. Choose Skip, or Try again. |
| select_pages, document gone | This document is no longer on your desk, so its pages cannot be chosen. Choose Skip, or Try again. |

  A storage failure while downloading the original is a normal step retry (1 and 2 minutes), not an instant Needs attention. A "Read again" action was considered and is not built (Shlok's decision; Q19).
- **A closed document's staged figures are dropped, not stranded (s6.5).** For a done or skipped document the staged banner's button reads "Drop these figures" and marks those staged figures rejected with no file (Aksh's own drop); deleting a staged figure and saving does the same. The banner line for that case reads "You removed every staged figure from <doc>. Saving drops them, because you marked the document done or skipped." (**pending Shlok approval**).
- **A wrongly linked company can be changed (s6.5).** The review screen has a "Change company" control (the same chooser, button "Move to this company") while none of the document's figures is filed or staged. Otherwise the desk answers with `company-locked`: "Some of this document's figures are already in its company's file, so the company cannot be changed." (**pending Shlok approval**).
- **Machine boundary (s4, migration 0006 amended in place, never pushed).** `service_role` may update only `documents.page_count`. A trigger on `document_pages` stops `service_role` recording a tick as Aksh's (`selected_by = 'aksh'`) or undoing one. `ingestion.graph.test.ts` also bans the names `publish_revision` and `unpublish_item` under ingestion, documents and the inbox route.
- **Provenance (s6.5).** The `filed` update is limited to the item's own staged proposals and its row count is checked; a shortfall raises `provenance.file (count-mismatch)`, so the save shows the existing "record could not be written" notice.

### 16.6 Plan 2b: migration 0008 and the s9 quota rechecks (2026-10-08, append-only)
Migration `20261007000008_ingestion_more.sql` (local only) widens `documents.kind` (image, audio, url, text) and `storage_path` (jpg, png, webp, mp3, m4a, webm, txt), adds `documents.fetched_from` (https only, set at insert) and `transcript_status`, the job and step kinds, the wait reasons `ocr_day`, `ocr_off`, `voice_hour`, `voice_day`, `job_steps.pass` (the unique key is now `(job_id, kind, page_no, pass)`), `document_pages.ocr`, `public.reserve_units(...)` for OCR requests and Whisper seconds, `document_digests` (append-only) and `reading_proposals` (separate from `proposals`). A link answer or pasted text is stored as `<id>.txt` (`text/plain`) and read by the `text_pages` step; there is no `fetch_url` step. Month counters are not kept (the 48-hour ledger prune would erase them): 375 a day times 31 days is 11,625, below the 18,750 monthly cap, so the daily cap binds first.

Rechecked 2026-10-08 (additions to the s9 table; the figures already in s9 were confirmed unchanged):
| Limit | Value | Source |
|---|---|---|
| OCR.space engines | Engine 2 is the default; Engine 1 is labelled deprecated; Engine 3 (highest accuracy, tables and handwriting) has its own extra 1,000 conversions a month on the free plan, in addition to the 25,000 | https://ocr.space/ocrapi |
| Groq Whisper free file limit | 25 MB on the free tier (100 MB on the developer tier); the model page shows 100 MB without a tier split | https://console.groq.com/docs/speech-to-text ; https://console.groq.com/docs/model/whisper-large-v3-turbo |
| Groq Whisper billing | a minimum of 10 audio seconds is billed per request | https://console.groq.com/docs/speech-to-text |
| OCR.space limit status and timeout | not documented on the vendor page; to be measured with a real key (R26: no constant lands in `caps.ts` until s9 carries the verified value) | https://ocr.space/ocrapi |

### 16.7 Plan 2b Task 2: scanned PDF pages (2026-10-08, append-only)
The OCR.space call was checked against https://ocr.space/OCRAPI on 2026-10-08: `POST https://api.ocr.space/parse/image`, multipart with `file`, `filetype`, `isTable`, `OCREngine` (1, 2 or 3) and `scale`; **the key is the `apikey` HTTP header, not a form field**; the answer carries `IsErroredOnProcessing`, `ErrorMessage` and `ParsedResults[].ParsedText`. The page documents no quota status code, no quota message and no timeout (exit code -20 means a timeout), so the adapter reads HTTP 403 and 429 and the quota words in an errored answer as "the day's allowance", and a key named as invalid (or HTTP 401) as a key problem. Engine 2 is used (the default; Engine 1 is deprecated). "1 MB" is read as 1,048,576 bytes (`OCR_MAX_BYTES`); an answer that calls the file too big is a size refusal, so a different reading only costs one request. Each scan page is split out of the stored PDF and sent alone (the free tier takes 3 pages a request), with `@cantoo/pdf-lib` 2.11.1 (MIT, published 2026-09-15; `pdf-lib` 1.17.1 was last published in 2021).

Behaviour:
- A scan page is a page with under 50 characters of text. `stepsForPage` sends a scan to `ocr_page` and any other page to `extract_page`; select_pages, Aksh's tick and "Read the ticked pages" all use it.
- A document where at least 80% of the pages are scans and the scans number no more than its page budget is scanned whole by select_pages. A larger scanned document waits for Aksh's ticks.
- `ocr_page` reserves one request in the `ocrspace` bucket (375 a day; no month counter), writes the text over the scan page once, marks it `ocr`, classifies it and queues `extract_page` when the page was ticked, or is a statement page and the document's budget has room (never one Aksh unticked). A refusal never counts as a failure: the daily allowance defers on `ocr_day` with a block until the ledger's earliest reset (an hour when the ledger is empty); a key the reader names as bad, or the third refusal in a row while our own ledger is under its cap, is a sentence for Aksh.

Copy (plain second person). "Pending Shlok approval" means the build chose the wording and Shlok has not yet read it.
| Where | Text | Status |
|---|---|---|
| Needs attention, scan page over 1 MB | This scanned page is over the free reader's 1 MB limit. Enter it manually or skip. | from the plan |
| Needs attention, key refused | The scan reader did not accept the desk's key. Check the OCR.space key in the settings, then try again. | first sentence from ruling R9; second pending Shlok approval |
| Needs attention, nothing read | Nothing could be read from this scan. Enter the figures yourself, or skip. | pending Shlok approval |
| Needs attention, page refused or not separable | The scan reader could not take this page. Enter it manually or skip. | pending Shlok approval |
| Needs attention, scan with no reader (replaces "Scans are read in a later update") | Scan reading is off, so this scanned page cannot be read. Enter it manually or skip. | pending Shlok approval |
| Paused, `ocr_off` | Scan reading is off. | from ruling R6 |
| Paused, `ocr_day` | Today's free scan reading is used up. It carries on by itself within 24 hours. | pending Shlok approval |
| Paused, `voice_day` / `voice_hour` (used by Task 4) | Today's free voice reading is used up. It carries on by itself within 24 hours. / Waiting for the next hour of voice reading. It carries on by itself. | pending Shlok approval |
| Being read | Reading scanned pages: 3 of 12, ready by 11:40 | pending Shlok approval |
| Ready, a large scanned document with nothing ticked | N pages are scans. Tick the pages to read; each uses one of today's 375 scan reads. | pending Shlok approval (Shlok's threshold: the document's page budget) |
| Page chooser, an unread scan | Scanned page, not read yet | pending Shlok approval |

### 16.8 Plan 2b Task 3: photos and screenshots (2026-10-08, append-only)
Step 0, https://console.groq.com/docs/vision read 2026-10-08: the vision model is `qwen/qwen3.8-27b`; a request takes up to 3 images and each image counts as 2,048 input tokens (`IMAGE_TOKENS`); the page states a 20 MB limit for a request that carries an image URL and does not state a separate limit for base64 images; JSON mode is supported. https://console.groq.com/docs/structured-outputs lists `qwen/qwen3.8-27b` for both strict and best-effort `json_schema`, so the extraction schema is sent strict as for the text model. `reasoning_effort` for this model is not documented, so it is not sent (R14). The desk sends exactly one image per call, always under 1 MB (about 1.4 MB as base64), far below either limit. No new runtime dependency: the browser's own `createImageBitmap` and canvas shrink the picture.

Behaviour:
- The drop bar takes a PDF, or a photo or screenshot (JPEG, PNG or WebP). The browser draws a photo on a canvas of at most 1,600 pixels on the long side with its proportions kept, white behind any transparency, and encodes it as a JPEG at quality 0.85, stepping down by 0.05 to 0.6 until it is under 1 MB (1,048,576 bytes, `IMAGE_MAX_BYTES`, equal to `OCR_MAX_BYTES`). A photo that never fits is refused before any upload. The file is hashed after shrinking, so the duplicate check is on the bytes that are stored. The upload sends the bare type (`image/jpeg`, never `;codecs=` or `;charset=`).
- `startUploadInput` carries `kind` (`pdf` or `image`). The server checks the type and the file name per kind (the type must be exactly `image/jpeg`, `image/png` or `image/webp`), the size per kind (PDF 50 MB, photo 1 MB), chooses the path `<id>.jpg|png|webp`, records `documents.kind = 'image'`, and `finishUpload` compares the stored object's type with the one the path names. The job is `ingest_image` and its first step is `ocr_page` on page 1 (a PDF's is `pdf_text`).
- `ocr_page` on a photo makes page 1 (empty text, `page_count` 1), sends the picture to the scan reader like a scanned PDF page (one request in the `ocrspace` bucket, the same waits and sentences), writes the text over the page and queues `vision_page` whether or not the reader found text.
- `vision_page` sends the one image and the prompt `extract-image-v1` to the vision model (`GROQ_MODEL_VISION`, default `qwen/qwen3.8-27b`) and nothing of the reader's text (R14). The reservation is the text, `IMAGE_TOKENS` and the completion cap, below the 6,000 tokens a minute. The answer is the same extraction as a digital page; every value and quote is checked against the reader's text exactly as for a digital page, so a figure the reader missed is flagged "value not on the page". The cache key is the SHA-256 of the image bytes under the image prompt version. Nothing is ticked; a photo is one page and its card has no page list.
- Inbox: `vision_page` is a page step (progress, attention pages, ready-by estimate). A document that is only partly scanned now lists its scan pages for ticking too (Task 2 review); the read of listed pages goes in ranges of 1,000 so a long scanned report loses none.

Copy (plain second person). "Pending Shlok approval" means the build chose the wording and Shlok has not yet read it.
| Where | Text | Status |
|---|---|---|
| Drop bar, button | Choose a file | pending Shlok approval (was "Choose a PDF") |
| Drop bar, hint | or drop one here. PDFs of annual reports, presentations and filings, up to 50 MB, and photos or screenshots of a table. | pending Shlok approval |
| Upload refused, any other file (`upload-unsupported`, replaces `upload-not-pdf`) | Drop a PDF, a photo or a voice note. | from ruling R12 (the voice note works from Task 4) |
| Upload refused, photo too big after shrinking (`upload-image-too-large`) | This photo is still over 1 MB after shrinking; crop it to the table. | from the plan |
| Needs attention, photo no longer stored | This photo is no longer stored, so it cannot be read. Choose Skip, or Try again. | pending Shlok approval |

Task 3 fix round 1 (2026-10-08, append-only): a photo uploaded while AI reading is off now keeps its `vision_page` step, which waits (`ai_off`) and carries on once a key is set; a photo has no page list to tick, so it could not be queued later. More copy, all pending Shlok approval:
| Where | Text | Status |
|---|---|---|
| `upload-duplicate` (replaces the 2a wording; the card still adds "You uploaded this on 3 Oct." and "Open it") | You uploaded this file before. Open the earlier copy. | pending Shlok approval |
| Drop bar, section label (screen readers) | Upload a file | pending Shlok approval (was "Upload a PDF") |
| Upload refused, the browser cannot open the picture | This photo could not be opened. Try another one. | pending Shlok approval |
| Needs attention, a photo (replaces "Page 1 could not be read.") | This photo could not be read. | pending Shlok approval |
