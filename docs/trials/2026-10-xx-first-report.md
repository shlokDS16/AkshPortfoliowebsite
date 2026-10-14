# Phase 2a first-report measurement (date when run: 2026-10-xx)

Plan 2a Task 16, steps 1-3. **Deferred on 2026-10-08 (lean mode, Shlok):** nothing in this file has been run. The hosted
push, the Vercel key, the preview deploy, the real report and the cap updates wait until after Aksh's Phase 1 trial and the
merge of `phase-2a`, when Aksh has real PDFs. Steps are written as a checklist so the session that runs them has nothing
to decide. The date in the file name is filled in then (rename the file; do not overwrite this text).

Until then every throughput number in the spec (s9: about 3,400 tokens per statement page; about 7 pages per 240-s pump run;
a 20-page document in about 45 min with the tab closed, about 12 min with it open; about 44 pages a day) is an
**assumption**, not a measurement. `TOKENS_PER_PAGE_DEFAULT` in `src/modules/ingestion/caps.ts` is still 3,400.

## Step 1. Hosted (controller, with Shlok's go-ahead for anything on Production)
- [ ] Merge decision: Aksh's 3-day trial is over (Slice A changes the Facts form he is trialling).
- [ ] Dry run: `pnpm supabase db push --dry-run` lists exactly `20261007000006_documents_jobs.sql` and `20261007000007_extraction.sql`.
- [ ] `defenso guard_code` (or the opus review that stands in while it rejects GET) on migration 0006 before the push.
- [ ] Push: `pnpm db:push`. Then `pnpm db:types` shows no diff against the committed `database.types.ts`.
- [ ] Read-only check on hosted: the `documents` bucket exists, is private, `file_size_limit` is 52428800 (50 MB), and its `storage.objects` policies are admin-only.
- [ ] `GROQ_API_KEY` (and `GROQ_MODEL_TEXT`) set on Vercel **Preview**; Production only with Shlok's approval. `LLM_ADAPTER` is **not** set on Vercel.
- [ ] Deploy the preview from `phase-2a`; `GET /api/health` returns 200 and its `checks` include `queue`.
- [ ] Re-enable `.github/workflows/pump.yml` only after a Vercel protection bypass is arranged (progress.md, Pending Shlok).
- [ ] The external uptime monitor watches `/api/health` (it now fails on a stuck queue, so it emails Shlok and Aksh once per incident).

## Step 2. Run one real annual report (Aksh's choice; digital PDF under 50 MB)
Record each value from the database (`provider_usage`, `job_steps`, `proposals`) and from a stopwatch. Do not estimate.

| Measure | Value | How to read it |
|---|---|---|
| Report (company, year, file name, size in MB) | | |
| Page count | | `documents.page_count` |
| Text pass: wall time, steps used | | `pdf_text` steps: first start to last finish; count of re-enqueues |
| Pages selected by the rule | | `document_pages.selected_by = 'rule'` |
| Pages Aksh changed (ticked + unticked) | | `selected_by = 'aksh'` and unticked rows |
| Tokens per page, median | | `provider_usage.tokens_used` for `kind = 'reservation'`, `status = 'used'` |
| Tokens per page, p90 | | same rows |
| Wall clock to Ready, tab closed | | upload to the Ready card, with the inbox tab closed (pump only) |
| Wall clock to Ready, tab open | | upload to the Ready card, with the inbox tab open |
| Proposals produced | | `proposals` for the document |
| Flags (count, by flag) | | `proposals.flags` |
| False flags (flagged, but the value was right as read) | | counted by Aksh while reviewing |
| Missed errors (verified, but wrong) | | counted by Aksh; any is a Critical finding |
| Aksh's review minutes | | stopwatch, first review click to File under |
| Figures filed | | `proposals.status = 'filed'` |
| Typed by hand instead (figures he had to key in) | | his list |
| Anything else that slowed him | | friction log |

### Friction log (first report)
| Screen | What got in the way | Seconds lost | Blocks / slows / cosmetic | Fixed in (commit) |
|---|---|---|---|---|
| | | | | |

