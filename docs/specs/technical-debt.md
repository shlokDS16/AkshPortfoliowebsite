# Technical Debt

Shortcuts, TODOs, known limitations, and refactor opportunities.

| Added | Item | Why it exists | Cost if ignored | Trigger to fix |
|---|---|---|---|---|

## 2026-10-04 (planning phase)
- Official SEBI circular PDFs (Jan 2025, May 2026) not yet downloaded into `docs/compliance/`; rules were derived from the research report and news coverage.
- Upstox API pricing/token-refresh and Next.js 16.3.8 Turbopack CSS fix are unverified assumptions with documented fallbacks (bhavcopy; `--webpack`).
- Reference-site research could not fetch Scuttleblurb, Nomad, Akre, Ambit, Dalton; findings for those are from search snippets only.

## 2026-10-07 (Plan 1B close-out)
- (Plan 1B) `listBlockedItems` scans the latest 200 gate decisions; replace with a view when items exceed a few hundred.
- (Plan 1B) The public snapshot loads every gated revision; fine below ~100 files, then page by item.
- (Plan 1B) New names runs four idempotent writes (record, items, captures, archive) without a transaction (re-runnable); move to an RPC in Phase 2.
- (Plan 1B) Prose numbers in Aksh's VIEW rely on the item-level 30-day lag; per-figure withholding covers facts, chips and exhibits only.
- (Plan 1B) Theme pages are not public in Phase 1 (themes are private stubs); revisit with the learning graph (Phase 4).
- (Plan 1B) Visual baselines are platform-specific and local-only (D29); move to a Linux container job if drift appears.
- (Plan 1B) Refile has no lock: two simultaneous clicks can file one capture twice.
- (Plan 1B) Q8: `publish_revision()` trusts the server-built `p_lint_result` (ADR-003 confines the caller to service_role with a verified admin actor; SQL does not re-run the lint). Decide before launch whether to sign it.
- (Plan 1B) The display:block phone tables keep table roles in Chromium's accessibility tree (e2e); Safari/VoiceOver and NVDA are checked by hand only (trial doc).
- (Plan 1B final review) Inline source chips measure 41.4 px with their hit area against design-dna's "every control >= 44 px on coarse pointers"; accepted under the WCAG 2.5.8 inline exception (e2e asserts 24 px for chips, 44 px for controls).
- (Plan 1B final review) Single-admin race: the publish path reads `data_as_of` twice without a lock, and the lint result is not bound to `items.updated_at`. Bind it inside `publish_revision()` in the next migration.
- (Plan 1B final review) The public streak can be up to 1 h stale (home page ISR, `revalidate = 3600`).
- (Plan 1B final review) `SegmentedControl` lacks Up/Down/Home/End keys (APG radiogroup pattern). Fix before public launch.
- (Plan 1B final review) Screen-reader check (VoiceOver, NVDA) of the display:block phone tables is still owed before AMC readers see the site.

## 2026-10-07 (data safety: nightly backup)
- (Backup) Backup artifacts expire after 90 days (`retention-days: 90`, the GitHub maximum for this plan). Consider a monthly copy of one `.gpg` file to Shlok's drive.
- (Backup) Supabase Storage buckets are not covered by the database dump. None are used yet; revisit in Phase 2 when PDFs land in Storage (an object-level copy plus the same encryption).
- (Backup) The restore drill proves data restore into a schema built from migrations, not `schema.sql` / `roles.sql` into a fresh hosted project; do a one-time real restore into a scratch Supabase project before launch.

## 2026-10-08 (Plan 2a close-out)
- (Plan 2a) **Originals are not in the database backups.** `scripts/backup` and `.github/workflows/backup.yml` dump Postgres only; uploaded PDFs live in the private `documents` Storage bucket and are not copied. Page text (`document_pages`) is in the dump, so a lost original costs a re-upload, not the figures. "Done with this document" deletes the original on purpose. Trigger to fix: before Aksh keeps originals he cannot re-download (an object-level encrypted copy, as the Phase 1 backup line already said to revisit).
- (Plan 2a) Migrations 0006-0007 are local only; the hosted push, the bucket-policy read-back and the first real report wait for the merge (docs/trials/2026-10-xx-first-report.md). Every throughput number is an assumption until then.
- (Plan 2a) `TOKENS_PER_PAGE_DEFAULT` (3,400) and `PAGE_CHAR_LIMIT` (12,000) are unmeasured; the AI pages meter ("N of 44") and every ETA derive from the first.
- (Plan 2a, Task 3) `service_role` can set `documents.status` to done/skipped and `selected_by = 'aksh'`; only the import-graph test keeps job code away. `publish_revision()` and `unpublish_item()` are callable by `service_role` with any `p_actor`. Final-review item.
- (Plan 2a, Task 4) In-flight signed uploads can jointly pass the 90% storage line (single admin). Upload error texts exist in `documents/errors.ts` and `lib/messages.ts` (kept equal by a test).
- (Plan 2a, Task 6) `setVerdicts` makes one round trip per page, and `select_pages` never checks the drain deadline: batch it if a long report is slow.
- (Plan 2a, Tasks 1-2, topics) A too-long topic shared by N facts gives N identical errors on one `G` line; `G | Topic |` with no ids is dropped silently; a repeated id inside one `G` row is skipped silently; `draftToSheet` writes the topic untrimmed; a topic named like a period gives two same-titled captions; the Facts hint does not mention topics.
- (Plan 2a, Tasks 9-11) The NO_RATE constant and Zod-issue formatter are duplicated in `fixture-llm.ts` and `groq.ts`; a misconfigured fixture on Vercel logs on every `aiReadingOn()` call; a thrown LLM call releases 0 tokens although Groq may have counted them (headers reconcile); the sweep builds a second service client for `pruneUsage`, and a prune failure marks the heartbeat failed; the usage integration test skips with a warning when no local stack exists (CI must run it); `proposals.page_no` is not tied to the extraction's page.
- (Plan 2a, Task 12) `lastError` echoes values into the model's system prompt (pass codes and paths only); an orphan extraction can remain if a crash falls between the two inserts; a value printed second in a line with no prior column is not caught by the line check; no test for model `page_kind` against the selector.
- (Plan 2a, Task 13) "Drop it" has no undo; a flagged `quote_not_on_page` row is filed with an empty quote; File under with `noValidate` gives a generic save-failed text after `startFileAction` already created the file; the company chooser has a unit test but no e2e; a document linked to the wrong company cannot be relinked; values and rows both travel in the RSC payload.
- (Plan 2a, Task 14) Provenance insert and the `filed` update are two writes, not one transaction, and the update's row count is unchecked (a concurrent unstage can leave an orphan provenance row); duplicate or over-cap staged rows stay staged until Send back (the banner explains); Send back discards unsaved form edits without a warning; a staged unsaved figure from a document later marked Done still offers Send back, which lands on the closed message and can never be refiled; the Done confirmation loses focus on each swap and its "cannot be undone" line has no live region.
- (Plan 2a, Task 15) The "Ready to review" card appears only for a document with figures to check, while the Inbox tab badge also counts a read document with none (it has nothing to review but a Skip to decide); the desk home runs the inbox's full read (`listInbox`) once per load, which is fine for one admin and a handful of documents, and should become a count query if the inbox grows.

