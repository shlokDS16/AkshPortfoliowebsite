# Option B: Ports-and-adapters modular monolith (optimised for long-term extensibility)

## 1. Problem
The desk starts on free tiers but will predictably change its LLM (Groq to Claude), host (Vercel to Cloudflare) and regulatory regime (unregistered to SEBI RA). Each change must cost an adapter or a config row, not a rewrite, and the ledger and thesis history must stay trustworthy throughout.

## 2. Current State
No code yet. Binding limits (from `docs/research/2026-10-04-tooling-landscape.md`): one cron a day, 300 s functions, Groq 8k TPM / 200k TPD (about 70-100 pages a day), Azure DI 500 pages a month, Supabase pausing after a week idle, SEBI 30-day price lag.

## 3. Options Considered
| Option | Verdict |
|---|---|
| A. Thin Next.js calling Supabase/Groq directly | Fastest; vendor calls leak everywhere |
| **B. Modular monolith with ports and adapters, Postgres as system of record** | **Chosen** |
| C. Separate worker service plus microservices | Costs money and ops for one user |
| D. Everything in Supabase Edge Functions | Swaps Vercel lock-in for Supabase lock-in |

## 4. Recommendation
**Repo layout (pnpm workspace).** `packages/domain` is pure TypeScript: entities, Zod schemas and policies, with no imports from Next, Supabase or any vendor. `packages/ports` holds the interfaces. Each vendor gets its own `packages/adapters-*` package. `packages/jobs` holds pipelines as plain `(ctx) => Promise` functions. `apps/web` is the Next.js 16 UI plus thin entrypoints. `eslint-plugin-boundaries` keeps the domain import-free.

**Modules.** catalog (companies, themes), research (items and revisions), documents/ingestion, valuation, ledger, publishing/compliance, knowledge-graph, distribution (newsletter, video) and identity. No module writes another's tables; they talk through public module APIs or the `domain_events(id, type, aggregate_id, payload, occurred_at)` outbox.

**Provider ports, resolved by a registry from env vars plus the `model_routes` table.**
- `LlmPort.generate({task, schema: ZodType, messages, images?}) -> {data, usage, provider, model}`. Each Zod schema is converted once to JSON Schema and mapped to Groq `response_format` or Claude `output_config.format`. Each adapter declares capability flags (`vision`, `nativePdf`, `maxImages`, `strictJson`). A row `model_routes(task, provider, model, fallback, enabled)` picks the model per task (classify, extract_financials, label_assumptions, draft_newsletter).
- `TextExtractorPort` (unpdf), `OcrPort.extract(pageImage) -> blocks[] with confidence` (Azure DI, Google Vision overflow), `TranscriberPort` (Groq Whisper), `EmbedderPort` (gte-small; every vector row stores `embed_model` and `dim`).
- `MarketDataPort.dailyBars(symbols, from, to)`: Upstox, NSE bhavcopy backfill, test fixture. `MailerPort` (Resend). `BlobPort` (Supabase Storage, R2 later). `JobQueuePort` (Postgres today).
- A `BudgetGovernor` meters calls in `provider_usage(provider, day, tokens, pages, requests)` and defers work instead of failing. Shared contract tests run against every adapter.

**Data model (key columns).**
- `companies(id, slug, name, nse_symbol, bse_code, isin, sector)` and `themes`.
- `items(id, kind[note|thesis|learning|case_study|issue], company_id, theme_id, visibility[private|clients|public], current_revision_id)`.
- `item_revisions(id, item_id, rev_no, body_md, structured jsonb, schema_version, change_reason, created_at)` is append-only. Theses change only by new revisions; revision diffs feed the newsletter.
- `documents(id, sha256 unique, storage_key, mime, source_url, company_id, doc_type, period, status)`, `document_pages(document_id, page_no, text, char_count, ocr_provider, confidence)`, `chunks(id, source_type, source_id, text, embedding vector, embed_model)`.
- `extractions(id, document_id, schema_name, schema_version, payload, review_state, reviewed_at)`. Approval projects rows into `financial_facts(company_id, period, metric, value, unit, extraction_id)`.
- `valuation_models(id, company_id, document_id, cells jsonb, assumption_map jsonb, unsupported_fns text[])`. HyperFormula recomputes in the browser.
- Ledger: `ideas(id, company_id, opened_at, stance, horizon, thesis_revision_id, entry_close, bench_entry_close)`, `idea_events(id, idea_id, kind[open|note|close], at, payload, prev_hash, hash)`, `prices_daily(symbol, date, close, source)` and `idea_scores(idea_id, as_of, ret, bench_ret, excess)`.
- Knowledge graph: `concepts(id, slug, body)`, `concept_edges(src, dst, relation)` and `concept_links(concept_id, item_id, relation)`, queried with recursive CTEs.
- Distribution: `issues(id, week, revision_id, status, provider_msg_id)` and `videos(id, youtube_id, transcript_document_id, chapters jsonb)`.
- `audit_log(table, row_id, op, actor, at, before, after)` is filled by a generic trigger.

