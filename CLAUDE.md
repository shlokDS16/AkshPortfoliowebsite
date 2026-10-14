# Aksh Research Desk

Personal equity-research system for Aksh Agrawal (student investor, India) with a public showcase credible to AMC readers. Free tiers only: Next.js 16 on Vercel Hobby, Supabase free, Groq free, free OCR. Two-tier visibility: private ledger / public 30-day-lagged case studies (SEBI education carve-out).

## Start of every session (in this order)
Subagents given a task brief skip this routine: the brief is the requirements. Open a file below only when the brief points to it.
0. `graph-memory brief` (module map, last session, next step; about 700 tokens). Look code up with `graph-memory where|module|impact` before grep; do not explore the codebase.
1. `docs/progress.md` - the status snapshot and RESUME block only (the first 16 lines). Update it as you go.
2. Only when the task needs them: `docs/project-memory/timeline.md` (last 3 entries), `docs/project-memory/unanswered-questions.md`, `docs/architecture/ADR-001-stack.md` (the decided shape; do not relitigate without a new ADR), the spec section for the current task in `docs/specs/`, and the standards in `claude/` (`engineering.md`, `architecture.md`, `documentation.md`, `project-memory.md`, `routines.md`).

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
Prefix heavy CLI with `rtk` (`rtk pnpm test`, `rtk git diff`). Supabase CLI: always the project's pinned devDependency (`pnpm supabase ...`, 2.119.0), never a global binary; regenerate types with `pnpm db:types`. Use `agent-browser read <url>` for docs. markitdown CLI full path: `C:\Users\Shlok\AppData\Roaming\Python\Python314\Scripts\markitdown.exe`.

## End of every session
Run `graph-memory sync --note "<what changed>" --next "<exact next step>"` (refreshes the code graph and writes the session note to the Obsidian vault), then the End-of-Session Routine in `claude/routines.md`: update `docs/progress.md`, append to the timeline, record decisions as ADRs, log debt and open questions, name the next task with a reason.

Never overwrite historical project knowledge. Append; do not replace.
