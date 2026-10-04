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
