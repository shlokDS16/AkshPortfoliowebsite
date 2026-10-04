# Option A: Speed to first working version

Framing: one app, one database, no new vendors.

## 1. Problem
Aksh needs a private research desk (capture, ingestion, ledger) and a public showcase that stays inside SEBI's education carve-out. Everything must fit free tiers (one cron a day, 300 s functions, Groq at 8k TPM and 200k TPD, 1 GB storage). The real risks are never shipping, or accidentally publishing a recommendation.

## 2. Current state
Greenfield, with verified tooling notes only (docs/research/2026-10-04-tooling-landscape.md). One writer, a few hundred readers, about 2 to 5 documents a day.

## 3. Options considered
- **A1. Monolith + Postgres `jobs` table** (`after()` on upload, an admin-tab pump, a daily cron sweep). **Chosen:** one runtime, one deploy.
- A2. Supabase Edge Functions + pg_cron/pgmq: a second runtime and deploy pipeline.
- A3. Managed queue (Inngest, Trigger.dev, QStash): a new vendor with unverified free tiers.
- A4. A Python worker on Aksh's laptop: fails silently when the laptop sleeps.

## 4. Recommendation

**Stack:** Next.js 16 Server Actions, `supabase-js` with generated types, and Supabase CLI SQL migrations. No ORM or state library. UI is shadcn/ui. Zod schemas become JSON Schema for Groq strict mode.

### Data model
- `profiles(id=auth.users.id, role admin|client)`
- `companies(slug, name, nse_symbol, bse_code, sector, summary_md, visibility)`
- `themes(slug, name, description_md, visibility)`
- `entries(kind note|thesis|learning|case_study, title, slug, body_md, company_id?, theme_id?, idea_id?, visibility private|clients|public, status draft|published, published_at, data_as_of, compliance jsonb, search tsvector)`. One table means one editor, one policy and one search index.
- `documents(storage_path, source_url, mime, doc_type, company_id?, theme_id?, page_text jsonb, status, visibility default private)`
- `extractions(document_id, schema_name, payload jsonb, flags jsonb, review_status pending|approved|rejected)`
- `jobs(type, document_id?, status, cursor jsonb, attempts, run_after, locked_until, last_error)`
- `models(document_id, company_id, cells jsonb, assumptions jsonb, unsupported jsonb, visibility)`
- `ideas(company_id, symbol, direction long|avoid, opened_at, entry_price, rationale_md, closed_at?, exit_price?)`. A trigger blocks edits to `opened_at`, `entry_price` and `direction`.
- `prices(symbol, date, close)`
- view `idea_performance`: return against Nifty 50 since `opened_at`, computed rather than stored.
- `concepts(slug, name, explainer_md, visibility)` and `concept_links(concept_id, entry_id)` with real foreign keys.
- `videos(youtube_id, title, transcript_md, chapters jsonb, company_id?, visibility, compliance)`
- `newsletters(week_start, subject, body_md, status draft|approved|sent, resend_broadcast_id, compliance)`

Subscribers live only in a Resend Audience.

### Ingestion within Hobby limits
1. The browser uploads to Supabase Storage through a signed URL, which bypasses the Vercel body limit. A server action inserts `documents` and `jobs` rows, then calls `after(() => runJobs(240_000))`.
2. `runJobs` claims jobs with `FOR UPDATE SKIP LOCKED`, runs one step at a time, saves `cursor` after each step and stops before its time budget. If Groq returns 429, it sets `run_after` from the retry-after header and exits. There is no custom rate limiter.
3. While the inbox is open it polls every 10 s and POSTs `/api/jobs/run` if work is queued, so the admin tab acts as the worker. The daily cron sweeps whatever is left.
4. Pipelines by input type:
   - **PDF:** `unpdf` extracts text. Pages under 50 characters go to Azure DI. Only keyword-located statement pages (about 10 to 15) go to `gpt-oss-120b` strict JSON. All page text is kept for search.
   - **Image:** `qwen3.8-27b` vision.
   - **Voice:** Whisper, then a `gpt-oss-20b` summary.
   - **YouTube:** oEmbed metadata plus a transcript from Aksh's own audio or captions.
   - **XLSX:** SheetJS cells are loaded into HyperFormula and diffed against Excel's cached values to flag unsupported functions. A heuristic suggests assumption cells (hard-coded inputs with many dependents) and Aksh confirms them. The browser recalculates as sliders move.
