# Option C: Operational simplicity

Framing: fewest moving parts. One Next.js app, one Supabase project, one daily cron, no queue, no Edge Functions. (verify) marks facts not confirmed in `docs/research/2026-10-04-tooling-landscape.md`.

## 1. Problem

A private desk and public showcase on free tiers that each fail differently: Groq (8k TPM, 200k TPD), Azure DI (500 pages/month), Vercel Hobby (one cron a day, 1 h of logs) and Supabase (pauses after 7 idle days). Aksh will not read logs, so a silent failure stays broken.

## 2. Current state

Nothing is built and the tooling is researched. Background processing, alerting and compliance enforcement are still undecided.

## 3. Options considered

- **A. Browser-driven step loop (chosen):** Aksh's open tab drives the work. No extra services.
- **B. pg_cron + queue + Edge Functions:** adds a second deploy target and leaves jobs stuck where nobody sees them.
- **C. External worker (GitHub Actions, Inngest):** adds accounts and secrets that expire without anyone noticing.

A wins because no work runs while nobody is watching.

## 4. Recommendation

**Runtime.** Groq, Azure DI and Resend are called only from admin server routes, never on a public request path.

**Data model.** One `entries` table replaces five separate content tables.
```
companies(id, slug, name, nse_symbol, sector, visibility)
entries(id, kind[note|thesis|learning|case_study], title, body_md, company_id?, theme?,
        visibility[private|public], data_as_of, published_at, search tsvector)
documents(id, entry_id?, company_id?, storage_path, mime, pages_text jsonb, extracted jsonb)
inbox_items(id, source[file|voice|youtube], storage_path|url, status[queued|working|
        waiting_quota|needs_review|filed|failed], cursor jsonb, draft jsonb, error_plain)
ideas(id, company_id, opened_on, stance, entry_px, thesis_entry_id, closed_on, exit_px) -- private
prices(symbol, day, close)        -- tracked symbols + NIFTY 50 only
idea_scores                       -- VIEW: return vs Nifty since opened_on
concepts(id, name, body_md); links(from_type, from_id, to_type, to_id)
videos(id, youtube_id, title, transcript_md, visibility)
newsletter_issues(id, week, draft_md, status[draft|sent], sent_at)
usage(day, provider, units)       -- own quota ledger
events(at, source, level, message_plain, seen)   -- the only "log" Aksh sees
```
Search uses Postgres full-text. pgvector is left out of v1.

**Ingestion without a queue.**
1. The browser uploads to Storage with a signed URL, avoiding Vercel's body limit (verify: 4.5 MB), and inserts an `inbox_items` row.
2. The Inbox page loops on `POST /api/inbox/[id]/step`. Each call does one unit of work (target under 60 s, limit 300 s), saves `cursor` and `draft`, and returns `{progress, next|wait_sec|needs_review}`. Steps are idempotent per `(item, stage, page)`, so closing the tab only pauses the work.
3. Stages:
   - **classify:** first 2 pages, one gpt-oss-20b call.
   - **text:** `unpdf` per page. Pages with fewer than 50 characters go to Azure DI Layout.
   - **select:** keyword-match the financial statement pages, so a 300-page annual report costs about 12 Groq calls instead of 300.
   - **extract:** 1 to 2 pages per gpt-oss-120b call, with a strict `json_schema`.
   - Images go to qwen3.8-27b vision. Voice files up to 25 MB go to Whisper.
4. **needs_review:** the source page is shown beside the extracted JSON. Aksh edits, picks a company or theme, and clicks File.
5. Only one item is processed at a time, which keeps rate limiting trivial.

**Quotas.** Each call checks `usage` against budgets about 25% under vendor limits (Groq 150k tokens/day, Azure 400 pages/month). Over budget or on a 429, the item moves to `waiting_quota`: "Paused at page 8/12. AI allowance resets tomorrow 05:30 IST. Nothing is lost." The next Inbox visit resumes it. "Skip AI, enter manually" always works.

