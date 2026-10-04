# ADR-001: Stack and system shape

Status: PROPOSED, red-team pass complete, awaiting Shlok's approval - 2026-10-04
Inputs: `docs/architecture/options/option-A-speed.md`, `option-B-extensibility.md`, `option-C-simplicity.md`; `docs/research/*.md`; `docs/compliance/publishing-rules.md`.

## 1. Problem
Build a personal equity-research desk for a non-technical student investor (Aksh) that he uses daily, that a few invited people can see, and whose public side reads as credible to an AMC head, all on free tiers (Vercel Hobby, Supabase free, Groq free, free OCR) and inside SEBI's investor-education carve-out.

## 2. Current state
Greenfield. Verified limits: one Vercel cron/day with no retry, 300 s functions, Groq 8k TPM / 200k TPD (~70-100 PDF pages/day), Azure DI 500 pages/month, Supabase 500 MB and pauses after 7 idle days, SEBI 30-day price lag for educational content.

## 3. Options considered
Three framings were produced independently (speed, extensibility, operational simplicity). Where they **agree** is the binding constraint; where they **diverge** is the decision.

**All three agree on:**
- One Next.js 16 app + Supabase; no extra vendors, no separate worker service. Postgres is the job store.
- Background work is pumped three ways: `after()` on upload, the open admin tab looping a "run next step" endpoint, and the single daily cron as a sweeper. Every step is resumable and < 250 s. Groq 429s **defer** work; nothing fails.
- Compliance is enforced in the database (publish function/trigger) plus a text lint plus RLS re-checking the 30-day lag. The private ledger has no public read path.
- Magic-link auth; service-role key only in job/cron code.
- HyperFormula (GPLv3) is acceptable because the repo stays open source and the site is non-commercial.
- Cut from v1: pgvector/embeddings, visual graph rendering, LLM-based Excel assumption mapping, newsletter auto-send, YouTube audio download, payments.

**Where they diverge, and the decision:**

| Decision | A (speed) | B (extensibility) | C (simplicity) | **Chosen** | Why |
|---|---|---|---|---|---|
| Repo shape | single app, `lib/` | pnpm workspace, 6 packages, eslint-boundaries | single app | **Single app, `src/modules/<domain>/`, provider interfaces in `src/lib/providers/`** | Workspace scaffolding is 25-35% overhead for one developer; module folders + a simple import-boundary lint rule give 80% of the seam value |
| Content storage | one `entries` table, edited in place | `items` + append-only `item_revisions` | `entries` | **`items` + `item_revisions` (append-only)** | Versioned, diffable theses are an allocator-credibility requirement (R1 row 2) and feed the newsletter "what changed" |
| Provider swapping | one `groq.ts` wrapper | ports + adapters + `model_routes` table | direct calls | **TypeScript interfaces (`LlmPort`, `OcrPort`, `TranscriberPort`, `MarketDataPort`, `MailerPort`) with one real adapter + one fixture adapter each; model choice from env, not a table** | Claude and Cloudflare moves are likely; a table-driven router is not needed for one user |
| Budget control | per-model daily token pools | `BudgetGovernor` + `provider_usage` table | `usage` table capped 25% under vendor limit | **`provider_usage` table, caps at 75% of vendor limits, defer-not-fail** | All three want it; C's safety margin is right |
| Ledger integrity | trigger blocks edits to key columns | append-only `idea_events` with hash chain + daily public anchor | ledger never public | **Append-only `idea_events`, hash chain, daily anchor to a public Gist (Phase 3)** | "Cannot be quietly edited" is the single strongest trust signal for an AMC; cost is one cron step |
| Client logins | educational-only client role | `memberships` roles | cut (SEBI trigger) | **Schema has `visibility ∈ {private, clients, public}` from day one; NO client accounts in v1** | Sharing with identified people may look like advice; decide after legal check (open question Q1) |
| Compliance audit | lint + trigger + RLS | versioned `PublicationPolicy` + `gate_decisions` table | `publish_entry()` SQL function | **`publish_item()` SQL function is the only publish path; writes `gate_decisions(policy_version, verdict, reasons)`; TS lint runs first for friendly errors** | Audit trail of every publish decision is cheap and shows process |
| Owner alerting | none specific | queue depth in UI | red strip if cron silent 36 h + one plain-English email per incident | **C's approach** | Non-technical owner will not read logs |
| Search | Postgres FTS | pgvector | FTS | **Postgres FTS in v1; `chunks` table designed so pgvector can be added without migration pain** | Free DB fills fast with vectors |

