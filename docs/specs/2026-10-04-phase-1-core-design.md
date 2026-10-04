# Phase 1 spec: Core - data model, capture, public desk

Status: DRAFT for Shlok's review - 2026-10-04. Depends on ADR-001. Exit criterion: deployed preview; Aksh has captured real notes for 3 consecutive days; rubric rows R1 1-3, R2 1-5, R3 1-7 score >= 4.

## 1. Purpose
Give Aksh a place faster than Notepad to record what he finds each day, make those findings accumulate into dated, versioned company theses and learning notes, and show the public a research desk (not a blog) that already obeys the compliance rules. Everything in later phases files *into* the objects defined here, so this phase must get the data model right.

## 2. Users and surfaces
- **Aksh (admin):** `/desk/*` behind magic-link login restricted to `ADMIN_EMAIL`. Mobile-first; he will capture from his phone.
- **Public reader:** `/` and public routes. No login. Sees only `visibility = public AND status = published` content that has passed the gate.
- **Shlok (developer):** local dev, Supabase dashboard, Vercel.
- No client accounts in Phase 1 (ADR-001, Q1).

## 3. Data model (migration `0001_core.sql`)
All tables have `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`. RLS enabled on every table; no table is readable by `anon` directly - public reads go through `security_invoker` views.

```
profiles           id (= auth.users.id), email, role text check (role in ('admin','client')) default 'client'
companies          slug unique, name, nse_symbol, bse_code, isin, sector, one_liner, visibility
themes             slug unique, name, description_md, visibility
items              kind text check in ('note','thesis','learning','case_study','process'),
                   slug unique nullable (set on first publish), title,
                   company_id fk null, theme_id fk null,
                   visibility text check in ('private','clients','public') default 'private',
                   status text check in ('draft','published','archived') default 'draft',
                   current_revision_id fk -> item_revisions, published_at, data_as_of date null,
                   learning_objective text null, holds_position text check in ('yes','no','not_disclosed') null,
                   search tsvector generated
item_revisions     item_id fk, rev_no int, body_md, structured jsonb default '{}', schema_version int default 1,
                   change_reason text, author text check in ('aksh','system') default 'aksh', created_at
                   -- append-only: UPDATE/DELETE revoked + BEFORE trigger raises
captures           raw_text, parsed jsonb, item_id fk null, company_id fk null, theme_id fk null,
                   source text check in ('web','mobile','api'), created_at
                   -- the daily capture log; never deleted (feeds R1 row 7 "daily-use evidence")
gate_decisions     item_id fk, revision_id fk, policy_version text, verdict text check in ('pass','fail'),
                   reasons jsonb, decided_at
heartbeats         job text, ran_at timestamptz, ok bool, detail text
```
Indexes: `items(company_id)`, `items(theme_id)`, `items(visibility, status, published_at desc)`, GIN on `items.search`, `item_revisions(item_id, rev_no desc)`, `captures(created_at desc)`.

**Public views (security_invoker = true):** `public_items` (joins current revision; `where visibility='public' and status='published' and (data_as_of is null or data_as_of <= current_date - 30)`), `public_companies`, `public_themes`. The 30-day rule is therefore enforced in SQL regardless of application code.

