# Progress ledger - Aksh Research Desk

**Read this first in every session.** It is the single source of truth for where the build stands. Tick items only after verification (tests green, deploy checked, or Shlok confirmed). One line per task; details live in the linked spec/ADR, not here.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done+verified · `[!]` blocked (say why) · `[-]` dropped (say why)

## Status snapshot
- **Phase:** 0 complete (ADR-001 accepted, Phase 1 spec approved, Plan 1A written). Phase 1 not started.
- **Last session:** 2026-10-04 - kickoff, research, ADR-001 + red team, agents, env template, rubrics, Plan 1A (7,007 lines), UI segment 1 comparison
- **Next highest-value task:** Shlok confirms segment 3 (provisional) and picks the motion personality (segment 6) from `docs/design/comparisons/06-motion.html`; then design-dna tokens and Plan 1B. WHY: Plan 1B needs all three. In parallel: Task 0 prerequisites by hand, then `superpowers:subagent-driven-development` on Plan 1A from Task 1 (does not depend on UI choices).
- **Blocked on:** credentials in `.env.local` (REQUIRED-P1 in `.env.example`); Mobbin MCP needs a paid plan (Q7)

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
- [x] Plan 1A written (tasks 1.1-1.7, 1.10) → `docs/plans/2026-10-04-phase-1a-core.md` (not yet executed)
- [ ] Plan 1B (tasks 1.8, 1.9, 1.11) after UI segments 1-3 are chosen
- [ ] Download official SEBI circular PDFs into `docs/compliance/`

## Phase 1 - Core: data model, capture, public desk
Goal: Aksh captures a thought in < 5 s; companies/theses/learnings exist; public site looks like a desk. Exit: deployed preview, Aksh has used it for 3 days.
- [ ] 1.1 Scaffold Next.js 16 + pnpm + Tailwind v4 + shadcn + Vitest + Playwright; CI; smoke deploy to Vercel (Turbopack CSS check)
- [ ] 1.2 Supabase project, migrations 0001 (identity, catalog, research, compliance tables), RLS, generated types
- [ ] 1.3 `src/lib/env.ts` (zod), Supabase clients (server/browser/service/public), `proxy.ts` session refresh
- [ ] 1.4 Admin auth (magic link, `ADMIN_EMAIL` gate), `/desk` shell
- [ ] 1.5 `research` module: items + revisions service, TDD
- [ ] 1.6 `compliance` module: lint + `publish_item()` + `gate_decisions`, adversarial tests
- [ ] 1.7 Quick capture (`t:` `l:` `$SYM` `#theme` grammar) + daily capture log
- [~] 1.8 UI segments 1-3 decided with Shlok → `docs/design/decisions.md`. Segments 1 (B+ Labelled Blocks) and 2 (Register + What-changed + Read-first) DECIDED; segment 3 (Exhibits + Ledger table + meters) PROVISIONAL pending Shlok; segment 6 (motion) in progress
- [ ] 1.9 Public pages: desk home, company page (thesis + revisions + sources), learning note, about/process, disclosures
- [ ] 1.10 Three clocks: `/api/cron/daily` heartbeat, `/api/jobs/run` pump via `.github/workflows/pump.yml` (15 min), `/api/health` + external uptime monitor emailing Shlok + Aksh
- [ ] 1.11 Seed with 2 real companies from Aksh's notepad/Excel; 3-day usage trial; fix friction
- [ ] Phase 1 review vs rubrics R1/R2/R3; timeline entry; ADR updates

## Phase 2 - Ingestion inbox
- [ ] 2.1 `documents` + `ingestion` migrations (documents, pages, extractions, jobs, job_steps, provider_usage)
- [ ] 2.2 Provider ports + fixture adapters: `LlmPort`, `OcrPort`, `TranscriberPort`
- [ ] 2.3 Groq adapter with strict JSON + budget governor (75% caps, defer-not-fail, retry-after)
- [ ] 2.4 Signed-URL upload → job creation → `after()` pump → admin inbox loop → cron sweep
- [ ] 2.5 Pipelines: PDF (unpdf → Azure DI fallback → statement-page locator → extract), image (qwen vision), voice (Whisper), URL (oEmbed), text paste
- [ ] 2.6 Review screen (page text beside editable JSON; approve files under company/theme)
- [ ] 2.7 XLSX → SheetJS → HyperFormula → assumption confirmation → interactive valuation page (PRIVATE only; public gets a lagged static scenario table)
- [ ] 2.10 Page selector: statement/commentary pages only go to the LLM; page budget + ETA per document; `needs_attention` terminal state with "enter manually"
- [ ] 2.8 UI segment 4 (capture + review) decided and built
- [ ] 2.9 Owner alerting: paused/quota states, one email per incident

## Phase 3 - Two-tier track record
- [ ] 3.1 `ledger` migrations (ideas, idea_events append-only + hash chain, prices_daily, idea_scores)
- [ ] 3.2 `MarketDataPort`: Upstox adapter + NSE bhavcopy fallback + manual entry
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
