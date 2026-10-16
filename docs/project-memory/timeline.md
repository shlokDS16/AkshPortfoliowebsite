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

## 2026-10-13 - Plan 2b complete: Task 9, final review, fix wave
- Fresh controller session (the previous one had reached 499k tokens) in a new worktree, `.claude/worktrees/aksh-research-desk-2b-3fb39e`, fast-forwarded to phase-2a; the ledger moved with it. Budget mode LEAN. Docker Desktop was hung on stale socket files; fixed by setting two folders aside (now a memory note).
- Task 9: the public file shows, under a filed figure's quote, "Printed on p. N of <source name>; matched by the desk and accepted by the analyst." It reads through `public.public_fact_checks()` (migration 0009, SECURITY DEFINER, anon only, three columns), not a view: no anon grant touches `fact_provenance` or `proposals`.
- The Task 9 security review and the whole-branch final review ran in parallel on opus and agreed: no Critical; the line could overclaim (edited or flagged figures still read "matched by the desk") and a failed check read took every public page down. One fix wave closed both, plus prompt-fence stripping until stable and kind guards on page selection and extraction. Re-review clean.
- Evidence on a clean local database: pgTAP 784/784, unit 2954, e2e 231 passed / 9 skipped, lint and typecheck clean. Deferred to debt: OCR.space per-IP refusal wording, discarded transcript text (migration 0010 before voice notes go on), re-read near the 60-figure cap.
- Next: Shlok's local real-key test, then with his approval the hosted push of 0006-0009 (before the app deploy) and the merge to main. Q23 (line wording) open.