**Functions:**
- `is_admin()`: `exists (select 1 from profiles where id = auth.uid() and role = 'admin')`. Role is set by a trigger on `auth.users` insert comparing email to the `app.admin_email` setting; never from `user_metadata`.
- `publish_revision(item_id uuid, revision_id uuid, policy_version text, lint_result jsonb) returns gate_decisions`: SECURITY DEFINER, admin-only (`REVOKE EXECUTE` from anon/authenticated; checks `is_admin()` inside). Used for the first publish **and every later revision of a public item**. Re-checks in SQL: lint_result.passed is true; if kind = 'case_study' then data_as_of is not null and <= current_date - 30; learning_objective not null; holds_position not null when company_id not null. Writes `gate_decisions`; on pass sets `visibility='public', status='published', current_revision_id=revision_id, published_at=coalesce(published_at, now()), slug` if null. On fail raises with reasons. **This is the only code path that can set visibility to public or advance `current_revision_id` on a public item**: a trigger rejects direct updates to those columns unless a session GUC set only inside this function is present. New revisions on a public item are stored immediately (append-only) but stay invisible until gated.
- `unpublish_item(item_id uuid)`: admin-only; sets visibility private; the server action then calls `updateTag` and purges the path cache.
- `lint_allowances(item_id fk, sentence_hash text, reason text, created_at)`: admin-editable sentence allowlist (educational usage of a flagged phrase). The lint reports allowed sentences as `allowed_by` in the gate decision. There is no rule-level override.
- All RPC functions: `REVOKE EXECUTE ... FROM anon, authenticated` by default; grant only what the public views need (none in Phase 1). Supabase Auth signups disabled; the admin user is created once by Shlok.

**RLS summary:** admin: all on all tables. anon/authenticated non-admin: nothing directly; views only. `captures`, `gate_decisions`, `heartbeats`: admin only.

## 4. Modules (Phase 1 subset of ADR-001)
```
src/
  app/
    (public)/            layout (disclosure bar, nav), page (desk home), companies/[slug], notes/[slug],
                         learning/[slug], process, about
    desk/                layout (admin guard), page (capture + today), items/[id], companies, themes, settings
    api/cron/daily/      heartbeat + alert check (full job logic arrives in Phase 2/3)
    auth/callback/       magic-link exchange
  modules/
    identity/            isAdmin(), requireAdmin(), getClaims wrapper
    catalog/             companies + themes: schema.ts, queries.ts, actions.ts, service.ts, tests
    research/            items + revisions: createItem, addRevision, getItemWithHistory, diffRevisions
    capture/             parseCapture (grammar below), saveCapture -> item/revision
    compliance/          lint.ts (lexicon + rules), policy.ts (policy_version 'sebi-unreg-2026-07'), publish.ts (calls publish_item), tests with adversarial phrases
  lib/
    env.ts               zod-validated env
    supabase/            server.ts, browser.ts, service.ts (job-only), public.ts (cookie-less for cached reads)
    markdown/            render (remark/rehype, citations), sanitize
  components/
    ui/                  shadcn primitives
    desk/                domain components (ThesisBody, SourceFacts, RevisionTimeline, Disclosure, AsOfBadge)
  proxy.ts               Supabase session refresh only (not an auth boundary)
supabase/migrations/     0001_core.sql
emails/                  alert-cron-silent.tsx
e2e/                     playwright: capture flow, publish gate, public pages
```
Import rule (eslint): `modules/*` may import `lib/*` and sibling module public `index.ts` only; `app/*` imports modules; nothing imports `app/*`.

## 5. Quick capture (the daily entry point)
One textarea at `/desk`, autofocused, works offline-first (queued in localStorage, flushed when online). Submit with Enter (Shift+Enter for newline). Grammar, parsed client-side and re-parsed server-side:

