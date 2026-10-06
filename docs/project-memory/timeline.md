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
