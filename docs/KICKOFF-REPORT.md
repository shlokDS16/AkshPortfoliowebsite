# Kickoff Report: Aksh Research Desk (2026-10-04)

## What I understood
A personal equity-research system Aksh (student investor, India) uses daily, with a public side that an AMC head finds credible. He drops in whatever he already produces (notepad text, Excel models, screener screenshots, PDFs, voice notes, YouTube links); the system structures, files and versions it; he reviews and publishes within SEBI's education carve-out. Free tiers only.

## Research findings (see `docs/research/`)
- Groq free tier is the binding limit: 8k TPM / 200k TPD ≈ 70-100 PDF pages/day. Only statement and commentary pages go to the LLM; everything else is text-indexed without AI.
- Llama 4 vision is deprecated on Groq; use `qwen/qwen3.8-27b` for images, `gpt-oss-120b` for strict-JSON structuring, Whisper free for 8 h/day of audio.
- SEBI: 30-day price-lag rule for educational content effective 1 Jul 2026; no buy/sell/target language; no performance claims. A public live track record is the riskiest feature; it becomes private ledger + lagged public case studies.
- Vercel Hobby: one cron/day, no retry, non-commercial. A GitHub Actions schedule (free) is the job pump; an external uptime monitor is the third clock.
- screener.in scraping is forbidden; it stays a reading source. Prices via Upstox (unverified free) with NSE bhavcopy fallback.
- Contradicts conventional "portfolio site" wisdom: bare PDFs (Nomad letters) outrank polished sites; publishing mistakes raises credibility; a verifiable record beats social proof.

## Stack (ADR-001)
Next.js 16.3 App Router (Turbopack), TypeScript, pnpm, Tailwind v4 + shadcn/ui, Zod, React Email; Supabase Postgres (SQL migrations, RLS, security_invoker views, append-only revisions, hash-chained ledger); Postgres `jobs` table pumped by GitHub Actions + Vercel cron; provider interfaces with Groq / Azure DI / Upstox / Resend adapters and fixture adapters; Vitest + Playwright + pgTAP; GitHub Actions CI; Vercel Hobby. Framing that won: A's runtime, B's data integrity, C's owner-visible failure UX.

## Active tool stack (see `docs/research/2026-10-04-tool-inventory.md`)
Must: project-kickoff, superpowers (brainstorming, writing-plans, subagent-driven-development, TDD, verification), ui-ux-pro-max, ui-design-master, frontend-design, vercel:* (nextjs, vercel-functions, env-vars, deployments-cicd, shadcn), supabase:* skills + Supabase MCP, master-backend-builder, security-review + defenso guard_code, Mobbin MCP, agent-browser, context7, rtk, markitdown CLI (full path).
Optional: task-master (if tasks exceed ~40), seo-playbook/searchfit (Phase 5), Figma MCP (if Shlok wants editable mockups), graphify (once the codebase is large).
Skip: Twilio, HuggingFace, Firebase, Canva/Gamma, n8n (unreachable), Vercel Queues/Workflows (beta; Postgres jobs suffice).

## Token strategy
`rtk` for pnpm/git/test output; `agent-browser read` for docs; markitdown CLI for Aksh's sample PDFs/Excel (convert once, grep headings); subagents for research/review with write-to-file output contracts; implementers one at a time with spec paths, never pasted context; `docs/progress.md` as the ledger so no task is re-dispatched after compaction.

## Execution strategy
- `desk-architect` (opus): specs, ADRs, reviews. `desk-ui` (opus): segment-by-segment design with visual choices from Shlok. `desk-backend` (sonnet): modules, TDD. Task reviewer (sonnet) after each task; final branch reviewer (opus) per phase.
- Parallel: research, UI exploration, reviews. Sequential: all implementation.

## First 3 actions
1. Shlok approves ADR-001 (incl. s8 amendments) and the Phase 1 spec; answers the four decision points in the kickoff message.
2. `superpowers:writing-plans` → `docs/plans/phase-1.md`; create Supabase project + Vercel project; fill `.env.local` REQUIRED-P1 keys.
3. `desk-ui` runs UI segment 1 (reading experience) with Mobbin research and shows Shlok three directions, while `desk-backend` executes plan tasks 1.1-1.6.

## Watch out for
- Ingestion throughput expectations: set ETA per document in the UI from day one.
- Any wording that reads as a recommendation; the gate is server-side and per revision for this reason.
- Next.js 16.3 Turbopack CSS 404 on Vercel reported for 16.3.0; smoke-test preview in task 1.1.
- Vercel Hobby non-commercial clause; HyperFormula GPLv3 (repo stays open source).
- Client logins (Q1) and Upstox terms (Q2) unresolved; both have fallbacks.
