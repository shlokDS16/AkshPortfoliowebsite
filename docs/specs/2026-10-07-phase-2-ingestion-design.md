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

### 16.9 Plan 2b Task 4: voice notes into captures Aksh confirms (2026-10-08, append-only)
Step 0, https://console.groq.com/docs/speech-to-text and the API reference read 2026-10-08: `POST https://api.groq.com/openai/v1/audio/transcriptions` (OpenAI-compatible), multipart `file`, `model`, `language`, `response_format` (`json`, `verbose_json` or `text`), `temperature`; free-tier files up to 25 MB; at least 10 audio seconds are billed a request; models `whisper-large-v3-turbo` (the default, `GROQ_MODEL_WHISPER`) and `whisper-large-v3`; the service downsamples to 16 kHz mono. The plain `json` answer carries `text` only, so the adapter asks for `verbose_json` and reads the audio's `duration` (documented by the OpenAI-compatible format and shown in third-party Groq examples, not spelled out on the Groq page; if it is absent the adapter falls back to the end of the last segment, then to none, and the reservation stands). The file limit is read as 25,000,000 bytes (`VOICE_MAX_BYTES`), the smaller reading, so the provider never refuses a file the desk accepted. No new runtime dependency (`fetch`, `FormData` and `Blob` are built in).

The switch: `VOICE_NOTES` in `env.server.ts` is `on` or unset; unset is off and is the default everywhere. Off means the drop bar neither offers nor takes voice notes, `startUpload` refuses `kind: audio` with `voice-off`, no transcriber is built (`createTranscriberPort` returns null), and nothing is sent to Groq. Aksh's consent to send his recordings to Groq (ADR-004 s8) is not recorded; it is recorded in the timeline when the switch is first turned on. The fixture transcriber follows the same rule and, like the other fixtures, is refused on Vercel.

