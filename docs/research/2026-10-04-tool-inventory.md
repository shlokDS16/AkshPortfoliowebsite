# Tool inventory matched to Aksh Research Desk (2026-10-04)

Project: Next.js 16 + Supabase + Groq free tier + Vercel Hobby. AI ingestion (PDF/Excel/video), public research site + private admin, Resend newsletter, Mobbin-inspired world-class UI.
Sources read live: installed_plugins.json, ~/.claude.json (server names only), ~/.claude/commands/sc, ~/.claude/skills, ~/.claude/.agents/skills, token-optimization-techniques/*.md, PATH checks. No secrets recorded.

Verdicts: **Must** = activate for this build; **Optional** = use when the specific need arises; **Skip** = irrelevant here.

## Skills (~/.claude/skills and plugin skills)

| Tool | Verdict | Reason |
|---|---|---|
| project-kickoff | Must | Required by global CLAUDE.md for any new project; scaffolds project OS and memory. |
| ui-design-master | Must | Design-DNA extraction from Mobbin refs, GSAP/motion, React/Next perf rules; core of the "world-class UI" requirement. |
| ui-ux-pro-max (skill + anthropic-skills copy) | Must | Palettes, font pairings, 99 UX guidelines, shadcn/Tailwind stack support for the public site and admin. |
| frontend-design (skill + plugin) | Must | Avoids generic AI look; distinctive production-grade components. |
| vercel:nextjs, vercel:next-cache-components, vercel:react-best-practices | Must | Next.js 16 App Router, cache components, perf for public research pages. |
| vercel:shadcn | Must | Component foundation for admin + public UI. |
| vercel:ai-sdk | Must | Structured extraction from PDF/Excel text via Groq provider; streaming in admin. |
| vercel:deployments-cicd, vercel:env-vars, vercel:vercel-functions, vercel:vercel-cli | Must | Hobby-tier limits (function duration, body size) shape the ingestion architecture; env management. |
| supabase:supabase, supabase:supabase-postgres-best-practices | Must | Schema, RLS for private admin, storage, FTS/pgvector design. |
| seo-playbook + searchfit-seo:* (schema-markup, technical-seo, on-page-seo, seo-audit) | Must | Public research site must rank; Article/ScholarlyArticle schema, sitemaps, OG. |
| security-master, security-review, defenso (skill) | Must | Admin auth, upload endpoints, RLS, newsletter endpoints are attack surface. |
| superpowers:brainstorming, writing-plans, executing-plans, test-driven-development, systematic-debugging, verification-before-completion | Must | Plan-then-build discipline for a multi-subsystem app; verify before claiming done. |
| superpowers:subagent-driven-development, dispatching-parallel-agents, parallel-tasks | Optional | Parallelise public site, admin, ingestion pipeline once a plan exists. |
| superpowers:using-git-worktrees, finishing-a-development-branch | Optional | Only if the folder becomes a git repo (currently not). |
| agent-browser (skill; also in .agents/skills) | Must | Screenshot/QA of the running UI at several viewports; Mobbin-parity visual checks. |
| code-quality, performance | Optional | Lint/typecheck setup and Core Web Vitals pass near the end. |
| webfetch-security | Optional | When fetching external research sources or Mobbin pages into context. |
| hidden-unicode | Optional | Audit admin-uploaded PDFs/text for invisible prompt injection before feeding the LLM. |
| humanizer (+ anthropic-skills copy) | Optional | Site copy, newsletter copy, about page. |
| neobrutalist-motion | Skip | Specific style that conflicts with a research-desk look unless the owner picks it. |
| github, github-actions | Optional | Only once a repo and CI exist. |
| enterprise-architecture, subagent-library, task-observer | Skip | Low value at this project size. |
| claude-mem | Optional | Cross-session memory if the build spans many sessions. |
| headroom | Optional | Context compression for large sessions; overlaps with rtk. |
| web-search, advanced-scraping | Optional | Competitor and reference research; scraping not needed for core product. |
| vercel:ai-gateway, vercel:vercel-storage, vercel:workflow, vercel:routing-middleware | Optional | Gateway only if leaving Groq direct; Blob/storage for uploads; Workflow for long video jobs beyond Hobby limits; middleware for admin gating. |
| vercel:chat-sdk, build-agents, eve, next-forge, microfrontends, flags-sdk, vercel-sandbox, vercel-services, vercel-firewall | Skip | Not needed at this scale (firewall optional later). |
| design:accessibility-review, design:design-critique, design:design-system, design:ux-copy | Optional | Accessibility and critique passes on the finished UI. |
| figma:* skills | Optional | Only if a Figma file is produced or supplied; Mobbin covers inspiration. |
| marketing:email-sequence, marketing:content-creation | Optional | Newsletter template and welcome sequence. |
| anthropic-skills:pdf, xlsx, markitdown-pdf, docx | Optional | Generating test fixtures and inspecting PDF/Excel ingest samples. |
| anthropic-skills:web-artifacts-builder, canvas-design, theme-factory | Skip | Artifact-oriented, not for a deployed Next.js app. |
| anthropic-skills:master-backend-builder | Optional | Backend pattern reference for the ingestion API. |
| ios-app-development, iosui, react-native-*, Andriod_*, upgrading-react-native, exam-textbook-builder | Skip | Mobile/exam domains. |
| twilio-developer-kit:* (incl. sendgrid) | Skip | Newsletter is Resend, not Twilio/SendGrid. |
| huggingface-skills:*, legal:*, finance:*, operations:*, product-management:*, slack-by-salesforce:*, patent skills, ultralearn | Skip | Unrelated domains. |

## Agents (Agent tool types)

| Agent | Verdict | Reason |
|---|---|---|
| frontend-architect | Must | UI architecture, accessibility, performance of the Next.js front end. |
| backend-architect | Must | Ingestion pipeline, data integrity, retry design under Hobby limits. |
| security-engineer | Must | Review auth, RLS, upload handling, newsletter consent/unsubscribe flow. |
| system-architect | Optional | Overall architecture at the start. |
| Plan, Explore | Optional | Planning and codebase search once code exists. |
| quality-engineer | Optional | Test strategy for the ingestion parsers. |
| performance-engineer, vercel:performance-optimizer | Optional | Pre-launch Core Web Vitals pass. |
| vercel:deployment-expert, vercel:ai-architect | Optional | Deployment debugging; AI SDK + Groq design. |
| feature-dev:code-architect / code-explorer / code-reviewer, self-review | Optional | Feature-by-feature build and review loop. |
| searchfit-seo:seo-auditor, content-strategist, competitor-analyzer | Optional | Post-launch SEO audit and content plan. |
| requirements-analyst, technical-writer | Optional | PRD refinement; README/admin docs. |
| deep-research(-agent) | Optional | Researching Groq free-tier limits and parser libraries. |
| python-expert, devops-architect, refactoring-expert, root-cause-analyst, learning-guide, socratic-mentor, business-panel-experts, pm-agent, repo-index, statusline-setup, claude-code-guide, hookify:conversation-analyzer | Skip | Stack is TypeScript/Next; not needed. |

## Plugins (installed_plugins.json, 18)

| Plugin (version) | Verdict | Reason |
|---|---|---|
| vercel 0.49.2 | Must | Deploy, env, Next.js and AI SDK guidance; Hobby deployment target. |
| supabase 0.1.15 | Must | Postgres/RLS best-practice skills for the data layer. |
| frontend-design | Must | Design quality guard. |
| superpowers 6.3.0 | Must | Planning, TDD, debugging, verification workflow. |
| context7 | Must | Current docs for Next 16, Supabase JS, Resend, Groq SDK, shadcn (training data may be stale). |
| security-guidance 2.0.8 | Must | Pattern warnings on Edit/Write plus LLM diff review each turn; fits auth/upload-heavy app. |
| code-review, feature-dev | Optional | Review and feature loops. |
| github | Optional | When repo and PRs exist. |
| figma 2.2.111 | Optional | If design handoff goes through Figma. |
| playground | Optional | Interactive HTML explorers for design tokens/layouts before committing to UI. |
| hookify | Optional | Encode project rules (e.g. block committing .env). |
| skill-creator, mcp-server-dev | Skip | Not building skills/MCP servers here. |
| telegram, firebase, huggingface-skills, microsoft-docs | Skip | Not in stack (telegram currently fails to connect). |

## MCPs

Configured in ~/.claude.json (global mcpServers, names only): notebooklm, canva, figma, n8n, supabase, defenso, task-master-ai. Additional connectors exposed this session: Mobbin, Vercel, context7, claude-in-chrome, Claude_Browser, Gamma, OpenArt, a media-generation server, scheduled-tasks, mcp-registry, terminal, others.

| MCP | Verdict | Reason |
|---|---|---|
| Mobbin (search_flows, search_screens, search_sections) | Must | Direct source of the Mobbin-inspired UI references: pull real flows/screens/sections for research listing, article page, admin upload, newsletter signup, then feed to ui-design-master design-DNA. Present this session as a connector (not in ~/.claude.json). |
| supabase | Must | Migrations, RLS advisors, type generation, edge functions, logs. Run get_advisors after every schema change. |
| defenso | Must | guard_code after auth/DB/env/request-body code; scan_repo before launch; check_headers on the Vercel URL. |
| context7 (plugin) | Must | Live library docs. |
| Vercel MCP (connector) | Must | Deployments, runtime logs, env. It needs OAuth authorisation this session (listed as requiring auth), so authorise via /mcp first. |
| claude-in-chrome / Claude_Browser | Must | Visual QA of the running site beside Mobbin references. |
| task-master-ai | Optional | Project exceeds 10 tasks (three ingestion formats, admin, site, newsletter); needs an LLM provider key (Groq could serve). |
| figma | Optional | Only if designs are made in Figma. |
| canva | Skip | Marketing-asset tool; optional for newsletter graphics only (also needs auth). |
| notebooklm | Optional | Source-grounded research on Groq limits or domain material. |
| n8n | Skip | Configured but failing (ENDPOINT_NOT_FOUND); newsletter is handled by Resend. |
| plugin:telegram | Skip | Connection closed. |
| Gamma, OpenArt, media-generation, Firebase, Twilio docs, Microsoft Learn, HF, Slack/Atlassian/etc. connectors | Skip | Unrelated. |
| markitdown MCP | Skip | Not available as an MCP (per CLAUDE.md); use the CLI instead. |

## SuperClaude (/sc:*)

30 command files plus README.md in ~/.claude/commands/sc (the skill docs say 31): agent, analyze, brainstorm, build, business-panel, cleanup, design, document, estimate, explain, git, help, implement, improve, index-repo, index, load, pm, recommend, reflect, research, save, sc, select-tool, spawn, spec-panel, task, test, troubleshoot, workflow.

| Command | Verdict | Reason |
|---|---|---|
| /sc:research | Must | Groq free-tier limits, Hobby limits, PDF/Excel parser options with web search. |
| /sc:design, /sc:workflow | Must | Architecture and phased plan for the ingestion pipeline and admin. |
| `--uc` flag | Must | About 40% fewer output tokens on any /sc: command. |
| /sc:implement | Optional | Overlaps superpowers; use for scoped features. |
| /sc:test, /sc:troubleshoot, /sc:analyze, /sc:improve, /sc:cleanup | Optional | Per-phase quality loops. |
| /sc:save, /sc:load, /sc:reflect | Optional | Session continuity. |
| /sc:index-repo, /sc:index | Optional | After the codebase exists. |
| /sc:estimate, /sc:spec-panel, /sc:brainstorm, /sc:task, /sc:pm | Optional | Scoping and spec review. |
| /sc:business-panel, agent, spawn, git, build, document, explain, recommend, select-tool, help, sc | Skip | Redundant with superpowers and plugins, or not needed. |

## Token optimizers (decision tree applied)

| Tool | Verdict | Reason |
|---|---|---|
| rtk 0.42.4 | Must | Project has npm/next build, tsc, git, test output; hook auto-rewrites. |
| CLAUDE.md rules | Must | Always on. |
| markitdown CLI | Must | Needed to inspect sample PDF/Excel inputs when designing ingestion: convert to disk, grep headings, read sections. The MCP variant is unavailable. |
| graphify (pip graphifyy 0.9.14) | Optional | Build once the codebase exceeds a few dozen files (`/graphify . --no-viz`); code extraction costs 0 tokens. No value before code exists. |
| claude-monitor, ccusage | Optional | Run when sessions get long. Groq free tier is the app runtime, not Claude spend. |
| headroom, claude-mem | Optional | See skills table. |

Decision-tree result: reading PDFs/Excel -> markitdown CLI; running npm/git/tsc -> rtk; codebase exploration after scaffold -> graphify; /sc: output -> --uc.

## CLIs on PATH (checked with Get-Command / where)

| CLI | On PATH | Version | Verdict | Note |
|---|---|---|---|---|
| rtk | yes (C:\Users\Shlok\tools\rtk.exe) | 0.42.4 | Must | |
| agent-browser | yes (npm global) | 0.32.1 | Must | Visual QA and screenshots. |
| vercel | yes (npm global) | 54.13.0 | Must | Deploy, env pull, logs. |
| supabase | yes (C:\Users\Shlok\.supabase\bin) | 2.102.0 | Must | Local stack, migrations, type generation. |
| task-master | yes (npm global) | 0.43.1 | Optional | See MCP row. |
| gh | yes | 2.101.0 | Optional | Once a repo exists. |
| node / npm | yes | not queried | Must | |
| graphify | NO | pip graphifyy 0.9.14; graphify.exe is in C:\Users\Shlok\AppData\Roaming\Python\Python314\Scripts | Optional | Add that folder to PATH or call by full path. |
| markitdown | NO | exe in same Scripts folder | Must | Call by full path (as CLAUDE.md says). |
| claude-monitor | NO | exe in same Scripts folder | Optional | Full path. |

## Gaps worth noting
- Vercel MCP and several plugin MCPs need OAuth via /mcp before use (not done by the agent).
- Project folder is not a git repo; worktree/finishing skills and gh need `git init` first.
- No dedicated Resend, Groq, or PDF-parsing skill/MCP installed; use context7 for Resend and Groq SDK docs.
- No video-transcription tool installed; markitdown audio/OCR does not work on Python 3.14. Plan video ingestion via a hosted transcription API (verify Groq limits via context7/web before committing).