## 4. Recommendation (the shape)
- **Runtime:** Next.js 16.3 App Router (Turbopack, `cacheComponents` off initially), TypeScript strict, pnpm, Tailwind v4 + shadcn/ui, React Email, Zod (schemas double as Groq strict JSON schemas), Vitest + Playwright, GitHub Actions CI.
- **Data:** Supabase Postgres with SQL migrations as the only schema source; generated types; RLS everywhere; `security_invoker` views for public reads.
- **Modules:** `catalog` (companies, themes), `research` (items, revisions), `documents` (storage, pages, extractions), `ingestion` (jobs, steps, pipelines), `valuation` (models, HyperFormula), `ledger` (ideas, events, prices, scores), `compliance` (lint, policy, gate), `knowledge` (concepts, links), `distribution` (newsletter issues, videos), `identity` (admin check).
- **Jobs:** `jobs` + `job_steps` tables, lease (`locked_until`) + reaper, `FOR UPDATE SKIP LOCKED`, pumped by `after()`, admin inbox loop, daily cron.
- **Daily cron (`/api/cron/daily`):** heartbeat row, drain jobs ≤ 240 s, pull daily closes (Upstox → bhavcopy fallback), score ledger, anchor ledger hash, apply 30-day gate release, draft Monday newsletter (never sends).
- **Hosting:** Vercel Hobby. Portable to Cloudflare via OpenNext later; nothing Vercel-specific outside `app/api/cron` and `after()`.

## 5. Tradeoffs
- Background work is best-effort when the admin tab is closed; a big document may wait until the next cron. Accepted: the owner is told, and nothing is lost.
- Append-only revisions cost storage; Markdown text is tiny relative to 500 MB.
- Interfaces without a routing table mean a provider change is a code change, not a config change. Accepted for one developer.
- Regex lint has false positives. That is the safe direction; the review UI shows the exact sentence.

## 6. Risks
- Groq free-tier limits or models change (they did twice in 2026). Mitigation: `LlmPort` + fixture adapter; usage table; tests do not call Groq.
- Vercel Hobby non-commercial clause. Mitigation: no payments, no sponsors; OpenNext migration path documented.
- 1 GB storage ≈ 60-100 annual reports. Mitigation: keep `source_url`, allow deleting originals after approval, store page text not PDFs long-term.
- Upstox API terms/pricing unverified. Mitigation: bhavcopy adapter; manual close entry.
- Client sharing may trigger RA rules. Mitigation: Q1 in unanswered questions; no client accounts until answered.
- Next.js 16.3 Turbopack CSS 404 bug reported in 16.3.0. Mitigation: smoke-test preview deploy in Phase 1 task 1; `--webpack` fallback.

## 7. Future evolution
- Paid LLM: add `anthropic` adapter to `LlmPort`; native PDF input skips OCR step.
- Cloudflare: OpenNext + Workers cron + R2 `BlobPort`; Postgres stays.
- SEBI RA registration: new `policy_version` permitting recommendations with RA disclosures; `clients` visibility activated.
- Scale: pgvector on `chunks`; partition `prices_daily`; `pg_cron` + `pg_net` as a 10-minute pump if the free plan allows.

## 8. Red-team amendments (2026-10-04, from `ADR-001-red-team.md`)
Findings accepted and folded into the decision. Each amendment names the finding it answers.