5. Classification uses extension and MIME first, with `gpt-oss-20b` only when that is ambiguous. Each model has a separate daily token pool.
6. Every extraction lands as `pending`. Approving it on the review screen (editable JSON next to the page text) files it under a company or theme.

### Daily cron (`/api/cron/daily`)
- Upstox candles for ledger symbols and Nifty 50, with bhavcopy and manual entry as fallbacks.
- A 240 s job sweep.
- On Sundays, `gpt-oss-20b` drafts the newsletter from public items changed that week. The draft is never auto-sent.
- The daily run also keeps Supabase from pausing.

### Auth and RLS
- Magic-link login, with `is_admin()` and `is_client()` helpers.
- Anonymous visitors read only rows that are `public` and `published`. Clients can also read `clients` rows.
- `ideas`, `prices`, `jobs`, `extractions`, `documents` and `newsletters` are admin-only, so other roles have no policy and cannot read them.
- The service-role key is used only in the cron and job routes.

### Compliance gating (three layers)
1. **Lint** (`lib/compliance/lint.ts`): regex rules for buy, sell, accumulate, target, upside, stop loss, multibagger and "returned N%", plus ticker-and-direction phrasing. It runs before publishing entries, videos and newsletters. A failure blocks publishing, and v1 has no override.
2. **Database trigger:** a public entry requires `compliance.passed`. A case study also requires `data_as_of <= current_date - 30` and a linked idea opened at least 30 days earlier.
3. **RLS:** the anonymous policy repeats the 30-day rule. Case-study charts are frozen snapshots, and raw `prices` are never public.

The public layout always shows a disclaimer.

### Module boundaries
```
app/(public)/   companies, notes, case-studies, concepts, videos, newsletter
app/desk/       capture, inbox, review, ideas, models, newsletter (admin guard)
app/api/        cron/daily, jobs/run
lib/            db, jobs, ingest, market, compliance, newsletter
```
Imports flow one way, from `app` into `lib`. `lib/compliance` has no dependencies.

**Quick capture:** one box with no LLM. `t:` makes a thesis, `l:` a learning, `$SYM` links a company and `#theme` a theme. A URL becomes a job, a dropped file goes to the inbox, and anything else becomes a private draft note.

### Not built in v1
- pgvector (Postgres full-text search instead)
- a visual graph (backlinks instead)
- LLM assumption mapping
- YouTube audio download
- comments, realtime and multi-author editing
- payments
- a lint override
- "ask my desk" chat
- Upstox token automation

## 5. Tradeoffs
- **One runtime:** fastest to build, but background work is best-effort. A large document may wait until the next cron if the admin tab is closed.
- **Single `entries` table:** saves three CRUD stacks, but leaves nullable kind-specific columns.
- **Computed performance view:** always correct, but slower at scale (fine here).
- **HyperFormula is GPLv3:** the repo must stay open source.
- **Regex lint:** blunt, with false positives. That is the safe failure mode.

## 6. Risks
- **Hobby is non-commercial:** clients must never pay.
- **Client logins could resemble research-analyst activity:** clients get educational content only and never see the ledger.
- **1 GB holds about 60 to 100 annual reports:** delete originals after approval and keep `source_url`.
- **Upstox pricing and token expiry are unverified:** the fallbacks cover it.
- **A crash mid-step:** the `locked_until` lease plus `attempts` retry it safely.
- **Groq limits may change:** every LLM call sits behind `lib/ingest/groq.ts`.

## 7. Future evolution
1. A `pg_cron` + `pg_net` ping to `/api/jobs/run` every 10 minutes gives a real worker with no new vendor (verify the extensions on the free plan first).
2. Embed approved extractions into pgvector with gte-small.
3. A force-graph concept view.
4. LLM mapping to a canonical DCF schema.
5. If the project goes commercial: move to paid tiers and adopt A2 or A3. The `jobs` contract stays the same, so only the runner moves.
