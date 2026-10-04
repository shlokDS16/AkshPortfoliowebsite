# Folder structure: Aksh Research Desk (Next.js 16, 2026-10-04)

## Recommendation
Use `src/`, a single root layout, and keep `app/` thin. Next.js is explicitly unopinionated, so this is a judgement call. Domain logic lives in `src/modules/<domain>/`. Routes only compose modules. Next's data-security guide recommends a server-only Data Access Layer (DAL) for new projects, and says server actions should stay thin and delegate to it.

```
aksh-research-desk/
├─ AGENTS.md                     # map of this tree + rules for subagents (<100 lines)
├─ proxy.ts                      # (was middleware.ts) session refresh + optimistic /admin redirect only
├─ next.config.ts                # cacheComponents: true
├─ vercel.json                   # crons (1 daily dispatcher on Hobby)
├─ components.json               # shadcn: aliases -> @/components, @/lib/utils
├─ vitest.config.mts  playwright.config.ts
├─ docs/  research/  adr/  architecture.md  runbook.md
├─ scripts/                      # one-off TS: seed, backfill-embeddings, gen-types.sh
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/                # SOURCE OF TRUTH for schema, RLS, pgvector, storage buckets
│  ├─ seed.sql
│  └─ tests/                     # pgTAP / RLS checks
├─ e2e/                          # Playwright specs only
├─ public/
└─ src/
   ├─ app/
   │  ├─ layout.tsx              # single root: <html>, fonts, globals.css
   │  ├─ (public)/               # layout = site chrome; pages use "use cache" + cacheTag
   │  │  ├─ page.tsx  companies/[slug]/  notes/[slug]/  theses/[slug]/
   │  ├─ (admin)/admin/         # NOTE: real "admin" segment needed for /admin URL
   │  │  ├─ login/page.tsx
   │  │  └─ (console)/          # layout.tsx = auth guard (getClaims + role check)
   │  │     ├─ inbox/  review/  ledger/  companies/  theses/
   │  │     └─ _components/     # route-private UI
   │  ├─ api/
   │  │  ├─ cron/[job]/route.ts # thin: verify CRON_SECRET -> modules/*/jobs
   │  │  └─ ingest/route.ts     # inbound webhook / email-forward endpoint
   │  ├─ sitemap.ts  robots.ts  not-found.tsx
   ├─ modules/                   # domain code; one folder per bounded context
   │  ├─ companies/ notes/ theses/ ingestion/ ledger/
   │  │     schema.ts           # zod + domain types
   │  │     queries.ts          # import "server-only"; reads; authz; returns DTOs
   │  │     actions.ts          # "use server"; validate -> call service -> updateTag
   │  │     service.ts          # mutations / business rules
   │  │     jobs/               # cron/background handlers (ingestion, ledger)
   │  │     components/         # module-specific UI
   │  │     *.test.ts           # vitest, colocated
   ├─ components/
   │  ├─ ui/                     # shadcn primitives only (CLI-owned)
   │  └─ shared/                 # app-wide composites (Nav, DataTable)
   ├─ emails/                    # React Email templates (*.tsx)
   ├─ lib/
   │  ├─ supabase/
   │  │  ├─ server.ts           # cookie-bound, anon key (admin/RLS)
   │  │  ├─ browser.ts          # client components, publishable key
   │  │  ├─ public.ts           # cookie-less anon client for cached public reads
   │  │  ├─ service.ts          # import "server-only"; service-role; jobs only
   │  │  ├─ proxy.ts            # updateSession() helper called by root proxy.ts
   │  │  └─ database.types.ts   # generated
   │  ├─ groq.ts  env.ts  utils.ts
   └─ test/                      # setup files, factories
```

## Why
- **Routes:** `(public)` and `(admin)` groups, nested layouts under one root layout. Multiple root layouts also work, but each needs its own `<html>/<body>`; not needed here.
- **Schema:** `supabase/migrations` only. Generate types with the Supabase CLI. Sources say that for Supabase-first projects Drizzle is optional, and often used only as a query builder.
- **Supabase clients:** Supabase's docs suggest `lib/supabase/{client,server,proxy}.ts`; this tree adds `public.ts` and `service.ts`.
- **Tests:** unit tests colocated; E2E in `e2e/`.
- **Email:** React Email default dir is `./emails`; under `src/` pass its `--dir` option (verify exact flag).

## Next.js 16 specifics (verified against nextjs.org)
- `proxy.ts` replaces `middleware.ts`, exports `proxy`, runs on Node.js, lives at root or in `src/` beside `app/`. `middleware.ts` is deprecated. Codemod: `npx @next/codemod@canary middleware-to-proxy .`
- `cacheComponents: true` (replaces `experimental.ppr` and `dynamicIO`): everything is dynamic unless opted in with `"use cache"`, `cacheLife`, `cacheTag`. Requires Node runtime.
- `revalidateTag(tag, 'max')` needs a profile. New `updateTag()` (Server Actions only) gives read-your-writes for admin edits. `params`, `cookies()`, `headers()` are async-only.
- Turbopack default; `next lint` removed (use ESLint/Biome directly); Node 20.9+.

## Contradictions and gotchas
1. **Hobby cron = once per day, imprecise (up to +59 min).** A "background jobs" folder of many crons will fail deploy. Use one daily dispatcher that drains a `jobs` table; use another trigger (GitHub Actions cron, or Supabase pg_cron - not verified here) for anything faster.
2. **Proxy is not an auth boundary.** Server Functions are POSTs to the page route, so a matcher exclusion skips them. Re-check authz inside every action and DAL function. Scope the proxy matcher to `/admin` so public pages never touch auth cookies.
3. **`(admin)` group adds no URL segment.** Without a real `admin/` folder you get `/inbox` colliding with public routes.
4. **Vitest cannot render async Server Components** (Next docs). Test modules as pure functions; cover pages in Playwright.
5. **Supabase MCP `apply_migration` writes remote-only history.** Always commit a file in `supabase/migrations`, or run `supabase db pull` to avoid drift.
6. **Conventional wisdom says Drizzle for 2026 Next apps.** Here it creates a second schema source next to RLS/pgvector SQL. Skip it.
7. Use `getClaims()`, not `getSession()`, for server checks (Supabase docs).
8. Playwright: Next recommends testing against `build && start`, not dev.

## Sources
- https://nextjs.org/docs/app/getting-started/project-structure
- https://nextjs.org/blog/next-16
- https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents
- https://nextjs.org/docs/app/guides/data-security
- https://nextjs.org/docs/app/guides/testing/vitest
- https://nextjs.org/docs/app/guides/testing/playwright
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/local-development/overview
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/functions/configuring-functions/duration (Hobby max 300s)
- https://makerkit.dev/docs/next-supabase-turbo/recipes/drizzle-supabase
