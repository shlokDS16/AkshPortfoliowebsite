# Project Timeline

Append-only chronology for Aksh Research Desk. Never rewrite an entry. When new information
contradicts an old entry, add a new entry that references the old one.

Entry template:

```
## YYYY-MM-DD - [short title]

**What happened:**
**Why:**
**Discovered:**   (facts learned, including surprises)
**Assumed:**      (flagged as assumption, not fact)
**Implications:** (what this constrains or unlocks later)
**Links:**        ADR-00N, session file
```

---

## 2026-10-04 - Project initialized

**What happened:** Project Operating System scaffolded via project-kickoff.
**Why:** Establish persistent standards and living memory from day one.
**Implications:** Every future session loads CLAUDE.md and follows the standards
in `claude/`. End-of-session routine runs before any session finishes.

## 2026-10-04 - Kickoff
- Brainstormed with Shlok (building for his friend Aksh Agrawal, student investor). Goal: personal research system he uses daily, showable to a few people, public side credible to AMCs. Budget: free tiers only (Vercel, Supabase, Groq, YouTube).
- Approach C approved: "research desk with an AI librarian" (universal inbox -> extract -> review -> file), two-tier visibility for SEBI, build order core -> ingestion -> track record -> learning graph -> distribution.
- Research verified against vendor docs (docs/research/). Key surprises: Groq free tier is 8k TPM (70-100 pages/day); Llama 4 vision deprecated on Groq (use qwen3.8-27b); SEBI 30-day price-lag rule effective 1 Jul 2026; screener.in scraping forbidden; Vercel Hobby one cron/day, no retry.
- Three architecture framings produced; ADR-001 chooses A's runtime + B's data integrity (append-only revisions, hash-chained ledger) + C's owner-visible failure UX. Red-team pass dispatched.
- Scaffolded Project OS, three agents, .env.example, compliance rules, rubrics, progress.md. Git initialised.
- Next: Shlok approves ADR-001 and the Phase 1 spec; then writing-plans for Phase 1.
- Later on 2026-10-04: Shlok approved ADR-001, the Phase 1 spec, the capture grammar, private-only interactive valuation and no client accounts in v1. Plan 1A written (14 tasks, 7,007 lines, every library call verified against current docs; NOT executed). desk-ui produced three reading-experience directions and a side-by-side comparison (Mobbin MCP refused: paid plan; 40 screens studied via browser). Spec reconciled with the plan's resolutions (publish_revision naming, RLS on base tables for invoker views, fail-row semantics, SUPABASE_SECRET_KEY). Session stopped by Shlok; resume with the reading-direction choice.
- 2026-10-05: Segment 1 round 2 (B+ improvised, H hybrid). Shlok chose B+ (all-sans research file) over the designer's recommended H. Recorded in docs/design/decisions.md. Segment 2 (navigation + IA) exploration dispatched.
- 2026-10-05: Segment 2 decided (Register + What-changed block + Read-first notes). Shlok delegated the pick to the recommendation, asking for the most visually appealing and presentable option. Segment 3 (data display) dispatched.
- 2026-10-05: Segment 3 delivered; controller took the recommended hybrid as PROVISIONAL (Shlok in class). Rule-9 ruling: no equity/per-share values in public scenario tables. Motion research done (docs/research/2026-10-05-motion-landscape.md); segment 6 motion demo dispatched. Plan 1A execution started on branch phase-1a (pre-flight: 149 rows, 15 rulings in .superpowers ledger); Task 1 implementer running.
- 2026-10-05: Motion segment decided (Instrument + Paper morph + Terminal draw-to-cap). Docker Desktop crashed on the Inference/Model Runner socket while Task 3 needed supabase start; fix steps given to Shlok. Segment 5 (identity) dispatched.
- 2026-10-05: Segment 4 decided (Trays base + command-line capture internals + day-book gate notes).
- 2026-10-05: Segment 5 decided (Case files under Aksh's name, geru accent, numbering as mark); segment 3 confirmed. All six design segments decided. Q5 answered. design-dna writer dispatched.
- 2026-10-05 (end): Task 3 complete+reviewed; Task 4 implemented (dc8243d) awaiting review; design-dna + component-inventory written (15 decisions to ratify). Shlok hit the weekly usage limit (resets 22:40); session paused with no agents running. Shlok's credentials found in .env.example were moved to .env.local and the template restored.
- 2026-10-06: Shlok filled .env.local. Normalised two odd lines, trimmed whitespace on five values, generated CRON_SECRET locally. Provider changes: OCR.space replaces Azure DI; NSE bhavcopy only (Upstox dropped; Q2 closed); Supabase access token verified (project laommoxjogvvzcpxdjly, PG17). SUPABASE_SECRET_KEY is the legacy JWT (valid to end-2026). Task 4 review dispatched.
- 2026-10-06: Task 4 complete (273 pgTAP; backdating + slug + spoof closed). Migrations pushed to hosted Supabase via access token (no DB password). Security Advisor 0 errors. Admin email seeded; public signups disabled on hosted auth. Task 5 dispatched; Plan 1B being written.
- 2026-10-06: Task 6 complete (magic-link admin auth; review approved, signups verified closed via live probe). Plan 1A 5/14 done (Tasks 1,3,4,5,6); Task 2 deploy deferred.
- 2026-10-06: Task 7 complete (research module: items, append-only revisions, diff, desk item screens; review approved). Plan 1A 6/14.
- 2026-10-06: Task 8 complete (compliance lint: normalising pre-pass, abbreviation-aware splitter, Indian price formats, false-positive guards; 423 tests; 3 review rounds). Plan 1B written (16 tasks) and its decisions ratified.
- 2026-10-06: Task 9 complete (publish gate service, retraction, desk gate panel; allowances bound to flagged sentences; latest-only publish via migration 0003, pushed to hosted). Q8 logged (forged lint_result via direct RPC; decide before launch). Plan 1A 8/14.
- 2026-10-06: Task 10 complete (capture grammar parser; brackets/quotes/commas, digit-leading NSE symbols like 5PAISA, money amounts like $5M excluded, linear URL trim). Plan 1A 9/14.
- 2026-10-06: Task 11 complete (catalog stubs via one ensureStub helper, race-tolerant; saveCapture verbatim-first and idempotent by clientId; submitCapture with fixed error codes; real-DB e2e on the local stack). Plan 1A 10/14.
- 2026-10-06: Task 11 complete (verbatim capture log, shared race-tolerant stub helper, idempotent save; review approved). Plan 1A 10/14.
- 2026-10-06: Task 12 implemented (capture screen: offline localStorage queue, single-flight flush + navigator.locks, rejected captures kept not dropped, storage-blocked notice, today by company, 30-day strip; title/reason limits now count UTF-16 units; listSince error mapped to fixed codes). Awaiting review. Plan 1A 11/14 pending review.
- 2026-10-06: Task 12 complete (offline-first capture box with per-note storage keys, single-flight cross-tab sync, nothing ever silently discarded; 626 unit, 31 e2e). Plan 1A 11/14.
- 2026-10-06: Task 14 complete (Plan 1A closed apart from the Task 2 deploy): Playwright projects setup/anon/desk-mobile/desk-desktop with shared admin storage state, guard.spec, CI e2e job on a local Supabase stack (CLI 2.102.0); the 375 px run found and fixed a desk layout that widened on long diff lines.
- 2026-10-07: Plan 1A Tasks 1, 3-14 complete and reviewed (e2e 64/64 x3 on the local stack, CI e2e job not yet run on GitHub). Plan 1B pre-flight found 22 conflicts with the real code; ruled and errata being written. Vercel CLI token invalid; deploy waits.
- 2026-10-07: Final-review fix wave (I1-I5 + slug): migration 0004 confines publish/unpublish/allowance writes to service_role with a verified actor (ADR-003), counts the lag in IST, freezes linked catalog text, caps slugs at 60; shared helpers in src/lib; token-hash magic-link template. Local only: 391 pgTAP, 701 unit, e2e 64/64 x2.
- 2026-10-07: Plan 1A final review closed (0 critical; 5 important fixed in one wave: gate confined to service_role (ADR-003), IST dates immune to client timezone, frozen public catalog text, shared helpers in src/lib, CLI 2.119.0 pinned). Migration 0004 pushed to hosted. Hosted email templates not editable on free tier (Q9).
- 2026-10-07 (end of session): handoff written in docs/progress.md (RESUME HERE). Admin user created on hosted (role admin, awaiting invite acceptance). Flake debugging agent running at handoff.
- 2026-10-07: Resumed in the session worktree (phase-1a moved there; main checkout detached). Offline-sync flake root-caused (online event joining a doomed in-flight run) and fixed with review; commit emails rewritten to the GitHub no-reply address; main + phase-1a pushed. Vercel project created: preview behind Vercel Authentication (first CLI deploy auto-promoted to production; Shlok chose to leave it); preview URL added to hosted Auth redirects. Errata amendment A1 (migration 0005 on the 0004 bodies; A1.7 Toast keeps role=status). Plan 1B Tasks 1-4 complete and reviewed (tokens/fonts/harness, motion/primitives, view contracts/chrome/compliance, reading blocks with rule-3 withheld fixes); Task 5 in fix round 1. Session ended at the usage limit.
- 2026-10-07 (later): Plan 1B Tasks 5-11 complete and reviewed (exhibits/ledger/history, home components and /dev/preview, casefile module with rule-9 and verbatim diff, migration 0005 pushed to hosted, showcase public view models, private desk shell with refile, capture sheet). Compliance hardening from reviews: withheld figures stripped from every view model and aria label, public test status hidden while withheld (Q10), new publish rule 3a (Figures to covers every figure). CI first run green on PR #1. Ingestion proposal for Phase 2 written; Groq's AUP rules out a second account's key. Docker socket crash fixed. Task 12 (item editor) in progress at session end (usage limit).
- 2026-10-07 (day 2): Plan 1B Tasks 12-15 complete (item editor, new names + local seed, public site + login note, B+ company file page). Controller now visually checks each page task (60-screenshot QA pass; fixes: meter label overlap, diff wrap, 'Figures to' label). Shlok chose to add Task 15b, a row-form facts editor, before Aksh's trial; Tasks 15-16 on opus. Incident: worktree HEAD had become detached so 17 commits were on no branch; fixed and push verification added. Session paused at the usage limit with Task 15b running.
- 2026-10-07 (day 2, end): Task 15b (row-form facts editor) complete after one fix round (ids never reused so body citations stay correct; keyboard focus on add/remove; a React 19 form reset that reverted dropdowns after a failed save was found and fixed). Only Task 16 remains in Plan 1B. Next session starts with Task 16 on opus.

## 2026-10-07 - Plan 1B complete (design system, public desk, private desk screens, seed)
- Built: Case files tokens and Plex subsets, Motion/NumberFlow/ViewTransition foundation, 60+ desk components, the
  register home, B+ file page, notes, process, about, 404, favicon and share cards, the trays desk with capture
  sheet, the editor with gate notes and checklist, the facts row form (Task 15b), New names, and a UI-driven seed of
  two fictional files (local stacks only).
- Data model: migration 20261007000005 (file numbers, figures-to rule, capture days, New names tables; the IST lag
  came with 20261007000004); ADR-002.
- Task 16: WCAG 2.2 AA axe scans of every public page (375/1280, light/dark) and the desk, keyboard-complete desk,
  LCP/CLS budget on throttled 4G, reduced-motion e2e project, local-only visual baselines of /dev/preview, and the
  3-day usage-trial checklist (docs/trials/2026-10-06-phase-1-usage-trial.md).
- Decisions D1-D32 are in the plan header; the ones Shlok should know: fictional seed must be unpublished before
  launch wherever it was seeded (D20); visual baselines are local-only (D29); the receipt wording for a thesis
  without a company (D32).
- Next: the 3-day usage trial, then the Phase 1 rubric review.

## 2026-10-07 - Plan 1B closed and preview deployed
- Task 16 built and reviewed (opus): WCAG AA scans, LCP/CLS budget (caught CLS 0.016 from NumberFlow's mask, fixed), reduced-motion e2e, local visual baselines (awaiting Shlok), trial checklist.
- Final whole-branch review (opus, Plan 1B scope ee90262..28e0550): 0 Critical; I1 desk showed Live while the 30-day lag hid the file; I2 a public file cannot take newer figures without going offline (desk note now, ADR later: Q11). One fix wave (6cc4e40..93db8fd): I1, I2 copy, publishRevision moved to a server-only module, desk error boundary, per-company register de-dup, chip padding, test hardening. Scoped re-review: all 13 addressed.
- Hosted Supabase dry run: up to date (0001-0005). Preview deployed from a git-archive of 93db8fd and aliased to aksh-research-desk-preview.vercel.app; CSS chunk 200 (Q6 does not reproduce).
- Rulings collected in docs/plans/2026-10-07-phase-1b-rulings.md. Next: Shlok's four decisions, then the 3-day usage trial.

## 2026-10-07 - Production live, backups on, Phase 2 approved
- PR #1 merged to main (1237d3c): aksh-research-desk.vercel.app now serves the real desk (was the smoke-test placeholder). Production env vars set; hosted Auth site_url and redirect allow list include the production domain. Daily cron verified (heartbeat:daily ok), which keeps the free Supabase project from pausing. Pump workflow disabled by Shlok until Phase 2 has jobs (needs a Vercel protection bypass then).
- Data safety: nightly encrypted backup (.github/workflows/backup.yml, 02:30 IST, gpg AES256, 90-day artifacts, repo is public so nothing plaintext); first run 37617095650 succeeded and was decrypted and listed locally; restore drill PASS on the local stack. Runbook docs/runbooks/backup-and-restore.md; passphrase in Shlok's password manager.
- Admin: hosted has one account, Aksh's, already admin; ADMIN_EMAIL set for Preview and Production.
- Incident: the controller printed the hosted DB password twice while validating SUPABASE_DB_URL (shell fallbacks echoed the value); Shlok reset it each time; checks now go through a script that prints booleans only. The current password was later pasted in chat; reset pending.
- Phase 2: Shlok accepted the five ingestion defaults and approved ADR-004; spec and plans 2a (16 tasks, slices A manual / B upload+PDF text / C Groq) and 2b (9 tasks) on branch phase-2a. Slice A waits for the trial before reaching Aksh.

## 2026-10-07 (late) - Plan 2a Tasks 1-11
- Pre-flight of Plan 2a (opus): 29 findings ruled R1-R29 (incl. the provenance policy that could never pass, e2e that could only run once, steps outliving the function).
- Built and reviewed: casefile topics + Notes (T1-2, topic layout A picked by Shlok), migration 0006 documents/jobs/bucket/machine boundary hardened in place (T3), signed upload (T4), job engine + queue health (T5), PDF text + page selector with hash/%PDF check (T6), Inbox with a POST pump route (T7), document pane (T8), Groq adapter (T9, live smoke 200), migration 0007 extraction/provenance/usage hardened in place (T10), budget governor (T11). 0006/0007 local only until phase-2a merges.
- Session ended with Task 12 mid-build; see the ledger's SESSION END line.
- 2026-10-08: Plan 2a Task 14 built (desk-backend): staged machine figures merge into the Facts form once, `recordFiledFacts` writes provenance after the revision (never a condition of the save), staged rows Aksh deletes return to review, Done with this document deletes the PDF and stops its job.

- 2026-10-08: Plan 2a final-review fix wave (desk-backend): one filing rule for review and editor, "All figures checked." card with its Review link, plain Try again / Skip copy, Drop these figures for closed documents, Change company, migration 0006 narrowed in place (service_role no longer updates documents.status or ticks as Aksh), provenance count check, full-loop e2e.

## 2026-10-08 - Plan 2a build complete (lean mode)
- Fresh controller session in worktree exciting-newton-1e57fd (a PreToolUse hook blocks writes to other worktrees; branch reset to phase-2a 6c73b1c, push HEAD:phase-2a).
- Built and reviewed: T13 review screen + File under (+ company chooser), T14 staged rows + provenance + Done (opus review, security stand-in for defenso), T15 degradation copy, meters, Needs-you cards, repeat-run e2e fixes (two real bugs: mobile grid overflow, seeded file lost from the recent list), T16 close-out docs (hosted push and first real report deferred to after the trial).
- Final whole-branch review (opus): 0 Critical; 3 Important (filed figures could vanish, Done unreachable after deciding all figures, false "upload again" copy) + 3 must-fix (stranded staged figures of closed documents, wrong company unfixable, machine could change documents.status). One fix wave (0e1d2b7), scoped re-review all addressed. Unit 2026, pgTAP 632, whole e2e suite green twice on one DB.
- Open for Shlok: Q13-Q15, Q19, Q20; merge and hosted push after Aksh's trial.

## 2026-10-08 (later) - Plan 2b Tasks 1-8, then paused
- Shlok accepted Q13-Q15, Q19, Q20 as built and treated Aksh's trial as ended; chose "build everything, then test" (2a + 2b in one merge).
- Local try-out: launcher against the local stack with a job pump; git-ignored .env.try.local holds Groq and OCR.space keys (never read by Claude).
- Plan 2b pre-flight (opus): 26 findings, 6 HIGH (no link fetch in job steps; pass column so re-runs are not silently deduped; separate reading_proposals; public line through a definer function; a routing path to OCR for scans). Vendor quotas rechecked: all match spec s9; Whisper free cap 25 MB, 10 s minimum billing.
- Built and reviewed: migration 0008, OCR.space scans, photos + qwen vision, voice notes (behind VOICE_NOTES, off until Aksh consents), links + paste with an SSRF-safe fetch (opus security review; one hidden-script leak found and fixed), page classifier, private digest, re-read + test readings. Every task had a review; fix rounds caught real bugs (duplicate readings, stuck photos, transcripts in the document pane, pipe characters breaking the case file, filing disagreeing with the review screen).
- Paused by Shlok for other work. Next: Task 9, final review, local real-key test, then merge and hosted push with approval. Q22 (erase discarded transcript text) open.