## 2026-10-08 (Plan 2a final review, CAN WAIT items; the fix wave closed the rest)
Closed by the fix wave: the filing/staging basis mismatch, the unreachable Done, the false "upload again" copy, stranded staged figures of closed documents, the unfixable company, `service_role` UPDATE on `documents.status` (and ticks as Aksh), the provenance count check, and the ban on `publish_revision` / `unpublish_item` in the graph test.
- (Final review, queue and extraction) The 60-proposal cap is count-then-insert, so two concurrent drains can pass 60 on one document (re-count after the insert, or accept the overshoot in a comment). A page Aksh ticks before `select_pages` has run counts against the budget and the rule then still ticks a full budget of its own, so total reads can be budget plus Aksh's ticks.
- (Final review, filing) Provenance insert and the `filed` update are still two writes, not one transaction; the proper fix is a `security invoker` SQL function doing both. An orphan `fact_provenance` row is invisible (`provenanceForItem` reads filed proposals only). Filing again after a consolidated page is read later leaves an earlier staged standalone repeat staged (it is not cleared when it becomes a repeat).
- (Final review, publish gate) `publish_revision()` and `unpublish_item()` stay callable by `service_role` with any `p_actor` (phase 1, 0004/0005); 2a code never names them and handlers cannot reach the client. Q8 owns the real fix.
- (Final review, Tasks 1-2) Duplicate topic errors; the 40-char test asserts the line only; an empty `G` row is dropped; a repeated id is skipped; an untrimmed topic, a tab in a topic, a period-named topic caption, and the Facts hint (copy and parser polish).
- (Final review, Task 4) Concurrent signed uploads can jointly pass 90%; duplicated message maps are kept equal only by a test.
- (Final review, Task 6) `setVerdicts` is one round trip per page and `select_pages` has no deadline check; watch on a 400+ page report in the trial.
- (Final review, Task 7) A forged Origin still needs the admin cookie; accepting the request's own origin is safe (re-reviewed).
- (Final review, Task 8) Same-title documents in the quote match; per-item renormalisation; a non-integer page box; no unit tests for DocLayout / OpenDocumentButton; one copy paragraph; search is only mocked.
- (Final review, Tasks 9-12) NO_RATE formatter duplicated; the fixture misconfigured on Vercel logs on every call; `proposals.page_no` is not tied to the extraction's page; a thrown LLM call releases 0 tokens; a second service client for prune; a fake median; the usage integration test skips without a local stack (CI must actually run it); a value printed second on a line with no prior column is not caught.
- (Final review, Task 13) Drop has no undo; a `quote_not_on_page` row is filed with an empty quote; File under `noValidate` shows a generic text; the unused `values` in the RSC payload; the desk-a11y spec does not cover the review screen's new controls.
- (Final review, Task 14) Duplicate or over-cap staged rows stay staged until Send back / Drop; Send back discards unsaved edits without a warning; extra copy awaits Shlok (Q13, Q20); the Done confirmation's focus and live region (operable, but check the a11y rubric row); `review.test.tsx` overlaps `change-company.test.tsx` and is over 300 lines; the mobile upload flake and the `/desk/items` recent-only list.
- (Final review, Tasks 15-16) The liveness strip re-parses its sentence; the drop-bar floor differs from the meter's rounding; an unused `refuse` prop; the storage line replaces "Uploaded X"; the "Could not be read" state word; `needsYouDocs` returns a silent `[]` and runs a full `listInbox` per home load; this file was missing items; a long progress line.
- (Final review, Q15) The home Ready card appears only when `pending > 0`, while the Inbox badge counts every ready document; "All figures checked." makes a document ready with nothing to check, so settle this with Shlok.