## Step 3. Update the numbers (after Step 2)
- [ ] `src/modules/ingestion/caps.ts`: `TOKENS_PER_PAGE_DEFAULT` = the measured median (rounded up to the nearest 100).
- [ ] If the p90 or the median exceeds 5,000 tokens per page: lower `PAGE_CHAR_LIMIT` (12,000 today) and write down why here.
- [ ] Spec `docs/specs/2026-10-07-phase-2-ingestion-design.md` s9: keep the "Throughput estimate (assumption ...)" line and append the measured one beneath it, dated.
- [ ] ADR-004 s8: append "Measured <date>: ..." beneath the 3,400-token assumption.
- [ ] The inbox ETA and the AI pages meter ("AI pages today: N of 44") both derive from the constant; check the meter's total (`floor(150000 / TOKENS_PER_PAGE_DEFAULT)`) reads sensibly.
- [ ] Re-score the rows marked "pending first report" below and file anything under 4 as a task in `docs/progress.md`.

## Rubric scores from code and tests (2026-10-08, Plan 2a built through Task 15)
Scored by the Task 15/16 implementer from the code, the tests and the e2e runs; the `desk-architect` pass is the controller's.
Rows that need the real report are marked **pending first report** and are not below-4 tasks.

| Row | Score | Evidence |
|---|---|---|
| R1.2 Dated and versioned | 4 | Every staged figure carries a period, as-of date and unit from the page's own headers through code (`periods.ts`), refused when incomplete (`figure-incomplete`); provenance records the revision it was filed in and whether Aksh changed it. 5 needs a real filed file on the public site. |
| R1.3 Facts vs view separation | 5 | Machine readings live only in `extractions`, `proposals` and `fact_provenance` (admin RLS); three-layer write boundary (pgTAP 0006/0007, `ingestion.graph.test.ts`, proposals trigger); a filed figure is a typed row in `structured` that Aksh saved with his own change reason; the chip is private. |
| R2.3 Data display | 4 | Review shows each figure with its page, quoted line and as-of; the inbox meters are real quotas with units (MB, pages); phone layouts do not scroll sideways and the open page chooser no longer widens the page (e2e asserts `scrollWidth <= 375`). Legibility of a real 300-page report's figures: **pending first report**. |
| R2.4 Capture speed | **pending first report** | Built: the upload card appears at once, reading starts by itself, the Ready card is on the desk home, one flag at a time with keys 1/2. "Faster than Notepad" needs Aksh's review minutes for a real report. |
| R2.7 Accessibility and perf | 4 | axe WCAG 2.2 A/AA clean on `/desk`, `/desk/inbox`, `/desk/items`, `/desk/names` and on the review page, at 375 and 1280, light and dark (desk-a11y, desk-staging); keyboard flow tested; reduced motion honoured. LCP on 4G for the inbox is not measured (**pending first report**). |
| R3.1 Free-tier safety | 4 | Governor at 75% caps under an advisory lock with real `reserve_usage` integration tests; 429s and quota waits defer and never fail; AI-off, paused, storage-full and stuck-queue states all have owner-visible copy (Task 15). 5 needs the external monitor emailing on a real stuck queue (hosted, deferred). |
| R3.2 Idempotent jobs | 5 | Leases and reaper (two expiries to `needs_attention`), `on conflict do nothing` page writes, extraction cached by input hash, dedupe key per proposal, queue claim with `SKIP LOCKED`; runner tests with a fake clock. |
| R3.3 Security | 4 | RLS on every new table, column-level grants for the machine, storage policies, signed uploads, origin checks; pgTAP 627 green on a clean database. `defenso guard_code` could not run (server rejects GET); opus reviews stood in. Hosted bucket policies unverified until Step 1. |
| R3.4 Compliance in code | 5 | No new publish path; staged figures go through the editor, the existing save action and `publish_revision()`; the machine cannot write a revision (graph test, grants and trigger); provenance is private. |
| R3.5 Tests | 4 | Unit 2005; e2e 205 passed / 9 skipped, twice in a row on one database, retries 0; pgTAP 627; the full flow (upload to Done) runs at 375 and 1280. The usage integration test skips with a warning when no local stack exists (CI must run it; see debt). |
| R3.6 Small units | 5 | No non-test source file over 300 lines; components under 200; modules talk through their public entry; the e2e specs are under 300 lines and share `e2e/support/desk.ts`. |
| R3.7 Memory discipline | 4 | ADR-004 plan decisions, spec amendments, errata, debt and open questions written at close-out; progress ticks done. The timeline entry and the status snapshot are the controller's. |