| Token | Effect |
|---|---|
| `$RELIANCE` or `$reliance` | links to company by `nse_symbol` (creates a stub company if unknown, flagged for review) |
| `#capital-cycle` | links to theme (creates stub) |
| `t:` prefix | kind = thesis (new thesis if none for that company, else new revision on the existing one with `change_reason` = the text's first line) |
| `l:` prefix | kind = learning |
| `p:` prefix | kind = process |
| URL anywhere | stored on the capture; in Phase 2 becomes an ingestion job |
| nothing | kind = note, private draft |

Every capture is stored verbatim in `captures` before any parsing, so nothing is lost if parsing fails. The desk home shows "today" (captures grouped by company) and a 30-day capture streak strip.

## 6. Thesis page (public and private views)
Structure is fixed so every company reads the same way (R1 rows 1, 3):
1. Header: company, sector, one-liner, `AsOfBadge` (data as-of date), `holds_position`.
2. **Aksh's view** (current revision body, Markdown).
3. **What would prove me wrong** (required section in the body template; lint fails publish if missing).
4. **Source facts** (Phase 2 fills from extractions; Phase 1 renders a manual citations list from `structured.sources[]`).
5. **Revision history**: list of revisions with dates and `change_reason`; diff view between any two.
6. Linked learning notes (backlinks).
7. `Disclosure` block, rendered from data.
Private view adds: linked captures, drafts, and (Phase 3) ledger entries.

## 7. Public desk home
Not a blog index. Sections: "On the desk this week" (companies with new revisions, lagged), "Process" (pinned process items), "Learning" (latest learnings), "Mistakes" (empty-state copy until Phase 3), capture-streak indicator ("Aksh has logged research on 23 of the last 30 days" - counts only, no content). Disclosure bar persistent at the bottom on mobile, top on desktop.

## 8. Scheduled work and liveness (three independent clocks)
- `GET /api/cron/daily` (Vercel cron, `Authorization: Bearer CRON_SECRET`): runs independent try/caught steps; Phase 1 has one step, `heartbeat:daily`. Phases 2-3 add prices, gate release, newsletter draft, each writing its own `heartbeats` row.
- `POST /api/jobs/run` (same bearer): Phase 1 only writes `heartbeat:pump`; Phase 2 drains jobs for <= 240 s. Called every 15 minutes by `.github/workflows/pump.yml` (GitHub Actions schedule, secret stored as a repo secret). This write keeps the free Supabase project from pausing.
- `GET /api/health` (public, no secret): returns 200 with heartbeat ages, 500 if `heartbeat:pump` > 2 h or `heartbeat:daily` > 36 h. A free external monitor (cron-job.org or UptimeRobot) polls it every 15 min and emails Shlok + Aksh on failure. The admin home shows a red strip in the same conditions.
- Lint scope: title, slug, learning_objective, body, stringified `structured`, and OG title/description derived from them. Public items cannot carry attachments in Phase 1.

## 9. Error handling and degradation
- Capture: server failure -> stays in localStorage queue, UI shows "saved on this device, will sync"; never shows a blank form.
- Publish: gate failure returns `{rule, sentence}`; the editor highlights the sentence. No override.
- Supabase paused/unreachable: public pages served from ISR cache (revalidate 1 h; `updateTag` on publish); admin shows a plain-English banner.
- All server actions re-check `requireAdmin()`; proxy only refreshes sessions.

## 10. Testing
- Vitest: `capture/parseCapture` (grammar table), `compliance/lint` (adversarial list: "buy", "accumulate on dips", "TP 2,400", "returned 34%", "my calls", plus allowed phrases "why I avoid target prices", quoted source text), `research` revision/diff service, env validation.
- pgTAP or SQL tests via Supabase CLI: RLS (anon cannot read `items`; `public_items` hides data_as_of < 30 days), `publish_item` rejects direct visibility updates and underage case studies, revision immutability.
- Playwright: magic-link login (test inbox), capture -> item appears, publish happy path and blocked path, public company page renders disclosure and as-of badge at 375 px and 1280 px.
- CI (GitHub Actions): lint, typecheck, vitest, Playwright against a Supabase branch or local stack; Vercel preview per PR.

## 11. Out of scope for Phase 1
Ingestion of any file, LLM calls, ledger, prices, concepts graph, newsletter sending, videos, client accounts, pgvector, OpenGraph image generation.

## 12. Open items for Shlok
- Confirm the capture grammar tokens (`$`, `#`, `t:`, `l:`, `p:`).
- Confirm "no client accounts in Phase 1".
- UI segments 1-3 will be chosen with you via `desk-ui` before any public page is built.