Behaviour:
- The drop bar (voice on) takes `.mp3`, `.m4a` and `.webm` up to 25 MB, claims the bare type (`audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/webm`; never `;codecs=`), measures the length with an `<audio>` element (a webm that reports Infinity is seeked past its end; no answer in 4 seconds is none) and refuses a recording longer than 90 minutes (`VOICE_MAX_SECONDS`, the hour allowance) before anything is sent. The server checks the same limits again. The document is `kind = 'audio'` with `transcript_status = 'pending'` from the moment it is created (Aksh's session; job code cannot write that column). The job is `ingest_audio`; its first step is `transcribe` on page 1 with the measured length in `args.seconds`.
- `transcribe` reserves audio seconds in the `groq-whisper` bucket (the name contains "whisper", which `reserve_units` requires) against 75% of Groq's limits: `WHISPER_CAPS = { rpm: 15, rpd: 1,500, secondsHour: 5,400, secondsDay: 21,600 }`. The reservation is the larger of the browser's length and a floor of file size over 40,000 bytes a second, at least the 10 seconds Groq bills a request, and at most the hour allowance; it settles at the length the provider reports (at least 10). A full ledger defers on `voice_hour` or `voice_day`; a provider 429 releases the seconds, blocks the bucket and defers; a provider error is a retry (three, then Needs attention). A rerun after a lost lease makes no second request.
- The transcript is stored as the text of page 1 of the document (`ocr = false`, no page kind). It is shown on the card as Aksh's own words in a box he can edit. The machine never saves it and never calls the capture module: the card's Save calls the existing `submitCapture` with his edited text, `source` web or mobile, and `clientId = the document's id` (a second press is a no-op), and only then calls `markTranscriptSavedAction`, which records `transcript_status = 'saved'` and finishes the document the way Done does (job stopped, recording deleted, document in Finished). Discard (asked once) records `discarded` and does the same, with no capture. Over 20,000 characters the card asks him to shorten it before saving. The stored page text stays in the private database after either decision, like the page text of any finished document.
- Trays: a voice note being typed out is Being read; once typed out, with the transcript waiting, it is Ready for you with the sentence below, it is not counted as figures, and it has a Needs you card that opens the inbox on it.

Copy (plain second person). "Pending Shlok approval" means the build chose the wording and Shlok has not yet read it.
| Where | Text | Status |
|---|---|---|
| Upload refused, voice off (`voice-off`) | Voice notes are not switched on yet. | from ruling R8 |
| Upload refused, over 25 MB (`voice-too-large`) | This voice note is over 25 MB. Record a shorter one. | pending Shlok approval |
| Upload refused, over 90 minutes (`voice-too-long`) | This voice note is longer than 90 minutes. Record a shorter one. | pending Shlok approval |
| Drop bar hint, voice on (appended to the hint) | , or a voice note (MP3, M4A or WebM, up to 25 MB). | pending Shlok approval |
| Being read, a voice note | Typing out your voice note. | pending Shlok approval |
| Ready for you, a voice note typed out (card sentence and Needs you card) | Your voice note is typed out. Check it, then save it as a capture. | from ruling R13 |
| Transcript card, box label | Your voice note, typed out | from the plan, pending Shlok approval |
| Transcript card, hint under the box | Change anything the typing got wrong. What you save is exactly what is here. | pending Shlok approval |
| Transcript card, too long | This is over 20,000 characters. Shorten it before you save. | pending Shlok approval |
| Transcript card, buttons | Save as a capture / Discard / Yes, discard it / Keep it | pending Shlok approval |
| Transcript card, save failed | Could not save. Try again. | existing `save-failed` text |
| Needs attention, voice off | Voice notes are not switched on yet. | from ruling R8 |
| Needs attention, recording no longer stored | This voice note is no longer stored, so it cannot be typed out. Choose Skip, or Try again. | pending Shlok approval |
| Needs attention, nothing heard | Nothing could be heard in this recording. Skip it, or try another one. | pending Shlok approval |
| Needs attention, over 25 MB when read | This voice note is over 25 MB, more than the free voice reading takes. Skip it, or record a shorter one. | pending Shlok approval |
| Needs attention, nothing stored for it | This voice note could not be typed out. | pending Shlok approval |
| Needs attention, three tries | This voice note could not be typed out after three tries. Try again, or skip it. | pending Shlok approval |
| Paused, `voice_day` / `voice_hour` | (already in s16.7) | pending Shlok approval |

### 16.10 Plan 2b Task 5: links and pasted text (2026-10-08, append-only)
No SQL beyond migration 0008 (it already admits `url` and `text` documents, `<id>.txt` and `text/plain`, `fetched_from`, the `ingest_url` / `ingest_text` jobs and the `text_pages` step). There is no `fetch_url` job step (ruling R1): Aksh's click runs the fetch inside his own action, on his session, so job code never writes a document's kind, path, link or hash.
- **The safe fetch (`src/modules/documents/safe-fetch.ts`, `ip-guard.ts`, `safe-fetch-transport.ts`).** The only code that requests an address Aksh typed. https only, port 443, no user name or password in the link. The host name is resolved by the desk (`dns.lookup`, all addresses); if any one address is private, loopback, link-local (including the cloud metadata address), carrier-grade NAT, multicast, unspecified or reserved the link is refused: 0.0.0.0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0.0/24, 192.0.2.0/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4 (with 255.255.255.255); `::`, `::1`, fc00::/7, fe80::/10, ff00::/8, `::/96`, 64:ff9b::/96 and 64:ff9b:1::/48, 2001:db8::/32, 2001::/32 (Teredo), 100::/64; a mapped address (`::ffff:a.b.c.d`) and a 6to4 address (2002::/16) are judged as the IPv4 they carry. An address written into the link is checked the same way, without a lookup. The connection is then made to the vetted address itself (the request is handed that address and a `lookup` that can only answer it), with the original name for the Host header and the TLS name, so a second DNS answer cannot swap it (DNS rebinding). Up to 2 redirects, each checked again from scratch (scheme, user name, port, then its own lookup). At most 50 MB, counted as the body streams (a Content-Length only ends the read early); everything, lookups and redirects included, is cut off at 30 s. The request carries a user agent, an accept line and an accept-encoding line, never a cookie or an authorization header, and the certificate checks stay on. `node:https` is imported by the transport file only (a graph test keeps it so).
- **What a link answers with.** A PDF (by its type, or by `%PDF-` when the server calls it octet-stream) is stored as `<id>.pdf` through the same checks as an upload (hash, duplicate refusal, 90% storage refusal, size, type) with `fetched_from` and `source_url` set to the link Aksh pasted, and read by `pdf_text` like any PDF. A web page is reduced to its visible text (script, style, comments and tags removed, a table row kept as one line, entities decoded; no parser dependency) and stored, like plain text and like pasted text, as `<id>.txt` (`text/plain`), kind `url`, and read by `text_pages`. Anything else is refused. The page's title is the document's title; a PDF's is its file name.
- **`text_pages`.** Cuts the stored text into pages of about 8,000 characters at a line break (a last piece under 50 characters is folded into the page before it, so no text page is taken for a scan), 25 pages a step, then enqueues itself from the next page like `pdf_text`; the last step hands over to `select_pages`. Text is limited to 200,000 characters (a server action body is 1 MB by default, and 25 pages is far more than a results table). Longer text is refused, never cut.
- **Selection (R15).** For a `text` or `url` document `select_pages` picks the statement pages (heading rule) and every page where more than 15% of the words are numbers, best first within the page budget, because Aksh chose this text. Pages of these documents are never sent to OCR.
- **Where it is in the product.** The drop bar gets a paste box under the file chooser (`link-paste.tsx`): a paste that is one http(s) address is a link, anything else is text; the optional company, filing date and public link beside it apply to both. The desk home's Today list shows "Read this link" under a capture that holds an https link; it is Aksh's click and never automatic, so a capture alone never costs a fetch or a model call.
- **Testing without a network.** The tests inject the resolver and the transport. For the e2e, `LLM_ADAPTER=fixture` (off Vercel only) swaps the real DNS and HTTPS for made-up sites under `.test` (`fixture-link.ts`); the guard runs on their answers unchanged, and `internal.test` answers a private address so the e2e sees the refusal.
- **Known limits.** A page is read as UTF-8 (a page in another character set will show wrong letters; the type's `charset` is not used). A page that builds its table with JavaScript has no table in the desk's copy. A site that blocks an unfamiliar user agent (BSE may) answers with an error page, and the desk says it could not open the link.

Copy (plain second person). "Pending Shlok approval" means the build chose the wording and Shlok has not yet read it.
| Where | Text | Status |
|---|---|---|
| Link refused, not a usable link (`link-invalid`) | Use a full link that starts with https:// and has no user name, password or port number. | pending Shlok approval |
| Link refused, private or internal address (`link-blocked`) | That link points somewhere the desk will not open. | pending Shlok approval |
| Link could not be opened (`link-failed`) | The desk could not open that link. Check it, or paste the text instead. | pending Shlok approval |
| Too many redirects (`link-redirects`) | That link sends the desk through too many other links. Open it in your browser and paste the final link. | pending Shlok approval |
| Over 50 MB (`link-too-large`) | That link is over 50 MB. Download the part you need and upload it. | pending Shlok approval |
| Over 30 seconds (`link-timeout`) | That link took longer than 30 seconds to answer. Try again, or paste the text instead. | pending Shlok approval |
| Not a page or a PDF (`link-unsupported`) | That link is not a web page or a PDF. Upload the file instead. | pending Shlok approval |
| No text at the link (`link-empty`) | No readable text was found at that link. Paste the text instead. | pending Shlok approval |
| Pasted text under 50 characters (`text-too-short`) | Paste a little more, at least 50 characters. | pending Shlok approval |
| Text over 200,000 characters (`text-too-long`) | That is over 200,000 characters. Paste the part with the figures. | pending Shlok approval |
| Drop bar paste box, label | Or paste a link or some text | pending Shlok approval |
| Drop bar paste box, hint | The desk opens a link only when you press Read it. | pending Shlok approval |
| Drop bar paste box, button / while working | Read it / Opening the link… / Saving… | pending Shlok approval |
| Drop bar paste box, done | Opened the link. The desk starts reading it now. / Added. The desk starts reading it now. | pending Shlok approval |
| Drop bar paste box, duplicate | You added this on 3 Oct. Open it | pending Shlok approval |
| Drop bar paste box, the call failed | The desk could not read that. Try again. | pending Shlok approval |
| Today list, under a capture with a link | Read this link / Opening the link… / Added to your inbox. Open the inbox | pending Shlok approval |
| Today list, the call failed | The desk could not open that link. Try again. | pending Shlok approval |
| Being read, text or a web page | Reading page 2 of 4 (the PDF's sentence) | pending Shlok approval |
| Needs attention, stored text gone | The stored text is no longer there, so its pages cannot be made. Choose Skip, or Try again. | pending Shlok approval |
| Needs attention, stored text differs | The stored text is not the text that was added. Choose Try again, or Skip this document. | pending Shlok approval |
| Needs attention, no text | There is no readable text in this document. Choose Skip. | pending Shlok approval |

### 16.11 Plan 2b Task 6: the ambiguous-page classifier (2026-10-08, append-only)
No SQL beyond migration 0008 (it already admits the `classify_pages` step, with a page, `pass`, and no insert from the desk). `GROQ_MODEL_CLASSIFY` (optional, default `openai/gpt-oss-20b`; blank means the default) joins `GROQ_MODEL_TEXT/VISION/WHISPER`; the model's own bucket in `provider_usage` is its id, under the same `GROQ_CAPS` (30 RPM, 1K RPD, 8K TPM, 200K TPD at 75%, s9 row for `gpt-oss-120b / gpt-oss-20b / qwen3.8-27b`, https://console.groq.com/docs/rate-limits, rechecked 2026-10-08). The limits are "organization level" on that page; each model has its own row, so the desk keeps one bucket per model id and reads Groq's own headers, which show a pooled limit if there is one (ADR-004 s3.5).
- **Which pages (R16).** `select_pages` hands over a page when the rules said `other`, it is not a scan, it is not a contents page (fewer than 3 statement headings) and more than 15% of its words are numbers: at most 30 pages (three batches), the densest first. Only when AI is on, the document is not pasted text or a web page (those are read by density already) and the page budget still has room. Pages Aksh ticked or unticked are never sent.
- **The steps (R2).** One batch is one `classify_pages` step keyed by its first page; its arguments hold the pages still to sort and the verdicts kept so far. Ten pages a call, the first 600 characters of each (about 2,000 input tokens), `max_completion_tokens` 400, `reasoning_effort: "low"`, prompt `classify-v1`, answer `{ pages: [{ page, kind, confidence }] }`. A batch queues the next; the last batch ticks what the model found and queues the reading through the shared routing (`stepsForPage`), so nothing goes around it.
- **What a verdict is worth.** Confidence under 0.6, a kind of `other`, a page not asked about, and a repeat are ignored and the rule's verdict stands. A kept verdict is stored as the page's kind with score `20 + 20 x confidence` (32 to 40), so it ranks below any page with a statement heading. The last batch spends only the page budget that is left after the rule's pages and Aksh's ticks (his count), best first; a page Aksh ticked or unticked is never changed (the database trigger enforces it too). Classifier calls never count against the page budget.
- **Governor and failures.** Every call goes through `callWithinBudget` in the classify bucket, so a spent allowance defers the step with its time and reason, like extraction. A batch the model cannot answer (invalid twice, a provider error three times, a refused request) is let go, not failed: the batch is done with `letGo` in its result, the chain carries on, and the rules' choice stands, so an optional helper never puts a document under Needs attention. Unreadable step arguments are the one attention case.
- **Copy.** None new: the tray reads "Choosing the pages to read." while a batch is queued, and the existing paused sentences cover the allowance.
- **Testing.** The tests use a fake `LlmPort`; the fixture adapter answers a classification request with no pages placed unless a committed entry matches.

### 16.12 Plan 2b Task 7: the private digest of commentary pages (2026-10-08, append-only)
No SQL beyond migration 0008 (it already holds `document_digests`: one row per claim, `unique (document_id, page_no, extraction_id, ord)`, append-only, admin read, service-role select and insert, and admits the `digest_page` step from the desk). The table's lengths are the limits: **section 1 to 300 characters**, claim 1 to 400, line 1 to 600; `src/modules/ingestion/caps.ts` holds the rest (8 claims a page, 1,500 completion tokens, a line under 20 characters is never counted as confirmed).
- **Routing (R6).** The one `stepsForPage` function sends a page the selector called `mdna` to `digest_page` (a scan still goes to `ocr_page` first), so `select_pages`, Aksh's tick, "Read the ticked pages" and a classifier's pick all take the same road. A voice note is never digested (`digest_page` returns done without a call if its document is audio, and the pane's read returns nothing for one).
- **The step.** `digest_page` reads one page (the first 12,000 characters) on the text model through the governor, prompt `digest-v1`, answer `{ claims: [{ section, claim, line }] }`: claims management makes about the future, capacity, guidance and risks; the line copied from the page; the claim in at most 25 words. It writes one `extractions` row and the `document_digests` rows and nothing else: no proposal, no capture, no revision, nothing in `body_md`, `change_reason` or `captures.raw_text`. `on_page` is `onPage(line, page text)` decided in code when the row is written.
- **Idempotency (R20 and the Task 1 carry).** The step first looks for the extraction this page already has under `digest-v1` for the same input hash and model, and reuses its id (and its stored answer, with no new call); it inserts a new extraction only when there is none. Rows are written with `on conflict do nothing`, so a rerun, a duplicate step or a lost lease adds neither an extraction nor a row. (`extract_page` and `vision_page` keep their own pattern.)
- **Where it is in the product.** The document pane shows a "Machine-read" panel (mono marker, private, closed until opened) above the page text: each claim with its section, the machine's note and the printed line. A claim whose line is not on the page is hidden behind "Show 2 claims the page check could not confirm" and, when shown, is marked and offers nothing. "Use as a fact" appears only on a confirmed claim and sends the Facts form one event carrying the document's source details, the verified line and the page ("p. 12"): the form adds the document's source row (the one "Use as source" adds, reused when it is listed) and a new fact row with the quote, the locator and the source set and **label and value empty**. The claim's text is not in the event. Nothing is saved: Aksh fills the row and saves it through the one save action. Nothing public reads the table, the panel or its reader (the isolation test checks it).
- **The tray.** A digest is a page step (R13): "Reading commentary: 2 of 5 pages" while only digests are left; a document of only commentary pages ends "Read. The commentary notes are in the document pane beside your file; there are no figures to check." and has no Needs-you card.
- **Testing.** Tests use a fake `LlmPort`; the fixture adapter answers a `page_digest` request from its own table (`fixtures/digest.json`), so a statement heading on the page can never pick a figures answer, and a page with no committed entry digests to no claims.

Copy (plain second person; "pending Shlok approval" means the build chose the wording and Shlok has not yet read it).
| Where | Text | Status |
|---|---|---|
| Panel marker | Machine-read | pending Shlok approval |
| Panel summary | 3 claims on this page / 1 claim on this page | pending Shlok approval |
| Panel note | The AI read this page and noted what management says. These notes are only for you. They are never published and are not your words. | pending Shlok approval |
| Hidden claims toggle | Show 2 claims the page check could not confirm / Hide 1 claim the page check could not confirm | pending Shlok approval |
| Hidden claim mark | Not found on this page | pending Shlok approval |
| Button on a confirmed claim | Use as a fact | pending Shlok approval |
| After Use as a fact | It is in the Facts list as a new row. Add the label and value yourself. | pending Shlok approval |
| Facts form did not take it | The Facts list could not take it. Fix the facts sheet first, or the list may be full. | pending Shlok approval |
| Digest could not be read | The machine-read notes for this page could not be loaded. | pending Shlok approval |
| Tray, digests being read | Reading commentary: 2 of 5 pages | pending Shlok approval |
| Tray, only commentary read, and a claim was found | Read. The commentary notes are in the document pane beside your file; there are no figures to check. (With no claim found the card says the usual "Read. No figures matched; open it beside your file.") | pending Shlok approval |
| Section when the model gave none | No heading | pending Shlok approval |
- **Fix round 1 (2026-10-08).** A stored line is one line of single spaces (a line copied across a PDF wrap would otherwise break the facts sheet, which splits on newlines and tabs); a line containing `|` is kept as the model gave it but is never counted as on the page, so it stays under "could not confirm" and cannot reach "Use as a fact" (the sheet splits a row on `|`). The prompt's "8 claims" and "25 words" come from `DIGEST_MAX_CLAIMS` and `DIGEST_CLAIM_WORDS`. The highest page number (5,000) is one constant, `MAX_PAGE_NO` in `documents/limits.ts`.