**Excel valuation.** Browser only. SheetJS (`cellFormula:true`) feeds HyperFormula. A cell whose value differs from Excel's cached value is flagged as unsupported. Aksh clicks cells to mark assumptions (no LLM). The workbook JSON and assumption map are saved to Storage.

**One daily cron (`/api/cron/daily`, service role).** Each task runs in its own try/catch and writes an `events` row:
1. Fetch closing prices for tracked symbols and the Nifty from the NSE bhavcopy and index files. These need no expiring token (verify the URLs). Backfill any missing days from the last 7.
2. Touch the database, which refreshes scores through the view and keeps Supabase from pausing.
3. Recompute which entries are eligible for the public site (the 30-day gate).
4. On Mondays, draft the newsletter from the week's changes and save it with `status=draft`. The newsletter is never sent automatically.
5. If any task failed, send Aksh one plain-English email through Resend, linking to the admin page.

**Telling the owner.** The admin home shows a "Things that need you" strip, computed at page load:
- the last cron run, in red if it is more than 36 h old. This catches a dead cron, which no email can.
- unseen `events`, stuck items and quota use
- a last export more than 30 days old

The strip and the failure email are the only alerting.

**Graceful degradation.** Public pages use ISR, so a paused Supabase still serves the last good render. A Groq, Azure or NSE failure only banners admin features. Stale scores show their date.

**Auth and RLS.**
- Login is by magic link, limited to one allowlisted admin email.
- `anon` can select only `visibility='public'` rows, through `public_*` views.
- `ideas`, `prices`, `usage`, `events` and `inbox_items` are admin-only.
- The service role key is used only in the cron route.

**Compliance gating, in Postgres rather than the UI.** `publish_entry(id)` is the only path to `visibility='public'`. It rejects an entry if:
- the body matches the banned-language regex (`buy|sell|target|accumulate|upside|multibagger|returns? of`)
- `data_as_of` is less than 30 days old
- the company has ledger activity in the last 30 days

`ideas` never gets a public route or anon policy. The public layout carries a disclaimer that cannot be removed: not SEBI-registered, education only, may hold positions, consult a registered adviser.

**Cut from v1:** client logins (these would also trigger SEBI research-analyst registration), pgvector, the graph visualisation (backlinks only), LLM labelling of Excel cells, YouTube audio download (Aksh uploads his own audio), automatic newsletter sending, Google Vision as a second OCR, batch uploads, and public performance numbers.

## 5. Tradeoffs

- Ingestion runs only while Aksh's tab is open, so a backlog means sitting with the Inbox.
- One item at a time is slow, but stays within 8k TPM.
- Full-text search misses synonyms.
- One `entries` table: weaker per-kind validation, but a quarter of the RLS policies.
- Marking assumptions by hand takes about 2 minutes per model.

## 6. Risks

- **NSE blocks Vercel IPs:** a red event, an admin "paste closes" form, and a 7-day backfill.
- **Free tiers change:** model IDs and budgets live in env vars.
- **No backups on Supabase Free:** an "Export everything" button, and the strip nags after 30 days.
- **SEBI rules:** the database gate, no public ledger, no client tier.
- **Hobby non-commercial clause:** no paid tier or sponsorship. Cloudflare Pages is the exit.
- **HyperFormula is GPLv3:** make the repo public, or keep valuation admin-only.
- **Cron stops silently:** the 36 h staleness check.

## 7. Future evolution

- Swappable driver: steps are idempotent HTTP calls, so a later scheduler can call the same `/step` with no rewrite.
- Past about 500 entries, add pgvector.
- After Aksh passes NISM XV and registers as a part-time RA, enable `visibility='client'` and client logins.
- Supabase Pro ($25/month) and the Groq paid tier remove pausing and the daily caps. Both are config changes, not redesigns.
