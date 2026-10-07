# Progress ledger - Aksh Research Desk

**Read this first in every session.** It is the single source of truth for where the build stands. Tick items only after verification (tests green, deploy checked, or Shlok confirmed). One line per task; details live in the linked spec/ADR, not here.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done+verified · `[!]` blocked (say why) · `[-]` dropped (say why)

## Status snapshot
- **Phase:** 1 in progress. Plan 1A and Plan 1B COMPLETE (Tasks 1-16 + 15b, final whole-branch review on opus, one fix wave, scoped re-review all addressed; HEAD 93db8fd on phase-1a). Hosted Supabase at 0001-0005 (dry run 2026-10-07: up to date). Preview deployed 2026-10-07: https://aksh-research-desk-preview.vercel.app (deployment aksh-research-desk-7gxy9f9uf; behind Vercel Deployment Protection).
- **Last session:** 2026-10-07 - worktree moved to `.claude/worktrees/eloquent-bohr-cc522d` (branch claude/aksh-phase-1a-resume-8c3f7b = phase-1a; push HEAD:phase-1a); Task 16 (a11y/perf/reduced motion/visual baselines/trial checklist) built + reviewed; final review: 0 Critical, I1 (desk said Live during the 30-day lag) and I2 (public file cannot take newer figures, desk note now, ADR later: Q11) fixed with 11 minors; Q11-Q12 logged; every controller ruling collected in docs/plans/2026-10-07-phase-1b-rulings.md; preview deployed and verified (home 200, CSS chunk 200 so Q6 does not reproduce, /desk 307 to login, hosted auth allow list includes the preview domain).
- **Next highest-value task (RESUME HERE):**
  0. WORK IN `.claude/worktrees/eloquent-bohr-cc522d` (canonical SDD ledger: its `.superpowers/sdd/2026-10-06-phase-1b-ui/progress.md`; the copy in aksh-research-desk-resume-22d45c is frozen). Branch claude/aksh-phase-1a-resume-8c3f7b carries phase-1a's commits because phase-1a is checked out in the old worktree; push with `git push origin HEAD:phase-1a` and verify with `git ls-remote origin refs/heads/phase-1a`.
  1. Shlok decisions pending: (a) approve the 4 visual baselines (`e2e/visual.spec.ts-snapshots/`, untracked; commit after approval, D29); (b) NumberFlow mask 0px (counts clip instead of fade, fixes CLS 0.016) keep or revert; (c) how Aksh reaches the protected preview: Vercel share link vs turning preview protection off (project setting, ask first); (d) the 5 ingestion-proposal decisions; Q10-Q12.
  2. Run the 3-day usage trial (docs/trials/2026-10-06-phase-1-usage-trial.md): it is the Phase 1 exit criterion. Before day 1: Aksh's auth user exists in hosted Supabase (Dashboard, Add user) and he signs in on the preview in the same browser that requested the link (Q9).
  3. Health on preview reports both heartbeats null (Vercel crons run on production only; the GitHub pump targets production). Expected until a production deploy, which needs Shlok's approval.
  4. PR #1 https://github.com/shlokDS16/AkshPortfoliowebsite/pull/1: check CI after each push. Deferred minors for the trial/next phase are in the ledger (FINAL REVIEW triage) and docs/specs/technical-debt.md.
- **Blocked on (production only):** Shlok's approval for a production deploy; Q9 (custom SMTP needs a domain) for phone-proof login links.

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