1. **Throughput (critical: "ten annual reports never finish").** LLM calls are made only for *selected pages*: financial statements, notes to accounts and management commentary located by keyword (10-20 pages per annual report); every other page is text-extracted and indexed with no LLM call. Each document gets a page budget and a visible ETA in the inbox ("ready by Thu"). Job steps have `max_attempts` and a terminal `needs_attention` state with a one-click "enter manually / skip AI" path; nothing defers forever. An optional `ANTHROPIC_API_KEY` slot lets a paid key be used for bursts later without code change.
2. **Queue pump (critical/high: cron silence, admin-tab pump, one cron doing seven jobs).** A **GitHub Actions scheduled workflow** (free) calls `POST /api/jobs/run` every 15 minutes with `CRON_SECRET`, replacing the admin-tab loop as the primary pump. The Vercel daily cron becomes a backstop that runs independent, individually try/caught steps (heartbeat, prices, gate release, newsletter draft), each writing its own `heartbeats` row. A free external uptime monitor (e.g. cron-job.org or UptimeRobot) polls `GET /api/health`, which returns 500 when any heartbeat is stale, and emails both Shlok and Aksh. Three independent clocks; no single silent failure.
3. **Gate scope (critical: gate tied to the publish event; lint covers body only).** The gate runs on **every revision** of an item whose visibility is public, not only at first publish: for public items `current_revision_id` advances only through `publish_revision()`, which re-runs lint + policy and writes a `gate_decisions` row. Rule 4 (named-security recency) is evaluated per revision. Lint input is the full public surface: title, slug, `learning_objective`, body, `structured` (stringified), and metadata derived from them (OG title/description). Public items cannot carry file attachments in Phase 1; in Phase 2, any image or document shown publicly must have passed lint on its extracted text.
4. **Interactive valuation (critical: DCF output is a target price).** Interactive models are **private/clients-only** in v1. The public thesis page shows a static *scenario table* (reader-independent, lagged 30 days, labelled as scenario outputs, never "fair value" or "target") that itself passes the gate. Revisit when SEBI status changes.
5. **False positives (high: redeploy to fix a lint hit is the likeliest abandonment cause).** Two different things: a *rule override* remains impossible; a *sentence allowlist* is admin-editable in the review UI (`lint_allowances(item_id, sentence_hash, reason, created_at)`), recorded in the gate decision. Aksh can mark "why I avoid target prices" as educational usage without a developer.
6. **Bypasses (high).** `REVOKE EXECUTE` on all RPC functions from `anon`/`authenticated` except the intended ones; Supabase signups disabled (magic link works only for the pre-created admin user); `visibility` and `current_revision_id` guarded by triggers so direct table edits cannot publish; pgTAP tests assert all three.
7. **Client logins (high: ADR and publishing rules disagreed).** Aligned: **no client accounts in v1** anywhere. The `clients` visibility value exists in the schema only. `docs/compliance/publishing-rules.md` updated.
8. **Hash chain (high: proves nothing unless revealed).** Purpose clarified as *commit now, reveal later*: the daily anchor publishes only hashes. When a case study is published (>= 30 days later) it includes the original ledger event payload and its hash, so a reader can verify the commitment predates the outcome. Public pages never reveal unlagged events.
9. **Retraction (high: caches and social cards).** `unpublish_item()` sets visibility private, calls `updateTag`, and purges the Vercel cache for the path; OG images are generated on request with `max-age` 1 h. Third-party crawler caches are outside our control and are documented as such.
10. **Supabase pause (critical).** The GitHub Actions pump writes to the database every 15 minutes (a `heartbeats` row), which is a write, not a read ping, so the pause condition is never met even if the Vercel cron dies.

Residual risks accepted: GitHub scheduled workflows can be delayed under load and are disabled after 60 days of repo inactivity on public repos (the Vercel cron and the uptime monitor cover that gap); the regex lint remains blunt by design.