**Immutability.** `item_revisions`, `idea_events` and `audit_log` have UPDATE and DELETE revoked from every role, plus a `BEFORE UPDATE OR DELETE` trigger that raises an error. Each `idea_events.hash` is `sha256(prev_hash || canonical_json(row))`. The daily cron publishes the chain head to a public commit (git or a Gist), which gives external timestamp evidence.

**Ingestion job model.** `jobs(id, pipeline, pipeline_version, subject_id, state, attempts, next_run_at, locked_until, error)` and `job_steps(job_id, step, input_hash, output jsonb, provider, model, tokens, state)`. Workers claim jobs with `FOR UPDATE SKIP LOCKED`. A pipeline is a declared step list: `detect -> extract_text -> ocr_fallback(pages <50 chars) -> classify -> extract_structured(1-2 pages per call) -> embed -> await_review`.
- Each step is idempotent, keyed by `input_hash`, and capped at about 250 s. Swapping a provider or bumping a schema re-runs only the invalidated steps.
- Three things pump the queue: `after()` on upload, the one daily cron (drains for up to 280 s, then pulls market data, scores the ledger and keeps Supabase awake), and an admin "process now" loop in the browser.
- Voice notes and own-video audio go through `TranscriberPort`; YouTube links store oEmbed metadata.

**Compliance as a domain rule.** `PublicationPolicy` is a pure, versioned function (`policy_version = 'sebi-unreg-2026-07'`) that returns `{verdict, reasons[]}`. It requires `data_as_of <= now() - 30 days`, finds no buy/sell/target or performance-claim language (a lexicon, with an advisory LLM classifier on top), and requires the disclaimer block. Every publish writes `gate_decisions(id, revision_id, policy_version, verdict, reasons, decided_at)`.
- Layered enforcement: `publish` refuses without an approved gate decision; public RLS views re-check `data_as_of` in SQL so a UI bug cannot leak fresh prices; the ledger has no public path, and case studies are separate items with snapshotted, lagged data.

**Auth and RLS.** Supabase Auth with `memberships(user_id, role[admin|client])`, injected as a JWT claim by a custom access-token hook.
- anon: `public_*` views only. client: `visibility in (public, clients)`. admin: everything.
- Ledger, jobs and `provider_usage` are admin-only; the service role lives only in `packages/jobs`. Buckets: `raw` (private), `public-assets`. pgTAP tests RLS in CI.

## 5. Tradeoffs
- About 25-35% more scaffolding before the first visible feature: ports, a registry, contract tests and an outbox.
- A shared interface flattens provider strengths. For example, Claude's native PDF input bypasses OCR entirely. Capability flags let pipelines branch on this, at the cost of extra conditional paths.
- Postgres-as-queue and CTE graphs are slower than dedicated tools but keep one portable store. Append-only text revisions stay well under 500 MB for years.

## 6. Risks
- **Speculative abstraction:** every port ships with two adapters (real plus fixture) from day one.
- **Groq caps stall ingestion:** steps defer to the next day; the review UI shows queue depth.
- **Self-attested ledger:** the hash chain proves no edits only after external anchoring. Anchor daily.
- **Compliance false negatives:** human approval stays mandatory.
- **Licences and terms:** HyperFormula is GPLv3 and Vercel Hobby is non-commercial. Monetising triggers both a host move and a HyperFormula licence review.
- **Upstox fee unverified:** bhavcopy adapter is the fallback.

## 7. Future Evolution
- **Claude:** add `adapters-anthropic` and flip the `model_routes` rows. `nativePdf` lets extraction skip the `ocr_fallback` step, and old `job_steps` keep their provenance.
- **Cloudflare:** wire `packages/jobs` to a Workers scheduled handler and Queues (a new `JobQueuePort` adapter), `BlobPort` to R2, and keep Postgres via Hyperdrive. The UI moves with OpenNext. The domain is untouched.
- **SEBI RA registration:** ship a new policy version (`sebi-ra-<date>`) that permits recommendations with mandatory RA disclosures. Add a `recommendations` projection over the ledger and client entitlements on `memberships`. The existing append-only audit trail supports record-keeping duties.
- **10x content:** partition `chunks` and `prices_daily` by year; Apache AGE only if CTE latency hurts.
