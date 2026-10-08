# Progress ledger - Aksh Research Desk

**Read this first in every session.** It is the single source of truth for where the build stands. Tick items only after verification (tests green, deploy checked, or Shlok confirmed). One line per task; details live in the linked spec/ADR, not here.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done+verified · `[!]` blocked (say why) · `[-]` dropped (say why)

## Status snapshot
- **Phase:** 1 LIVE on production (https://aksh-research-desk.vercel.app, main 1237d3c; Aksh's 3-day trial running; he is the only account and the admin). Phase 2 (ingestion) in progress on branch `phase-2a`: Plan 2a Tasks 1-12 of 16 complete and reviewed (Slice A manual topics/Notes, Slice B upload + PDF reading + Inbox + document pane, Slice C Groq adapter, migration 0007, budget governor).
- **Last session:** 2026-10-07 - production went live (PR #1 merged); nightly encrypted DB backup + restore drill + runbook; daily keep-awake cron verified; Groq key and all env vars pushed to Vercel Preview + Production; ADR-004 accepted; Plan 2a pre-flight (29 rulings) and Tasks 1-11 built with per-task reviews. Shlok's standing rules: push every new env var to Vercel; sonnet by default, opus only for security tasks and final reviews.
- **Next highest-value task (RESUME HERE):**
  0. Work in `.claude/worktrees/eloquent-bohr-cc522d`, branch `phase-2a` (push `git push origin phase-2a`, verify with `git ls-remote`). Canonical SDD ledger: `.superpowers/sdd/2026-10-07-phase-2a-ingestion/progress.md` (git-ignored, on disk only); read its LAST line (SESSION END) for the exact next step.
  1. Plan 2a Tasks 1-12 complete and reviewed (HEAD 0ced6dd). Next: Task 13 (review screen), then 14-16, the final whole-branch review (opus), one fix wave. LEAN MODE (Shlok's weekly limit): follow the ledger's 2026-10-08 ruling — sonnet implementers, non-test review packages, T15+T16 together, one targeted opus final review.
  2. After Aksh's trial: merge phase-2a into main (production deploys), push migrations 0006-0007 to hosted (dry run first; then check the documents bucket and storage policies read-only). Slice A changes the Facts form, so it must not reach main before the trial ends.
  3. Pending Shlok: approve the 4 visual baselines (e2e/visual.spec.ts-snapshots, untracked); NumberFlow clip vs fade; Q10-Q12; how Aksh reaches production (it is behind Vercel protection: share link or turn protection off). The pump workflow is disabled until Phase 2 jobs ship (re-enable needs a Vercel protection bypass, ask Shlok). defenso guard_code is broken server-side (rejects GET); opus reviews stand in.
- **Blocked on:** nothing for Phase 2 build. Production changes need Shlok's go-ahead per merge.

## Phase 0 - Kickoff and planning
- [x] Brainstorm: goal, user, workflow, maintainer, budget (2026-10-04)
- [x] Tooling research verified against vendor docs → `docs/research/2026-10-04-tooling-landscape.md`
- [x] Folder structure, pitfalls, reference sites, tool inventory → `docs/research/`
- [x] Architecture options A/B/C → `docs/architecture/options/`
- [x] ADR-001 drafted → `docs/architecture/ADR-001-stack.md`
- [x] Red-team pass on ADR-001 → `docs/architecture/ADR-001-red-team.md`; 10 amendments folded into ADR-001 s8
- [x] Project OS scaffold (`CLAUDE.md`, `claude/`, `docs/project-memory/`)
- [x] Agents: `.claude/agents/desk-architect.md`, `desk-ui.md`, `desk-backend.md`
- [x] `.env.example` with phase labels
- [x] `docs/compliance/publishing-rules.md`, `docs/rubrics.md`
- [x] Phase 1 spec drafted → `docs/specs/2026-10-04-phase-1-core-design.md`
- [x] Shlok approves ADR-001 + Phase 1 spec (2026-10-04)
- [x] Plan 1A written (tasks 1.1-1.7, 1.10) → `docs/plans/2026-10-04-phase-1a-core.md` (executed 2026-10-06; Tasks 1, 3-14 complete and reviewed; Task 2 deploy pending)
- [x] Plan 1B (tasks 1.8, 1.9, 1.11) → `docs/plans/2026-10-06-phase-1b-ui.md` (Tasks 1-16 + 15b complete and reviewed 2026-10-07; final whole-branch review pending)
- [ ] Download official SEBI circular PDFs into `docs/compliance/`

## Phase 1 - Core: data model, capture, public desk
Goal: Aksh captures a thought in < 5 s; companies/theses/learnings exist; public site looks like a desk. Exit: deployed preview, Aksh has used it for 3 days.
- [x] 1.1a Scaffold Next.js 16.3.8 + pnpm + Tailwind v4 + shadcn + Vitest + Playwright + CI (Plan 1A Task 1, commits 55e4f08, 826c87a, branch phase-1a, reviewed)
- [ ] 1.1b Smoke deploy to Vercel (Plan 1A Task 2) — waits for Vercel credentials
- [x] 1.2a Migration 20261005000001_core.sql: tables, identity, append-only, RLS, grants; 98 pgTAP (Task 3, reviewed)
- [x] 1.2b Migration 20261005000002_publish.sql: invoker views, publish_revision gate, unpublish, heartbeat_ages, generated types, CI db job; 252 pgTAP (Task 4, dc8243d) - e2e verified on the local stack (Task 14, 2026-10-06); CI job not yet run
- [x] 1.3 `src/lib/env.ts` (zod), Supabase clients (server/browser/service/public), `proxy.ts` session refresh - e2e verified on the local stack (Task 14, 2026-10-06); CI job not yet run
- [x] 1.4 Admin auth (magic link, `ADMIN_EMAIL` gate), `/desk` shell - e2e verified on the local stack (Task 14, 2026-10-06); CI job not yet run
- [x] 1.5 `research` module: items + revisions service, TDD - implemented 2026-10-06 (115 unit tests, 10 e2e green on the local stack) - e2e verified on the local stack (Task 14, 2026-10-06); CI job not yet run
- [x] 1.6 `compliance` module: lint + `publish_item()` + `gate_decisions`, adversarial tests - e2e verified on the local stack (Task 14, 2026-10-06); CI job not yet run
- [x] 1.6b Final-review hardening, migration `20261007000004_hardening.sql` (LOCAL only, not yet pushed to hosted): gate functions service_role-only with a verified `p_actor` and pinned policy version (ADR-003), lint allowances written only through SQL, 30-day lag on the IST calendar, public catalog text frozen while linked, slugs capped at 60; shared error/redirect helpers moved to `src/lib`; magic-link email uses the token-hash `/auth/confirm` link. Verified 2026-10-07 on the local stack: 391 pgTAP, 701 unit, lint, typecheck, build, e2e 64/64 twice. Hosted push and hosted Magic Link template are the controller's.
- [~] 1.7 Quick capture (`t:` `l:` `$SYM` `#theme` grammar) + daily capture log — Plan 1A Tasks 10-11 done: parser, `saveCapture` (verbatim first, idempotent), catalog stubs, `submitCapture` action; capture screen and daily log are Plan 1B. Task 12 done 2026-10-06: `/desk` capture box (Enter saves, offline queue, single-flight flush with cross-tab lock, rejected captures kept until dismissed), today by company, 30-day strip; 609 unit + 30 e2e green on the local stack. - e2e verified on the local stack (Task 14, 2026-10-06); CI job not yet run. Unverified/open: the 30-day daily capture log is Plan 1B
- [x] 1.8 UI segments 1-6 decided with Shlok → `docs/design/decisions.md`. Segments 1 (B+ Labelled Blocks) and 2 (Register + What-changed + Read-first) DECIDED; ALL SIX SEGMENTS DECIDED 2026-10-05 (1 B+ Labelled Blocks; 2 Register+What-changed+Read-first; 3 Exhibits+Ledger+meters; 4 Trays+capture internals+gate notes; 5 Case files under Aksh's name; 6 Instrument+morph+draw-to-cap)
- [x] 1.9 Public pages: desk home, company page (thesis + revisions + sources), learning note, about/process, disclosures (Plan 1B Tasks 14-15)
- [~] 1.10 Three clocks: `/api/cron/daily` heartbeat, `/api/jobs/run` pump via `.github/workflows/pump.yml` (15 min), `/api/health` + external uptime monitor emailing Shlok + Aksh - e2e verified on the local stack (Task 14, 2026-10-06); CI job not yet run. Unverified/open: the external uptime monitor (needs the deploy, Task 2) and the GitHub pump workflow on the hosted app
- [~] 1.11 Seed: 2 fictional files through the UI (Plan 1B Task 13); 3-day trial checklist at docs/trials/2026-10-06-phase-1-usage-trial.md; trial pending. Visual baselines (4 PNGs, e2e/visual.spec.ts-snapshots/) generated but uncommitted until Shlok approves them
- [ ] Phase 1 review vs rubrics R1/R2/R3; timeline entry; ADR updates

## Phase 2 - Ingestion inbox
- [ ] 2.1 `documents` + `ingestion` migrations (documents, pages, extractions, jobs, job_steps, provider_usage)
- [ ] 2.2 Provider ports + fixture adapters: `LlmPort`, `OcrPort`, `TranscriberPort`
- [ ] 2.3 Groq adapter with strict JSON + budget governor (75% caps, defer-not-fail, retry-after)
- [ ] 2.4 Signed-URL upload → job creation → `after()` pump → admin inbox loop → cron sweep
- [ ] 2.5 Pipelines: PDF (unpdf → OCR.space fallback, tables via Groq vision → statement-page locator → extract), image (qwen vision), voice (Whisper), URL (oEmbed), text paste
- [ ] 2.6 Review screen (page text beside editable JSON; approve files under company/theme)
- [ ] 2.7 XLSX → SheetJS → HyperFormula → assumption confirmation → interactive valuation page (PRIVATE only; public gets a lagged static scenario table)
- [ ] 2.10 Page selector: statement/commentary pages only go to the LLM; page budget + ETA per document; `needs_attention` terminal state with "enter manually"
- [ ] 2.8 UI segment 4 (capture + review) decided and built
- [ ] 2.9 Owner alerting: paused/quota states, one email per incident

## Phase 3 - Two-tier track record
- [ ] 3.1 `ledger` migrations (ideas, idea_events append-only + hash chain, prices_daily, idea_scores)
- [ ] 3.2 `MarketDataPort`: NSE bhavcopy adapter + manual entry (Upstox dropped 2026-10-06, ADR-001 s9.2)
- [ ] 3.3 Cron: closes, scoring vs Nifty 50, hash anchor to public Gist
- [ ] 3.4 Private ledger UI (hit rate, excess return, holding period, mistakes journal)
- [ ] 3.5 Public case studies: 30-day release gate, snapshot charts, "what I expected / what happened / what I learned"
- [ ] 3.6 Resolve Q1 (client logins) with legal input

## Phase 4 - Learning graph
- [ ] 4.1 `knowledge` migrations (concepts, concept_links, concept_edges)
- [ ] 4.2 Concept pages linking to the analyses where applied; reading log
- [ ] 4.3 Backlinks UI; "what I learned this month" auto-list

## Phase 5 - Distribution
- [ ] 5.1 Newsletter: weekly draft from revision diffs; Resend Broadcasts; approve-to-send
- [ ] 5.2 Videos: YouTube listing, Whisper transcript, chapters; compliance lint on transcript
- [ ] 5.3 PDF export of a thesis (print stylesheet) for sharing
- [ ] 5.4 SEO/schema markup, OpenGraph, RSS (all gate-aware)

## Parking lot (not scheduled)
- pgvector + "ask my desk" · visual graph · LLM assumption mapping · OpenNext/Cloudflare move · SEBI RA policy version
