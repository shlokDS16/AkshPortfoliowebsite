# Aksh Research Desk

Personal equity-research system for Aksh Agrawal (student investor, India) with a public showcase credible to AMC readers. Free tiers only: Next.js 16 on Vercel Hobby, Supabase free, Groq free, free OCR. Two-tier visibility: private ledger / public 30-day-lagged case studies (SEBI education carve-out).

## Start of every session (in this order)
1. `docs/progress.md` - where the build stands and the next task. Update it as you go.
2. `docs/project-memory/timeline.md` (last 3 entries) and `docs/project-memory/unanswered-questions.md`.
3. `docs/architecture/ADR-001-stack.md` - the decided shape. Do not relitigate without a new ADR.
4. The spec for the current task in `docs/specs/`.
5. Standards: `claude/engineering.md`, `claude/architecture.md`, `claude/documentation.md`, `claude/project-memory.md`, `claude/routines.md`.

## Hard rules
- Compliance is a domain rule: `docs/compliance/publishing-rules.md`. The only publish path is the DB `publish_revision()` function (runs on every revision of a public item). Never add a UI override.
- Quotas are facts, not guesses: `docs/research/2026-10-04-tooling-landscape.md` and `docs/research/2026-10-04-pitfalls.md`. Re-verify before changing a limit.
- The AI organises, Aksh thinks: machine-extracted facts and his words never share a field.
- Migrations in `supabase/migrations/` are the only schema source; commit the file even when applying via MCP.
- Secrets via `src/lib/env.ts` only. `.env.example` is the labelled template; `.env.local` is never committed.
- Quality bar: `docs/rubrics.md`. Nothing ships below 4 on an applicable row.

## Agents (`.claude/agents/`)
- `desk-architect` (opus): structure, ADRs, specs, design reviews.
- `desk-ui` (opus): segment-by-segment design with Mobbin + ui-ux-pro-max + ui-design-master; shows Shlok visual options before building.
- `desk-backend` (sonnet): schema, RLS, modules, jobs, adapters, tests; TDD; defenso guard_code on sensitive code.
Never run two implementers in parallel. Research and review parallelise; building does not.

## Commands
Prefix heavy CLI with `rtk` (`rtk pnpm test`, `rtk git diff`). Use `agent-browser read <url>` for docs. markitdown CLI full path: `C:\Users\Shlok\AppData\Roaming\Python\Python314\Scripts\markitdown.exe`.

## End of every session
Run the End-of-Session Routine in `claude/routines.md`: update `docs/progress.md`, append to the timeline, record decisions as ADRs, log debt and open questions, name the next task with a reason.

Never overwrite historical project knowledge. Append; do not replace.
