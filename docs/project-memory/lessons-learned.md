# Lessons Learned

Anything that would save a future engineer time. Append only.

Format: **[date]** - what happened, what it cost, what to do instead.

## 2026-10-04
- Project agents in `.claude/agents/` are registered only at session start. In the session that creates them, run them as `general-purpose` agents told to read and adopt the agent file first.
- Three architecture framings (speed / extensibility / simplicity) produced genuinely different designs; the red team then found 4 critical issues none of the three had. Keep the red-team step; it earned its cost (free-tier throughput and the single-cron failure mode).
- Free-tier facts changed twice in 2026 (Groq vision models, Supabase key names). Always re-verify `docs/research/2026-10-04-tooling-landscape.md` before relying on a limit.
- Git on this Windows machine emits CRLF warnings; `core.autocrlf false` is set in the repo config.