## 2026-10-13 (later) - Real-provider smoke run and its fixes
- While Shlok was in classes: an agent drove the local desk with the real Groq and OCR.space keys (19 and 3 calls, repo fixtures only, no voice). Text PDF, scanned PDF, photo, pasted text, an ordinary link, the digest and a re-read all work; strict JSON schemas are accepted by all three models; the private-address guard held.
- It found what the evening test would have hit first: the try-out launcher still ran the old Plan 2a worktree, and the sign-in email pointed at a dead port. Both fixed in the scratch launcher.
- One fix batch from the findings: bseindia.com pages now open (Node's strict parser rejects the site's headers; one lenient retry, that host only, in its own commit e1f5f8c so Shlok can drop it: Q24); OCR.space 400 is a permanent refusal and its message no longer blames the key; a classifier batch that gives up is shown and clears once the pages are chosen; re-read cap room; an end-to-end test for the public line. Opus review: APPROVE, the link guard is intact; three minors closed; re-review clean.
- Evidence at HEAD: pgTAP 784/784 on a clean database, unit 2988, e2e 235 passed / 9 skipped, lint and typecheck clean.
- Deferred with reasons: classifier prompt tuning (needs an evaluation set), migration 0010 for discarded transcripts (before voice notes go on), provenance filed against an already published revision (architect's ruling). Not started: XLSX valuation and Phase 3, which need a spec and Shlok's design choices.

## 2026-10-13 to 2026-10-14 - Phase 2 live; Phase 3a (private track record) built
- Go-live of Phase 2: Vercel env added, fresh backup, hosted migrations 0006-0009 pushed by Shlok (Claude Code's auto mode refuses production pushes and merges), CI fixed (an integration suite that crashed without a local stack; e2e pump tests that assumed one pump finishes a job), PR #2 merged by Shlok. The job pump was switched on (two repository secrets) and /api/health went green. Hosted storage checked: private bucket, owner-only policies, the four expected public functions.
- Phase 3 design: spec, ADR-005 (ledger integrity and price source) and Plan 3a, with 25 decisions made on Shlok's behalf.
- Plan 3a built one task at a time, each with an opus or sonnet review and fix rounds: sealed, hash-chained idea entries; daily official closes from NSE (hardened zip and CSV readers, a holiday rule that only marks a day shut when both files are missing and a later day is known open); scoring against the Nifty 50 with a restatement log and visible marks; a daily seal with a comparison that catches rewritten history; the publish gate's rule 4 and position check read from the sealed entries; the Ledger screens (ideas, entries, closes with an official-file upload and manual entry, corporate actions, the journal).
- Reviews caught real problems before release: a hand-typed close that could become permanent, scoring that read editable summary columns, a corporate-action factor that could inflate a return unflagged, an anchor port that could replace published history, an upload that reported "stored" when nothing was written, and wording that over-claimed what the integrity checks prove.
- Scope cut by Shlok on 2026-10-14: release = Phases 1, 2, 3a and a user guide; public case studies, the spreadsheet valuation page, alert emails, the learning graph, distribution, the public gist copy, voice notes and client logins deferred.
- Evidence at 0306abb: pgTAP 1752, unit 4114, build OK, e2e 290 passed / 9 skipped / 0 failed. PR #3 open. User guide written and published as a private page.
- Next: Shlok pushes migrations 0010-0014 and merges PR #3; then the first live run confirms NSE answers Vercel's servers.

## 2026-10-14 (later) - Phase 3a released; pump schedule fix; 2.9 alert email built
- Shlok pushed migrations 0010-0014; the hosted dry run says up to date (14 of 14). /api/health is green with six entries.
- The GitHub pump schedule (*/15) never fired in the 5 hours after it was enabled, while the daily backup schedule did. It moved to off-peak minutes 7, 22, 37, 52 (PR #4, with the quick guide and the resume note).
- The NSE-from-Vercel check (Q29) cannot run yet: the daily step only fetches companies with an open idea, and there are none. The first daily run after Aksh's first real idea is the check.
- 2.9 alert email built on request: one email when something goes red and one all-clear, held for 30 minutes, decided in the database under a lock, sent through Resend, and off until the key and the address are set. Aksh gets it only once a domain is verified (Q36).
- Next: Shlok merges PR #4, then pushes migration 0015 and merges the 2.9 PR, then sets the two Vercel env values; confirm a scheduled pump run within 2 hours of the PR #4 merge.

## 2026-10-15 - 2.7 valuation models built and reviewed (not yet released)
- Shlok asked for 2.7 by name; Q37 (b): no GPL, so the engine is IronCalc (Node 0.8.3 in the job, wasm 0.8.4 on the page) with SheetJS 0.20.3 from its CDN.
- Four tasks: a safe workbook reader and both engines; migration 0017, the `.xlsx` upload kind and the `xlsx_read` step; the private model page with the calculator in a Web Worker, the inbox card, the bundle check and the licence notices; a whole-branch opus review and one fix wave.
- Reviews caught: a zip bomb that SheetJS would have inflated (204 KB to 200 MB), a crafted workbook that could hang the job (the Node engine now runs in a child process killed at 60 s), Aksh's session able to write under `models/`, a calculator that kept using a disposed engine after a scenario save, sheet indices mapped from the stored order instead of the engine's, and a retry that failed at pass 9 with a generic error.
- Evidence at 802cf25: unit 4707, pgTAP 2020, typecheck, lint, build and the bundle check clean; e2e desk-models + desk-a11y 40 passed. defenso guard_code failed server-side on every try; opus reviews stood in.
- Next: open the PR (CI runs on pull requests only); Shlok pushes migration 0017 to hosted; the Vercel preview check (one fixture upload reaches Ready on Linux, steps in the final review); Shlok approves the new copy; merge.

## 2026-10-15 (evening) - Phase 3b public case studies built and reviewed (not yet released)
- Shlok delegated the day's decisions. Plan 3b written by desk-architect (6 tasks, D26-D44), rules addendum v1.1, built task by task by sonnet implementers, opus review of the migrations and one opus final review, one sonnet fix wave.
- Nothing becomes public at deploy: both owner switches are off; `/cases` is a 404 and the record section on `/process` stays hidden until one case study passes the gate.
- The final review caught a price or return written in his own words passing the gate on a ledger case (the 30-day price check never ran there); now refused by a rule-10 check with no allowance. Also: the forced "What would prove me wrong" heading dropped for ledger cases, a guard on the local aged fixture, a transitive import check for the public boundary, "Figures to" read-only on a ledger case.
- Evidence at 62743c7: unit 5014, pgTAP 2175, full e2e 300 passed plus the cases projects.
- Next: after PR #8, push 0018-0019 with the 3b merge; Shlok approves copy and decisions; switches stay off until he runs the runbook.

## 2026-10-15 (night) - Phase 4 learning graph built and reviewed (not yet released)
- Spec and plan by desk-architect (concepts are the existing themes, no new table; his links between concepts stay private; reading notes are a private item kind captured with `r:`; a private month page of his learnings). Seven tasks, sonnet implementers, opus on the migrations and one opus final review, one fix wave.
- Reviews caught: a private concept's name could reach the public through a change note; a deploy-state e2e that would skip instead of fail if something leaked; an unlocked read of linked themes in the gate; hashes from capture tags showing in public titles.
- Evidence at d334e9f: unit 5325, pgTAP 2284, full e2e 336 passed, 0 failed.
- Next: release after 2.7 and 3b, with the pre-push theme check.

## 2026-10-15 (late) - 2.7, 3b and Phase 4 released together
- Stacked PRs merged down (#10 into 3b, #9 into 2.7), Shlok pushed migrations 0017-0021 and merged #8 (d99daaa). Production: health green, `/cases` and `/concepts` 404 as designed, the engine wasm served. One check left for Aksh's sign-in: a spreadsheet upload on production reaching Ready for you.

## 2026-10-16 - Phase 5 planned; 5a print, search and feeds built and reviewed
- Phase 5 split into 5a (no migration, no outbound), 5b videos (reads YouTube only) and 5c letters (the only part that can send, only on Aksh's press).
- 5a: metadata, JSON-LD, share cards, sitemap, RSS, request-time robots, print layout with the full disclosure on every page. The review and its e2e caught a share card that stayed hidden for an hour after a republish, and index pages printing without the standard disclosure.
- Evidence at 03a038d: unit 5472, full e2e 419 passed, 0 failed.

## 2026-10-16 (afternoon) - Phase 5b videos built and reviewed (not yet released)
- Read-only YouTube adapter (videos stay off until the key is set), caption files from YouTube Studio, chapters, rule 12 lint over every spoken word, public video pages behind the gate. Privacy ruling: no request to Google or YouTube before the visitor presses Play.
- The review caught caption-parsing regexes that took minutes on a hostile 1 MB file, YouTube data that could outlive YouTube's 30-day storage limit, and e2e runs that reached i.ytimg.com; all fixed, and an e2e guard now fails any test that touches an outside host.
- A laptop restart cut Task 9 short; the work was recovered from a checkpoint commit and finished.
- Evidence at 769fb3a: unit 5911, pgTAP 2435, full e2e 463 passed, 0 failed.

## 2026-10-16 (evening) - 5c Task 11: letters adapter and no-send guards
- Resend letters transport (shared HTTP with the alert mailer), a guard that sends nothing without a live approval row read from SQL, a fixture, env names; nothing sent (report docs/plans/2026-10-16-phase-5c-T11-report.md).

## 2026-10-16 (evening) - Phase 5c letters built and reviewed (not yet released; nothing can send until a domain is verified)
- The only part that can email real people: every send needs Aksh's press and an approval row for exactly that send; the adapter refuses without a key, a verified domain and a non-test environment. Readers' addresses are kept behind four narrow database doors.
- The review caught a retry path that could email every reader twice; fixed. A test guard broke during the build and let a few unauthenticated GETs reach Resend and Google API hosts (nothing sent); the guard was rebuilt as a loopback allowlist.
- Sign-ups stay closed until Shlok chooses the grievance contact (Q41).
- Evidence at 93bee5c: unit 6458, pgTAP 2659, full e2e 529 passed, 0 failed.
