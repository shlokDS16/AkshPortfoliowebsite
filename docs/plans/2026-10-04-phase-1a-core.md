# Phase 1A Core (private desk, schema, gate, capture, clocks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the private half of Aksh Research Desk Phase 1: a deployed Next.js 16.3 app on Vercel with the Supabase schema (RLS, append-only revisions, the `publish_revision()` gate), admin magic-link login, the `research`, `compliance` and `capture` modules behind a plain `/desk`, and three independent liveness clocks.

**Architecture:** One Next.js App Router app. Domain code lives in `src/modules/<name>/` behind an `index.ts` (plus `actions.ts` for server actions and `client.ts` for browser-safe code); `src/app/` only composes modules. Postgres is the authority: RLS on every table, `security_invoker` public views, an append-only `item_revisions` table and a SECURITY DEFINER `publish_revision()` that is the only way anything becomes public. Business logic is tested with Vitest against in-memory repository fakes, SQL guarantees with pgTAP, and flows with Playwright against a local Supabase stack in CI.

**Tech Stack:** Next.js 16.3 (App Router, Turbopack), React 19, TypeScript strict, pnpm, Tailwind v4, shadcn/ui, Zod 4, `@supabase/ssr` (>= 0.10) + `@supabase/supabase-js`, Supabase CLI (local stack, migrations, pgTAP), Vitest, Playwright, GitHub Actions, Vercel Hobby.

**Spec:** `docs/specs/2026-10-04-phase-1-core-design.md` (APPROVED 2026-10-04). Read with `docs/architecture/ADR-001-stack.md` (section 8 amendments), `docs/compliance/publishing-rules.md`, `docs/research/2026-10-04-folder-structure.md` and `docs/research/2026-10-04-pitfalls.md`.

**Scope:** `docs/progress.md` tasks 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.10. Out of scope (Plan 1B): 1.8 UI segments, 1.9 public pages, 1.11 seeding and the usage trial. `/desk` screens here use plain shadcn components and make no design decisions.

## Global Constraints

Every task implicitly includes these. Quoted text is verbatim from the spec, ADR-001, the pitfalls note or CLAUDE.md.

- Runtime: "Next.js 16.3 App Router (Turbopack, `cacheComponents` off initially), TypeScript strict, pnpm, Tailwind v4 + shadcn/ui, React Email, Zod (schemas double as Groq strict JSON schemas), Vitest + Playwright, GitHub Actions CI" (ADR-001 s4). React Email is not used in 1A.
- No webpack config in `next.config.ts`: "`next build` fails if any webpack config exists, even plugin-injected; escape hatch `--webpack`" (pitfalls s5). `--webpack` is allowed only as the Task 2 build-flag fallback.
- Node >= 20.9 (pitfalls s5). CI uses Node 22.
- Supabase keys: "use sb_publishable/sb_secret (secret key independently rotatable, blocked in browsers)" (pitfalls s2). Env names: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) and `SUPABASE_SECRET_KEY` (`sb_secret_...`).
- "Supabase Postgres with SQL migrations as the only schema source; generated types; RLS everywhere; `security_invoker` views for public reads" (ADR-001 s4). "Migrations in `supabase/migrations/` are the only schema source; commit the file even when applying via MCP" (CLAUDE.md).
- "Secrets via `src/lib/env.ts` only" (CLAUDE.md). No file under `src/` other than `src/lib/env.ts` reads `process.env`. The e2e harness imports `parseServerEnv` from `src/lib/env.ts`; config files may read `process.env.CI`.
- Files stay under 300 lines (desk-architect rules). Split before crossing. Exempt: generated `src/lib/supabase/database.types.ts`, and `supabase/migrations/0001_core.sql`, which spec s3 names as one migration (it is organised in numbered sections instead).
- "Magic-link auth; service-role key only in job/cron code" (ADR-001 s3). `src/lib/supabase/service.ts` may be imported only from `src/modules/ops/**` (ESLint-enforced, Task 1).
- "All RPC functions: `REVOKE EXECUTE ... FROM anon, authenticated` by default; grant only what the public views need (none in Phase 1). Supabase Auth signups disabled; the admin user is created once by Shlok" (spec s3). Decision D2 records the one deliberate grant.
- `item_revisions` is "append-only: UPDATE/DELETE revoked + BEFORE trigger raises" (spec s3).
- `publish_revision()` "is the only code path that can set visibility to public or advance `current_revision_id` on a public item" (spec s3). "Never add a UI override" (CLAUDE.md). "There is no rule-level override" (spec s3).
- "`proxy.ts` Supabase session refresh only (not an auth boundary)"; "All server actions re-check `requireAdmin()`; proxy only refreshes sessions" (spec s4, s9).
- Server auth checks use `getClaims()`, never `getSession()` (pitfalls s2).
- Policy version: `'sebi-unreg-2026-07'` (spec s4).
- "Default for every new object is `private`" (publishing-rules).
- Import rule: "`modules/*` may import `lib/*` and sibling module public `index.ts` only; `app/*` imports modules; nothing imports `app/*`" (spec s4). This plan also allows `@/modules/<name>/actions` (server actions) and `@/modules/<name>/client` (browser-safe code), because a client component cannot import an `index.ts` that re-exports server-only code.
- Every commit message ends with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Prefix heavy CLI with `rtk` when it is installed (`rtk pnpm test`); commands below are written without it.

## Resolved spec ambiguities (decisions this plan makes)

- **D1 Function name.** Spec s3 and ADR s8.3 say `publish_revision()`; spec s4/s10, CLAUDE.md and progress.md say `publish_item()`. This plan uses `publish_revision()` and updates the CLAUDE.md hard rule in Task 4.
- **D2 EXECUTE grant.** The admin's session runs as role `authenticated`, so revoking EXECUTE from `authenticated` would make publishing impossible except with the secret key (forbidden outside job code). `publish_revision` and `unpublish_item` are granted to `authenticated` only, re-check `private.is_admin()` inside, and are revoked from `public`, `anon` and `service_role`. Everything else is revoked. pgTAP asserts it.
- **D3 "No table readable by anon directly" vs `security_invoker`.** An invoker view needs the caller to hold table privileges. `anon` therefore gets SELECT on `items`/`item_revisions` and a column subset of `companies`/`themes`, under RLS policies whose predicates are identical to the views. Anon can read, through the base tables, exactly the rows and columns the views show. pgTAP asserts it.
- **D4 A failed gate is recorded, not raised.** A RAISE would roll back the `gate_decisions` insert and lose the audit trail. `publish_revision()` returns the `fail` row; it raises only for "not admin" and "not found".
- **D5 `app.admin_email`.** A migration in a public repo cannot carry the email. It lives in `private.settings` (never exposed by the Data API), set once by Shlok; a trigger recomputes roles.
- **D6 Env name.** `.env.example` has `SUPABASE_SERVICE_ROLE_KEY`; this plan renames it `SUPABASE_SECRET_KEY` (Supabase docs and the sb_secret constraint).
- **D7 `t:` capture on an existing thesis.** New revision body = latest body + blank line + capture text (append, not replace); `change_reason` = the capture's first line.
- **D8 Public company/theme free text.** `companies.one_liner` and `themes.description_md` are not linted in Phase 1, so anon cannot read them (column grants). Plan 1B decides how a one-liner reaches the public page (for example inside the gated revision's `structured`).
- **D9 Public revision history** = revisions with a `pass` gate decision (`public_item_revisions` view).
- **D10 Public metadata freeze.** On a public item, title, slug, kind, company, theme, learning objective, data-as-of and holds-position change only by unpublish, edit, republish. Bodies change through new revisions and the gate.
- **D11 Capture idempotency.** `captures.client_id uuid unique` lets the offline queue retry safely; `raw_text` is immutable.
- **D12 Rule 4** (named-security recency) needs the Phase 3 ledger; that phase's migration adds it to `publish_revision()`.
- **D13 Magic-link e2e** uses `auth.admin.generateLink` + `/auth/confirm?token_hash=...` on the local stack; the real email round trip is a manual check in Task 6.
- **D14 Search.** `items.search` covers title + learning objective (a generated column cannot read revisions).

## File structure

| Path | Responsibility | Task |
|---|---|---|
| `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `components.json` | toolchain, import-boundary lint | 1 |
| `vitest.config.mts`, `src/test/empty.ts`, `playwright.config.ts`, `e2e/*` | test harness | 1, 14 |
| `.github/workflows/ci.yml` | lint, typecheck, unit, build, pgTAP, e2e | 1, 4, 14 |
| `scripts/check-css-chunks.mjs` | Turbopack CSS-404 smoke check | 2 |
| `supabase/config.toml`, `supabase/seed.sql`, `supabase/migrations/0001_core.sql`, `supabase/tests/*.test.sql` | schema, RLS, gate, pgTAP | 3, 4 |
| `src/lib/slug.ts`, `src/lib/dates.ts`, `src/lib/cache-tags.ts` | small shared helpers | 1, 8, 9 |
| `src/lib/env.ts` | zod-validated env, the only reader of `process.env` | 5 |
| `src/lib/supabase/{types,errors,server,browser,service,public,proxy,database.types}.ts`, `src/proxy.ts` | clients and session refresh | 4, 5 |
| `src/modules/identity/*` | admin check, magic-link actions | 6 |
| `src/modules/research/*` | items, revisions, diff | 7 |
| `src/modules/compliance/*` | lexicon, lint, publish gate | 8, 9 |
| `src/modules/capture/*`, `src/modules/catalog/*` | grammar, filing, offline queue, streak | 10, 11, 12 |
| `src/modules/ops/*` | heartbeats, health, bearer auth (job code) | 13 |
| `src/app/login`, `src/app/auth/{callback,confirm}`, `src/app/desk/**` | thin routes and admin screens | 6, 7, 9, 12, 13 |
| `src/app/api/{cron/daily,jobs/run,health}/route.ts`, `vercel.json`, `.github/workflows/pump.yml` | three clocks | 13 |
| `src/test/fakes/*` | in-memory repositories for Vitest | 7, 9, 11 |

---

### Task 0: Prerequisites Shlok does by hand

No code. Tick each box before the task that needs it. Values go only into a password manager, `.env.local`, Vercel and GitHub settings, never into git.

- [ ] **Tools (before Task 1):** Node 22 LTS; `corepack enable`; Git; Docker Desktop running (the local Supabase stack and `supabase test db` need it; without Docker, pgTAP and e2e run only in CI).
- [ ] **GitHub (before Task 1):** create the repository (public, which the GPL decision in ADR-001 assumes), add it as `origin`, push the existing `main`.
- [ ] **Supabase project (before Task 3):** create a free project in region Mumbai (`ap-south-1`); keep the database password in a password manager. In Settings > API Keys create a publishable key and a secret key (new key system). Note the project URL and project ref.
- [ ] **Supabase Auth (before Task 6):** Authentication > Sign In / Providers: Email enabled; turn OFF "Allow new users to sign up". URL Configuration: Site URL = the Vercel production URL; Redirect URLs = `http://localhost:3000/**` and `https://<production-domain>/**`.
- [ ] **Admin user (before Task 6):** Authentication > Users > Add user > Create new user with Aksh's email and "Auto Confirm User" ticked. This is the only account; it signs in by magic link.
- [ ] **CRON_SECRET (before Task 2):** generate once in Git Bash with `openssl rand -hex 32`. Use the same value in Vercel, `.env.local` and GitHub.
- [ ] **Vercel (before Task 2):** import the GitHub repo (framework Next.js, Node 22). Environment variables for Production and Preview: `NEXT_PUBLIC_SITE_URL` (production URL, no trailing slash), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`), `SUPABASE_SECRET_KEY` (`sb_secret_...`), `ADMIN_EMAIL` (Aksh's address), `CRON_SECRET`.
- [ ] **`.env.local` (before Task 5):** copy `.env.example` to `.env.local` and fill every `[REQUIRED-P1]` key with the hosted values (Task 5 renames the secret key to `SUPABASE_SECRET_KEY`).
- [ ] **GitHub Actions secrets (before Task 13):** Settings > Secrets and variables > Actions > New repository secret: `CRON_SECRET` (same value) and `SITE_URL` (production URL, no trailing slash).
- [ ] **Uptime monitor (after Task 13 is deployed):** a free UptimeRobot or cron-job.org HTTP monitor on `https://<production-domain>/api/health` every 15 minutes, alerting when the status is not 200, alert contacts Shlok and Aksh.

---

### Task 1: Scaffold, toolchain, import boundaries, CI baseline (progress 1.1, part 1)

**Files:**
- Create (generated by CLIs): `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `AGENTS.md`, `src/app/{layout.tsx,page.tsx,globals.css}`, `src/components/ui/{button,input,textarea,label,badge}.tsx`, `src/lib/utils.ts`
- Create: `vitest.config.mts`, `src/test/empty.ts`, `src/lib/slug.ts`, `playwright.config.ts`, `e2e/smoke.spec.ts`, `.github/workflows/ci.yml`
- Modify: `.gitignore`
- Test: `src/lib/slug.test.ts`, `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `slugify(input: string, maxLength?: number): string` in `src/lib/slug.ts` (output matches `^[a-z0-9]+(-[a-z0-9]+)*$` or is `''`); pnpm scripts `dev`, `build`, `build:webpack`, `start`, `lint`, `typecheck`, `test`, `e2e`, `db:start`, `db:reset`, `db:test`, `db:types`, `db:push`; the ESLint import-boundary rules; Vitest aliases `server-only` to an empty module; shadcn `Button`, `Input`, `Textarea`, `Label`, `Badge` in `@/components/ui/*`.

- [ ] **Step 1: Scaffold into a sibling folder.** The project folder already holds `CLAUDE.md`, `claude/` and `.env.example`, which create-next-app refuses to overwrite, and its name has spaces and capitals.

```bash
cd "/c/Users/Shlok/Downloads"
pnpm create next-app@16.3 aksh-desk-scaffold --ts --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-pnpm --no-cache-components --no-react-compiler \
  --skip-install --disable-git --yes
```

Expected: `aksh-desk-scaffold/` with `src/app`, `package.json`, `eslint.config.mjs`, `next.config.ts`, `AGENTS.md`.

- [ ] **Step 2: Copy without overwriting project files, then delete the scaffold**

```bash
cd "/c/Users/Shlok/Downloads"
cp -rn aksh-desk-scaffold/. "Aksh Agrawal portfolio website/"
rm -rf aksh-desk-scaffold
cd "Aksh Agrawal portfolio website"
git status --short
```

Expected: `CLAUDE.md`, `.gitignore` and `.env.example` are NOT listed as modified (`-n` kept ours); the new files are untracked.

- [ ] **Step 3: Edit `package.json`.** Set `"name": "aksh-research-desk"`, add `"private": true`, `"packageManager": "pnpm@<output of pnpm --version>"` and `"engines": { "node": ">=20.9" }`, and replace `"scripts"` with:

```json
{
  "dev": "next dev",
  "build": "next build",
  "build:webpack": "next build --webpack",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "e2e": "playwright test",
  "db:start": "supabase start",
  "db:reset": "supabase db reset",
  "db:test": "supabase test db",
  "db:types": "supabase gen types typescript --local > src/lib/supabase/database.types.ts",
  "db:push": "supabase db push"
}
```

- [ ] **Step 4: Let the compiler accept regex lookbehind.** In `tsconfig.json` change `"target": "ES2017"` to `"target": "ES2022"`. Keep `"strict": true` and `"paths": { "@/*": ["./src/*"] }` as generated.

- [ ] **Step 5: Pin `cacheComponents` off explicitly.** Replace `next.config.ts`:

```ts
import type { NextConfig } from "next";

// ADR-001 s4: cacheComponents stays off until public pages need it (pitfalls s5: with
// Supabase cookie auth it turns uncached reads outside Suspense into build errors).
// Never add a `webpack` key here: Turbopack builds fail if any webpack config exists.
const nextConfig: NextConfig = {
  cacheComponents: false,
};

export default nextConfig;
```

- [ ] **Step 6: Install dependencies and UI primitives**

```bash
pnpm install
pnpm add @supabase/supabase-js @supabase/ssr zod server-only
pnpm add -D vitest vite-tsconfig-paths @playwright/test supabase
pnpm exec playwright install chromium
pnpm dlx shadcn@latest init --defaults
pnpm dlx shadcn@latest add button input textarea label badge
pnpm list next @supabase/ssr zod
```

Expected: `next 16.3.x`, `@supabase/ssr` >= 0.10.0 (its `setAll` receives a `headers` argument), `zod` 4.x. Accept the defaults if the shadcn CLI asks anything (styling is Plan 1B's decision). Note the exact `next` patch for Task 2.

- [ ] **Step 7: Test infrastructure.** Create `src/test/empty.ts`:

```ts
// Vitest alias target for `server-only`, whose default entry throws outside React Server Components.
export {};
```

Create `vitest.config.mts`:

```ts
import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: { "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    unstubEnvs: true,
  },
});
```

- [ ] **Step 8: Write the failing test** `src/lib/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("slugify", () => {
  it.each([
    ["How Capex Cycles Turn!", "how-capex-cycles-turn"],
    ["M&M", "m-and-m"],
    ["BAJAJ-AUTO", "bajaj-auto"],
    ["Café Coffee Day", "cafe-coffee-day"],
    ["  capital--cycle  ", "capital-cycle"],
  ])("slugify(%j) = %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("returns an empty string when nothing is usable", () => {
    expect(slugify("  --  !!")).toBe("");
  });

  it("caps the length without leaving a trailing hyphen", () => {
    const slug = slugify("word ".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toMatch(SLUG);
  });
});
```

- [ ] **Step 9: Run it to make sure it fails**

Run: `pnpm test src/lib/slug.test.ts`
Expected: FAIL with `Failed to resolve import "./slug"`.

- [ ] **Step 10: Implement** `src/lib/slug.ts`:

```ts
/** URL slug that satisfies the SQL check `^[a-z0-9]+(-[a-z0-9]+)*$`, or '' when nothing is usable. */
export function slugify(input: string, maxLength = 80): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, maxLength).replace(/-+$/g, "");
}
```

- [ ] **Step 11: Run it to make sure it passes**

Run: `pnpm test`
Expected: PASS (7 tests).

- [ ] **Step 12: Import-boundary lint.** Replace `eslint.config.mjs` (it keeps the generated Next presets):

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const NO_APP = { group: ["@/app/*", "@/app/**"], message: "Nothing imports app/* (spec s4)." };
const MODULE_ENTRY_POINTS = {
  group: ["@/modules/*/*", "@/modules/*/*/**", "!@/modules/*/index", "!@/modules/*/actions", "!@/modules/*/client"],
  message: "Import a module through its index, actions or client entry point only (spec s4).",
};
const NO_SECRET_CLIENT = {
  group: ["@/lib/supabase/service"],
  message: "The secret-key client is job code only: use it inside src/modules/ops (ADR-001 s3).",
};
const restrict = (...patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["src/app/**/*.{ts,tsx}"], rules: restrict(NO_APP, MODULE_ENTRY_POINTS, NO_SECRET_CLIENT) },
  {
    files: ["src/modules/**/*.{ts,tsx}"],
    ignores: ["src/modules/ops/**"],
    rules: restrict(NO_APP, MODULE_ENTRY_POINTS, NO_SECRET_CLIENT),
  },
  { files: ["src/modules/ops/**/*.{ts,tsx}"], rules: restrict(NO_APP, MODULE_ENTRY_POINTS) },
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: restrict({
      group: ["@/app/*", "@/app/**", "@/modules/*", "@/modules/**"],
      message: "lib/ is a leaf: it must not import modules or app (spec s4).",
    }),
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/lib/supabase/database.types.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
```

- [ ] **Step 13: Placeholder home page** (the smoke deploy needs a prerendered page that references a CSS chunk). Replace `src/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Aksh Research Desk</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The public desk is being built. Nothing here is investment advice.
      </p>
    </main>
  );
}
```

In `src/app/layout.tsx` change only the `metadata` export to `{ title: "Aksh Research Desk", description: "A student investor's research desk. Educational content only." }`.

- [ ] **Step 14: Playwright smoke.** Create `playwright.config.ts` (Task 14 replaces it with the full version):

```ts
import { defineConfig } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "anon", testMatch: /smoke\.spec\.ts/ }],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Create `e2e/smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("home renders with its stylesheet applied", async ({ page }) => {
  const cssFailures: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes(".css") && !response.ok()) cssFailures.push(response.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Aksh Research Desk" })).toBeVisible();
  expect(cssFailures).toEqual([]);
});
```

Append to `.gitignore`:

```gitignore
# e2e auth state and local supabase env export
e2e/.auth/
.supabase.env
```

- [ ] **Step 15: CI baseline.** Create `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  app:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      # Placeholders so `next build` can evaluate modules; nothing calls Supabase at build time.
      NEXT_PUBLIC_SITE_URL: http://127.0.0.1:3100
      NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_ci_placeholder
      SUPABASE_SECRET_KEY: sb_secret_ci_placeholder
      ADMIN_EMAIL: admin@desk.test
      CRON_SECRET: ci-only-cron-secret-0123456789abcdef0123
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec playwright test --project=anon
```

- [ ] **Step 16: Run the whole gate locally**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e`
Expected: all green; the build output names Turbopack; Playwright `1 passed`.

- [ ] **Step 17: Commit**

```bash
git add -A
git status --short   # confirm no .env.local and no .next
git commit -m "chore: scaffold Next.js 16.3 app with pnpm, Tailwind v4, shadcn, Vitest, Playwright, CI" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Smoke deploy and the Turbopack CSS-404 check (progress 1.1, part 2; answers Q6)

**Files:**
- Create: `scripts/check-css-chunks.mjs`
- Modify: `docs/project-memory/timeline.md` (append), `docs/project-memory/unanswered-questions.md` (append under Q6); `package.json` only on fallback
- Test: the script's exit code

**Interfaces:**
- Consumes: Task 1 build; Task 0 Vercel project.
- Produces: `node scripts/check-css-chunks.mjs <baseUrl> [paths...]` exits 0 when every stylesheet linked from each page returns 2xx, else 1. Reused after Tasks 6 and 13 and by Plan 1B.

- [ ] **Step 1: Write the check script** `scripts/check-css-chunks.mjs`:

```js
// Usage: node scripts/check-css-chunks.mjs https://<deployment> [/ /login ...]
// Detects the Next.js 16.3 Turbopack bug where prerendered HTML references CSS chunks
// that 404 on Vercel (docs/research/2026-10-04-pitfalls.md s5).
const [base, ...rest] = process.argv.slice(2);
if (!base) {
  console.error("usage: node scripts/check-css-chunks.mjs <baseUrl> [paths...]");
  process.exit(2);
}
const paths = rest.length > 0 ? rest : ["/"];
let failures = 0;
for (const path of paths) {
  const page = await fetch(new URL(path, base), { redirect: "follow" });
  const html = await page.text();
  const hrefs = [...html.matchAll(/href="([^"]+\.css[^"]*)"/g)].map((m) => m[1]);
  console.log(`${page.status} ${path} (${hrefs.length} stylesheet links)`);
  if (!page.ok || hrefs.length === 0) failures++;
  for (const href of new Set(hrefs)) {
    const css = await fetch(new URL(href, base));
    console.log(`  ${css.status} ${href}`);
    if (!css.ok) failures++;
  }
}
console.log(failures === 0 ? "CSS check passed" : `CSS check FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it against a local production build**

```bash
pnpm build
pnpm start -p 3000 &
sleep 5
node scripts/check-css-chunks.mjs http://127.0.0.1:3000 /
kill %1
```

Expected: `200 / (1 stylesheet links)` or more, every href `200`, `CSS check passed`.

- [ ] **Step 3: Deploy.** `git push origin main`. In Vercel > Deployments wait for the production deployment. In its build log confirm the line naming Next.js 16.3.x and Turbopack.

- [ ] **Step 4: Run the check against production**

Run: `node scripts/check-css-chunks.mjs https://<production-domain> /`
Expected: exit 0. Open the URL on a phone: the heading is styled, not browser-default serif.

- [ ] **Step 5 (only if Step 4 fails): webpack fallback.** In `package.json` set `"build": "next build --webpack"` (keep `build:webpack`). Commit `fix: build with webpack until the Turbopack CSS-404 bug is fixed` with the trailer, push, wait for the deployment, rerun Step 4. Expected: exit 0. If it still fails, stop and raise it with Shlok: the cause is not the known Turbopack bug.

- [ ] **Step 6: Record the result.** Append to `docs/project-memory/timeline.md`, filling the angle-bracket values from Steps 3-5:

```markdown
## 2026-10-04 - Smoke deploy and Turbopack CSS check (Q6)

**What happened:** Deployed the Phase 1A scaffold to Vercel production and ran scripts/check-css-chunks.mjs.
**Discovered:** Next.js <exact 16.3.x> on Vercel with Turbopack: <CSS chunks returned 200 | CSS chunks 404; build switched to --webpack>.
**Implications:** <Turbopack stays | build uses --webpack; rerun the script on every Next patch upgrade>.
**Links:** docs/plans/2026-10-04-phase-1a-core.md Task 2
```

Append under Q6 in `docs/project-memory/unanswered-questions.md` (append only): `- **Answered 2026-10-04:** see the timeline entry "Smoke deploy and Turbopack CSS check (Q6)".`

- [ ] **Step 7: Commit**

```bash
git add scripts/check-css-chunks.mjs docs/project-memory/timeline.md docs/project-memory/unanswered-questions.md package.json
git commit -m "chore: smoke deploy check for Turbopack CSS chunks" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin main
```

---

### Task 3: Migration 0001 part 1 - tables, identity, append-only, RLS, grants (progress 1.2, part 1)

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `supabase/seed.sql`, `supabase/migrations/0001_core.sql` (sections 0-10)
- Test: `supabase/tests/0001_core_rls.test.sql`

**Interfaces:**
- Consumes: Task 1 (`supabase` dev dependency, `db:*` scripts).
- Produces (SQL, relied on by every later task):
  - Tables `public.profiles, companies, themes, items, item_revisions, captures, gate_decisions, lint_allowances, heartbeats`, and `private.settings(key, value)`.
  - `private.is_admin() returns boolean`, `private.revision_passed(uuid) returns boolean`.
  - `item_revisions.rev_no` assigned by trigger (callers never send it); UPDATE/DELETE/TRUNCATE on `item_revisions` and `gate_decisions` raise `P0001`; `captures.raw_text` immutable (`P0001`); captures never deleted.
  - `items.current_revision_id` must belong to the same item (`23514`).
  - `companies.needs_review`, `themes.needs_review` flag capture stubs; `captures.client_id uuid unique` for idempotent retries.
  - Grants: `authenticated` (the admin) as listed in section 10; `anon` SELECT on `items`, `item_revisions` and `companies(id, slug, name, nse_symbol, bse_code, isin, sector)`, `themes(id, slug, name)`; `service_role` SELECT/INSERT on `heartbeats` only.

- [ ] **Step 1: Initialise the Supabase folder**

```bash
pnpm supabase init
```

Expected: `supabase/config.toml` created. In it set every `enable_signup` key (under `[auth]` and `[auth.email]`) to `false`, set `[auth] site_url = "http://127.0.0.1:3100"` and `additional_redirect_urls = ["http://127.0.0.1:3100/**", "http://localhost:3000/**"]`. Leave `[db.seed]` enabled.

- [ ] **Step 2: Write the failing pgTAP test** `supabase/tests/0001_core_rls.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Fixtures, created as the migration owner (RLS does not apply to the owner).
insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'stranger@pgtap.test');

select is((select role from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'admin', 'the ADMIN_EMAIL user gets role admin');
select is((select role from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  'client', 'any other user gets role client');
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint, 'RLS is enabled on every table in public');

-- The admin works through RLS.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$
  insert into public.items (id, kind, title)
  values ('dddddddd-0000-4000-8000-000000000001', 'note', 'Private draft')
$$, 'admin can create an item');
select results_eq($$
  insert into public.item_revisions (item_id, body_md)
  values ('dddddddd-0000-4000-8000-000000000001', 'first') returning rev_no
$$, array[1], 'first revision gets rev_no 1');
select results_eq($$
  insert into public.item_revisions (item_id, body_md)
  values ('dddddddd-0000-4000-8000-000000000001', 'second') returning rev_no
$$, array[2], 'the next revision gets rev_no 2');
select throws_ok($$
  update public.item_revisions set body_md = 'edited'
  where item_id = 'dddddddd-0000-4000-8000-000000000001'
$$, '42501', null, 'admin cannot update a revision (no grant)');
select throws_ok($$
  delete from public.item_revisions where item_id = 'dddddddd-0000-4000-8000-000000000001'
$$, '42501', null, 'admin cannot delete a revision (no grant)');
select lives_ok($$ insert into public.captures (raw_text) values ('$TCS deal wins slowing') $$,
  'admin can log a capture');
select throws_ok($$ update public.captures set raw_text = 'rewritten' where true $$,
  'P0001', null, 'capture raw_text is immutable');
select throws_ok($$ delete from public.captures where true $$,
  '42501', null, 'captures are never deleted (no grant)');

-- Even the table owner cannot rewrite history.
reset role;
select throws_ok($$ update public.item_revisions set body_md = 'x' where true $$,
  'P0001', null, 'append-only trigger blocks UPDATE for the owner');
select throws_ok($$ delete from public.item_revisions where true $$,
  'P0001', null, 'append-only trigger blocks DELETE for the owner');

-- A signed-in non-admin sees and writes nothing.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is_empty($$ select id from public.items $$, 'non-admin reads no private items');
select throws_ok($$ insert into public.items (kind, title) values ('note', 'sneaky') $$,
  '42501', null, 'non-admin cannot create items');
select throws_ok($$
  update public.profiles set role = 'admin' where id = 'bbbbbbbb-0000-4000-8000-000000000002'
$$, '42501', null, 'non-admin cannot promote itself');

-- Anonymous visitors.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is_empty($$ select id from public.items $$, 'anon reads no private or draft items');
select throws_ok($$ select * from public.captures $$, '42501', null, 'anon cannot read captures');
select throws_ok($$ select * from public.gate_decisions $$, '42501', null, 'anon cannot read gate decisions');
select throws_ok($$ select * from public.heartbeats $$, '42501', null, 'anon cannot read heartbeats');
select throws_ok($$ select one_liner from public.companies $$, '42501', null,
  'anon cannot read the unlinted company one_liner');
select throws_ok($$ insert into public.items (kind, title) values ('note', 'x') $$,
  '42501', null, 'anon cannot write items');

select * from finish();
rollback;
```

- [ ] **Step 3: Run it to make sure it fails**

```bash
pnpm db:start
pnpm db:test
```

Expected: FAIL, `relation "private.settings" does not exist`.

- [ ] **Step 4: Write sections 0-10 of the migration** `supabase/migrations/0001_core.sql`:

```sql
-- =============================================================================
-- 0001_core.sql - Phase 1 core: identity, catalog, research, capture,
-- compliance, ops. The only schema source (ADR-001 s4). Never edit this file
-- after it reaches the hosted project; add 0002_*.sql instead.
-- Spec: docs/specs/2026-10-04-phase-1-core-design.md s3.
-- =============================================================================

-- 0. Nothing in public is reachable by API roles unless granted in section 10.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

-- 1. Private schema: helpers and settings, never exposed by the Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;
-- The auth service fires on_auth_user_created; give it a path to the trigger function.
grant usage on schema private to supabase_auth_admin;

create table private.settings (
  key   text primary key,
  value text not null
);
revoke all on private.settings from public, anon, authenticated, service_role;

-- 2. Identity. Role comes from private.settings('admin_email'), never user_metadata.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now()
);

create function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_admin_email text;
begin
  select s.value into v_admin_email from private.settings s where s.key = 'admin_email';
  insert into public.profiles (id, email, role)
  values (
    new.id,
    coalesce(new.email, ''),
    case when v_admin_email is not null
              and lower(coalesce(new.email, '')) = lower(v_admin_email)
         then 'admin' else 'client' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.apply_admin_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.key = 'admin_email' then
    update public.profiles
       set role = case when lower(email) = lower(new.value) then 'admin' else 'client' end
     where true;
  end if;
  return new;
end;
$$;

create trigger settings_apply_admin_email
  after insert or update on private.settings
  for each row execute function private.apply_admin_email();

-- Users created before this migration (Shlok creates the admin first) get a profile now.
insert into public.profiles (id, email)
select u.id, coalesce(u.email, '') from auth.users u
on conflict (id) do nothing;

-- 3. Catalog. Capture creates stubs flagged needs_review.
create table public.companies (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null check (length(trim(name)) > 0),
  nse_symbol   text unique check (nse_symbol = upper(nse_symbol)),
  bse_code     text,
  isin         text,
  sector       text,
  one_liner    text,
  visibility   text not null default 'private' check (visibility in ('private', 'clients', 'public')),
  needs_review boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.themes (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name           text not null check (length(trim(name)) > 0),
  description_md text,
  visibility     text not null default 'private' check (visibility in ('private', 'clients', 'public')),
  needs_review   boolean not null default false,
  created_at     timestamptz not null default now()
);

-- 4. Research: items and append-only revisions.
create table public.items (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('note', 'thesis', 'learning', 'case_study', 'process')),
  slug                text unique check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               text not null check (length(trim(title)) > 0),
  company_id          uuid references public.companies (id) on delete restrict,
  theme_id            uuid references public.themes (id) on delete restrict,
  visibility          text not null default 'private' check (visibility in ('private', 'clients', 'public')),
  status              text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  current_revision_id uuid,
  published_at        timestamptz,
  data_as_of          date,
  learning_objective  text,
  holds_position      text check (holds_position in ('yes', 'no', 'not_disclosed')),
  search              tsvector generated always as (
                        setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
                        setweight(to_tsvector('english'::regconfig, coalesce(learning_objective, '')), 'B')
                      ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.item_revisions (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.items (id) on delete restrict,
  rev_no         int not null default 0 check (rev_no >= 1), -- set by trigger
  body_md        text not null default '',
  structured     jsonb not null default '{}'::jsonb,
  schema_version int not null default 1,
  change_reason  text,
  author         text not null default 'aksh' check (author in ('aksh', 'system')),
  created_at     timestamptz not null default now(),
  unique (item_id, rev_no)
);

alter table public.items
  add constraint items_current_revision_fk
  foreign key (current_revision_id) references public.item_revisions (id) on delete restrict;

create function private.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_set_updated_at
  before update on public.items
  for each row execute function private.set_updated_at();

create function private.assign_rev_no()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.items i where i.id = new.item_id for update;
  select coalesce(max(r.rev_no), 0) + 1 into new.rev_no
    from public.item_revisions r where r.item_id = new.item_id;
  return new;
end;
$$;

create trigger item_revisions_assign_rev_no
  before insert on public.item_revisions
  for each row execute function private.assign_rev_no();

create function private.reject_mutation()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'P0001';
end;
$$;

create trigger item_revisions_append_only
  before update or delete on public.item_revisions
  for each row execute function private.reject_mutation();
create trigger item_revisions_no_truncate
  before truncate on public.item_revisions
  for each statement execute function private.reject_mutation();

create function private.check_current_revision()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.current_revision_id is not null and not exists (
    select 1 from public.item_revisions r
    where r.id = new.current_revision_id and r.item_id = new.id
  ) then
    raise exception 'current_revision_id % does not belong to item %',
      new.current_revision_id, new.id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger items_check_current_revision
  before insert or update of current_revision_id on public.items
  for each row execute function private.check_current_revision();

-- 5. Capture log: stored verbatim before parsing, never deleted.
create table public.captures (
  id         uuid primary key default gen_random_uuid(),
  raw_text   text not null,
  parsed     jsonb,
  item_id    uuid references public.items (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  theme_id   uuid references public.themes (id) on delete set null,
  source     text not null default 'web' check (source in ('web', 'mobile', 'api')),
  client_id  uuid unique,
  created_at timestamptz not null default now()
);

create function private.guard_capture_raw_text()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.raw_text is distinct from old.raw_text then
    raise exception 'captures.raw_text is stored verbatim and cannot change' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger captures_raw_text_immutable
  before update on public.captures
  for each row execute function private.guard_capture_raw_text();
create trigger captures_no_delete
  before delete on public.captures
  for each row execute function private.reject_mutation();

-- 6. Compliance: audit trail of every gate decision, and the sentence allowlist.
create table public.gate_decisions (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.items (id) on delete restrict,
  revision_id    uuid not null references public.item_revisions (id) on delete restrict,
  policy_version text not null,
  verdict        text not null check (verdict in ('pass', 'fail')),
  reasons        jsonb not null default '{}'::jsonb,
  decided_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create trigger gate_decisions_append_only
  before update or delete on public.gate_decisions
  for each row execute function private.reject_mutation();

create table public.lint_allowances (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.items (id) on delete cascade,
  sentence_hash text not null check (sentence_hash ~ '^[0-9a-f]{64}$'),
  reason        text not null check (length(trim(reason)) >= 3),
  created_at    timestamptz not null default now(),
  unique (item_id, sentence_hash)
);

create function private.revision_passed(p_revision_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.gate_decisions g
    where g.revision_id = p_revision_id and g.verdict = 'pass'
  );
$$;

-- 7. Ops: one row per clock tick (spec s8).
create table public.heartbeats (
  id         uuid primary key default gen_random_uuid(),
  job        text not null,
  ran_at     timestamptz not null default now(),
  ok         boolean not null,
  detail     text,
  created_at timestamptz not null default now()
);

-- 8. Indexes (spec s3). item_revisions(item_id, rev_no) is served by its unique constraint.
create index items_company_id_idx          on public.items (company_id);
create index items_theme_id_idx            on public.items (theme_id);
create index items_current_revision_id_idx on public.items (current_revision_id);
create index items_public_feed_idx         on public.items (visibility, status, published_at desc);
create index items_search_idx              on public.items using gin (search);
create index captures_created_at_idx       on public.captures (created_at desc);
create index captures_item_id_idx          on public.captures (item_id);
create index captures_company_id_idx       on public.captures (company_id);
create index captures_theme_id_idx         on public.captures (theme_id);
create index gate_decisions_item_idx       on public.gate_decisions (item_id, decided_at desc);
create index gate_decisions_revision_idx   on public.gate_decisions (revision_id);
create index heartbeats_job_ran_at_idx     on public.heartbeats (job, ran_at desc);

-- 9. Row level security.
alter table public.profiles        enable row level security;
alter table public.companies       enable row level security;
alter table public.themes          enable row level security;
alter table public.items           enable row level security;
alter table public.item_revisions  enable row level security;
alter table public.captures        enable row level security;
alter table public.gate_decisions  enable row level security;
alter table public.lint_allowances enable row level security;
alter table public.heartbeats      enable row level security;

create policy profiles_admin_all on public.profiles for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy companies_admin_all on public.companies for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy themes_admin_all on public.themes for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy items_admin_all on public.items for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy item_revisions_admin_all on public.item_revisions for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy captures_admin_all on public.captures for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy gate_decisions_admin_read on public.gate_decisions for select to authenticated
  using ((select private.is_admin()));
create policy lint_allowances_admin_all on public.lint_allowances for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy heartbeats_admin_read on public.heartbeats for select to authenticated
  using ((select private.is_admin()));

-- Public reads: the same predicate as the public_* views (decision D3), so the 30-day
-- rule holds in SQL whichever object a caller queries.
create policy items_public_read on public.items for select to anon, authenticated
  using (visibility = 'public' and status = 'published'
         and (data_as_of is null or data_as_of <= current_date - 30));
create policy item_revisions_public_read on public.item_revisions for select to anon, authenticated
  using (private.revision_passed(id) and exists (
    select 1 from public.items i
    where i.id = item_revisions.item_id and i.visibility = 'public' and i.status = 'published'
      and (i.data_as_of is null or i.data_as_of <= current_date - 30)));
create policy companies_public_read on public.companies for select to anon, authenticated
  using (exists (
    select 1 from public.items i
    where i.company_id = companies.id and i.visibility = 'public' and i.status = 'published'
      and (i.data_as_of is null or i.data_as_of <= current_date - 30)));
create policy themes_public_read on public.themes for select to anon, authenticated
  using (exists (
    select 1 from public.items i
    where i.theme_id = themes.id and i.visibility = 'public' and i.status = 'published'
      and (i.data_as_of is null or i.data_as_of <= current_date - 30)));

-- 10. Grants. Start from nothing, then grant exactly what each role needs.
revoke all on all tables in schema public from anon, authenticated, service_role;
revoke execute on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.revision_passed(uuid) to anon, authenticated;

-- anon: the public tier only, filtered by the *_public_read policies.
grant select on public.items, public.item_revisions to anon;
grant select (id, slug, name, nse_symbol, bse_code, isin, sector) on public.companies to anon;
grant select (id, slug, name) on public.themes to anon;

-- authenticated: the admin (signups are disabled). RLS still filters every row.
grant select, insert, update on public.companies, public.themes, public.items, public.captures to authenticated;
grant select, insert on public.item_revisions to authenticated;
grant select, insert, delete on public.lint_allowances to authenticated;
grant select on public.profiles, public.gate_decisions, public.heartbeats to authenticated;

-- service_role: job code (src/modules/ops) writes and reads heartbeats only in Phase 1.
grant select, insert on public.heartbeats to service_role;
```

- [ ] **Step 5: Local seed** (written after the migration because `supabase start` and `db reset` apply it and it needs `private.settings`; `db push` never sends it to the hosted project). Create `supabase/seed.sql`:

```sql
-- Local stack and CI only. The hosted project gets its admin email by hand (Task 4, Step 9).
insert into private.settings (key, value)
values ('admin_email', 'admin@desk.test')
on conflict (key) do update set value = excluded.value;
```

- [ ] **Step 6: Apply and run the test**

```bash
pnpm db:reset
pnpm db:test
```

Expected: `supabase/tests/0001_core_rls.test.sql .. ok`, `All tests successful`, `Result: PASS` (22 tests). If the CLI rejects the file name `0001_core.sql`, rename it to `20261004000001_core.sql` (same content) and note the rename in the commit body.

- [ ] **Step 7: Commit**

```bash
git add supabase/config.toml supabase/seed.sql supabase/migrations/0001_core.sql supabase/tests/0001_core_rls.test.sql
git commit -m "feat(db): core tables, admin identity, append-only revisions, RLS and grants" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Migration 0001 part 2 - public views, publish gate, unpublish, generated types (progress 1.2 part 2, 1.6 SQL half)

**Files:**
- Modify: `supabase/migrations/0001_core.sql` (append sections 11-14), `CLAUDE.md` (one line), `.github/workflows/ci.yml` (add `db` job)
- Create: `src/lib/supabase/database.types.ts` (generated)
- Test: `supabase/tests/0001_publish_gate.test.sql`

**Interfaces:**
- Consumes: Task 3 schema.
- Produces:
  - Views (all `security_invoker = true`, SELECT granted to `anon, authenticated`): `public_items(id, kind, slug, title, company_id, theme_id, published_at, data_as_of, learning_objective, holds_position, revision_id, rev_no, body_md, structured, schema_version, revised_at)`, `public_item_revisions(id, item_id, rev_no, body_md, structured, change_reason, created_at)`, `public_companies(id, slug, name, nse_symbol, bse_code, isin, sector)`, `public_themes(id, slug, name)`. Plan 1B reads only these.
  - `public.publish_revision(p_item_id uuid, p_revision_id uuid, p_policy_version text, p_lint_result jsonb) returns public.gate_decisions`. `p_lint_result` must contain `passed: true`, `revisionId` = `p_revision_id`, `policyVersion` = `p_policy_version`. `reasons` of the returned row is `{ "failures": [{rule, message}], "lint": <p_lint_result> }`.
  - `public.unpublish_item(p_item_id uuid) returns text` (the slug, for cache purge).
  - Trigger `items_guard_publish` raising `42501` on any direct publish or any public-surface change of a public item.
  - `Database`, `Json`, `Tables<>`, `TablesInsert<>`, `TablesUpdate<>` exported from `src/lib/supabase/database.types.ts`.

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/0001_publish_gate.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test');
insert into public.companies (id, slug, name, nse_symbol)
  values ('cccccccc-0000-4000-8000-000000000001', 'testco', 'TestCo', 'TESTCO');

-- d1: learning item naming TestCo, ready to publish (two revisions).
insert into public.items (id, kind, title, slug, company_id, learning_objective, holds_position)
  values ('dddddddd-0000-4000-8000-000000000001', 'learning', 'How capex cycles turn',
          'how-capex-cycles-turn', 'cccccccc-0000-4000-8000-000000000001',
          'Recognise the late stage of a capex cycle.', 'no');
insert into public.item_revisions (id, item_id, body_md) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'Body v1');
insert into public.item_revisions (id, item_id, body_md) values
  ('eeeeeeee-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', 'Body v2');
-- d2: case study whose data is only 10 days old.
insert into public.items (id, kind, title, slug, company_id, learning_objective, holds_position, data_as_of)
  values ('dddddddd-0000-4000-8000-000000000002', 'case_study', 'Fresh case', 'fresh-case',
          'cccccccc-0000-4000-8000-000000000001', 'Learn X.', 'no', current_date - 10);
insert into public.item_revisions (id, item_id, body_md) values
  ('eeeeeeee-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000002', 'Case body');
-- d3: learning item with recent data: passes the gate, hidden by the 30-day rule.
insert into public.items (id, kind, title, slug, learning_objective, data_as_of)
  values ('dddddddd-0000-4000-8000-000000000003', 'learning', 'Recent numbers', 'recent-numbers',
          'Learn Y.', current_date - 5);
insert into public.item_revisions (id, item_id, body_md) values
  ('eeeeeeee-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000003', 'Recent body');
-- d4: names a company but has no holds_position.
insert into public.items (id, kind, title, slug, company_id, learning_objective)
  values ('dddddddd-0000-4000-8000-000000000004', 'learning', 'No position', 'no-position',
          'cccccccc-0000-4000-8000-000000000001', 'Learn Z.');
insert into public.item_revisions (id, item_id, body_md) values
  ('eeeeeeee-0000-4000-8000-000000000005', 'dddddddd-0000-4000-8000-000000000004', 'Body');

-- Function and view privileges.
select ok(not has_function_privilege('anon', 'public.publish_revision(uuid, uuid, text, jsonb)', 'execute'),
  'anon cannot execute publish_revision');
select ok(has_function_privilege('authenticated', 'public.publish_revision(uuid, uuid, text, jsonb)', 'execute'),
  'the admin session (authenticated) can execute publish_revision');
select ok(not has_function_privilege('service_role', 'public.publish_revision(uuid, uuid, text, jsonb)', 'execute'),
  'job code cannot publish');
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and c.relname in ('public_items', 'public_item_revisions', 'public_companies', 'public_themes')
      and 'security_invoker=true' = any (coalesce(c.reloptions, '{}'::text[]))),
  4::bigint, 'all four public views run with security_invoker');

-- Direct publishing is impossible, even for the admin.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ update public.items set visibility = 'public' where id = 'dddddddd-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin cannot set visibility = public directly');
select throws_ok($$ update public.items set status = 'published' where id = 'dddddddd-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin cannot set status = published directly');
select throws_ok($$ insert into public.items (kind, title, visibility) values ('note', 'x', 'public') $$,
  '42501', null, 'admin cannot insert a public item');

-- The gate passes a clean item.
select results_eq($$
  select verdict from public.publish_revision('dddddddd-0000-4000-8000-000000000001',
    'eeeeeeee-0000-4000-8000-000000000001', 'sebi-unreg-2026-07',
    '{"passed":true,"revisionId":"eeeeeeee-0000-4000-8000-000000000001","policyVersion":"sebi-unreg-2026-07"}'::jsonb)
$$, array['pass'], 'a clean learning item passes the gate');
select results_eq($$
  select visibility, status, current_revision_id::text from public.items
  where id = 'dddddddd-0000-4000-8000-000000000001'
$$, $$ values ('public', 'published', 'eeeeeeee-0000-4000-8000-000000000001') $$,
  'a pass sets visibility, status and the current revision');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$ select title from public.public_items $$, array['How capex cycles turn'],
  'anon sees the published item through public_items');
select results_eq($$ select slug from public.public_companies $$, array['testco'],
  'the company of a public item becomes visible');
select results_eq($$
  select rev_no from public.public_item_revisions where item_id = 'dddddddd-0000-4000-8000-000000000001'
$$, array[1], 'only gated revisions are public (revision 2 is not)');

-- Later revisions of a public item stay invisible until gated (ADR-001 s8.3).
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$
  update public.items set current_revision_id = 'eeeeeeee-0000-4000-8000-000000000002'
  where id = 'dddddddd-0000-4000-8000-000000000001'
$$, '42501', null, 'advancing a public item outside the gate is blocked');
select throws_ok($$ update public.items set title = 'Buy now' where id = 'dddddddd-0000-4000-8000-000000000001' $$,
  '42501', null, 'retitling a public item outside the gate is blocked');
select results_eq($$
  select verdict from public.publish_revision('dddddddd-0000-4000-8000-000000000001',
    'eeeeeeee-0000-4000-8000-000000000002', 'sebi-unreg-2026-07',
    '{"passed":false,"revisionId":"eeeeeeee-0000-4000-8000-000000000002","policyVersion":"sebi-unreg-2026-07"}'::jsonb)
$$, array['fail'], 'a revision whose lint failed is rejected');
select results_eq($$
  select current_revision_id::text from public.items where id = 'dddddddd-0000-4000-8000-000000000001'
$$, array['eeeeeeee-0000-4000-8000-000000000001'], 'the rejected revision did not go live');
select results_eq($$
  select verdict from public.publish_revision('dddddddd-0000-4000-8000-000000000001',
    'eeeeeeee-0000-4000-8000-000000000002', 'sebi-unreg-2026-07',
    '{"passed":true,"revisionId":"eeeeeeee-0000-4000-8000-000000000001","policyVersion":"sebi-unreg-2026-07"}'::jsonb)
$$, array['fail'], 'a lint result computed for another revision is rejected');
select results_eq($$
  select verdict from public.publish_revision('dddddddd-0000-4000-8000-000000000001',
    'eeeeeeee-0000-4000-8000-000000000002', 'sebi-unreg-2026-07',
    '{"passed":true,"revisionId":"eeeeeeee-0000-4000-8000-000000000002","policyVersion":"sebi-unreg-2026-07"}'::jsonb)
$$, array['pass'], 'gating the new revision advances it');

-- Rule 3: case studies need data at least 30 days old.
select results_eq($$
  select verdict from public.publish_revision('dddddddd-0000-4000-8000-000000000002',
    'eeeeeeee-0000-4000-8000-000000000003', 'sebi-unreg-2026-07',
    '{"passed":true,"revisionId":"eeeeeeee-0000-4000-8000-000000000003","policyVersion":"sebi-unreg-2026-07"}'::jsonb)
$$, array['fail'], 'a case study with data younger than 30 days fails');
select results_eq($$ select visibility from public.items where id = 'dddddddd-0000-4000-8000-000000000002' $$,
  array['private'], 'the failed case study stays private');
select ok((select reasons -> 'failures' @> '[{"rule":"3"}]'::jsonb from public.gate_decisions
           where item_id = 'dddddddd-0000-4000-8000-000000000002'),
  'the failure is recorded with rule 3');

-- The 30-day rule also lives in the view and the base-table policy.
select results_eq($$
  select verdict from public.publish_revision('dddddddd-0000-4000-8000-000000000003',
    'eeeeeeee-0000-4000-8000-000000000004', 'sebi-unreg-2026-07',
    '{"passed":true,"revisionId":"eeeeeeee-0000-4000-8000-000000000004","policyVersion":"sebi-unreg-2026-07"}'::jsonb)
$$, array['pass'], 'a learning item with recent data passes the gate');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is_empty($$ select id from public.public_items where id = 'dddddddd-0000-4000-8000-000000000003' $$,
  'public_items hides data younger than 30 days');
select is_empty($$ select id from public.items where id = 'dddddddd-0000-4000-8000-000000000003' $$,
  'the base table hides it from anon as well');

-- Rule 5: holds_position is required when a company is named.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq($$
  select verdict from public.publish_revision('dddddddd-0000-4000-8000-000000000004',
    'eeeeeeee-0000-4000-8000-000000000005', 'sebi-unreg-2026-07',
    '{"passed":true,"revisionId":"eeeeeeee-0000-4000-8000-000000000005","policyVersion":"sebi-unreg-2026-07"}'::jsonb)
$$, array['fail'], 'an item naming a company without holds_position fails');

-- Retraction.
select results_eq($$ select public.unpublish_item('dddddddd-0000-4000-8000-000000000001') $$,
  array['how-capex-cycles-turn'], 'unpublish returns the slug for cache purge');
select results_eq($$ select visibility from public.items where id = 'dddddddd-0000-4000-8000-000000000001' $$,
  array['private'], 'unpublish makes the item private');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is_empty($$ select id from public.public_items where id = 'dddddddd-0000-4000-8000-000000000001' $$,
  'the unpublished item leaves public_items');

-- Audit trail and caller checks.
reset role;
select throws_ok($$ update public.gate_decisions set verdict = 'pass' where true $$,
  'P0001', null, 'gate_decisions is append-only');
select throws_ok($$
  select public.publish_revision('dddddddd-0000-4000-8000-000000000001',
    'eeeeeeee-0000-4000-8000-000000000001', 'sebi-unreg-2026-07', '{}'::jsonb)
$$, '42501', null, 'publish_revision refuses a caller who is not the admin');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm db:test`
Expected: `0001_core_rls.test.sql .. ok` and `0001_publish_gate.test.sql` FAIL with `function public.publish_revision(uuid, uuid, text, jsonb) does not exist`.

- [ ] **Step 3: Append sections 11-14 to** `supabase/migrations/0001_core.sql`:

```sql
-- 11. Public views. security_invoker = true so the caller's RLS applies (pitfalls s2).
create view public.public_items with (security_invoker = true) as
select i.id, i.kind, i.slug, i.title, i.company_id, i.theme_id, i.published_at, i.data_as_of,
       i.learning_objective, i.holds_position,
       r.id as revision_id, r.rev_no, r.body_md, r.structured, r.schema_version,
       r.created_at as revised_at
from public.items i
join public.item_revisions r on r.id = i.current_revision_id
where i.visibility = 'public' and i.status = 'published'
  and (i.data_as_of is null or i.data_as_of <= current_date - 30);

create view public.public_item_revisions with (security_invoker = true) as
select r.id, r.item_id, r.rev_no, r.body_md, r.structured, r.change_reason, r.created_at
from public.item_revisions r
join public.public_items p on p.id = r.item_id
where private.revision_passed(r.id);

create view public.public_companies with (security_invoker = true) as
select c.id, c.slug, c.name, c.nse_symbol, c.bse_code, c.isin, c.sector
from public.companies c
where exists (select 1 from public.public_items p where p.company_id = c.id);

create view public.public_themes with (security_invoker = true) as
select t.id, t.slug, t.name
from public.themes t
where exists (select 1 from public.public_items p where p.theme_id = t.id);

grant select on public.public_items, public.public_item_revisions,
                public.public_companies, public.public_themes to anon, authenticated;

-- 12. Guard: only publish_revision() (which sets app.publish_gate for its own
-- transaction) may make an item public or change what a public item shows.
create function private.guard_publish_columns()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('app.publish_gate', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.visibility = 'public' or new.status = 'published' or new.published_at is not null then
      raise exception 'items: only publish_revision() can make an item public' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status = 'published' and old.status is distinct from 'published' then
    raise exception 'items: only publish_revision() can publish' using errcode = '42501';
  end if;
  if new.visibility = 'public' and (
       old.visibility is distinct from 'public'
    or new.current_revision_id is distinct from old.current_revision_id
    or new.title is distinct from old.title
    or new.slug is distinct from old.slug
    or new.kind is distinct from old.kind
    or new.company_id is distinct from old.company_id
    or new.theme_id is distinct from old.theme_id
    or new.learning_objective is distinct from old.learning_objective
    or new.data_as_of is distinct from old.data_as_of
    or new.holds_position is distinct from old.holds_position
    or new.status is distinct from old.status
    or new.published_at is distinct from old.published_at
  ) then
    raise exception 'items: a public item changes only through publish_revision(); unpublish to edit details'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger items_guard_publish
  before insert or update on public.items
  for each row execute function private.guard_publish_columns();

-- 13. The only publish path (spec s3, ADR-001 s8.3). Re-checks in SQL what the
-- TypeScript lint already checked, records every decision, raises only for
-- "not admin" and "not found" (decision D4).
create function public.publish_revision(
  p_item_id        uuid,
  p_revision_id    uuid,
  p_policy_version text,
  p_lint_result    jsonb
)
returns public.gate_decisions
language plpgsql security definer set search_path = ''
as $$
declare
  v_item     public.items;
  v_failures jsonb := '[]'::jsonb;
  v_decision public.gate_decisions;
begin
  if not private.is_admin() then
    raise exception 'publish_revision: admin only' using errcode = '42501';
  end if;

  select * into v_item from public.items where id = p_item_id for update;
  if not found then
    raise exception 'publish_revision: item % not found', p_item_id using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.item_revisions r
                 where r.id = p_revision_id and r.item_id = p_item_id) then
    raise exception 'publish_revision: revision % does not belong to item %', p_revision_id, p_item_id
      using errcode = 'P0002';
  end if;

  if (p_lint_result -> 'passed') is distinct from 'true'::jsonb then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'lint', 'message', 'The text lint did not pass.'));
  end if;
  if (p_lint_result ->> 'revisionId') is distinct from p_revision_id::text then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'lint', 'message', 'The lint result belongs to a different revision.'));
  end if;
  if coalesce(p_policy_version, '') = ''
     or (p_lint_result ->> 'policyVersion') is distinct from p_policy_version then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'policy', 'message', 'The lint ran under a different policy version.'));
  end if;
  if v_item.slug is null then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'slug', 'message', 'A slug is required before publishing.'));
  end if;
  if v_item.learning_objective is null or length(trim(v_item.learning_objective)) = 0 then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '6', 'message', 'A learning objective is required.'));
  end if;
  if v_item.company_id is not null and v_item.holds_position is null then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '5', 'message', 'holds_position is required when a company is named.'));
  end if;
  if v_item.kind = 'case_study'
     and (v_item.data_as_of is null or v_item.data_as_of > current_date - 30) then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '3', 'message', 'A case study needs data_as_of at least 30 days old.'));
  end if;
  -- Rule 4 (named-security recency) needs the Phase 3 ledger; that phase's
  -- migration replaces this function and adds the check (decision D12).

  insert into public.gate_decisions (item_id, revision_id, policy_version, verdict, reasons)
  values (
    p_item_id, p_revision_id, coalesce(p_policy_version, ''),
    case when jsonb_array_length(v_failures) = 0 then 'pass' else 'fail' end,
    jsonb_build_object('failures', v_failures, 'lint', coalesce(p_lint_result, '{}'::jsonb))
  )
  returning * into v_decision;

  if v_decision.verdict = 'pass' then
    perform set_config('app.publish_gate', 'on', true);
    update public.items
       set visibility = 'public',
           status = 'published',
           current_revision_id = p_revision_id,
           published_at = coalesce(published_at, now())
     where id = p_item_id;
    perform set_config('app.publish_gate', 'off', true);
  end if;

  return v_decision;
end;
$$;

-- Retraction (ADR-001 s8.9). Returns the slug so the server action can purge caches.
create function public.unpublish_item(p_item_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_slug text;
begin
  if not private.is_admin() then
    raise exception 'unpublish_item: admin only' using errcode = '42501';
  end if;
  update public.items set visibility = 'private' where id = p_item_id returning slug into v_slug;
  if not found then
    raise exception 'unpublish_item: item % not found', p_item_id using errcode = 'P0002';
  end if;
  return v_slug;
end;
$$;

-- 14. Function privileges (spec s3, decision D2). Everything else stays revoked.
revoke execute on function public.publish_revision(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.unpublish_item(uuid) from public, anon, authenticated, service_role;
grant execute on function public.publish_revision(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.unpublish_item(uuid) to authenticated;
```

- [ ] **Step 4: Apply and run both test files**

```bash
pnpm db:reset
pnpm db:test
```

Expected: both files `ok`, `Result: PASS` (52 tests).

- [ ] **Step 5: Generate types**

```bash
pnpm db:types
```

Expected: `src/lib/supabase/database.types.ts` exists and contains `publish_revision`, `public_items` and `export type Tables<`. Run `pnpm typecheck` (PASS).

- [ ] **Step 6: Add the pgTAP job to CI.** Append under `jobs:` in `.github/workflows/ci.yml`:

```yaml
  db:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase start
      - run: supabase test db
```

- [ ] **Step 7: Align the CLAUDE.md hard rule with the spec (decision D1).** In `CLAUDE.md` replace `The only publish path is the DB \`publish_item()\` function.` with `The only publish path is the DB \`publish_revision()\` function (spec s3; see docs/plans/2026-10-04-phase-1a-core.md D1).`

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0001_core.sql supabase/tests/0001_publish_gate.test.sql \
  src/lib/supabase/database.types.ts .github/workflows/ci.yml CLAUDE.md
git commit -m "feat(db): public invoker views, publish_revision gate, unpublish_item, generated types" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 9: Push the migration to the hosted project and set the admin email (Shlok)**

```bash
pnpm supabase login
pnpm supabase link --project-ref <project-ref>
pnpm db:push
```

Expected: `Applying migration 0001_core.sql...` then `Finished supabase db push.` Then in Dashboard > SQL Editor run, with Aksh's real address:

```sql
insert into private.settings (key, value) values ('admin_email', '<aksh-email>')
on conflict (key) do update set value = excluded.value;
select email, role from public.profiles;
```

Expected: Aksh's row shows `admin`. Then open Dashboard > Advisors > Security Advisor: no ERROR-level findings (the four views must not be reported as security definer views).

---

### Task 5: `env.ts`, Supabase clients and `proxy.ts` session refresh (progress 1.3)

**Files:**
- Create: `src/lib/env.ts`, `src/lib/supabase/types.ts`, `src/lib/supabase/errors.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/service.ts`, `src/lib/supabase/public.ts`, `src/lib/supabase/proxy.ts`, `src/proxy.ts`
- Modify: `.env.example` (three comment/name lines)
- Test: `src/lib/env.test.ts`, `src/lib/supabase/errors.test.ts`, `src/lib/supabase/proxy.test.ts`

**Interfaces:**
- Consumes: `Database` from `src/lib/supabase/database.types.ts` (Task 4).
- Produces:
  - `src/lib/env.ts`: `type PublicEnv = { NEXT_PUBLIC_SITE_URL: string; NEXT_PUBLIC_SUPABASE_URL: string; NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string }`, `type ServerEnv = PublicEnv & { SUPABASE_SECRET_KEY: string; ADMIN_EMAIL: string; CRON_SECRET: string }`, `class EnvError extends Error { problems: string[] }`, `parsePublicEnv(source: Record<string, string | undefined>): PublicEnv`, `parseServerEnv(source): ServerEnv`, `publicEnv(): PublicEnv`, `serverEnv(): ServerEnv`. `NEXT_PUBLIC_SITE_URL` has no trailing slash; `ADMIN_EMAIL` is trimmed and lower-cased.
  - `src/lib/supabase/types.ts`: `type Db = SupabaseClient<Database>`.
  - `src/lib/supabase/errors.ts`: `class DbError extends Error { op: string; code: string | undefined }`, `dbError(op: string, error: { message: string; code?: string }): DbError`, `isUniqueViolation(error: unknown): boolean`.
  - `createSupabaseServerClient(): Promise<Db>` (cookie-bound, publishable key, server only), `createSupabaseBrowserClient(): Db`, `createSupabaseServiceClient(): Db` (secret key, `src/modules/ops` only), `createSupabasePublicClient(): Db` (cookie-less, publishable key, for Plan 1B cached public reads).
  - `updateSession(request: NextRequest): Promise<NextResponse>`; `src/proxy.ts` exports `proxy` and `config = { matcher: ["/desk/:path*"] }`.

- [ ] **Step 1: Write the failing env test** `src/lib/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EnvError, parsePublicEnv, parseServerEnv } from "./env";

const valid = {
  NEXT_PUBLIC_SITE_URL: "https://desk.example.com/",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_testkey123",
  SUPABASE_SECRET_KEY: "sb_secret_testkey456",
  ADMIN_EMAIL: " Aksh@Example.com ",
  CRON_SECRET: "c".repeat(32),
};

describe("parseServerEnv", () => {
  it("accepts a complete environment and normalises it", () => {
    const env = parseServerEnv(valid);
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://desk.example.com");
    expect(env.ADMIN_EMAIL).toBe("aksh@example.com");
  });

  it("names every missing variable", () => {
    expect(() => parseServerEnv({ ...valid, CRON_SECRET: undefined, ADMIN_EMAIL: undefined }))
      .toThrow(/CRON_SECRET[\s\S]*ADMIN_EMAIL|ADMIN_EMAIL[\s\S]*CRON_SECRET/);
  });

  it("rejects legacy JWT keys in favour of sb_secret_ / sb_publishable_ keys", () => {
    expect(() => parseServerEnv({ ...valid, SUPABASE_SECRET_KEY: "eyJhbGciOiJIUzI1NiJ9.payload.sig" }))
      .toThrow(/SUPABASE_SECRET_KEY/);
    expect(() => parseServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOi.x.y" }))
      .toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("rejects a short CRON_SECRET", () => {
    expect(() => parseServerEnv({ ...valid, CRON_SECRET: "short" })).toThrow(/CRON_SECRET/);
  });

  it("never echoes secret values in the error", () => {
    try {
      parseServerEnv({ ...valid, SUPABASE_SECRET_KEY: "eyJsupersecretvalue" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      expect((error as EnvError).message).not.toContain("supersecretvalue");
    }
  });
});

describe("parsePublicEnv", () => {
  it("does not require server-only variables", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SITE_URL: valid.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: valid.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcd.supabase.co");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test src/lib/env.test.ts`
Expected: FAIL with `Failed to resolve import "./env"`.

- [ ] **Step 3: Implement** `src/lib/env.ts`:

```ts
import { z } from "zod";

// The only file that reads process.env (CLAUDE.md). Labels match .env.example [REQUIRED-P1].
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .startsWith("sb_publishable_", "must be a publishable key (sb_publishable_...)"),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_", "must be a secret key (sb_secret_...)"),
  ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email("must be an email address")),
  CRON_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -hex 32)"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
type Source = Record<string, string | undefined>;

export class EnvError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}\nSee .env.example.`);
    this.name = "EnvError";
  }
}

function parse<S extends z.ZodType>(schema: S, source: Source): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Messages carry variable names and rules, never values.
    throw new EnvError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }
  return result.data;
}

export function parsePublicEnv(source: Source): PublicEnv {
  return parse(publicSchema, source);
}

export function parseServerEnv(source: Source): ServerEnv {
  return parse(serverSchema, source);
}

let cachedPublic: PublicEnv | undefined;
let cachedServer: ServerEnv | undefined;

export function publicEnv(): PublicEnv {
  // Literal property access so Next.js inlines NEXT_PUBLIC_* values into browser bundles.
  cachedPublic ??= parsePublicEnv({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return cachedPublic;
}

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must never run in the browser");
  }
  cachedServer ??= parseServerEnv(process.env);
  return cachedServer;
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `pnpm test src/lib/env.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Rename the secret key in `.env.example` (decision D6).** Replace these three lines:

```text
# [REQUIRED-P1][SECRET] Service-role key - bypasses RLS. Used ONLY by server jobs
# (ingestion worker, price cron). Never import into client code.
SUPABASE_SERVICE_ROLE_KEY=
```

with:

```text
# [REQUIRED-P1][SECRET] Secret key (sb_secret_...) - bypasses RLS. Used ONLY by job code
# in src/modules/ops (cron, pump, health). Never import into client code.
SUPABASE_SECRET_KEY=
```

Also change `# [REQUIRED-P1] Publishable (anon) key - safe in the browser, RLS enforces access` to `# [REQUIRED-P1] Publishable key (sb_publishable_...) - safe in the browser, RLS enforces access`, and `# [REQUIRED-P1] Owner's email; the only account allowed into /admin.` to `# [REQUIRED-P1] Owner's email; the only account allowed into /desk.` Update `.env.local` to the new name.

- [ ] **Step 6: Write the failing tests for DB errors and the session refresh.** `src/lib/supabase/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DbError, dbError, isUniqueViolation } from "./errors";

describe("dbError", () => {
  it("keeps the operation and Postgres code", () => {
    const error = dbError("research.insertItem", { message: "duplicate key", code: "23505" });
    expect(error).toBeInstanceOf(DbError);
    expect(error.message).toBe("research.insertItem: duplicate key");
    expect(error.code).toBe("23505");
  });

  it("recognises unique violations only", () => {
    expect(isUniqueViolation(dbError("x", { message: "dup", code: "23505" }))).toBe(true);
    expect(isUniqueViolation(dbError("x", { message: "rls", code: "42501" }))).toBe(false);
    expect(isUniqueViolation(new Error("23505"))).toBe(false);
  });
});
```

`src/lib/supabase/proxy.test.ts`:

```ts
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type CookieWrite = { name: string; value: string; options: Record<string, unknown> };
type CookieMethods = { setAll: (cookies: CookieWrite[], headers: Record<string, string>) => void };

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  cookies: undefined as CookieMethods | undefined,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: CookieMethods }) => {
    mocks.cookies = options.cookies;
    return { auth: { getClaims: mocks.getClaims } };
  },
}));

import { config } from "@/proxy";
import { updateSession } from "./proxy";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  mocks.getClaims.mockReset();
});

describe("updateSession", () => {
  it("calls getClaims once and passes the request through when nothing refreshes", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    const response = await updateSession(new NextRequest("http://localhost:3000/desk"));
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("writes refreshed cookies and the no-store cache headers onto the response", async () => {
    mocks.getClaims.mockImplementation(async () => {
      mocks.cookies?.setAll(
        [{ name: "sb-test-auth-token", value: "refreshed", options: { path: "/" } }],
        { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0", Expires: "0", Pragma: "no-cache" },
      );
      return { data: { claims: { sub: "user-1" } }, error: null };
    });
    const response = await updateSession(new NextRequest("http://localhost:3000/desk"));
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.status).toBe(200);
  });
});

describe("proxy matcher", () => {
  it("only runs on /desk so cron, pump, health and public pages never touch auth cookies", () => {
    expect(config.matcher).toEqual(["/desk/:path*"]);
  });
});
```

- [ ] **Step 7: Run them to make sure they fail**

Run: `pnpm test src/lib/supabase`
Expected: FAIL with `Failed to resolve import "./errors"` and `"./proxy"`.

- [ ] **Step 8: Implement the client layer.** `src/lib/supabase/types.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type Db = SupabaseClient<Database>;
```

`src/lib/supabase/errors.ts`:

```ts
export class DbError extends Error {
  constructor(
    readonly op: string,
    readonly code: string | undefined,
    message: string,
  ) {
    super(`${op}: ${message}`);
    this.name = "DbError";
  }
}

export function dbError(op: string, error: { message: string; code?: string }): DbError {
  return new DbError(op, error.code, error.message);
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof DbError && error.code === "23505";
}
```

`src/lib/supabase/server.ts`:

```ts
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";
import type { Db } from "./types";

/** Cookie-bound client for Server Components, Server Actions and Route Handlers. RLS applies. */
export async function createSupabaseServerClient(): Promise<Db> {
  const cookieStore = await cookies();
  const env = publicEnv();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. proxy.ts refreshes sessions.
        }
      },
    },
  });
}
```

`src/lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";
import type { Db } from "./types";

/** Browser client (publishable key). RLS applies. */
export function createSupabaseBrowserClient(): Db {
  const env = publicEnv();
  return createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
```

`src/lib/supabase/service.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "./database.types";
import type { Db } from "./types";

/** Secret-key client: bypasses RLS. Job code only (src/modules/ops), enforced by ESLint. */
export function createSupabaseServiceClient(): Db {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
```

`src/lib/supabase/public.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";
import type { Db } from "./types";

/** Cookie-less anon client for cached public reads (Plan 1B). Sees only the public_* views' rows. */
export function createSupabasePublicClient(): Db {
  const env = publicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
```

`src/lib/supabase/proxy.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Refreshes the Supabase session cookie. It is NOT an auth boundary (spec s4): it never
 * redirects, because a redirect after a refresh drops the refreshed cookies (pitfalls s2).
 * Pages and actions call requireAdmin().
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const env = publicEnv();
  const supabase = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });
  // Do not put code between client creation and getClaims().
  await supabase.auth.getClaims();
  return response;
}
```

`src/proxy.ts`:

```ts
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// /desk only: public pages, /api/cron, /api/jobs and /api/health never touch auth cookies,
// and Vercel cron does not follow redirects.
export const config = {
  matcher: ["/desk/:path*"],
};
```

- [ ] **Step 9: Run the tests and the type check**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS (env 6, errors 2, proxy 3, slug 7); no type or lint errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/env.ts src/lib/env.test.ts src/lib/supabase src/proxy.ts .env.example
git commit -m "feat(lib): validated env, Supabase clients with sb_ keys, proxy session refresh" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Admin magic-link auth and the `/desk` shell (progress 1.4)

**Files:**
- Create: `src/modules/identity/admin.ts`, `src/modules/identity/index.ts`, `src/modules/identity/actions.ts`
- Create: `src/app/login/page.tsx`, `src/app/login/login-form.tsx`, `src/app/auth/callback/route.ts`, `src/app/auth/confirm/route.ts`, `src/app/desk/layout.tsx`, `src/app/desk/page.tsx`
- Test: `src/modules/identity/admin.test.ts`

**Interfaces:**
- Consumes: `serverEnv()`, `publicEnv()`, `createSupabaseServerClient()`, `Db` (Task 5).
- Produces (from `@/modules/identity`): `type AdminIdentity = { userId: string; email: string }`, `type GetAdminDeps = { db?: Pick<Db, "auth">; adminEmail?: string }`, `isAdminEmail(email: string | null | undefined, adminEmail: string): boolean`, `safeNextPath(next: string | null | undefined, fallback?: string): string`, `getAdmin(deps?: GetAdminDeps): Promise<AdminIdentity | null>`, `requireAdmin(): Promise<AdminIdentity>` (redirects to `/login`), `confirmAdminSession(db: Pick<Db, "auth">, adminEmail?: string): Promise<boolean>` (signs out a non-admin). From `@/modules/identity/actions`: `type MagicLinkState = { status: "idle" | "sent" | "error"; message: string }`, `requestMagicLink(prev: MagicLinkState, formData: FormData): Promise<MagicLinkState>`, `signOut(): Promise<void>`. Routes `/login`, `/auth/callback?code=&next=`, `/auth/confirm?token_hash=&type=&next=`, and the `/desk` layout guard.

- [ ] **Step 1: Write the failing test** `src/modules/identity/admin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { confirmAdminSession, getAdmin, isAdminEmail, safeNextPath } from "./admin";
import type { Db } from "@/lib/supabase/types";

type ClaimsResult = { data: { claims: Record<string, unknown> } | null; error: Error | null };

function fakeAuth(result: ClaimsResult) {
  const calls = { signOut: 0 };
  const db = {
    auth: {
      getClaims: async () => result,
      signOut: async () => {
        calls.signOut++;
        return { error: null };
      },
    },
  } as unknown as Pick<Db, "auth">;
  return { db, calls };
}

const ADMIN = "aksh@example.com";

describe("isAdminEmail", () => {
  it("matches case- and space-insensitively", () => {
    expect(isAdminEmail(" Aksh@Example.COM ", ADMIN)).toBe(true);
    expect(isAdminEmail("someone@example.com", ADMIN)).toBe(false);
    expect(isAdminEmail(null, ADMIN)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/desk/items", "/desk/items"],
    [null, "/desk"],
    ["https://evil.example", "/desk"],
    ["//evil.example", "/desk"],
    ["/\\evil.example", "/desk"],
  ])("safeNextPath(%j) = %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("getAdmin", () => {
  it("returns the identity for the admin email", async () => {
    const { db } = fakeAuth({ data: { claims: { sub: "u-1", email: "Aksh@Example.com" } }, error: null });
    await expect(getAdmin({ db, adminEmail: ADMIN })).resolves.toEqual({ userId: "u-1", email: ADMIN });
  });

  it.each([
    ["another email", { data: { claims: { sub: "u-2", email: "x@example.com" } }, error: null }],
    ["no session", { data: null, error: null }],
    ["an auth error", { data: null, error: new Error("jwt expired") }],
    ["claims without sub", { data: { claims: { email: ADMIN } }, error: null }],
  ])("returns null for %s", async (_label, result) => {
    const { db } = fakeAuth(result as ClaimsResult);
    await expect(getAdmin({ db, adminEmail: ADMIN })).resolves.toBeNull();
  });
});

describe("confirmAdminSession", () => {
  it("signs out a session that is not the admin", async () => {
    const { db, calls } = fakeAuth({ data: { claims: { sub: "u-2", email: "x@example.com" } }, error: null });
    await expect(confirmAdminSession(db, ADMIN)).resolves.toBe(false);
    expect(calls.signOut).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test src/modules/identity`
Expected: FAIL with `Failed to resolve import "./admin"`.

- [ ] **Step 3: Implement** `src/modules/identity/admin.ts`:

```ts
import "server-only";
import { redirect } from "next/navigation";
import { serverEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Db } from "@/lib/supabase/types";

export type AdminIdentity = { userId: string; email: string };
export type GetAdminDeps = { db?: Pick<Db, "auth">; adminEmail?: string };

export function isAdminEmail(email: string | null | undefined, adminEmail: string): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === adminEmail.trim().toLowerCase();
}

/** Only same-site relative paths survive; anything else falls back (open-redirect guard). */
export function safeNextPath(next: string | null | undefined, fallback = "/desk"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** getClaims() verifies the JWT; getSession() is never used for authorisation (pitfalls s2). */
export async function getAdmin(deps: GetAdminDeps = {}): Promise<AdminIdentity | null> {
  const db = deps.db ?? (await createSupabaseServerClient());
  const adminEmail = deps.adminEmail ?? serverEnv().ADMIN_EMAIL;
  const { data, error } = await db.auth.getClaims();
  if (error || !data) return null;
  const claims = data.claims as unknown as Record<string, unknown>;
  const sub = typeof claims.sub === "string" ? claims.sub : null;
  const email = typeof claims.email === "string" ? claims.email : null;
  if (!sub || !email || !isAdminEmail(email, adminEmail)) return null;
  return { userId: sub, email: email.trim().toLowerCase() };
}

/** Every desk page and every server action calls this (spec s9). */
export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  return admin;
}

/** After a sign-in exchange: keep the session only if it is the admin's. */
export async function confirmAdminSession(db: Pick<Db, "auth">, adminEmail?: string): Promise<boolean> {
  const admin = await getAdmin({ db, adminEmail });
  if (admin) return true;
  await db.auth.signOut();
  return false;
}
```

`src/modules/identity/index.ts`:

```ts
export {
  confirmAdminSession,
  getAdmin,
  isAdminEmail,
  requireAdmin,
  safeNextPath,
  type AdminIdentity,
  type GetAdminDeps,
} from "./admin";
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `pnpm test src/modules/identity`
Expected: PASS (12 tests).

- [ ] **Step 5: Server actions** `src/modules/identity/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv, serverEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "./admin";

export type MagicLinkState = { status: "idle" | "sent" | "error"; message: string };

const SENT: MagicLinkState = {
  status: "sent",
  message: "If this address is allowed, a sign-in link is on its way. Check your inbox.",
};

export async function requestMagicLink(_prev: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };
  // Same answer for every address: the form never reveals who is allowed.
  if (!isAdminEmail(parsed.data, serverEnv().ADMIN_EMAIL)) return SENT;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=/desk`,
    },
  });
  if (error) return { status: "error", message: "Could not send the link right now. Try again in a minute." };
  return SENT;
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 6: Login page.** `src/app/login/login-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestMagicLink, type MagicLinkState } from "@/modules/identity/actions";

const initial: MagicLinkState = { status: "idle", message: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(requestMagicLink, initial);
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending..." : "Send sign-in link"}
      </Button>
      <p role="status" className="text-sm">
        {state.message}
      </p>
    </form>
  );
}
```

`src/app/login/page.tsx`:

```tsx
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message =
    error === "not-allowed"
      ? "That account is not allowed into the desk."
      : error
        ? "That sign-in link did not work. Request a new one."
        : null;
  return (
    <main className="mx-auto max-w-sm space-y-4 px-4 py-16">
      <h1 className="text-xl font-semibold">Sign in</h1>
      {message ? (
        <p role="alert" className="text-sm text-red-700">
          {message}
        </p>
      ) : null}
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 7: Auth routes.** `src/app/auth/callback/route.ts` (PKCE code from the emailed link):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { confirmAdminSession, safeNextPath } from "@/modules/identity";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  if (!code) return NextResponse.redirect(new URL("/login?error=missing-code", origin));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=link-expired", origin));
  if (!(await confirmAdminSession(supabase))) {
    return NextResponse.redirect(new URL("/login?error=not-allowed", origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
```

`src/app/auth/confirm/route.ts` (token-hash links: server-generated links and the e2e harness):

```ts
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { confirmAdminSession, safeNextPath } from "@/modules/identity";

const ALLOWED: EmailOtpType[] = ["magiclink", "email"];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));
  if (!tokenHash || !type || !ALLOWED.includes(type)) {
    return NextResponse.redirect(new URL("/login?error=bad-link", origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(new URL("/login?error=link-expired", origin));
  if (!(await confirmAdminSession(supabase))) {
    return NextResponse.redirect(new URL("/login?error=not-allowed", origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
```

- [ ] **Step 8: The `/desk` shell.** `src/app/desk/layout.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/modules/identity";
import { signOut } from "@/modules/identity/actions";

export default async function DeskLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <header className="mb-4 flex items-center justify-between gap-2 text-sm">
        <nav className="flex gap-4">
          <Link href="/desk">Today</Link>
          <Link href="/desk/items">Items</Link>
        </nav>
        <form action={signOut}>
          <button type="submit" className="text-muted-foreground underline">
            Sign out
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
```

`src/app/desk/page.tsx` (Task 12 replaces it with the capture screen):

```tsx
import { requireAdmin } from "@/modules/identity";

export default async function DeskHome() {
  const admin = await requireAdmin();
  return <p className="text-sm">Signed in as {admin.email}.</p>;
}
```

- [ ] **Step 9: Verify everything locally, including the real email round trip**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green.

Then `pnpm dev` (with `.env.local` pointing at the hosted project) and check by hand:
1. `http://localhost:3000/desk` redirects to `/login`.
2. A stranger's address shows the same "If this address is allowed..." message and no email arrives.
3. Aksh's address receives a link; opening it lands on `/desk` showing "Signed in as ...".
4. "Sign out" returns to `/login`, and `/desk` redirects again.

- [ ] **Step 10: Commit and deploy**

```bash
git add src/modules/identity src/app/login src/app/auth src/app/desk
git commit -m "feat(identity): admin-only magic link, auth callback and confirm routes, /desk guard" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin main
node scripts/check-css-chunks.mjs https://<production-domain> / /login
```

Expected: CSS check passed on both paths; the production magic link works for Aksh.

---

### Task 7: `research` module - items, append-only revisions, diff, desk item screens (progress 1.5)

**Files:**
- Create: `src/modules/research/{schema,types,errors,diff,service,repo,index,actions}.ts`, `src/test/fakes/research-repo.ts`
- Create: `src/app/desk/items/page.tsx`, `src/app/desk/items/[id]/{page,meta-form,revision-form,history}.tsx`
- Test: `src/modules/research/service.test.ts`, `src/modules/research/diff.test.ts`

**Interfaces:**
- Consumes: `Db`, `dbError`, `DbError`, `createSupabaseServerClient` (Task 5); `requireAdmin` (Task 6); generated `Tables`, `TablesUpdate`, `Json` (Task 4).
- Produces (from `@/modules/research`):
  - Consts and types: `ITEM_KINDS`, `VISIBILITIES`, `ITEM_STATUSES`, `HOLDS_POSITIONS`, `REVISION_AUTHORS`; `ItemKind`, `Visibility`, `ItemStatus`, `HoldsPosition`, `RevisionAuthor`.
  - `type Item = { id: string; kind: ItemKind; slug: string | null; title: string; companyId: string | null; themeId: string | null; visibility: Visibility; status: ItemStatus; currentRevisionId: string | null; publishedAt: string | null; dataAsOf: string | null; learningObjective: string | null; holdsPosition: HoldsPosition | null; createdAt: string; updatedAt: string }`
  - `type Revision = { id: string; itemId: string; revNo: number; bodyMd: string; structured: Record<string, unknown>; schemaVersion: number; changeReason: string | null; author: RevisionAuthor; createdAt: string }`
  - `type ItemWithHistory = { item: Item; revisions: Revision[] /* newest first */; current: Revision | null; pending: Revision[] /* newer than current, waiting for the gate */ }`, `type DiffLine = { op: "equal" | "add" | "remove"; text: string }`
  - `interface ResearchRepo { insertItem(row: NewItemRow): Promise<Item>; updateItem(id: string, patch: ItemPatch): Promise<Item>; insertRevision(row: NewRevisionRow): Promise<Revision>; getItem(id: string): Promise<Item | null>; listRevisions(itemId: string): Promise<Revision[]>; findThesisForCompany(companyId: string): Promise<Item | null>; listRecentItems(limit: number): Promise<Item[]> }`
  - Zod: `createItemInput`, `addRevisionInput`, `appendRevisionInput`, `updateItemMetaInput`; types `CreateItemInput`, `AddRevisionInput`, `AppendRevisionInput`, `UpdateItemMetaInput` (`z.input`).
  - `createItem(repo, input: CreateItemInput): Promise<{ item: Item; revision: Revision }>`, `addRevision(repo, input: AddRevisionInput): Promise<{ item: Item; revision: Revision; pendingGate: boolean }>`, `appendRevision(repo, input: AppendRevisionInput)` (same result), `getItemWithHistory(repo, itemId: string): Promise<ItemWithHistory | null>`, `updateItemMeta(repo, itemId: string, patch: UpdateItemMetaInput): Promise<Item>`, `listRecentItems(repo, limit?: number): Promise<Item[]>`, `diffRevisions(older: string, newer: string): DiffLine[]`, `createSupabaseResearchRepo(db: Db): ResearchRepo`, `ItemNotFoundError`, `PublicItemLockedError`.
  - From `@/modules/research/actions`: `createItemAction(formData)`, `updateItemMetaAction(itemId, formData)`, `addRevisionAction(itemId, formData)`, all `Promise<void>` (redirect with `?error=` on failure).
  - From `src/test/fakes/research-repo.ts`: `createMemoryResearchRepo(): MemoryResearchRepo` (adds `items: Map`, `revisions: Revision[]`, `setVisibility(id, visibility)`).

- [ ] **Step 1: Schema, types and errors** (no behaviour yet). `src/modules/research/schema.ts`:

```ts
import { z } from "zod";

export const ITEM_KINDS = ["note", "thesis", "learning", "case_study", "process"] as const;
export const VISIBILITIES = ["private", "clients", "public"] as const;
export const ITEM_STATUSES = ["draft", "published", "archived"] as const;
export const HOLDS_POSITIONS = ["yes", "no", "not_disclosed"] as const;
export const REVISION_AUTHORS = ["aksh", "system"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type HoldsPosition = (typeof HOLDS_POSITIONS)[number];
export type RevisionAuthor = (typeof REVISION_AUTHORS)[number];

const structured = z.record(z.string(), z.unknown());
const slug = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug: use lowercase letters, digits and single hyphens");

export const createItemInput = z.object({
  kind: z.enum(ITEM_KINDS),
  title: z.string().trim().min(1, "Title is required").max(200),
  bodyMd: z.string().max(200_000).default(""),
  companyId: z.guid().nullable().default(null),
  themeId: z.guid().nullable().default(null),
  learningObjective: z.string().trim().min(1).max(300).nullable().default(null),
  structured: structured.default({}),
  author: z.enum(REVISION_AUTHORS).default("aksh"),
});
export type CreateItemInput = z.input<typeof createItemInput>;

export const addRevisionInput = z.object({
  itemId: z.guid(),
  bodyMd: z.string().max(200_000),
  structured: structured.default({}),
  changeReason: z.string().trim().max(300).nullable().default(null),
  author: z.enum(REVISION_AUTHORS).default("aksh"),
});
export type AddRevisionInput = z.input<typeof addRevisionInput>;

export const appendRevisionInput = z.object({
  itemId: z.guid(),
  appendMd: z.string().trim().min(1, "Nothing to append").max(20_000),
  changeReason: z.string().trim().max(300).nullable().default(null),
  author: z.enum(REVISION_AUTHORS).default("aksh"),
});
export type AppendRevisionInput = z.input<typeof appendRevisionInput>;

export const updateItemMetaInput = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    slug: slug.nullable(),
    kind: z.enum(ITEM_KINDS),
    learningObjective: z.string().trim().min(1).max(300).nullable(),
    dataAsOf: z.iso.date().nullable(),
    holdsPosition: z.enum(HOLDS_POSITIONS).nullable(),
  })
  .partial();
export type UpdateItemMetaInput = z.input<typeof updateItemMetaInput>;
```

`src/modules/research/types.ts`:

```ts
import type { HoldsPosition, ItemKind, ItemStatus, RevisionAuthor, Visibility } from "./schema";

export type Item = {
  id: string;
  kind: ItemKind;
  slug: string | null;
  title: string;
  companyId: string | null;
  themeId: string | null;
  visibility: Visibility;
  status: ItemStatus;
  currentRevisionId: string | null;
  publishedAt: string | null;
  dataAsOf: string | null;
  learningObjective: string | null;
  holdsPosition: HoldsPosition | null;
  createdAt: string;
  updatedAt: string;
};

export type Revision = {
  id: string;
  itemId: string;
  revNo: number;
  bodyMd: string;
  structured: Record<string, unknown>;
  schemaVersion: number;
  changeReason: string | null;
  author: RevisionAuthor;
  createdAt: string;
};

/** revisions: newest first. pending: revisions newer than current (only on public items). */
export type ItemWithHistory = { item: Item; revisions: Revision[]; current: Revision | null; pending: Revision[] };
export type DiffLine = { op: "equal" | "add" | "remove"; text: string };

export type NewItemRow = {
  kind: ItemKind;
  title: string;
  companyId: string | null;
  themeId: string | null;
  learningObjective: string | null;
};
export type NewRevisionRow = {
  itemId: string;
  bodyMd: string;
  structured: Record<string, unknown>;
  changeReason: string | null;
  author: RevisionAuthor;
};
export type ItemPatch = Partial<
  Pick<
    Item,
    "title" | "slug" | "kind" | "companyId" | "themeId" | "learningObjective" | "dataAsOf" | "holdsPosition" | "currentRevisionId"
  >
>;

/** Storage port. rev_no is assigned by the database (trigger), never by callers. */
export interface ResearchRepo {
  insertItem(row: NewItemRow): Promise<Item>;
  updateItem(id: string, patch: ItemPatch): Promise<Item>;
  insertRevision(row: NewRevisionRow): Promise<Revision>;
  getItem(id: string): Promise<Item | null>;
  listRevisions(itemId: string): Promise<Revision[]>;
  findThesisForCompany(companyId: string): Promise<Item | null>;
  listRecentItems(limit: number): Promise<Item[]>;
}
```

`src/modules/research/errors.ts`:

```ts
export class ItemNotFoundError extends Error {
  readonly code = "ITEM_NOT_FOUND";
  constructor(readonly itemId: string) {
    super(`Item ${itemId} not found`);
    this.name = "ItemNotFoundError";
  }
}

/** Mirrors the SQL guard (decision D10) so Aksh gets a plain-English message first. */
export class PublicItemLockedError extends Error {
  readonly code = "PUBLIC_ITEM_LOCKED";
  constructor(readonly itemId: string) {
    super("This item is public. Unpublish it before changing its details.");
    this.name = "PublicItemLockedError";
  }
}
```

- [ ] **Step 2: The in-memory fake** `src/test/fakes/research-repo.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { Item, ResearchRepo, Revision, Visibility } from "@/modules/research";

export type MemoryResearchRepo = ResearchRepo & {
  items: Map<string, Item>;
  revisions: Revision[];
  setVisibility(id: string, visibility: Visibility): void;
};

export function createMemoryResearchRepo(): MemoryResearchRepo {
  const items = new Map<string, Item>();
  const revisions: Revision[] = [];
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 9, 4, 0, 0, tick++)).toISOString();

  return {
    items,
    revisions,
    setVisibility(id, visibility) {
      const item = items.get(id);
      if (!item) throw new Error(`no item ${id}`);
      items.set(id, { ...item, visibility, status: visibility === "public" ? "published" : item.status });
    },
    async insertItem(row) {
      const ts = now();
      const item: Item = {
        id: randomUUID(),
        kind: row.kind,
        slug: null,
        title: row.title,
        companyId: row.companyId,
        themeId: row.themeId,
        visibility: "private",
        status: "draft",
        currentRevisionId: null,
        publishedAt: null,
        dataAsOf: null,
        learningObjective: row.learningObjective,
        holdsPosition: null,
        createdAt: ts,
        updatedAt: ts,
      };
      items.set(item.id, item);
      return item;
    },
    async updateItem(id, patch) {
      const item = items.get(id);
      if (!item) throw new Error(`no item ${id}`);
      const next = { ...item, ...patch, updatedAt: now() };
      items.set(id, next);
      return next;
    },
    async insertRevision(row) {
      const revision: Revision = {
        id: randomUUID(),
        itemId: row.itemId,
        revNo: revisions.filter((r) => r.itemId === row.itemId).length + 1,
        bodyMd: row.bodyMd,
        structured: row.structured,
        schemaVersion: 1,
        changeReason: row.changeReason,
        author: row.author,
        createdAt: now(),
      };
      revisions.push(revision);
      return revision;
    },
    async getItem(id) {
      return items.get(id) ?? null;
    },
    async listRevisions(itemId) {
      return revisions.filter((r) => r.itemId === itemId).sort((a, b) => b.revNo - a.revNo);
    },
    async findThesisForCompany(companyId) {
      const theses = [...items.values()]
        .filter((i) => i.kind === "thesis" && i.companyId === companyId && i.status !== "archived")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return theses[0] ?? null;
    },
    async listRecentItems(limit) {
      return [...items.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
    },
  };
}
```

- [ ] **Step 3: Write the failing tests.** `src/modules/research/diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { diffRevisions } from "./diff";

describe("diffRevisions", () => {
  it("marks unchanged, removed and added lines", () => {
    expect(diffRevisions("a\nb\nc", "a\nc\nd")).toEqual([
      { op: "equal", text: "a" },
      { op: "remove", text: "b" },
      { op: "equal", text: "c" },
      { op: "add", text: "d" },
    ]);
  });

  it("treats empty text as no lines", () => {
    expect(diffRevisions("", "x")).toEqual([{ op: "add", text: "x" }]);
    expect(diffRevisions("x", "")).toEqual([{ op: "remove", text: "x" }]);
  });

  it("returns only equal lines for identical text", () => {
    expect(diffRevisions("a\nb", "a\nb").every((line) => line.op === "equal")).toBe(true);
  });

  it("falls back to remove-all then add-all beyond the size cap", () => {
    const older = Array.from({ length: 2100 }, (_, i) => `a${i}`).join("\n");
    const newer = Array.from({ length: 2100 }, (_, i) => `b${i}`).join("\n");
    const lines = diffRevisions(older, newer);
    expect(lines).toHaveLength(4200);
    expect(lines[0]).toEqual({ op: "remove", text: "a0" });
    expect(lines[4199]).toEqual({ op: "add", text: "b2099" });
  });
});
```

`src/modules/research/service.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryResearchRepo } from "@/test/fakes/research-repo";
import { ItemNotFoundError, PublicItemLockedError } from "./errors";
import { addRevision, appendRevision, createItem, getItemWithHistory, updateItemMeta } from "./service";

describe("createItem", () => {
  it("creates a private draft whose first revision is current", async () => {
    const repo = createMemoryResearchRepo();
    const { item, revision } = await createItem(repo, { kind: "learning", title: "  How capex cycles turn ", bodyMd: "v1" });
    expect(item).toMatchObject({
      title: "How capex cycles turn",
      visibility: "private",
      status: "draft",
      currentRevisionId: revision.id,
    });
    expect(revision).toMatchObject({ revNo: 1, bodyMd: "v1", changeReason: "created", author: "aksh" });
  });

  it("rejects an empty title", async () => {
    await expect(createItem(createMemoryResearchRepo(), { kind: "note", title: "   " })).rejects.toThrow(/Title is required/);
  });
});

describe("addRevision", () => {
  it("advances the current revision of a private item", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "note", title: "T", bodyMd: "v1" });
    const result = await addRevision(repo, { itemId: item.id, bodyMd: "v2", changeReason: "sharper" });
    expect(result.pendingGate).toBe(false);
    expect(result.revision.revNo).toBe(2);
    expect(result.item.currentRevisionId).toBe(result.revision.id);
  });

  it("stores a revision on a public item but leaves it waiting for the gate", async () => {
    const repo = createMemoryResearchRepo();
    const { item, revision: first } = await createItem(repo, { kind: "learning", title: "T", bodyMd: "v1" });
    repo.setVisibility(item.id, "public");
    const result = await addRevision(repo, { itemId: item.id, bodyMd: "v2", changeReason: "update" });
    expect(result.pendingGate).toBe(true);
    expect(result.revision.revNo).toBe(2);
    expect(repo.items.get(item.id)?.currentRevisionId).toBe(first.id);
  });

  it("throws for an unknown item", async () => {
    await expect(addRevision(createMemoryResearchRepo(), { itemId: randomUUID(), bodyMd: "x" })).rejects.toBeInstanceOf(
      ItemNotFoundError,
    );
  });
});

describe("appendRevision", () => {
  it("appends to the latest body after a blank line (decision D7)", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "thesis", title: "TCS thesis", bodyMd: "v1\n" });
    const { revision } = await appendRevision(repo, { itemId: item.id, appendMd: "Deal wins slowing", changeReason: "Deal wins slowing" });
    expect(revision.bodyMd).toBe("v1\n\nDeal wins slowing");
    expect(revision.changeReason).toBe("Deal wins slowing");
  });

  it("uses the new text alone when the latest body is empty", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "thesis", title: "T" });
    const { revision } = await appendRevision(repo, { itemId: item.id, appendMd: "first line" });
    expect(revision.bodyMd).toBe("first line");
  });
});

describe("getItemWithHistory", () => {
  it("lists revisions newest first and separates revisions waiting for the gate", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T", bodyMd: "v1" });
    repo.setVisibility(item.id, "public");
    await addRevision(repo, { itemId: item.id, bodyMd: "v2" });
    await addRevision(repo, { itemId: item.id, bodyMd: "v3" });
    const history = await getItemWithHistory(repo, item.id);
    expect(history?.revisions.map((r) => r.revNo)).toEqual([3, 2, 1]);
    expect(history?.current?.revNo).toBe(1);
    expect(history?.pending.map((r) => r.revNo)).toEqual([3, 2]);
  });

  it("returns null for an unknown item", async () => {
    await expect(getItemWithHistory(createMemoryResearchRepo(), randomUUID())).resolves.toBeNull();
  });
});

describe("updateItemMeta", () => {
  it("updates the details of a private item", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T" });
    const updated = await updateItemMeta(repo, item.id, {
      learningObjective: "Recognise a capex peak.",
      dataAsOf: "2026-08-01",
      holdsPosition: "no",
      slug: "capex-peak",
    });
    expect(updated).toMatchObject({ learningObjective: "Recognise a capex peak.", dataAsOf: "2026-08-01", holdsPosition: "no", slug: "capex-peak" });
  });

  it("refuses to change a public item (decision D10)", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T" });
    repo.setVisibility(item.id, "public");
    await expect(updateItemMeta(repo, item.id, { title: "New" })).rejects.toBeInstanceOf(PublicItemLockedError);
  });

  it("rejects a malformed slug", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T" });
    await expect(updateItemMeta(repo, item.id, { slug: "Bad Slug" })).rejects.toThrow(/Slug/);
  });
});
```

- [ ] **Step 4: Run them to make sure they fail**

Run: `pnpm test src/modules/research`
Expected: FAIL with `Failed to resolve import "./diff"` and `"./service"`.

- [ ] **Step 5: Implement the diff** `src/modules/research/diff.ts`:

```ts
import type { DiffLine } from "./types";

const MAX_CELLS = 4_000_000; // keeps the LCS table well under 50 MB

function toLines(text: string): string[] {
  return text === "" ? [] : text.split("\n");
}

/** Line diff (longest common subsequence) between two revision bodies. */
export function diffRevisions(older: string, newer: string): DiffLine[] {
  const a = toLines(older);
  const b = toLines(newer);
  if (a.length * b.length > MAX_CELLS) {
    return [
      ...a.map((text): DiffLine => ({ op: "remove", text })),
      ...b.map((text): DiffLine => ({ op: "add", text })),
    ];
  }
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "equal", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: "remove", text: a[i] });
      i++;
    } else {
      out.push({ op: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ op: "remove", text: a[i++] });
  while (j < m) out.push({ op: "add", text: b[j++] });
  return out;
}
```

- [ ] **Step 6: Implement the service** `src/modules/research/service.ts`:

```ts
import { ItemNotFoundError, PublicItemLockedError } from "./errors";
import {
  addRevisionInput,
  appendRevisionInput,
  createItemInput,
  updateItemMetaInput,
  type AddRevisionInput,
  type AppendRevisionInput,
  type CreateItemInput,
  type UpdateItemMetaInput,
} from "./schema";
import type { Item, ItemWithHistory, ResearchRepo, Revision } from "./types";

type RevisionResult = { item: Item; revision: Revision; pendingGate: boolean };

/** New items are private drafts (publishing-rules: default private). */
export async function createItem(repo: ResearchRepo, input: CreateItemInput): Promise<{ item: Item; revision: Revision }> {
  const data = createItemInput.parse(input);
  const draft = await repo.insertItem({
    kind: data.kind,
    title: data.title,
    companyId: data.companyId,
    themeId: data.themeId,
    learningObjective: data.learningObjective,
  });
  const revision = await repo.insertRevision({
    itemId: draft.id,
    bodyMd: data.bodyMd,
    structured: data.structured,
    changeReason: "created",
    author: data.author,
  });
  const item = await repo.updateItem(draft.id, { currentRevisionId: revision.id });
  return { item, revision };
}

/** Revisions are append-only. On a public item the new revision waits for publish_revision(). */
export async function addRevision(repo: ResearchRepo, input: AddRevisionInput): Promise<RevisionResult> {
  const data = addRevisionInput.parse(input);
  const existing = await repo.getItem(data.itemId);
  if (!existing) throw new ItemNotFoundError(data.itemId);
  const revision = await repo.insertRevision({
    itemId: existing.id,
    bodyMd: data.bodyMd,
    structured: data.structured,
    changeReason: data.changeReason,
    author: data.author,
  });
  if (existing.visibility === "public") return { item: existing, revision, pendingGate: true };
  const item = await repo.updateItem(existing.id, { currentRevisionId: revision.id });
  return { item, revision, pendingGate: false };
}

/** Appends text to the latest revision (decision D7: a capture adds to a thesis, never replaces it). */
export async function appendRevision(repo: ResearchRepo, input: AppendRevisionInput): Promise<RevisionResult> {
  const data = appendRevisionInput.parse(input);
  const history = await getItemWithHistory(repo, data.itemId);
  if (!history) throw new ItemNotFoundError(data.itemId);
  const latest = history.revisions[0] ?? null;
  const base = latest ? latest.bodyMd.trimEnd() : "";
  return addRevision(repo, {
    itemId: data.itemId,
    bodyMd: base === "" ? data.appendMd : `${base}\n\n${data.appendMd}`,
    structured: latest?.structured ?? {},
    changeReason: data.changeReason,
    author: data.author,
  });
}

export async function getItemWithHistory(repo: ResearchRepo, itemId: string): Promise<ItemWithHistory | null> {
  const item = await repo.getItem(itemId);
  if (!item) return null;
  const revisions = await repo.listRevisions(itemId);
  const current = revisions.find((r) => r.id === item.currentRevisionId) ?? null;
  const pending = current ? revisions.filter((r) => r.revNo > current.revNo) : [];
  return { item, revisions, current, pending };
}

/** Details of a public item are frozen (decision D10); the DB guard enforces the same rule. */
export async function updateItemMeta(repo: ResearchRepo, itemId: string, patch: UpdateItemMetaInput): Promise<Item> {
  const data = updateItemMetaInput.parse(patch);
  const existing = await repo.getItem(itemId);
  if (!existing) throw new ItemNotFoundError(itemId);
  if (existing.visibility === "public") throw new PublicItemLockedError(itemId);
  return repo.updateItem(itemId, data);
}

export async function listRecentItems(repo: ResearchRepo, limit = 100): Promise<Item[]> {
  return repo.listRecentItems(limit);
}
```

- [ ] **Step 7: Run the tests to make sure they pass**

Run: `pnpm test src/modules/research`
Expected: PASS (diff 4, service 12).

- [ ] **Step 8: The Supabase adapter and the module index.** `src/modules/research/repo.ts`:

```ts
import type { Json, Tables, TablesUpdate } from "@/lib/supabase/database.types";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { HoldsPosition, ItemKind, ItemStatus, RevisionAuthor, Visibility } from "./schema";
import type { Item, ItemPatch, ResearchRepo, Revision } from "./types";

const ITEM_COLUMNS =
  "id, kind, slug, title, company_id, theme_id, visibility, status, current_revision_id, published_at, data_as_of, learning_objective, holds_position, created_at, updated_at";
const REVISION_COLUMNS = "id, item_id, rev_no, body_md, structured, schema_version, change_reason, author, created_at";

type ItemRow = Omit<Tables<"items">, "search">;
type RevisionRow = Tables<"item_revisions">;

function asRecord(value: Json): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    kind: row.kind as ItemKind,
    slug: row.slug,
    title: row.title,
    companyId: row.company_id,
    themeId: row.theme_id,
    visibility: row.visibility as Visibility,
    status: row.status as ItemStatus,
    currentRevisionId: row.current_revision_id,
    publishedAt: row.published_at,
    dataAsOf: row.data_as_of,
    learningObjective: row.learning_objective,
    holdsPosition: row.holds_position as HoldsPosition | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRevision(row: RevisionRow): Revision {
  return {
    id: row.id,
    itemId: row.item_id,
    revNo: row.rev_no,
    bodyMd: row.body_md,
    structured: asRecord(row.structured),
    schemaVersion: row.schema_version,
    changeReason: row.change_reason,
    author: row.author as RevisionAuthor,
    createdAt: row.created_at,
  };
}

function toItemUpdate(patch: ItemPatch): TablesUpdate<"items"> {
  const out: TablesUpdate<"items"> = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.slug !== undefined) out.slug = patch.slug;
  if (patch.kind !== undefined) out.kind = patch.kind;
  if (patch.companyId !== undefined) out.company_id = patch.companyId;
  if (patch.themeId !== undefined) out.theme_id = patch.themeId;
  if (patch.learningObjective !== undefined) out.learning_objective = patch.learningObjective;
  if (patch.dataAsOf !== undefined) out.data_as_of = patch.dataAsOf;
  if (patch.holdsPosition !== undefined) out.holds_position = patch.holdsPosition;
  if (patch.currentRevisionId !== undefined) out.current_revision_id = patch.currentRevisionId;
  return out;
}

export function createSupabaseResearchRepo(db: Db): ResearchRepo {
  return {
    async insertItem(row) {
      const { data, error } = await db
        .from("items")
        .insert({
          kind: row.kind,
          title: row.title,
          company_id: row.companyId,
          theme_id: row.themeId,
          learning_objective: row.learningObjective,
        })
        .select(ITEM_COLUMNS)
        .single();
      if (error) throw dbError("research.insertItem", error);
      return toItem(data);
    },
    async updateItem(id, patch) {
      const { data, error } = await db.from("items").update(toItemUpdate(patch)).eq("id", id).select(ITEM_COLUMNS).single();
      if (error) throw dbError("research.updateItem", error);
      return toItem(data);
    },
    async insertRevision(row) {
      const { data, error } = await db
        .from("item_revisions")
        .insert({
          item_id: row.itemId,
          body_md: row.bodyMd,
          structured: row.structured as Json,
          change_reason: row.changeReason,
          author: row.author,
        })
        .select(REVISION_COLUMNS)
        .single();
      if (error) throw dbError("research.insertRevision", error);
      return toRevision(data);
    },
    async getItem(id) {
      const { data, error } = await db.from("items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw dbError("research.getItem", error);
      return data ? toItem(data) : null;
    },
    async listRevisions(itemId) {
      const { data, error } = await db
        .from("item_revisions")
        .select(REVISION_COLUMNS)
        .eq("item_id", itemId)
        .order("rev_no", { ascending: false });
      if (error) throw dbError("research.listRevisions", error);
      return data.map(toRevision);
    },
    async findThesisForCompany(companyId) {
      const { data, error } = await db
        .from("items")
        .select(ITEM_COLUMNS)
        .eq("kind", "thesis")
        .eq("company_id", companyId)
        .neq("status", "archived")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw dbError("research.findThesisForCompany", error);
      return data ? toItem(data) : null;
    },
    async listRecentItems(limit) {
      const { data, error } = await db
        .from("items")
        .select(ITEM_COLUMNS)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw dbError("research.listRecentItems", error);
      return data.map(toItem);
    },
  };
}
```

`src/modules/research/index.ts`:

```ts
export {
  addRevisionInput,
  appendRevisionInput,
  createItemInput,
  updateItemMetaInput,
  HOLDS_POSITIONS,
  ITEM_KINDS,
  ITEM_STATUSES,
  REVISION_AUTHORS,
  VISIBILITIES,
  type AddRevisionInput,
  type AppendRevisionInput,
  type CreateItemInput,
  type HoldsPosition,
  type ItemKind,
  type ItemStatus,
  type RevisionAuthor,
  type UpdateItemMetaInput,
  type Visibility,
} from "./schema";
export type { DiffLine, Item, ItemPatch, ItemWithHistory, NewItemRow, NewRevisionRow, ResearchRepo, Revision } from "./types";
export { ItemNotFoundError, PublicItemLockedError } from "./errors";
export { diffRevisions } from "./diff";
export { createSupabaseResearchRepo } from "./repo";
export { addRevision, appendRevision, createItem, getItemWithHistory, listRecentItems, updateItemMeta } from "./service";
```

- [ ] **Step 9: Server actions** `src/modules/research/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { DbError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { ItemNotFoundError, PublicItemLockedError } from "./errors";
import { createSupabaseResearchRepo } from "./repo";
import { addRevisionInput, createItemInput, updateItemMetaInput } from "./schema";
import { addRevision, createItem, updateItemMeta } from "./service";

function field(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function message(error: unknown): string {
  if (error instanceof ZodError) return error.issues.map((issue) => issue.message).join("; ");
  if (error instanceof PublicItemLockedError || error instanceof ItemNotFoundError) return error.message;
  if (error instanceof DbError) return error.message;
  return "Could not save. Try again.";
}

const withError = (path: string, error: unknown) => `${path}?error=${encodeURIComponent(message(error))}`;

async function repo() {
  return createSupabaseResearchRepo(await createSupabaseServerClient());
}

export async function createItemAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = createItemInput.safeParse({ kind: field(formData, "kind"), title: field(formData, "title") ?? "" });
  if (!parsed.success) redirect(withError("/desk/items", parsed.error));
  let itemId: string;
  try {
    itemId = (await createItem(await repo(), parsed.data)).item.id;
  } catch (error) {
    redirect(withError("/desk/items", error));
  }
  revalidatePath("/desk/items");
  redirect(`/desk/items/${itemId}`);
}

export async function updateItemMetaAction(itemId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const back = `/desk/items/${itemId}`;
  const parsed = updateItemMetaInput.safeParse({
    title: field(formData, "title") ?? "",
    slug: field(formData, "slug"),
    learningObjective: field(formData, "learningObjective"),
    dataAsOf: field(formData, "dataAsOf"),
    holdsPosition: field(formData, "holdsPosition"),
  });
  if (!parsed.success) redirect(withError(back, parsed.error));
  try {
    await updateItemMeta(await repo(), itemId, parsed.data);
  } catch (error) {
    redirect(withError(back, error));
  }
  revalidatePath(back);
  redirect(back);
}

export async function addRevisionAction(itemId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const back = `/desk/items/${itemId}`;
  const body = formData.get("bodyMd");
  const parsed = addRevisionInput.safeParse({
    itemId,
    bodyMd: typeof body === "string" ? body : "",
    changeReason: field(formData, "changeReason"),
  });
  if (!parsed.success) redirect(withError(back, parsed.error));
  try {
    await addRevision(await repo(), parsed.data);
  } catch (error) {
    redirect(withError(back, error));
  }
  revalidatePath(back);
  redirect(back);
}
```

- [ ] **Step 10: Desk item screens.** `src/app/desk/items/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { createSupabaseResearchRepo, ITEM_KINDS, listRecentItems } from "@/modules/research";
import { createItemAction } from "@/modules/research/actions";

export default async function ItemsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { error } = await searchParams;
  const items = await listRecentItems(createSupabaseResearchRepo(await createSupabaseServerClient()));
  return (
    <div className="space-y-6">
      <form action={createItemAction} className="flex flex-wrap items-end gap-2 rounded border p-3">
        <div className="space-y-1">
          <Label htmlFor="kind">Kind</Label>
          <select id="kind" name="kind" defaultValue="note" className="h-9 rounded-md border bg-transparent px-2 text-sm">
            {ITEM_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required />
        </div>
        <Button type="submit">Create item</Button>
      </form>
      {error ? (
        <p role="alert" className="rounded border border-red-600 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <ul className="divide-y text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 py-2">
            <Link href={`/desk/items/${item.id}`} className="underline">
              {item.title}
            </Link>
            <span className="text-muted-foreground">
              {item.kind.replace("_", " ")} · {item.visibility}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`src/app/desk/items/[id]/meta-form.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Item } from "@/modules/research";
import { updateItemMetaAction } from "@/modules/research/actions";

export function MetaForm({ item }: { item: Item }) {
  const locked = item.visibility === "public";
  return (
    <form key={item.updatedAt} action={updateItemMetaAction.bind(null, item.id)} className="space-y-3 rounded border p-3">
      <h2 className="text-sm font-medium">Details</h2>
      {locked ? (
        <p className="text-sm text-muted-foreground">
          This item is public. Unpublish it to change these details; body changes go through a new revision and the gate.
        </p>
      ) : null}
      <fieldset disabled={locked} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" defaultValue={item.title} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="slug">Slug</Label>
          <Input id="slug" name="slug" defaultValue={item.slug ?? ""} placeholder="set automatically on first publish" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="learningObjective">Learning objective</Label>
          <Textarea id="learningObjective" name="learningObjective" defaultValue={item.learningObjective ?? ""} rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="holdsPosition">Holds position</Label>
            <select
              id="holdsPosition"
              name="holdsPosition"
              defaultValue={item.holdsPosition ?? ""}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
            >
              <option value="">Not set</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="not_disclosed">Not disclosed</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dataAsOf">Data as of</Label>
            <Input id="dataAsOf" name="dataAsOf" type="date" defaultValue={item.dataAsOf ?? ""} />
          </div>
        </div>
        <Button type="submit" size="sm">
          Save details
        </Button>
      </fieldset>
    </form>
  );
}
```

`src/app/desk/items/[id]/revision-form.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Revision } from "@/modules/research";
import { addRevisionAction } from "@/modules/research/actions";

export function RevisionForm({ itemId, latest }: { itemId: string; latest: Revision | null }) {
  return (
    <form key={latest?.id ?? "none"} action={addRevisionAction.bind(null, itemId)} className="space-y-3 rounded border p-3">
      <h2 className="text-sm font-medium">New revision</h2>
      <div className="space-y-1">
        <Label htmlFor="bodyMd">Body (Markdown)</Label>
        <Textarea id="bodyMd" name="bodyMd" defaultValue={latest?.bodyMd ?? ""} rows={12} className="font-mono text-sm" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="changeReason">Change reason</Label>
        <Input id="changeReason" name="changeReason" placeholder="What changed and why" />
      </div>
      <Button type="submit" size="sm">
        Save revision
      </Button>
    </form>
  );
}
```

`src/app/desk/items/[id]/history.tsx`:

```tsx
import Link from "next/link";
import { diffRevisions, type Revision } from "@/modules/research";

type Props = { revisions: Revision[]; currentId: string | null; from?: string; to?: string };

const LINE_STYLE = {
  add: "bg-green-100 dark:bg-green-950",
  remove: "bg-red-100 line-through dark:bg-red-950",
  equal: "",
} as const;
const LINE_MARK = { add: "+ ", remove: "- ", equal: "  " } as const;

export function History({ revisions, currentId, from, to }: Props) {
  if (revisions.length === 0) return null;
  const newer = revisions.find((r) => String(r.revNo) === to) ?? revisions[0];
  const older = revisions.find((r) => String(r.revNo) === from) ?? revisions.find((r) => r.revNo === newer.revNo - 1) ?? null;
  const lines = older ? diffRevisions(older.bodyMd, newer.bodyMd) : [];
  return (
    <section className="space-y-3 rounded border p-3">
      <h2 className="text-sm font-medium">Revision history</h2>
      <ol className="space-y-1 text-sm">
        {revisions.map((r) => (
          <li key={r.id} className="flex flex-wrap gap-x-2">
            <span className="font-mono">#{r.revNo}</span>
            <span>{r.createdAt.slice(0, 10)}</span>
            <span className="text-muted-foreground">{r.changeReason ?? "no reason given"}</span>
            {r.id === currentId ? <span className="font-medium">current</span> : null}
            {r.revNo > 1 ? (
              <Link className="underline" href={`?from=${r.revNo - 1}&to=${r.revNo}`}>
                diff
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
      {older ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            Changes from #{older.revNo} to #{newer.revNo}
          </p>
          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
            {lines.map((line, index) => (
              <div key={index} className={LINE_STYLE[line.op]}>
                {LINE_MARK[line.op]}
                {line.text}
              </div>
            ))}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
```

`src/app/desk/items/[id]/page.tsx` (Task 9 adds the gate panel):

```tsx
import { notFound } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { createSupabaseResearchRepo, getItemWithHistory } from "@/modules/research";
import { History } from "./history";
import { MetaForm } from "./meta-form";
import { RevisionForm } from "./revision-form";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; from?: string; to?: string }>;
};

export default async function ItemPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { id } = await params;
  const { error, from, to } = await searchParams;
  if (!z.guid().safeParse(id).success) notFound();
  const history = await getItemWithHistory(createSupabaseResearchRepo(await createSupabaseServerClient()), id);
  if (!history) notFound();
  const { item, revisions, current, pending } = history;
  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{item.title}</h1>
        <p className="text-sm text-muted-foreground">
          {item.kind.replace("_", " ")} · <span data-testid="visibility">{item.visibility === "public" ? "Public" : "Private"}</span>
          {pending.length > 0 ? ` · ${pending.length} revision(s) waiting for the gate` : ""}
        </p>
      </header>
      {error ? (
        <p role="alert" className="rounded border border-red-600 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <MetaForm item={item} />
      <RevisionForm itemId={item.id} latest={revisions[0] ?? null} />
      <History revisions={revisions} currentId={current?.id ?? null} from={from} to={to} />
    </article>
  );
}
```

- [ ] **Step 11: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all green. Then with `pnpm dev` and the admin signed in: create a learning item at `/desk/items`, save details, save two revisions, open "diff" and see red/green lines.

- [ ] **Step 12: Commit**

```bash
git add src/modules/research src/test/fakes/research-repo.ts src/app/desk/items
git commit -m "feat(research): items with append-only revisions, line diff, desk item screens" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `compliance` lint - lexicon, sentence allowances, adversarial tests (progress 1.6, part 1)

**Files:**
- Create: `src/lib/dates.ts`, `src/modules/compliance/{policy,lexicon,sentences,lint}.ts`
- Test: `src/lib/dates.test.ts`, `src/modules/compliance/sentences.test.ts`, `src/modules/compliance/lint.test.ts`

**Interfaces:**
- Consumes: `ItemKind`, `HoldsPosition` types from `@/modules/research` (Task 7).
- Produces:
  - `src/lib/dates.ts`: `istDate(at: Date | string): string` (`YYYY-MM-DD` in Asia/Kolkata), `addDays(isoDate: string, days: number): string`, `istDayStartUtc(isoDate: string): string` (ISO timestamp of 00:00 IST).
  - `POLICY_VERSION = "sebi-unreg-2026-07"`, `RULE_TITLES: Record<string, string>`.
  - `splitSentences(text: string): string[]`, `normaliseSentence(sentence: string): string`, `sentenceHash(sentence: string): string` (sha256 hex of the normalised sentence; the `lint_allowances.sentence_hash` value).
  - `LINT_FIELDS = ["title", "slug", "learningObjective", "body", "structured"] as const`, `type LintField`, `type LintRule = "1" | "2" | "3" | "5" | "6" | "structure"`.
  - `type LintInput = { kind: ItemKind; title: string; slug: string | null; learningObjective: string | null; bodyMd: string; structured: Record<string, unknown>; companyId: string | null; holdsPosition: HoldsPosition | null; dataAsOf: string | null; today: string; allowances: ReadonlySet<string> }`.
  - `type LintFinding = { rule: LintRule; field: LintField | null; sentence: string | null; sentenceHash: string | null; match: string | null; message: string }`, `type LintAllowed = { rule: "1" | "2"; field: LintField; sentence: string; sentenceHash: string; match: string }`, `type LintResult = { passed: boolean; policyVersion: string; findings: LintFinding[]; allowedBy: LintAllowed[] }`.
  - `lintText(input: LintInput): LintResult`. Allowances apply only to rules 1 and 2 (publishing-rules: never to 3, 4 or 9). Quotes in `structured.sources[i].quote` with a non-empty `url` are exempt from rules 1 and 2 (cited source text).

- [ ] **Step 1: Write the failing tests.** `src/lib/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addDays, istDate, istDayStartUtc } from "./dates";

describe("dates", () => {
  it("gives the calendar date in India", () => {
    expect(istDate("2026-10-04T19:00:00Z")).toBe("2026-10-05"); // 00:30 IST next day
    expect(istDate("2026-10-04T18:00:00Z")).toBe("2026-10-04"); // 23:30 IST
  });

  it("adds and subtracts days across month ends", () => {
    expect(addDays("2026-10-04", -30)).toBe("2026-09-04");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("returns midnight IST as a UTC timestamp", () => {
    expect(istDayStartUtc("2026-10-04")).toBe("2026-10-03T18:30:00.000Z");
  });
});
```

`src/modules/compliance/sentences.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normaliseSentence, sentenceHash, splitSentences } from "./sentences";

describe("splitSentences", () => {
  it("splits on sentence ends and line breaks and drops blanks", () => {
    expect(splitSentences("One. Two? Three!\n\n## Heading\nFour")).toEqual(["One.", "Two?", "Three!", "## Heading", "Four"]);
  });

  it("keeps numbers with commas and decimals inside one sentence", () => {
    expect(splitSentences("TP 2,400 in 1.5 years. Next.")).toEqual(["TP 2,400 in 1.5 years.", "Next."]);
  });
});

describe("sentenceHash", () => {
  it("is a 64-char hex digest of the normalised sentence", () => {
    expect(sentenceHash("Why I avoid target prices.")).toMatch(/^[0-9a-f]{64}$/);
    expect(sentenceHash("why i  avoid TARGET prices.")).toBe(sentenceHash("Why I avoid target prices."));
    expect(normaliseSentence("  A   B ")).toBe("a b");
  });
});
```

`src/modules/compliance/lint.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lintText, type LintInput } from "./lint";
import { POLICY_VERSION } from "./policy";
import { sentenceHash } from "./sentences";

const base: LintInput = {
  kind: "learning",
  title: "How capex cycles turn",
  slug: "how-capex-cycles-turn",
  learningObjective: "Recognise the late stage of a capex cycle.",
  bodyMd: "Capacity additions slowed after utilisation peaked.",
  structured: {},
  companyId: null,
  holdsPosition: null,
  dataAsOf: null,
  today: "2026-10-04",
  allowances: new Set<string>(),
};
const lint = (patch: Partial<LintInput>) => lintText({ ...base, ...patch });

describe("lintText: clean educational text", () => {
  it("passes and stamps the policy version", () => {
    expect(lint({})).toEqual({ passed: true, policyVersion: POLICY_VERSION, findings: [], allowedBy: [] });
  });

  it.each([
    "The buyback was funded from cash.",
    "Selling expenses rose faster than revenue.",
    "The promoter exited a joint venture in 2019.",
  ])("does not flag look-alike words: %s", (sentence) => {
    expect(lint({ bodyMd: sentence }).passed).toBe(true);
  });
});

describe("lintText: adversarial phrases (spec s10, publishing-rules rules 1-2)", () => {
  it.each([
    ["buy", "You should buy RELIANCE here.", "1"],
    ["sell", "Time to sell the cyclicals.", "1"],
    ["accumulate on dips", "Accumulate on dips below the 200 DMA.", "1"],
    ["add on dips", "Add on dips for the long term.", "1"],
    ["exit", "I would exit before results.", "1"],
    ["book profit", "Book profits at these levels.", "1"],
    ["target price", "My target price is 3000.", "1"],
    ["TP 2,400", "TP 2,400 in twelve months.", "1"],
    ["stop loss", "Keep a stop loss at 900.", "1"],
    ["SL", "SL 880 on a closing basis.", "1"],
    ["upside of", "There is an upside of 40 percent.", "1"],
    ["multibagger", "This is a multibagger in the making.", "1"],
    ["will rally", "Metals will rally next quarter.", "1"],
    ["will fall", "The stock will fall after results.", "1"],
    ["undervalued by X%", "The stock is undervalued by 25%.", "1"],
    ["returned 34%", "This idea returned 34% since January.", "2"],
    ["my calls", "My calls have been right all year.", "2"],
    ["hit rate", "My hit rate is 70 out of 100.", "2"],
    ["beat the Nifty", "Our ideas beat the Nifty.", "2"],
    ["CAGR of my ideas", "The CAGR of my ideas is high.", "2"],
  ])("flags %s", (_label, sentence, rule) => {
    const result = lint({ bodyMd: `Context first. ${sentence} More context.` });
    expect(result.passed).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ rule, field: "body", sentence }));
  });

  it("lints the whole public surface, not only the body (ADR-001 s8.3)", () => {
    expect(lint({ title: "Buy this bank" }).findings[0]).toMatchObject({ field: "title", rule: "1" });
    expect(lint({ slug: "why-to-buy-hdfc" }).findings[0]).toMatchObject({ field: "slug", rule: "1" });
    expect(lint({ learningObjective: "Learn when to sell." }).findings[0]).toMatchObject({ field: "learningObjective" });
    expect(lint({ structured: { notes: ["Accumulate slowly"] } }).findings[0]).toMatchObject({ field: "structured" });
  });
});

describe("lintText: allowances and cited quotes", () => {
  const sentence = "Why I avoid target prices.";

  it("flags an educational sentence until Aksh allows it", () => {
    const blocked = lint({ bodyMd: sentence });
    expect(blocked.passed).toBe(false);
    const allowed = lint({ bodyMd: sentence, allowances: new Set([sentenceHash(sentence)]) });
    expect(allowed.passed).toBe(true);
    expect(allowed.allowedBy).toEqual([
      { rule: "1", field: "body", sentence, sentenceHash: sentenceHash(sentence), match: "target prices" },
    ]);
  });

  it("exempts quoted source text that carries a citation URL", () => {
    const quote = { title: "Broker note", url: "https://example.com/note.pdf", quote: "We rate the stock a BUY with TP 2,400." };
    expect(lint({ structured: { sources: [quote] } }).passed).toBe(true);
    expect(lint({ structured: { sources: [{ ...quote, url: "" }] } }).passed).toBe(false);
  });

  it("never lets an allowance cover rule 3", () => {
    const priceSentence = "It was trading at 18x earnings.";
    const result = lint({
      companyId: "6f1c2a8e-5d7b-4c1e-9a3f-2b8d7e6c5a41",
      holdsPosition: "no",
      dataAsOf: "2026-09-20",
      bodyMd: priceSentence,
      allowances: new Set([sentenceHash(priceSentence)]),
    });
    expect(result.passed).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: "3", sentence: priceSentence }));
  });
});

describe("lintText: structural rules", () => {
  const companyId = "6f1c2a8e-5d7b-4c1e-9a3f-2b8d7e6c5a41";

  it("accepts price numbers once the data is at least 30 days old (rule 3)", () => {
    expect(lint({ companyId, holdsPosition: "no", dataAsOf: "2026-08-01", bodyMd: "It was trading at 18x earnings." }).passed).toBe(true);
  });

  it("requires a learning objective (rule 6)", () => {
    expect(lint({ learningObjective: "  " }).findings).toContainEqual(expect.objectContaining({ rule: "6" }));
  });

  it("requires holds_position when a company is named (rule 5)", () => {
    expect(lint({ companyId }).findings).toContainEqual(expect.objectContaining({ rule: "5" }));
  });

  it("requires a 'What would prove me wrong' section on theses (spec s6)", () => {
    expect(lint({ kind: "thesis" }).findings).toContainEqual(expect.objectContaining({ rule: "structure" }));
    expect(lint({ kind: "thesis", bodyMd: "View.\n\n## What would prove me wrong\nIf margins shrink." }).passed).toBe(true);
  });

  it("requires a case study to use data at least 30 days old (rule 3)", () => {
    expect(lint({ kind: "case_study", bodyMd: "## What would prove me wrong\nX.", dataAsOf: "2026-09-25" }).findings).toContainEqual(
      expect.objectContaining({ rule: "3", field: null }),
    );
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test src/lib/dates.test.ts src/modules/compliance`
Expected: FAIL with `Failed to resolve import "./dates"`, `"./sentences"`, `"./lint"`.

- [ ] **Step 3: Implement dates** `src/lib/dates.ts`:

```ts
const IST = "Asia/Kolkata";
const istFormat = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar date (YYYY-MM-DD) in India, where Aksh lives. */
export function istDate(at: Date | string): string {
  return istFormat.format(new Date(at));
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 00:00 IST on the given date, as a UTC ISO timestamp (for "since" queries). */
export function istDayStartUtc(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00+05:30`).toISOString();
}
```

- [ ] **Step 4: Implement policy, lexicon and sentences.** `src/modules/compliance/policy.ts`:

```ts
/** docs/compliance/publishing-rules.md v1. Bump only with a new rules document. */
export const POLICY_VERSION = "sebi-unreg-2026-07";

export const RULE_TITLES: Record<string, string> = {
  "1": "Rule 1: no actionable language",
  "2": "Rule 2: no performance claims",
  "3": "Rule 3: 30-day data lag",
  "5": "Rule 5: position disclosure",
  "6": "Rule 6: educational framing",
  structure: "Thesis structure",
  slug: "Slug",
  policy: "Policy version",
  lint: "Text lint",
};
```

`src/modules/compliance/lexicon.ts`:

```ts
// Publishing rules 1 and 2. Case-insensitive, word-boundary. False positives are the safe
// direction (ADR-001 s5); Aksh clears educational uses with a sentence allowance.
export type TextRule = "1" | "2";
export type LexiconEntry = { id: string; rule: TextRule; pattern: RegExp; message: string };

const ACTIONABLE = "Reads as a recommendation to act. Write what you expected and why instead.";
const PERFORMANCE = "Reads as a performance claim. Public pages may not show track records.";

export const LEXICON: readonly LexiconEntry[] = [
  { id: "buy", rule: "1", pattern: /\bbuy\b/i, message: ACTIONABLE },
  { id: "sell", rule: "1", pattern: /\bsell\b/i, message: ACTIONABLE },
  { id: "accumulate", rule: "1", pattern: /\baccumulate\b/i, message: ACTIONABLE },
  { id: "add-on-dips", rule: "1", pattern: /\badd on dips\b/i, message: ACTIONABLE },
  { id: "exit", rule: "1", pattern: /\bexit\b/i, message: ACTIONABLE },
  { id: "book-profit", rule: "1", pattern: /\bbook(?:ing)? profits?\b/i, message: ACTIONABLE },
  { id: "target-price", rule: "1", pattern: /\btarget prices?\b/i, message: ACTIONABLE },
  { id: "tp", rule: "1", pattern: /\btp\b/i, message: ACTIONABLE },
  { id: "stop-loss", rule: "1", pattern: /\bstop[- ]?loss(?:es)?\b/i, message: ACTIONABLE },
  { id: "sl", rule: "1", pattern: /\bsl\b/i, message: ACTIONABLE },
  { id: "upside-of", rule: "1", pattern: /\bupside of\b/i, message: ACTIONABLE },
  { id: "multibagger", rule: "1", pattern: /\bmulti-?baggers?\b/i, message: ACTIONABLE },
  { id: "will-rally", rule: "1", pattern: /\bwill rally\b/i, message: ACTIONABLE },
  { id: "will-fall", rule: "1", pattern: /\bwill fall\b/i, message: ACTIONABLE },
  { id: "undervalued-by", rule: "1", pattern: /\bundervalued by\s+\d+(?:\.\d+)?\s*%/i, message: ACTIONABLE },
  { id: "returned-pct", rule: "2", pattern: /\breturned\s+\d+(?:\.\d+)?\s*%/i, message: PERFORMANCE },
  { id: "my-calls", rule: "2", pattern: /\bmy calls\b/i, message: PERFORMANCE },
  { id: "hit-rate", rule: "2", pattern: /\bhit rate\b/i, message: PERFORMANCE },
  { id: "beat-the-nifty", rule: "2", pattern: /\bbeat the nifty\b/i, message: PERFORMANCE },
  { id: "cagr-of-my", rule: "2", pattern: /\bcagr of my (?:ideas|picks|calls|portfolio)\b/i, message: PERFORMANCE },
];

/** Rule 3: a price, return or valuation number. Checked only when the item names a company. */
export const PRICE_NUMBER =
  /\b(?:price|priced|trading at|trades at|market cap|valuation|p\/e|pe of|ev\/ebitda|p\/b|returned|return of)\b[^.\n]{0,40}?\d/i;
```

`src/modules/compliance/sentences.ts`:

```ts
import { createHash } from "node:crypto";

export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function normaliseSentence(sentence: string): string {
  return sentence.replace(/\s+/g, " ").trim().toLowerCase();
}

/** The value stored in lint_allowances.sentence_hash. */
export function sentenceHash(sentence: string): string {
  return createHash("sha256").update(normaliseSentence(sentence)).digest("hex");
}
```

- [ ] **Step 5: Implement the lint** `src/modules/compliance/lint.ts`:

```ts
import { addDays } from "@/lib/dates";
import type { HoldsPosition, ItemKind } from "@/modules/research";
import { LEXICON, PRICE_NUMBER } from "./lexicon";
import { POLICY_VERSION } from "./policy";
import { sentenceHash, splitSentences } from "./sentences";

export const LINT_FIELDS = ["title", "slug", "learningObjective", "body", "structured"] as const;
export type LintField = (typeof LINT_FIELDS)[number];
export type LintRule = "1" | "2" | "3" | "5" | "6" | "structure";

export type LintInput = {
  kind: ItemKind;
  title: string;
  slug: string | null;
  learningObjective: string | null;
  bodyMd: string;
  structured: Record<string, unknown>;
  companyId: string | null;
  holdsPosition: HoldsPosition | null;
  dataAsOf: string | null;
  today: string;
  allowances: ReadonlySet<string>;
};
export type LintFinding = {
  rule: LintRule;
  field: LintField | null;
  sentence: string | null;
  sentenceHash: string | null;
  match: string | null;
  message: string;
};
export type LintAllowed = { rule: "1" | "2"; field: LintField; sentence: string; sentenceHash: string; match: string };
export type LintResult = { passed: boolean; policyVersion: string; findings: LintFinding[]; allowedBy: LintAllowed[] };

type TextUnit = { field: LintField; text: string; citedQuote: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function walk(value: unknown, units: TextUnit[], citedQuote: boolean): void {
  if (typeof value === "string") units.push({ field: "structured", text: value, citedQuote });
  else if (Array.isArray(value)) value.forEach((v) => walk(v, units, citedQuote));
  else if (isRecord(value)) Object.values(value).forEach((v) => walk(v, units, citedQuote));
}

/** The whole public surface (ADR-001 s8.3). OG text is derived from title and learning objective. */
function collectUnits(input: LintInput): TextUnit[] {
  const units: TextUnit[] = [
    { field: "title", text: input.title, citedQuote: false },
    { field: "slug", text: (input.slug ?? "").replace(/-/g, " "), citedQuote: false },
    { field: "learningObjective", text: input.learningObjective ?? "", citedQuote: false },
    { field: "body", text: input.bodyMd, citedQuote: false },
  ];
  const { sources, ...rest } = input.structured;
  for (const source of Array.isArray(sources) ? sources : sources === undefined ? [] : [sources]) {
    if (!isRecord(source)) {
      walk(source, units, false);
      continue;
    }
    const cited = typeof source.url === "string" && source.url.trim() !== "";
    for (const [key, value] of Object.entries(source)) walk(value, units, cited && key === "quote");
  }
  walk(rest, units, false);
  return units;
}

function dataIsLagged(input: LintInput): boolean {
  return input.dataAsOf !== null && input.dataAsOf <= addDays(input.today, -30);
}

const structural = (rule: LintRule, message: string, field: LintField | null = null): LintFinding => ({
  rule,
  field,
  sentence: null,
  sentenceHash: null,
  match: null,
  message,
});

export function lintText(input: LintInput): LintResult {
  const findings: LintFinding[] = [];
  const allowedBy: LintAllowed[] = [];
  const checkPrices = input.companyId !== null && !dataIsLagged(input);

  for (const unit of collectUnits(input)) {
    for (const sentence of splitSentences(unit.text)) {
      const hash = sentenceHash(sentence);
      for (const entry of LEXICON) {
        const match = entry.pattern.exec(sentence);
        if (!match || unit.citedQuote) continue;
        if (input.allowances.has(hash)) {
          allowedBy.push({ rule: entry.rule, field: unit.field, sentence, sentenceHash: hash, match: match[0] });
        } else {
          findings.push({ rule: entry.rule, field: unit.field, sentence, sentenceHash: hash, match: match[0], message: entry.message });
        }
      }
      const price = checkPrices ? PRICE_NUMBER.exec(sentence) : null;
      if (price) {
        findings.push({
          rule: "3",
          field: unit.field,
          sentence,
          sentenceHash: hash,
          match: price[0],
          message: "A price, return or valuation number needs a data as-of date at least 30 days old.",
        });
      }
    }
  }

  if (!input.learningObjective?.trim()) {
    findings.push(structural("6", "Add a one-sentence learning objective: it makes the piece education, not a view on a stock.", "learningObjective"));
  }
  if (input.companyId !== null && input.holdsPosition === null) {
    findings.push(structural("5", "Set 'Holds position' (yes, no or not disclosed) for an item that names a company."));
  }
  if ((input.kind === "thesis" || input.kind === "case_study") && !/^#{1,6}\s*what would prove me wrong\b/im.test(input.bodyMd)) {
    findings.push(structural("structure", "Add a 'What would prove me wrong' section as a Markdown heading.", "body"));
  }
  if (input.kind === "case_study" && !dataIsLagged(input)) {
    findings.push(structural("3", "A case study needs a data as-of date at least 30 days old."));
  }

  return { passed: findings.length === 0, policyVersion: POLICY_VERSION, findings, allowedBy };
}
```

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `pnpm test src/lib/dates.test.ts src/modules/compliance`
Expected: PASS (dates 3, sentences 3, lint 33).

- [ ] **Step 7: Commit**

```bash
git add src/lib/dates.ts src/lib/dates.test.ts src/modules/compliance
git commit -m "feat(compliance): publish lint with SEBI lexicon, sentence allowances, adversarial tests" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Publish gate service, retraction and the desk gate panel (progress 1.6, part 2)

**Files:**
- Create: `src/lib/cache-tags.ts`, `src/modules/compliance/{decision,repo,publish,index,actions}.ts`, `src/test/fakes/compliance-repo.ts`, `src/app/desk/items/[id]/gate-panel.tsx`
- Modify: `src/app/desk/items/[id]/page.tsx` (full replacement below)
- Test: `src/modules/compliance/publish.test.ts`

**Interfaces:**
- Consumes: `lintText`, `POLICY_VERSION`, `LINT_FIELDS`, `LintAllowed`, `LintField` (Task 8); `slugify` (Task 1); `istDate` (Task 8); `Db`, `dbError`, `Json` (Tasks 4-5); `requireAdmin` (Task 6); `Item`, `Revision`, research reads (Task 7); SQL `publish_revision`, `unpublish_item` (Task 4).
- Produces:
  - `CACHE_TAGS = { publicItems: "public-items" } as const` in `src/lib/cache-tags.ts` (Plan 1B tags its public reads with it).
  - `type GateFailure = { rule: string; message: string; field: string | null; sentence: string | null; match: string | null; sentenceHash: string | null }`, `type GateDecision = { decisionId: string; verdict: "pass" | "fail"; policyVersion: string; decidedAt: string; failures: GateFailure[]; allowedBy: LintAllowed[] }`, `type DecisionRow = { id: string; verdict: string; policy_version: string; decided_at: string; reasons: Json }`, `decisionFromRow(row: DecisionRow): GateDecision`.
  - `interface ComplianceRepo { loadPublishContext(itemId, revisionId): Promise<PublishContext | null>; trySetSlug(itemId, slug): Promise<boolean>; callPublishRevision(args: { itemId: string; revisionId: string; policyVersion: string; lintResult: Json }): Promise<DecisionRow>; callUnpublish(itemId): Promise<string | null>; latestDecision(itemId): Promise<DecisionRow | null>; addAllowance(itemId, sentenceHash, reason): Promise<void> }`, `createSupabaseComplianceRepo(db: Db): ComplianceRepo`.
  - `type PublishDeps = { repo: ComplianceRepo; today: () => string }`, `runPublishGate(deps, itemId: string, revisionId: string): Promise<GateDecision>`, `getLatestDecision(repo, itemId): Promise<GateDecision | null>`, `PublishContextNotFoundError`.
  - From `@/modules/compliance/actions`: `publishRevision(itemId: string, revisionId: string): Promise<GateDecision>`, `unpublishItem(itemId: string): Promise<{ slug: string | null }>`, and form actions `publishRevisionAction(itemId, revisionId, formData)`, `unpublishItemAction(itemId, formData)`, `allowSentenceAction(itemId, sentenceHash, formData)`.

- [ ] **Step 1: The fake repository** `src/test/fakes/compliance-repo.ts` (it mimics the SQL function's lint checks so the TypeScript orchestration can be tested without Postgres):

```ts
import { randomUUID } from "node:crypto";
import type { ComplianceRepo, DecisionRow, PublishContext } from "@/modules/compliance";

export type FakeComplianceRepo = ComplianceRepo & {
  context: PublishContext | null;
  takenSlugs: Set<string>;
  slugWrites: string[];
  published: { itemId: string; revisionId: string; lintResult: Record<string, unknown> }[];
  allowances: { itemId: string; sentenceHash: string; reason: string }[];
};

export function createFakeComplianceRepo(context: PublishContext | null): FakeComplianceRepo {
  const decisions: (DecisionRow & { item_id: string })[] = [];
  const repo: FakeComplianceRepo = {
    context,
    takenSlugs: new Set(),
    slugWrites: [],
    published: [],
    allowances: [],
    async loadPublishContext() {
      return repo.context;
    },
    async trySetSlug(_itemId, slug) {
      if (repo.takenSlugs.has(slug)) return false;
      repo.slugWrites.push(slug);
      if (repo.context) repo.context = { ...repo.context, item: { ...repo.context.item, slug } };
      return true;
    },
    async callPublishRevision({ itemId, revisionId, policyVersion, lintResult }) {
      const lint = lintResult as Record<string, unknown>;
      repo.published.push({ itemId, revisionId, lintResult: lint });
      const failures = lint.passed === true && lint.revisionId === revisionId ? [] : [{ rule: "lint", message: "The text lint did not pass." }];
      const row = {
        id: randomUUID(),
        item_id: itemId,
        verdict: failures.length === 0 ? "pass" : "fail",
        policy_version: policyVersion,
        decided_at: new Date(Date.UTC(2026, 9, 4)).toISOString(),
        reasons: { failures, lint: lintResult },
      };
      decisions.push(row);
      return row;
    },
    async callUnpublish() {
      return repo.context?.item.slug ?? null;
    },
    async latestDecision(itemId) {
      return [...decisions].reverse().find((d) => d.item_id === itemId) ?? null;
    },
    async addAllowance(itemId, sentenceHash, reason) {
      repo.allowances.push({ itemId, sentenceHash, reason });
    },
  };
  return repo;
}
```

- [ ] **Step 2: Write the failing test** `src/modules/compliance/publish.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createFakeComplianceRepo } from "@/test/fakes/compliance-repo";
import { decisionFromRow } from "./decision";
import { POLICY_VERSION } from "./policy";
import { PublishContextNotFoundError, getLatestDecision, runPublishGate, type PublishContext } from "./publish";
import { sentenceHash } from "./sentences";

const ITEM = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const REV = "7e8d9c0b-1a2b-4c3d-8e4f-5a6b7c8d9e0f";

function context(patch: Partial<PublishContext["item"]> = {}, bodyMd = "Utilisation peaked in 2024."): PublishContext {
  return {
    item: {
      id: ITEM,
      kind: "learning",
      title: "How Capex Cycles Turn",
      slug: null,
      learningObjective: "Recognise the late stage of a capex cycle.",
      companyId: null,
      holdsPosition: null,
      dataAsOf: null,
      visibility: "private",
      ...patch,
    },
    revision: { id: REV, bodyMd, structured: {} },
    allowances: [],
  };
}

const deps = (repo: ReturnType<typeof createFakeComplianceRepo>) => ({ repo, today: () => "2026-10-04" });

describe("runPublishGate", () => {
  it("assigns a slug from the title, lints, and passes a clean revision", async () => {
    const repo = createFakeComplianceRepo(context());
    const decision = await runPublishGate(deps(repo), ITEM, REV);
    expect(repo.slugWrites).toEqual(["how-capex-cycles-turn"]);
    expect(decision.verdict).toBe("pass");
    expect(repo.published[0].lintResult).toMatchObject({ passed: true, revisionId: REV, policyVersion: POLICY_VERSION });
  });

  it("suffixes the slug with the item id when the plain slug is taken", async () => {
    const repo = createFakeComplianceRepo(context());
    repo.takenSlugs.add("how-capex-cycles-turn");
    await runPublishGate(deps(repo), ITEM, REV);
    expect(repo.slugWrites).toEqual(["how-capex-cycles-turn-0b6f3c1e"]);
  });

  it("records a failed attempt and returns the rule and the exact sentence (spec s9)", async () => {
    const repo = createFakeComplianceRepo(context({}, "Utilisation peaked. You should buy the leader now."));
    const decision = await runPublishGate(deps(repo), ITEM, REV);
    expect(decision.verdict).toBe("fail");
    expect(decision.failures).toContainEqual(
      expect.objectContaining({ rule: "1", sentence: "You should buy the leader now.", match: "buy", field: "body" }),
    );
    expect(repo.published).toHaveLength(1);
  });

  it("applies the item's sentence allowances", async () => {
    const sentence = "Why I avoid target prices.";
    const ctx = context({}, sentence);
    ctx.allowances = [sentenceHash(sentence)];
    const decision = await runPublishGate(deps(createFakeComplianceRepo(ctx)), ITEM, REV);
    expect(decision.verdict).toBe("pass");
    expect(decision.allowedBy).toEqual([expect.objectContaining({ sentence, match: "target prices" })]);
  });

  it("throws when the item or revision does not exist", async () => {
    await expect(runPublishGate(deps(createFakeComplianceRepo(null)), ITEM, REV)).rejects.toBeInstanceOf(
      PublishContextNotFoundError,
    );
  });

  it("reads back the latest decision for the desk", async () => {
    const repo = createFakeComplianceRepo(context());
    await runPublishGate(deps(repo), ITEM, REV);
    expect((await getLatestDecision(repo, ITEM))?.verdict).toBe("pass");
  });
});

describe("decisionFromRow", () => {
  it("drops SQL failures already explained by a lint finding", () => {
    const decision = decisionFromRow({
      id: "d1",
      verdict: "fail",
      policy_version: POLICY_VERSION,
      decided_at: "2026-10-04T00:00:00Z",
      reasons: {
        failures: [
          { rule: "lint", message: "The text lint did not pass." },
          { rule: "6", message: "A learning objective is required." },
        ],
        lint: {
          findings: [
            { rule: "6", field: "learningObjective", sentence: null, sentenceHash: null, match: null, message: "Add one." },
          ],
          allowedBy: [],
        },
      },
    });
    expect(decision.failures.map((f) => f.rule)).toEqual(["6"]);
  });

  it("survives a malformed reasons payload", () => {
    const decision = decisionFromRow({ id: "d2", verdict: "fail", policy_version: "x", decided_at: "2026-10-04T00:00:00Z", reasons: "oops" });
    expect(decision.failures[0].rule).toBe("unknown");
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `pnpm test src/modules/compliance/publish.test.ts`
Expected: FAIL with `Failed to resolve import "@/test/fakes/compliance-repo"` dependencies (`@/modules/compliance` has no index yet).

- [ ] **Step 4: Implement decisions, the repository, the gate and the index.** `src/lib/cache-tags.ts`:

```ts
/** Cache tags shared by publish actions (Plan 1A) and public reads (Plan 1B). */
export const CACHE_TAGS = { publicItems: "public-items" } as const;
```

`src/modules/compliance/decision.ts`:

```ts
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { LINT_FIELDS, type LintAllowed } from "./lint";

export type DecisionRow = { id: string; verdict: string; policy_version: string; decided_at: string; reasons: Json };
export type GateFailure = {
  rule: string;
  message: string;
  field: string | null;
  sentence: string | null;
  match: string | null;
  sentenceHash: string | null;
};
export type GateDecision = {
  decisionId: string;
  verdict: "pass" | "fail";
  policyVersion: string;
  decidedAt: string;
  failures: GateFailure[];
  allowedBy: LintAllowed[];
};

const findingSchema = z.object({
  rule: z.string(),
  field: z.string().nullable(),
  sentence: z.string().nullable(),
  sentenceHash: z.string().nullable(),
  match: z.string().nullable(),
  message: z.string(),
});
const allowedSchema = z.object({
  rule: z.enum(["1", "2"]),
  field: z.enum(LINT_FIELDS),
  sentence: z.string(),
  sentenceHash: z.string(),
  match: z.string(),
});
const reasonsSchema = z.object({
  failures: z.array(z.object({ rule: z.string(), message: z.string() })).default([]),
  lint: z
    .object({ findings: z.array(findingSchema).default([]), allowedBy: z.array(allowedSchema).default([]) })
    .default({ findings: [], allowedBy: [] }),
});

/** One shape for the desk, from the gate_decisions row written by publish_revision(). */
export function decisionFromRow(row: DecisionRow): GateDecision {
  const parsed = reasonsSchema.safeParse(row.reasons);
  const reasons = parsed.success
    ? parsed.data
    : { failures: [{ rule: "unknown", message: "This gate decision could not be read." }], lint: { findings: [], allowedBy: [] } };
  const lintFailures: GateFailure[] = reasons.lint.findings;
  const sqlFailures: GateFailure[] = reasons.failures
    .filter((f) => !(f.rule === "lint" && lintFailures.length > 0))
    .filter((f) => !lintFailures.some((l) => l.rule === f.rule))
    .map((f) => ({ ...f, field: null, sentence: null, match: null, sentenceHash: null }));
  return {
    decisionId: row.id,
    verdict: row.verdict === "pass" ? "pass" : "fail",
    policyVersion: row.policy_version,
    decidedAt: row.decided_at,
    failures: [...lintFailures, ...sqlFailures],
    allowedBy: reasons.lint.allowedBy,
  };
}
```

`src/modules/compliance/repo.ts`:

```ts
import type { Json } from "@/lib/supabase/database.types";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { HoldsPosition, ItemKind, Visibility } from "@/modules/research";
import type { DecisionRow } from "./decision";

export type PublishContext = {
  item: {
    id: string;
    kind: ItemKind;
    title: string;
    slug: string | null;
    learningObjective: string | null;
    companyId: string | null;
    holdsPosition: HoldsPosition | null;
    dataAsOf: string | null;
    visibility: Visibility;
  };
  revision: { id: string; bodyMd: string; structured: Record<string, unknown> };
  allowances: string[];
};

export interface ComplianceRepo {
  loadPublishContext(itemId: string, revisionId: string): Promise<PublishContext | null>;
  trySetSlug(itemId: string, slug: string): Promise<boolean>;
  callPublishRevision(args: { itemId: string; revisionId: string; policyVersion: string; lintResult: Json }): Promise<DecisionRow>;
  callUnpublish(itemId: string): Promise<string | null>;
  latestDecision(itemId: string): Promise<DecisionRow | null>;
  addAllowance(itemId: string, sentenceHash: string, reason: string): Promise<void>;
}

const DECISION_COLUMNS = "id, verdict, policy_version, decided_at, reasons";

function asRecord(value: Json): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function createSupabaseComplianceRepo(db: Db): ComplianceRepo {
  return {
    async loadPublishContext(itemId, revisionId) {
      const [item, revision, allowances] = await Promise.all([
        db
          .from("items")
          .select("id, kind, title, slug, learning_objective, company_id, holds_position, data_as_of, visibility")
          .eq("id", itemId)
          .maybeSingle(),
        db.from("item_revisions").select("id, body_md, structured").eq("id", revisionId).eq("item_id", itemId).maybeSingle(),
        db.from("lint_allowances").select("sentence_hash").eq("item_id", itemId),
      ]);
      if (item.error) throw dbError("compliance.loadItem", item.error);
      if (revision.error) throw dbError("compliance.loadRevision", revision.error);
      if (allowances.error) throw dbError("compliance.loadAllowances", allowances.error);
      if (!item.data || !revision.data) return null;
      return {
        item: {
          id: item.data.id,
          kind: item.data.kind as ItemKind,
          title: item.data.title,
          slug: item.data.slug,
          learningObjective: item.data.learning_objective,
          companyId: item.data.company_id,
          holdsPosition: item.data.holds_position as HoldsPosition | null,
          dataAsOf: item.data.data_as_of,
          visibility: item.data.visibility as Visibility,
        },
        revision: { id: revision.data.id, bodyMd: revision.data.body_md, structured: asRecord(revision.data.structured) },
        allowances: allowances.data.map((a) => a.sentence_hash),
      };
    },
    async trySetSlug(itemId, slug) {
      const { error } = await db.from("items").update({ slug }).eq("id", itemId);
      if (!error) return true;
      if (error.code === "23505") return false;
      throw dbError("compliance.trySetSlug", error);
    },
    async callPublishRevision({ itemId, revisionId, policyVersion, lintResult }) {
      const { data, error } = await db.rpc("publish_revision", {
        p_item_id: itemId,
        p_revision_id: revisionId,
        p_policy_version: policyVersion,
        p_lint_result: lintResult,
      });
      if (error) throw dbError("compliance.publish_revision", error);
      return { id: data.id, verdict: data.verdict, policy_version: data.policy_version, decided_at: data.decided_at, reasons: data.reasons };
    },
    async callUnpublish(itemId) {
      const { data, error } = await db.rpc("unpublish_item", { p_item_id: itemId });
      if (error) throw dbError("compliance.unpublish_item", error);
      return data;
    },
    async latestDecision(itemId) {
      const { data, error } = await db
        .from("gate_decisions")
        .select(DECISION_COLUMNS)
        .eq("item_id", itemId)
        .order("decided_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw dbError("compliance.latestDecision", error);
      return data;
    },
    async addAllowance(itemId, sentenceHash, reason) {
      const { error } = await db
        .from("lint_allowances")
        // DO NOTHING on a repeat: the admin holds INSERT, not UPDATE, on lint_allowances.
        .upsert({ item_id: itemId, sentence_hash: sentenceHash, reason }, { onConflict: "item_id,sentence_hash", ignoreDuplicates: true });
      if (error) throw dbError("compliance.addAllowance", error);
    },
  };
}
```

`src/modules/compliance/publish.ts`:

```ts
import type { Json } from "@/lib/supabase/database.types";
import { slugify } from "@/lib/slug";
import { decisionFromRow, type GateDecision } from "./decision";
import { lintText } from "./lint";
import { POLICY_VERSION } from "./policy";
import type { ComplianceRepo, PublishContext } from "./repo";

export type { PublishContext };
export type PublishDeps = { repo: ComplianceRepo; today: () => string };

export class PublishContextNotFoundError extends Error {
  constructor(itemId: string, revisionId: string) {
    super(`Item ${itemId} or revision ${revisionId} not found`);
    this.name = "PublishContextNotFoundError";
  }
}

async function assignSlug(repo: ComplianceRepo, itemId: string, title: string): Promise<string> {
  const base = slugify(title) || "item";
  if (await repo.trySetSlug(itemId, base)) return base;
  const suffixed = `${base}-${itemId.slice(0, 8)}`;
  if (await repo.trySetSlug(itemId, suffixed)) return suffixed;
  throw new Error(`Could not assign a unique slug to item ${itemId}`);
}

/**
 * Lint first (friendly errors), then let publish_revision() decide and record (spec s3).
 * Every attempt, pass or fail, is written to gate_decisions. There is no override.
 */
export async function runPublishGate(deps: PublishDeps, itemId: string, revisionId: string): Promise<GateDecision> {
  const ctx = await deps.repo.loadPublishContext(itemId, revisionId);
  if (!ctx) throw new PublishContextNotFoundError(itemId, revisionId);
  const slug = ctx.item.slug ?? (await assignSlug(deps.repo, ctx.item.id, ctx.item.title));
  const lint = lintText({
    kind: ctx.item.kind,
    title: ctx.item.title,
    slug,
    learningObjective: ctx.item.learningObjective,
    bodyMd: ctx.revision.bodyMd,
    structured: ctx.revision.structured,
    companyId: ctx.item.companyId,
    holdsPosition: ctx.item.holdsPosition,
    dataAsOf: ctx.item.dataAsOf,
    today: deps.today(),
    allowances: new Set(ctx.allowances),
  });
  const row = await deps.repo.callPublishRevision({
    itemId,
    revisionId,
    policyVersion: POLICY_VERSION,
    lintResult: { ...lint, revisionId } as unknown as Json,
  });
  return decisionFromRow(row);
}

export async function getLatestDecision(repo: ComplianceRepo, itemId: string): Promise<GateDecision | null> {
  const row = await repo.latestDecision(itemId);
  return row ? decisionFromRow(row) : null;
}
```

`src/modules/compliance/index.ts`:

```ts
export { POLICY_VERSION, RULE_TITLES } from "./policy";
export { normaliseSentence, sentenceHash, splitSentences } from "./sentences";
export {
  lintText,
  LINT_FIELDS,
  type LintAllowed,
  type LintField,
  type LintFinding,
  type LintInput,
  type LintResult,
  type LintRule,
} from "./lint";
export { decisionFromRow, type DecisionRow, type GateDecision, type GateFailure } from "./decision";
export { createSupabaseComplianceRepo, type ComplianceRepo, type PublishContext } from "./repo";
export { getLatestDecision, PublishContextNotFoundError, runPublishGate, type PublishDeps } from "./publish";
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `pnpm test src/modules/compliance`
Expected: PASS (sentences 3, lint 33, publish 8).

- [ ] **Step 6: Server actions** `src/modules/compliance/actions.ts`:

```ts
"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { istDate } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import type { GateDecision } from "./decision";
import { runPublishGate } from "./publish";
import { createSupabaseComplianceRepo } from "./repo";

async function deps() {
  const repo = createSupabaseComplianceRepo(await createSupabaseServerClient());
  return { repo, today: () => istDate(new Date()) };
}

/** Purge our caches after anything public changes (ADR-001 s8.9). */
function purgePublic(): void {
  updateTag(CACHE_TAGS.publicItems);
  revalidatePath("/", "layout");
}

export async function publishRevision(itemId: string, revisionId: string): Promise<GateDecision> {
  await requireAdmin();
  const decision = await runPublishGate(await deps(), itemId, revisionId);
  if (decision.verdict === "pass") purgePublic();
  revalidatePath(`/desk/items/${itemId}`);
  return decision;
}

export async function unpublishItem(itemId: string): Promise<{ slug: string | null }> {
  await requireAdmin();
  const slug = await (await deps()).repo.callUnpublish(itemId);
  purgePublic();
  return { slug };
}

export async function publishRevisionAction(itemId: string, revisionId: string, _formData: FormData): Promise<void> {
  await publishRevision(itemId, revisionId);
  redirect(`/desk/items/${itemId}#gate`);
}

export async function unpublishItemAction(itemId: string, _formData: FormData): Promise<void> {
  await unpublishItem(itemId);
  redirect(`/desk/items/${itemId}`);
}

const allowanceInput = z.object({
  sentenceHash: z.string().regex(/^[0-9a-f]{64}$/),
  reason: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(500),
});

/** A sentence allowance, never a rule override (publishing-rules; rules 3, 4 and 9 ignore it). */
export async function allowSentenceAction(itemId: string, sentenceHash: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = allowanceInput.safeParse({ sentenceHash, reason: formData.get("reason") });
  if (!parsed.success) {
    redirect(`/desk/items/${itemId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid allowance")}#gate`);
  }
  await (await deps()).repo.addAllowance(itemId, parsed.data.sentenceHash, parsed.data.reason);
  revalidatePath(`/desk/items/${itemId}`);
  redirect(`/desk/items/${itemId}#gate`);
}
```

- [ ] **Step 7: The gate panel** `src/app/desk/items/[id]/gate-panel.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RULE_TITLES, type GateDecision } from "@/modules/compliance";
import { allowSentenceAction, publishRevisionAction, unpublishItemAction } from "@/modules/compliance/actions";
import type { Item, Revision } from "@/modules/research";

function Highlight({ sentence, match }: { sentence: string; match: string | null }) {
  const at = match ? sentence.toLowerCase().indexOf(match.toLowerCase()) : -1;
  if (!match || at < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, at)}
      <mark>{sentence.slice(at, at + match.length)}</mark>
      {sentence.slice(at + match.length)}
    </>
  );
}

type Props = { item: Item; latest: Revision | null; current: Revision | null; decision: GateDecision | null };

export function GatePanel({ item, latest, current, decision }: Props) {
  const isPublic = item.visibility === "public";
  const candidate = latest && (!isPublic || latest.id !== current?.id) ? latest : null;
  return (
    <section id="gate" className="space-y-3 rounded border p-3">
      <h2 className="text-sm font-medium">Publish gate</h2>
      {isPublic && current ? <p className="text-sm">Live: revision #{current.revNo}</p> : null}
      <div className="flex flex-wrap gap-2">
        {candidate ? (
          <form action={publishRevisionAction.bind(null, item.id, candidate.id)}>
            <Button type="submit" size="sm">
              Publish revision #{candidate.revNo}
            </Button>
          </form>
        ) : null}
        {isPublic ? (
          <form action={unpublishItemAction.bind(null, item.id)}>
            <Button type="submit" size="sm" variant="outline">
              Unpublish
            </Button>
          </form>
        ) : null}
      </div>
      {decision ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">
            {decision.verdict === "pass" ? "Passed the gate" : "Blocked by the gate"} ({decision.decidedAt.slice(0, 16).replace("T", " ")},{" "}
            {decision.policyVersion})
          </p>
          <ul className="space-y-3">
            {decision.failures.map((failure, index) => (
              <li key={index} className="rounded border border-red-600 p-2">
                <p className="font-medium">{RULE_TITLES[failure.rule] ?? `Rule ${failure.rule}`}</p>
                <p>{failure.message}</p>
                {failure.sentence ? (
                  <q data-testid="flagged-sentence" className="mt-1 block">
                    <Highlight sentence={failure.sentence} match={failure.match} />
                  </q>
                ) : null}
                {failure.sentenceHash && (failure.rule === "1" || failure.rule === "2") ? (
                  <form action={allowSentenceAction.bind(null, item.id, failure.sentenceHash)} className="mt-2 flex gap-2">
                    <Input name="reason" aria-label="Reason for allowing this sentence" placeholder="Why this is educational usage" required minLength={3} />
                    <Button type="submit" size="sm" variant="outline">
                      Allow sentence
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          {decision.allowedBy.length > 0 ? (
            <p className="text-muted-foreground">Allowed as educational usage: {decision.allowedBy.map((a) => `"${a.sentence}"`).join(", ")}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 8: Mount it.** Replace `src/app/desk/items/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseComplianceRepo, getLatestDecision } from "@/modules/compliance";
import { requireAdmin } from "@/modules/identity";
import { createSupabaseResearchRepo, getItemWithHistory } from "@/modules/research";
import { GatePanel } from "./gate-panel";
import { History } from "./history";
import { MetaForm } from "./meta-form";
import { RevisionForm } from "./revision-form";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; from?: string; to?: string }>;
};

export default async function ItemPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { id } = await params;
  const { error, from, to } = await searchParams;
  if (!z.guid().safeParse(id).success) notFound();
  const db = await createSupabaseServerClient();
  const [history, decision] = await Promise.all([
    getItemWithHistory(createSupabaseResearchRepo(db), id),
    getLatestDecision(createSupabaseComplianceRepo(db), id),
  ]);
  if (!history) notFound();
  const { item, revisions, current, pending } = history;
  const latest = revisions[0] ?? null;
  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{item.title}</h1>
        <p className="text-sm text-muted-foreground">
          {item.kind.replace("_", " ")} · <span data-testid="visibility">{item.visibility === "public" ? "Public" : "Private"}</span>
          {pending.length > 0 ? ` · ${pending.length} revision(s) waiting for the gate` : ""}
        </p>
      </header>
      {error ? (
        <p role="alert" className="rounded border border-red-600 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <GatePanel item={item} latest={latest} current={current} decision={decision} />
      <MetaForm item={item} />
      <RevisionForm itemId={item.id} latest={latest} />
      <History revisions={revisions} currentId={current?.id ?? null} from={from} to={to} />
    </article>
  );
}
```

- [ ] **Step 9: Verify the whole path by hand against the local stack**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all green. Then point `.env.local` temporarily at the local stack (values from `pnpm supabase status -o env`), sign in through `/auth/confirm` as in Task 14's setup, and check: a body with "You should buy the leader now." is blocked with Rule 1 and the word highlighted; "Why I avoid target prices." can be allowed with a reason and then passes; "Unpublish" makes the item private. Restore `.env.local`.

- [ ] **Step 10: Commit**

```bash
git add src/lib/cache-tags.ts src/modules/compliance src/test/fakes/compliance-repo.ts src/app/desk/items/[id]
git commit -m "feat(compliance): publish gate service, retraction, sentence allowances, desk gate panel" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Capture grammar parser (progress 1.7, part 1)

**Files:**
- Create: `src/modules/capture/parse.ts`, `src/modules/capture/index.ts`
- Test: `src/modules/capture/parse.test.ts`

**Interfaces:**
- Consumes: nothing (pure; safe in the browser).
- Produces: `CAPTURE_KINDS = ["note", "thesis", "learning", "process"] as const`, `type CaptureKind`, `type ParsedCapture = { kind: CaptureKind; symbols: string[] /* upper-case, unique, in order */; themes: string[] /* lower-case, unique */; urls: string[]; title: string /* first line without URLs, <= 120 chars, or "Untitled capture" */; firstLine: string; body: string /* text after the prefix, trimmed, tokens kept */ }`, `parseCapture(raw: string): ParsedCapture`. The first symbol and first theme are the ones filed against (Task 11).

- [ ] **Step 1: Write the failing test** `src/modules/capture/parse.test.ts` (the grammar table from spec s5):

```ts
import { describe, expect, it } from "vitest";
import { parseCapture } from "./parse";

describe("parseCapture: grammar table (spec s5)", () => {
  it.each([
    ["$RELIANCE capex cycle", { kind: "note", symbols: ["RELIANCE"] }],
    ["$reliance capex cycle", { kind: "note", symbols: ["RELIANCE"] }],
    ["#capital-cycle late stage", { kind: "note", themes: ["capital-cycle"] }],
    ["t: $TCS deal wins slowing", { kind: "thesis", symbols: ["TCS"] }],
    ["T: upper-case prefix", { kind: "thesis" }],
    ["l: what a capex cycle looks like", { kind: "learning" }],
    ["p: my checklist before reading an annual report", { kind: "process" }],
    ["see https://example.com/ar-2026.pdf.", { kind: "note", urls: ["https://example.com/ar-2026.pdf"] }],
    ["Margins expanding at the cement majors", { kind: "note", symbols: [], themes: [], urls: [] }],
  ])("%j", (raw, expected) => {
    expect(parseCapture(raw)).toMatchObject(expected);
  });
});

describe("parseCapture: edge cases", () => {
  it("strips the prefix from the body and uses the first line as title and change reason", () => {
    const parsed = parseCapture("t: $TCS deal wins slowing\nmore detail here");
    expect(parsed.body).toBe("$TCS deal wins slowing\nmore detail here");
    expect(parsed.firstLine).toBe("$TCS deal wins slowing");
    expect(parsed.title).toBe("$TCS deal wins slowing");
  });

  it("only treats a prefix at the very start as a kind", () => {
    expect(parseCapture("note t: not a thesis").kind).toBe("note");
    expect(parseCapture("tl: not a prefix").kind).toBe("note");
  });

  it("ignores dollar amounts, Markdown headings and URL fragments", () => {
    const parsed = parseCapture("# Heading with $5 move https://x.com/page#frag");
    expect(parsed.symbols).toEqual([]);
    expect(parsed.themes).toEqual([]);
  });

  it("keeps NSE symbols with & and - and de-duplicates in order", () => {
    expect(parseCapture("$M&M and $BAJAJ-AUTO, then $m&m again.").symbols).toEqual(["M&M", "BAJAJ-AUTO"]);
  });

  it("drops trailing punctuation from symbols", () => {
    expect(parseCapture("Watching $INFY.").symbols).toEqual(["INFY"]);
  });

  it("titles an empty capture and caps long titles", () => {
    expect(parseCapture("   ").title).toBe("Untitled capture");
    expect(parseCapture("x".repeat(300)).title.length).toBeLessThanOrEqual(120);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test src/modules/capture`
Expected: FAIL with `Failed to resolve import "./parse"`.

- [ ] **Step 3: Implement** `src/modules/capture/parse.ts`:

```ts
// Quick-capture grammar (spec s5). Pure: runs in the browser and again on the server.
export const CAPTURE_KINDS = ["note", "thesis", "learning", "process"] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export type ParsedCapture = {
  kind: CaptureKind;
  symbols: string[];
  themes: string[];
  urls: string[];
  title: string;
  firstLine: string;
  body: string;
};

const PREFIXES: Record<string, CaptureKind> = { t: "thesis", l: "learning", p: "process" };
const PREFIX_RE = /^\s*([tlp]):\s*/i;
const SYMBOL_RE = /(^|\s)\$([A-Za-z][A-Za-z0-9&-]{0,19})/g;
const THEME_RE = /(^|\s)#([A-Za-z][A-Za-z0-9-]{0,47})/g;
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const TRAILING_URL_PUNCTUATION = /[.,;:!?)\]]+$/;
const TITLE_MAX = 120;

function unique(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))];
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

export function parseCapture(raw: string): ParsedCapture {
  const prefix = PREFIX_RE.exec(raw);
  const kind: CaptureKind = prefix ? (PREFIXES[prefix[1].toLowerCase()] ?? "note") : "note";
  const body = (prefix ? raw.slice(prefix[0].length) : raw).trim();
  const firstLine = (body.split("\n")[0] ?? "").trim();
  const symbols = unique([...body.matchAll(SYMBOL_RE)].map((m) => m[2].replace(/[&-]+$/, "").toUpperCase()));
  const themes = unique([...body.matchAll(THEME_RE)].map((m) => m[2].replace(/-+$/, "").toLowerCase()));
  const urls = unique([...body.matchAll(URL_RE)].map((m) => m[0].replace(TRAILING_URL_PUNCTUATION, "")));
  const title = truncate(firstLine.replace(URL_RE, "").replace(/\s+/g, " ").trim(), TITLE_MAX) || "Untitled capture";
  return { kind, symbols, themes, urls, title, firstLine, body };
}
```

`src/modules/capture/index.ts` (Task 11 and 12 extend it):

```ts
export { CAPTURE_KINDS, parseCapture, type CaptureKind, type ParsedCapture } from "./parse";
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `pnpm test src/modules/capture`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/capture/parse.ts src/modules/capture/parse.test.ts src/modules/capture/index.ts
git commit -m "feat(capture): quick-capture grammar parser" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Catalog stubs and `saveCapture` - verbatim first, then file (progress 1.7, part 2)

**Files:**
- Create: `src/modules/catalog/{types,service,repo,index}.ts`, `src/modules/capture/{types,repo,service,deps,actions}.ts`, `src/test/fakes/catalog-repo.ts`, `src/test/fakes/capture-repo.ts`
- Modify: `src/modules/capture/index.ts` (full replacement below)
- Test: `src/modules/catalog/service.test.ts`, `src/modules/capture/service.test.ts`

**Interfaces:**
- Consumes: `parseCapture` (Task 10); `createItem`, `appendRevision`, `ResearchRepo`, `createSupabaseResearchRepo` (Task 7); `slugify` (Task 1); `DbError`, `dbError`, `isUniqueViolation`, `Db`, `Json` (Tasks 4-5); `requireAdmin` (Task 6).
- Produces:
  - `@/modules/catalog`: `type Company = { id: string; slug: string; name: string; nseSymbol: string | null; needsReview: boolean }`, `type Theme = { id: string; slug: string; name: string; needsReview: boolean }`, `interface CatalogRepo { findCompanyBySymbol(symbol): Promise<Company | null>; insertCompany(row: { slug; name; nseSymbol; needsReview }): Promise<Company>; findThemeBySlug(slug): Promise<Theme | null>; insertTheme(row: { slug; name; needsReview }): Promise<Theme> }`, `ensureCompany(repo, symbol: string): Promise<Company>`, `ensureTheme(repo, token: string): Promise<Theme>`, `InvalidCatalogTokenError`, `createSupabaseCatalogRepo(db: Db): CatalogRepo`.
  - `@/modules/capture` adds: `CAPTURE_SOURCES`, `type CaptureSource`, `type CaptureRecord`, `type CaptureListEntry = { id; rawText; createdAt; itemId; companyId; companySymbol: string | null; companyName: string | null; parseError: string | null }`, `interface CaptureRepo`, `saveCaptureInput`, `type SaveCaptureInput`, `type SaveCaptureDeps = { captures: CaptureRepo; catalog: CatalogRepo; research: ResearchRepo }`, `type SaveCaptureResult = { captureId: string; itemId: string | null; kind: CaptureKind | null; duplicate: boolean; parseError: string | null }`, `saveCapture(deps, input): Promise<SaveCaptureResult>`, `createSupabaseCaptureRepo(db)`, `createCaptureDeps(db: Db): SaveCaptureDeps`, `listCapturesSince(db: Db, sinceIso: string): Promise<CaptureListEntry[]>`.
  - `@/modules/capture/actions`: `type SubmitCaptureInput = { clientId: string; rawText: string; source: CaptureSource }`, `type SubmitCaptureResult = { ok: true; captureId: string; itemId: string | null; duplicate: boolean; parseError: string | null } | { ok: false; retry: boolean; message: string }`, `submitCapture(input): Promise<SubmitCaptureResult>`.
  - Fakes: `createMemoryCatalogRepo()` (with `simulateRace(symbol)`), `createMemoryCaptureRepo()` (with `records`).

- [ ] **Step 1: Catalog and capture types.** `src/modules/catalog/types.ts`:

```ts
export type Company = { id: string; slug: string; name: string; nseSymbol: string | null; needsReview: boolean };
export type Theme = { id: string; slug: string; name: string; needsReview: boolean };

export interface CatalogRepo {
  findCompanyBySymbol(symbol: string): Promise<Company | null>;
  insertCompany(row: { slug: string; name: string; nseSymbol: string; needsReview: boolean }): Promise<Company>;
  findThemeBySlug(slug: string): Promise<Theme | null>;
  insertTheme(row: { slug: string; name: string; needsReview: boolean }): Promise<Theme>;
}
```

`src/modules/capture/types.ts`:

```ts
export const CAPTURE_SOURCES = ["web", "mobile", "api"] as const;
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

export type CaptureRecord = {
  id: string;
  rawText: string;
  parsed: Record<string, unknown> | null;
  itemId: string | null;
  companyId: string | null;
  themeId: string | null;
  source: CaptureSource;
  clientId: string | null;
  createdAt: string;
};

export type CaptureListEntry = {
  id: string;
  rawText: string;
  createdAt: string;
  itemId: string | null;
  companyId: string | null;
  companySymbol: string | null;
  companyName: string | null;
  parseError: string | null;
};

export type CaptureAttachment = {
  parsed: Record<string, unknown>;
  itemId?: string | null;
  companyId?: string | null;
  themeId?: string | null;
};

export interface CaptureRepo {
  findByClientId(clientId: string): Promise<CaptureRecord | null>;
  insertRaw(input: { rawText: string; source: CaptureSource; clientId: string }): Promise<CaptureRecord>;
  attach(id: string, patch: CaptureAttachment): Promise<void>;
  listSince(sinceIso: string): Promise<CaptureListEntry[]>;
}
```

- [ ] **Step 2: Fakes.** `src/test/fakes/catalog-repo.ts`:

```ts
import { randomUUID } from "node:crypto";
import { DbError } from "@/lib/supabase/errors";
import type { CatalogRepo, Company, Theme } from "@/modules/catalog";

export type MemoryCatalogRepo = CatalogRepo & {
  companies: Map<string, Company>;
  themes: Map<string, Theme>;
  /** The next insert of this symbol loses a race: another request inserts it first. */
  simulateRace(symbol: string): void;
};

const duplicate = (op: string) => new DbError(op, "23505", "duplicate key value violates unique constraint");

export function createMemoryCatalogRepo(): MemoryCatalogRepo {
  const companies = new Map<string, Company>();
  const themes = new Map<string, Theme>();
  let racing: string | null = null;
  const addCompany = (row: { slug: string; name: string; nseSymbol: string; needsReview: boolean }): Company => {
    const company: Company = { id: randomUUID(), ...row };
    companies.set(company.id, company);
    return company;
  };
  return {
    companies,
    themes,
    simulateRace(symbol) {
      racing = symbol;
    },
    async findCompanyBySymbol(symbol) {
      return [...companies.values()].find((c) => c.nseSymbol === symbol) ?? null;
    },
    async insertCompany(row) {
      if (racing === row.nseSymbol) {
        racing = null;
        addCompany(row);
        throw duplicate("catalog.insertCompany");
      }
      if ([...companies.values()].some((c) => c.nseSymbol === row.nseSymbol || c.slug === row.slug)) {
        throw duplicate("catalog.insertCompany");
      }
      return addCompany(row);
    },
    async findThemeBySlug(slug) {
      return [...themes.values()].find((t) => t.slug === slug) ?? null;
    },
    async insertTheme(row) {
      if ([...themes.values()].some((t) => t.slug === row.slug)) throw duplicate("catalog.insertTheme");
      const theme: Theme = { id: randomUUID(), ...row };
      themes.set(theme.id, theme);
      return theme;
    },
  };
}
```

`src/test/fakes/capture-repo.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { CaptureRecord, CaptureRepo } from "@/modules/capture";

export type MemoryCaptureRepo = CaptureRepo & { records: CaptureRecord[] };

export function createMemoryCaptureRepo(): MemoryCaptureRepo {
  const records: CaptureRecord[] = [];
  let tick = 0;
  return {
    records,
    async findByClientId(clientId) {
      return records.find((r) => r.clientId === clientId) ?? null;
    },
    async insertRaw({ rawText, source, clientId }) {
      const record: CaptureRecord = {
        id: randomUUID(),
        rawText,
        parsed: null,
        itemId: null,
        companyId: null,
        themeId: null,
        source,
        clientId,
        createdAt: new Date(Date.UTC(2026, 9, 4, 6, 0, tick++)).toISOString(),
      };
      records.push(record);
      return record;
    },
    async attach(id, patch) {
      const index = records.findIndex((r) => r.id === id);
      if (index < 0) throw new Error(`no capture ${id}`);
      const current = records[index];
      records[index] = {
        ...current,
        parsed: patch.parsed,
        itemId: patch.itemId === undefined ? current.itemId : patch.itemId,
        companyId: patch.companyId === undefined ? current.companyId : patch.companyId,
        themeId: patch.themeId === undefined ? current.themeId : patch.themeId,
      };
    },
    async listSince(sinceIso) {
      return records
        .filter((r) => r.createdAt >= sinceIso)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({
          id: r.id,
          rawText: r.rawText,
          createdAt: r.createdAt,
          itemId: r.itemId,
          companyId: r.companyId,
          companySymbol: null,
          companyName: null,
          parseError: typeof r.parsed?.error === "string" ? r.parsed.error : null,
        }));
    },
  };
}
```

- [ ] **Step 3: Write the failing tests.** `src/modules/catalog/service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMemoryCatalogRepo } from "@/test/fakes/catalog-repo";
import { ensureCompany, ensureTheme, InvalidCatalogTokenError } from "./service";

describe("ensureCompany", () => {
  it("creates a stub flagged for review (spec s5)", async () => {
    const repo = createMemoryCatalogRepo();
    const company = await ensureCompany(repo, "m&m");
    expect(company).toMatchObject({ nseSymbol: "M&M", name: "M&M", slug: "m-and-m", needsReview: true });
  });

  it("reuses an existing company whatever the case of the symbol", async () => {
    const repo = createMemoryCatalogRepo();
    const first = await ensureCompany(repo, "TCS");
    expect(await ensureCompany(repo, "tcs")).toEqual(first);
    expect(repo.companies.size).toBe(1);
  });

  it("recovers when a concurrent capture inserted the same symbol first", async () => {
    const repo = createMemoryCatalogRepo();
    repo.simulateRace("INFY");
    const company = await ensureCompany(repo, "INFY");
    expect(company.nseSymbol).toBe("INFY");
    expect(repo.companies.size).toBe(1);
  });

  it("rejects tokens that are not NSE-style symbols", async () => {
    await expect(ensureCompany(createMemoryCatalogRepo(), "5PAISA!")).rejects.toBeInstanceOf(InvalidCatalogTokenError);
  });
});

describe("ensureTheme", () => {
  it("creates a stub theme with a readable name and reuses it", async () => {
    const repo = createMemoryCatalogRepo();
    const theme = await ensureTheme(repo, "Capital-Cycle");
    expect(theme).toMatchObject({ slug: "capital-cycle", name: "Capital Cycle", needsReview: true });
    expect(await ensureTheme(repo, "capital-cycle")).toEqual(theme);
  });

  it("rejects a token with nothing usable", async () => {
    await expect(ensureTheme(createMemoryCatalogRepo(), "--")).rejects.toBeInstanceOf(InvalidCatalogTokenError);
  });
});
```

`src/modules/capture/service.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryCaptureRepo } from "@/test/fakes/capture-repo";
import { createMemoryCatalogRepo } from "@/test/fakes/catalog-repo";
import { createMemoryResearchRepo } from "@/test/fakes/research-repo";
import { saveCapture } from "./service";

function setup() {
  const research = createMemoryResearchRepo();
  const catalog = createMemoryCatalogRepo();
  const captures = createMemoryCaptureRepo();
  return { research, catalog, captures, deps: { research, catalog, captures } };
}
const input = (rawText: string) => ({ rawText, source: "web" as const, clientId: randomUUID() });

describe("saveCapture", () => {
  it("stores the raw text verbatim and files a private note", async () => {
    const { deps, captures, research } = setup();
    const raw = "  Margins expanding at the cement majors  ";
    const result = await saveCapture(deps, input(raw));
    expect(captures.records[0].rawText).toBe(raw);
    const item = research.items.get(result.itemId ?? "");
    expect(item).toMatchObject({ kind: "note", title: "Margins expanding at the cement majors", visibility: "private" });
    expect(captures.records[0]).toMatchObject({ itemId: result.itemId, parsed: expect.objectContaining({ kind: "note" }) });
  });

  it("links $SYMBOL to a stub company flagged for review", async () => {
    const { deps, catalog, research, captures } = setup();
    const result = await saveCapture(deps, input("$NEWCO capex plan"));
    const company = [...catalog.companies.values()][0];
    expect(company).toMatchObject({ nseSymbol: "NEWCO", needsReview: true });
    expect(research.items.get(result.itemId ?? "")?.companyId).toBe(company.id);
    expect(captures.records[0].companyId).toBe(company.id);
  });

  it("reuses one company for $tcs and $TCS", async () => {
    const { deps, catalog } = setup();
    await saveCapture(deps, input("$tcs order book"));
    await saveCapture(deps, input("$TCS attrition"));
    expect(catalog.companies.size).toBe(1);
  });

  it("links #theme to a stub theme", async () => {
    const { deps, catalog, captures } = setup();
    await saveCapture(deps, input("#capital-cycle cement adds capacity"));
    const theme = [...catalog.themes.values()][0];
    expect(theme).toMatchObject({ slug: "capital-cycle", name: "Capital Cycle" });
    expect(captures.records[0].themeId).toBe(theme.id);
  });

  it("keeps one thesis per company and appends later t: captures as revisions (decision D7)", async () => {
    const { deps, research } = setup();
    const first = await saveCapture(deps, input("t: $TCS deal wins slowing"));
    const second = await saveCapture(deps, input("t: $TCS margins holding\nmore detail"));
    expect(second.itemId).toBe(first.itemId);
    const item = research.items.get(first.itemId ?? "");
    expect(item).toMatchObject({ kind: "thesis", title: "TCS thesis" });
    const latest = (await research.listRevisions(first.itemId ?? ""))[0];
    expect(latest).toMatchObject({
      revNo: 2,
      bodyMd: "$TCS deal wins slowing\n\n$TCS margins holding\nmore detail",
      changeReason: "$TCS margins holding",
    });
  });

  it("files l: as learning and p: as process", async () => {
    const { deps, research } = setup();
    const learning = await saveCapture(deps, input("l: how float works"));
    const processItem = await saveCapture(deps, input("p: annual report checklist"));
    expect(research.items.get(learning.itemId ?? "")?.kind).toBe("learning");
    expect(research.items.get(processItem.itemId ?? "")?.kind).toBe("process");
  });

  it("treats a repeated clientId as already saved (offline queue retry)", async () => {
    const { deps, captures, research } = setup();
    const once = input("$TCS once");
    const first = await saveCapture(deps, once);
    const again = await saveCapture(deps, once);
    expect(again).toMatchObject({ duplicate: true, captureId: first.captureId, itemId: first.itemId });
    expect(captures.records).toHaveLength(1);
    expect(research.items.size).toBe(1);
  });

  it("keeps the capture when filing fails, recording the error", async () => {
    const { deps, captures } = setup();
    const broken = { ...deps, research: { ...deps.research, insertItem: async () => Promise.reject(new Error("db down")) } };
    const result = await saveCapture(broken, input("A thought worth keeping"));
    expect(result).toMatchObject({ itemId: null, parseError: "db down" });
    expect(captures.records[0]).toMatchObject({ rawText: "A thought worth keeping", parsed: expect.objectContaining({ error: "db down" }) });
  });

  it("stores URLs on the capture for Phase 2 ingestion", async () => {
    const { deps, captures } = setup();
    await saveCapture(deps, input("read https://example.com/ar.pdf"));
    expect(captures.records[0].parsed).toMatchObject({ urls: ["https://example.com/ar.pdf"] });
  });

  it("rejects an empty capture", async () => {
    await expect(saveCapture(setup().deps, input("   "))).rejects.toThrow(/Empty capture/);
  });
});
```

- [ ] **Step 4: Run them to make sure they fail**

Run: `pnpm test src/modules/catalog src/modules/capture/service.test.ts`
Expected: FAIL with `Failed to resolve import "./service"` (and the fakes' `@/modules/catalog` import).

- [ ] **Step 5: Implement the catalog.** `src/modules/catalog/service.ts`:

```ts
import { slugify } from "@/lib/slug";
import { isUniqueViolation } from "@/lib/supabase/errors";
import type { CatalogRepo, Company, Theme } from "./types";

export class InvalidCatalogTokenError extends Error {
  constructor(token: string) {
    super(`"${token}" is not a usable symbol or theme`);
    this.name = "InvalidCatalogTokenError";
  }
}

const NSE_SYMBOL = /^[A-Z][A-Z0-9&-]{0,19}$/;

/** Finds a company by NSE symbol or creates a stub flagged for review (spec s5). */
export async function ensureCompany(repo: CatalogRepo, rawSymbol: string): Promise<Company> {
  const symbol = rawSymbol.trim().toUpperCase();
  if (!NSE_SYMBOL.test(symbol)) throw new InvalidCatalogTokenError(rawSymbol);
  const existing = await repo.findCompanyBySymbol(symbol);
  if (existing) return existing;
  try {
    return await repo.insertCompany({ slug: slugify(symbol), name: symbol, nseSymbol: symbol, needsReview: true });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await repo.findCompanyBySymbol(symbol);
    if (raced) return raced;
    throw error;
  }
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function ensureTheme(repo: CatalogRepo, token: string): Promise<Theme> {
  const slug = slugify(token);
  if (!slug) throw new InvalidCatalogTokenError(token);
  const existing = await repo.findThemeBySlug(slug);
  if (existing) return existing;
  try {
    return await repo.insertTheme({ slug, name: titleCase(slug), needsReview: true });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await repo.findThemeBySlug(slug);
    if (raced) return raced;
    throw error;
  }
}
```

`src/modules/catalog/repo.ts`:

```ts
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { CatalogRepo, Company, Theme } from "./types";

const COMPANY_COLUMNS = "id, slug, name, nse_symbol, needs_review";
const THEME_COLUMNS = "id, slug, name, needs_review";

type CompanyRow = { id: string; slug: string; name: string; nse_symbol: string | null; needs_review: boolean };
type ThemeRow = { id: string; slug: string; name: string; needs_review: boolean };

const toCompany = (r: CompanyRow): Company => ({ id: r.id, slug: r.slug, name: r.name, nseSymbol: r.nse_symbol, needsReview: r.needs_review });
const toTheme = (r: ThemeRow): Theme => ({ id: r.id, slug: r.slug, name: r.name, needsReview: r.needs_review });

export function createSupabaseCatalogRepo(db: Db): CatalogRepo {
  return {
    async findCompanyBySymbol(symbol) {
      const { data, error } = await db.from("companies").select(COMPANY_COLUMNS).eq("nse_symbol", symbol).maybeSingle();
      if (error) throw dbError("catalog.findCompanyBySymbol", error);
      return data ? toCompany(data) : null;
    },
    async insertCompany(row) {
      const { data, error } = await db
        .from("companies")
        .insert({ slug: row.slug, name: row.name, nse_symbol: row.nseSymbol, needs_review: row.needsReview })
        .select(COMPANY_COLUMNS)
        .single();
      if (error) throw dbError("catalog.insertCompany", error);
      return toCompany(data);
    },
    async findThemeBySlug(slug) {
      const { data, error } = await db.from("themes").select(THEME_COLUMNS).eq("slug", slug).maybeSingle();
      if (error) throw dbError("catalog.findThemeBySlug", error);
      return data ? toTheme(data) : null;
    },
    async insertTheme(row) {
      const { data, error } = await db
        .from("themes")
        .insert({ slug: row.slug, name: row.name, needs_review: row.needsReview })
        .select(THEME_COLUMNS)
        .single();
      if (error) throw dbError("catalog.insertTheme", error);
      return toTheme(data);
    },
  };
}
```

`src/modules/catalog/index.ts`:

```ts
export type { CatalogRepo, Company, Theme } from "./types";
export { ensureCompany, ensureTheme, InvalidCatalogTokenError } from "./service";
export { createSupabaseCatalogRepo } from "./repo";
```

- [ ] **Step 6: Implement the capture service.** `src/modules/capture/service.ts`:

```ts
import { z } from "zod";
import { isUniqueViolation } from "@/lib/supabase/errors";
import { ensureCompany, ensureTheme, type CatalogRepo, type Company, type Theme } from "@/modules/catalog";
import { appendRevision, createItem, type ResearchRepo } from "@/modules/research";
import { parseCapture, type CaptureKind, type ParsedCapture } from "./parse";
import { CAPTURE_SOURCES, type CaptureRecord, type CaptureRepo } from "./types";

export const saveCaptureInput = z.object({
  rawText: z
    .string()
    .max(20_000, "Capture is too long (20,000 characters max)")
    .refine((text) => text.trim().length > 0, "Empty capture"),
  source: z.enum(CAPTURE_SOURCES),
  clientId: z.guid(),
});
export type SaveCaptureInput = z.input<typeof saveCaptureInput>;
export type SaveCaptureDeps = { captures: CaptureRepo; catalog: CatalogRepo; research: ResearchRepo };
export type SaveCaptureResult = {
  captureId: string;
  itemId: string | null;
  kind: CaptureKind | null;
  duplicate: boolean;
  parseError: string | null;
};

const duplicateOf = (record: CaptureRecord): SaveCaptureResult => ({
  captureId: record.id,
  itemId: record.itemId,
  kind: null,
  duplicate: true,
  parseError: null,
});

async function fileCapture(
  research: ResearchRepo,
  parsed: ParsedCapture,
  company: Company | null,
  theme: Theme | null,
): Promise<string> {
  if (parsed.kind === "thesis" && company) {
    const existing = await research.findThesisForCompany(company.id);
    if (existing) {
      await appendRevision(research, { itemId: existing.id, appendMd: parsed.body, changeReason: parsed.firstLine });
      return existing.id;
    }
  }
  const title = parsed.kind === "thesis" && company ? `${company.nseSymbol ?? company.name} thesis` : parsed.title;
  const { item } = await createItem(research, {
    kind: parsed.kind,
    title,
    bodyMd: parsed.body,
    companyId: company?.id ?? null,
    themeId: theme?.id ?? null,
  });
  return item.id;
}

/**
 * Spec s5: the capture is stored verbatim BEFORE any parsing, so nothing is lost if
 * filing fails. A repeated clientId (offline queue retry) is a no-op.
 */
export async function saveCapture(deps: SaveCaptureDeps, input: SaveCaptureInput): Promise<SaveCaptureResult> {
  const data = saveCaptureInput.parse(input);
  const existing = await deps.captures.findByClientId(data.clientId);
  if (existing) return duplicateOf(existing);

  let capture: CaptureRecord;
  try {
    capture = await deps.captures.insertRaw(data);
  } catch (error) {
    const raced = isUniqueViolation(error) ? await deps.captures.findByClientId(data.clientId) : null;
    if (raced) return duplicateOf(raced);
    throw error;
  }

  const parsed = parseCapture(data.rawText);
  try {
    const company = parsed.symbols[0] ? await ensureCompany(deps.catalog, parsed.symbols[0]) : null;
    const theme = parsed.themes[0] ? await ensureTheme(deps.catalog, parsed.themes[0]) : null;
    const itemId = await fileCapture(deps.research, parsed, company, theme);
    await deps.captures.attach(capture.id, {
      parsed: { ...parsed },
      itemId,
      companyId: company?.id ?? null,
      themeId: theme?.id ?? null,
    });
    return { captureId: capture.id, itemId, kind: parsed.kind, duplicate: false, parseError: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.captures.attach(capture.id, { parsed: { ...parsed, error: message } });
    return { captureId: capture.id, itemId: null, kind: parsed.kind, duplicate: false, parseError: message };
  }
}
```

`src/modules/capture/repo.ts`:

```ts
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { CaptureRecord, CaptureRepo, CaptureSource } from "./types";

const CAPTURE_COLUMNS = "id, raw_text, parsed, item_id, company_id, theme_id, source, client_id, created_at";

type CaptureRow = {
  id: string;
  raw_text: string;
  parsed: Json | null;
  item_id: string | null;
  company_id: string | null;
  theme_id: string | null;
  source: string;
  client_id: string | null;
  created_at: string;
};

function asRecord(value: Json | null): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const toRecord = (r: CaptureRow): CaptureRecord => ({
  id: r.id,
  rawText: r.raw_text,
  parsed: asRecord(r.parsed),
  itemId: r.item_id,
  companyId: r.company_id,
  themeId: r.theme_id,
  source: r.source as CaptureSource,
  clientId: r.client_id,
  createdAt: r.created_at,
});

export function createSupabaseCaptureRepo(db: Db): CaptureRepo {
  return {
    async findByClientId(clientId) {
      const { data, error } = await db.from("captures").select(CAPTURE_COLUMNS).eq("client_id", clientId).maybeSingle();
      if (error) throw dbError("capture.findByClientId", error);
      return data ? toRecord(data) : null;
    },
    async insertRaw({ rawText, source, clientId }) {
      const { data, error } = await db
        .from("captures")
        .insert({ raw_text: rawText, source, client_id: clientId })
        .select(CAPTURE_COLUMNS)
        .single();
      if (error) throw dbError("capture.insertRaw", error);
      return toRecord(data);
    },
    async attach(id, patch) {
      const update: TablesUpdate<"captures"> = { parsed: patch.parsed as Json };
      if (patch.itemId !== undefined) update.item_id = patch.itemId;
      if (patch.companyId !== undefined) update.company_id = patch.companyId;
      if (patch.themeId !== undefined) update.theme_id = patch.themeId;
      const { error } = await db.from("captures").update(update).eq("id", id);
      if (error) throw dbError("capture.attach", error);
    },
    async listSince(sinceIso) {
      const { data, error } = await db
        .from("captures")
        .select("id, raw_text, created_at, item_id, company_id, parsed, companies(nse_symbol, name)")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw dbError("capture.listSince", error);
      return data.map((r) => {
        const parsed = asRecord(r.parsed);
        return {
          id: r.id,
          rawText: r.raw_text,
          createdAt: r.created_at,
          itemId: r.item_id,
          companyId: r.company_id,
          companySymbol: r.companies?.nse_symbol ?? null,
          companyName: r.companies?.name ?? null,
          parseError: typeof parsed?.error === "string" ? parsed.error : null,
        };
      });
    },
  };
}
```

`src/modules/capture/deps.ts`:

```ts
import type { Db } from "@/lib/supabase/types";
import { createSupabaseCatalogRepo } from "@/modules/catalog";
import { createSupabaseResearchRepo } from "@/modules/research";
import { createSupabaseCaptureRepo } from "./repo";
import type { SaveCaptureDeps } from "./service";
import type { CaptureListEntry } from "./types";

export function createCaptureDeps(db: Db): SaveCaptureDeps {
  return {
    captures: createSupabaseCaptureRepo(db),
    catalog: createSupabaseCatalogRepo(db),
    research: createSupabaseResearchRepo(db),
  };
}

export async function listCapturesSince(db: Db, sinceIso: string): Promise<CaptureListEntry[]> {
  return createSupabaseCaptureRepo(db).listSince(sinceIso);
}
```

Replace `src/modules/capture/index.ts`:

```ts
export { CAPTURE_KINDS, parseCapture, type CaptureKind, type ParsedCapture } from "./parse";
export {
  CAPTURE_SOURCES,
  type CaptureAttachment,
  type CaptureListEntry,
  type CaptureRecord,
  type CaptureRepo,
  type CaptureSource,
} from "./types";
export { saveCapture, saveCaptureInput, type SaveCaptureDeps, type SaveCaptureInput, type SaveCaptureResult } from "./service";
export { createSupabaseCaptureRepo } from "./repo";
export { createCaptureDeps, listCapturesSince } from "./deps";
```

- [ ] **Step 7: Run the tests to make sure they pass**

Run: `pnpm test src/modules/catalog src/modules/capture`
Expected: PASS (catalog 6, capture parse 15, capture service 10).

- [ ] **Step 8: The server action** `src/modules/capture/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { createCaptureDeps } from "./deps";
import { saveCapture, saveCaptureInput } from "./service";
import type { CaptureSource } from "./types";

export type SubmitCaptureInput = { clientId: string; rawText: string; source: CaptureSource };
export type SubmitCaptureResult =
  | { ok: true; captureId: string; itemId: string | null; duplicate: boolean; parseError: string | null }
  | { ok: false; retry: boolean; message: string };

export async function submitCapture(input: SubmitCaptureInput): Promise<SubmitCaptureResult> {
  await requireAdmin();
  const parsed = saveCaptureInput.safeParse(input);
  if (!parsed.success) {
    // Malformed entries would block the device queue forever; tell the client to drop them.
    return { ok: false, retry: false, message: parsed.error.issues[0]?.message ?? "Invalid capture" };
  }
  try {
    const result = await saveCapture(createCaptureDeps(await createSupabaseServerClient()), parsed.data);
    revalidatePath("/desk");
    return { ok: true, captureId: result.captureId, itemId: result.itemId, duplicate: result.duplicate, parseError: result.parseError };
  } catch {
    return { ok: false, retry: true, message: "Saved on this device; it will sync when the desk is reachable." };
  }
}
```

- [ ] **Step 9: Verify and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all green.

```bash
git add src/modules/catalog src/modules/capture src/test/fakes/catalog-repo.ts src/test/fakes/capture-repo.ts
git commit -m "feat(capture): verbatim capture log, company/theme stubs, thesis append, idempotent save" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Capture screen - offline queue, Enter to save, today and the 30-day strip (progress 1.7, part 3)

**Files:**
- Create: `src/modules/capture/{queue,today,streak,client}.ts`, `src/app/desk/{capture-box,today-list,streak-strip}.tsx`
- Modify: `src/modules/capture/index.ts` (add two exports), `src/app/desk/page.tsx` (full replacement)
- Test: `src/modules/capture/queue.test.ts`, `src/modules/capture/today.test.ts`, `src/modules/capture/streak.test.ts`

**Interfaces:**
- Consumes: `submitCapture`, `CaptureSource`, `CaptureListEntry`, `listCapturesSince` (Task 11); `istDate`, `addDays`, `istDayStartUtc` (Task 8); `requireAdmin` (Task 6).
- Produces:
  - `@/modules/capture/client` (browser-safe): `parseCapture`, `QUEUE_KEY = "desk.captureQueue.v1"`, `type QueuedCapture = { clientId: string; rawText: string; source: CaptureSource; queuedAt: string }`, `type StorageLike = { getItem(key): string | null; setItem(key, value): void; removeItem(key): void }`, `type SendOutcome = "sent" | "retry" | "drop"`, `type FlushResult = { sent: number; dropped: number; remaining: number }`, `createCaptureQueue(storage: StorageLike): { list(): QueuedCapture[]; enqueue(entry: QueuedCapture): QueuedCapture[]; remove(clientId: string): QueuedCapture[]; flush(send: (entry: QueuedCapture) => Promise<SendOutcome>): Promise<FlushResult> }`, `createMemoryStorage(): StorageLike`, `resolveStorage(get: () => StorageLike | undefined): StorageLike`.
  - `@/modules/capture`: `type TodayGroup = { key: string; label: string; entries: CaptureListEntry[] }`, `groupTodayByCompany(entries, today: string): TodayGroup[]`, `type Streak = { days: { date: string; count: number }[]; activeDays: number; windowDays: number }`, `captureStreak(dates: string[], today: string, windowDays?: number): Streak`. Plan 1B reuses `captureStreak` for the public "logged research on N of the last 30 days" counter (counts only).

- [ ] **Step 1: Write the failing tests.** `src/modules/capture/queue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createCaptureQueue, createMemoryStorage, QUEUE_KEY, resolveStorage, type QueuedCapture, type SendOutcome } from "./queue";

const entry = (clientId: string, rawText = `note ${clientId}`): QueuedCapture => ({
  clientId,
  rawText,
  source: "web",
  queuedAt: "2026-10-04T06:00:00.000Z",
});

describe("createCaptureQueue", () => {
  it("persists entries and de-duplicates by clientId", () => {
    const storage = createMemoryStorage();
    const queue = createCaptureQueue(storage);
    queue.enqueue(entry("a"));
    queue.enqueue(entry("a"));
    queue.enqueue(entry("b"));
    expect(createCaptureQueue(storage).list().map((e) => e.clientId)).toEqual(["a", "b"]);
  });

  it("sends in order and removes what was sent", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    queue.enqueue(entry("a"));
    queue.enqueue(entry("b"));
    const seen: string[] = [];
    const result = await queue.flush(async (e) => {
      seen.push(e.clientId);
      return "sent";
    });
    expect(seen).toEqual(["a", "b"]);
    expect(result).toEqual({ sent: 2, dropped: 0, remaining: 0 });
  });

  it("stops at the first retry and keeps the rest, in order", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    ["a", "b", "c"].forEach((id) => queue.enqueue(entry(id)));
    const outcomes: Record<string, SendOutcome> = { a: "sent", b: "retry", c: "sent" };
    const result = await queue.flush(async (e) => outcomes[e.clientId]);
    expect(result).toEqual({ sent: 1, dropped: 0, remaining: 2 });
    expect(queue.list().map((e) => e.clientId)).toEqual(["b", "c"]);
  });

  it("drops entries the server rejects as malformed and carries on", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    queue.enqueue(entry("bad"));
    queue.enqueue(entry("good"));
    const result = await queue.flush(async (e) => (e.clientId === "bad" ? "drop" : "sent"));
    expect(result).toEqual({ sent: 1, dropped: 1, remaining: 0 });
  });

  it("treats a thrown send as a retry", async () => {
    const queue = createCaptureQueue(createMemoryStorage());
    queue.enqueue(entry("a"));
    const result = await queue.flush(async () => Promise.reject(new Error("offline")));
    expect(result).toEqual({ sent: 0, dropped: 0, remaining: 1 });
  });

  it("backs up a corrupt queue instead of silently losing it", () => {
    const storage = createMemoryStorage();
    storage.setItem(QUEUE_KEY, "{not json");
    expect(createCaptureQueue(storage).list()).toEqual([]);
    expect(storage.getItem(`${QUEUE_KEY}.corrupt`)).toBe("{not json");
  });
});

describe("resolveStorage", () => {
  it("falls back to memory when browser storage is blocked", () => {
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => undefined,
    };
    const storage = resolveStorage(() => blocked);
    storage.setItem("k", "v");
    expect(storage.getItem("k")).toBe("v");
  });
});
```

`src/modules/capture/today.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupTodayByCompany } from "./today";
import type { CaptureListEntry } from "./types";

const capture = (id: string, createdAt: string, company: { id: string; symbol: string } | null): CaptureListEntry => ({
  id,
  rawText: id,
  createdAt,
  itemId: null,
  companyId: company?.id ?? null,
  companySymbol: company?.symbol ?? null,
  companyName: company?.symbol ?? null,
  parseError: null,
});

describe("groupTodayByCompany", () => {
  it("keeps only today's captures (IST) and puts 'No company' last", () => {
    const tcs = { id: "c-tcs", symbol: "TCS" };
    const infy = { id: "c-infy", symbol: "INFY" };
    const groups = groupTodayByCompany(
      [
        capture("1", "2026-10-04T10:00:00Z", tcs),
        capture("2", "2026-10-04T09:00:00Z", null),
        capture("3", "2026-10-04T08:00:00Z", infy),
        capture("4", "2026-10-04T07:00:00Z", tcs),
        capture("5", "2026-10-03T10:00:00Z", tcs), // 15:30 IST on 3 Oct
      ],
      "2026-10-04",
    );
    expect(groups.map((g) => [g.label, g.entries.map((e) => e.id)])).toEqual([
      ["INFY", ["3"]],
      ["TCS", ["1", "4"]],
      ["No company", ["2"]],
    ]);
  });
});
```

`src/modules/capture/streak.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { captureStreak } from "./streak";

describe("captureStreak", () => {
  it("counts captures per day over the last 30 days ending today", () => {
    const streak = captureStreak(["2026-10-04", "2026-10-04", "2026-10-02", "2026-09-05", "2026-09-04"], "2026-10-04");
    expect(streak.days).toHaveLength(30);
    expect(streak.days[0].date).toBe("2026-09-05");
    expect(streak.days[29]).toEqual({ date: "2026-10-04", count: 2 });
    expect(streak.activeDays).toBe(3); // 2026-09-04 is outside the window
    expect(streak.windowDays).toBe(30);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test src/modules/capture`
Expected: FAIL with `Failed to resolve import "./queue"`, `"./today"`, `"./streak"`.

- [ ] **Step 3: Implement.** `src/modules/capture/queue.ts`:

```ts
// Offline-first capture queue (spec s5, s9). Pure: storage is injected.
import type { CaptureSource } from "./types";

export const QUEUE_KEY = "desk.captureQueue.v1";
const PROBE_KEY = "desk.storageProbe";

export type QueuedCapture = { clientId: string; rawText: string; source: CaptureSource; queuedAt: string };
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
export type SendOutcome = "sent" | "retry" | "drop";
export type FlushResult = { sent: number; dropped: number; remaining: number };

function isQueued(value: unknown): value is QueuedCapture {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.clientId === "string" && typeof v.rawText === "string" && typeof v.source === "string" && typeof v.queuedAt === "string";
}

export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

/** localStorage when it works; memory otherwise (private mode, blocked site data). */
export function resolveStorage(get: () => StorageLike | undefined): StorageLike {
  try {
    const storage = get();
    if (storage) {
      storage.setItem(PROBE_KEY, "1");
      if (storage.getItem(PROBE_KEY) === "1") {
        storage.removeItem(PROBE_KEY);
        return storage;
      }
    }
  } catch {
    // fall through to memory
  }
  return createMemoryStorage();
}

export function createCaptureQueue(storage: StorageLike) {
  function write(entries: QueuedCapture[]): void {
    try {
      storage.setItem(QUEUE_KEY, JSON.stringify(entries));
    } catch {
      // storage full or blocked: entries stay in the caller's hands for this session
    }
  }

  function list(): QueuedCapture[] {
    let raw: string | null = null;
    try {
      raw = storage.getItem(QUEUE_KEY);
    } catch {
      return [];
    }
    if (!raw) return [];
    try {
      const value: unknown = JSON.parse(raw);
      return Array.isArray(value) ? value.filter(isQueued) : [];
    } catch {
      try {
        storage.setItem(`${QUEUE_KEY}.corrupt`, raw);
      } catch {
        // nothing more we can do on this device
      }
      write([]);
      return [];
    }
  }

  function enqueue(entry: QueuedCapture): QueuedCapture[] {
    const next = [...list().filter((e) => e.clientId !== entry.clientId), entry];
    write(next);
    return next;
  }

  function remove(clientId: string): QueuedCapture[] {
    const next = list().filter((e) => e.clientId !== clientId);
    write(next);
    return next;
  }

  /** Sends oldest first; stops at the first retry so order is preserved. */
  async function flush(send: (entry: QueuedCapture) => Promise<SendOutcome>): Promise<FlushResult> {
    let sent = 0;
    let dropped = 0;
    for (const entry of list()) {
      let outcome: SendOutcome;
      try {
        outcome = await send(entry);
      } catch {
        outcome = "retry";
      }
      if (outcome === "retry") break;
      remove(entry.clientId);
      if (outcome === "sent") sent++;
      else dropped++;
    }
    return { sent, dropped, remaining: list().length };
  }

  return { list, enqueue, remove, flush };
}
```

`src/modules/capture/today.ts`:

```ts
import { istDate } from "@/lib/dates";
import type { CaptureListEntry } from "./types";

export type TodayGroup = { key: string; label: string; entries: CaptureListEntry[] };

/** Spec s5: the desk home shows today's captures grouped by company. */
export function groupTodayByCompany(entries: CaptureListEntry[], today: string): TodayGroup[] {
  const groups = new Map<string, TodayGroup>();
  for (const entry of entries) {
    if (istDate(entry.createdAt) !== today) continue;
    const key = entry.companyId ?? "none";
    const group = groups.get(key) ?? { key, label: entry.companySymbol ?? entry.companyName ?? "No company", entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === "none") return 1;
    if (b.key === "none") return -1;
    return a.label.localeCompare(b.label);
  });
}
```

`src/modules/capture/streak.ts`:

```ts
import { addDays } from "@/lib/dates";

export type Streak = { days: { date: string; count: number }[]; activeDays: number; windowDays: number };

/** Counts only, never content (spec s7). `dates` are IST calendar dates (YYYY-MM-DD). */
export function captureStreak(dates: string[], today: string, windowDays = 30): Streak {
  const counts = new Map<string, number>();
  for (const date of dates) counts.set(date, (counts.get(date) ?? 0) + 1);
  const days = Array.from({ length: windowDays }, (_, index) => {
    const date = addDays(today, index - (windowDays - 1));
    return { date, count: counts.get(date) ?? 0 };
  });
  return { days, activeDays: days.filter((d) => d.count > 0).length, windowDays };
}
```

`src/modules/capture/client.ts`:

```ts
// Browser-safe entry point: no server-only imports may be added here.
export { parseCapture, type CaptureKind, type ParsedCapture } from "./parse";
export {
  createCaptureQueue,
  createMemoryStorage,
  QUEUE_KEY,
  resolveStorage,
  type FlushResult,
  type QueuedCapture,
  type SendOutcome,
  type StorageLike,
} from "./queue";
export type { CaptureSource } from "./types";
```

Append to `src/modules/capture/index.ts`:

```ts
export { groupTodayByCompany, type TodayGroup } from "./today";
export { captureStreak, type Streak } from "./streak";
```

- [ ] **Step 4: Run them to make sure they pass**

Run: `pnpm test src/modules/capture`
Expected: PASS (queue 7, today 1, streak 1, plus the earlier 25).

- [ ] **Step 5: The capture box** `src/app/desk/capture-box.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { submitCapture } from "@/modules/capture/actions";
import { createCaptureQueue, resolveStorage, type CaptureSource, type SendOutcome } from "@/modules/capture/client";

type Status = "idle" | "saving" | "queued";

function detectSource(): CaptureSource {
  return window.matchMedia("(pointer: coarse)").matches ? "mobile" : "web";
}

export function CaptureBox() {
  const router = useRouter();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [waiting, setWaiting] = useState(0);

  const queue = useCallback(() => createCaptureQueue(resolveStorage(() => window.localStorage)), []);

  const flush = useCallback(async () => {
    const result = await queue().flush(async (entry): Promise<SendOutcome> => {
      const response = await submitCapture(entry);
      if (response.ok) return "sent";
      return response.retry ? "retry" : "drop";
    });
    setWaiting(result.remaining);
    if (result.sent > 0) router.refresh();
    return result;
  }, [queue, router]);

  useEffect(() => {
    ref.current?.focus();
    void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  async function submit() {
    const rawText = text;
    if (rawText.trim() === "") return;
    // Queue first: the thought is on the device before any network call (spec s9).
    queue().enqueue({ clientId: crypto.randomUUID(), rawText, source: detectSource(), queuedAt: new Date().toISOString() });
    setText("");
    setStatus("saving");
    const { remaining } = await flush();
    setStatus(remaining > 0 ? "queued" : "idle");
    ref.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div className="space-y-1">
      <Textarea
        ref={ref}
        aria-label="Capture"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        placeholder="What did you find? $SYMBOL links a company, #theme a theme, t: thesis, l: learning, p: process"
        className="text-base"
      />
      <p role="status" className="min-h-5 text-xs text-muted-foreground">
        {status === "saving" ? "Saving..." : waiting > 0 ? `Saved on this device, will sync (${waiting} waiting).` : ""}
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Today list, streak strip and the desk home.** `src/app/desk/today-list.tsx`:

```tsx
import Link from "next/link";
import type { TodayGroup } from "@/modules/capture";

export function TodayList({ groups }: { groups: TodayGroup[] }) {
  if (groups.length === 0) return <p className="text-sm text-muted-foreground">Nothing captured yet today.</p>;
  return (
    <section className="space-y-4" aria-label="Today">
      {groups.map((group) => (
        <div key={group.key}>
          <h2 className="text-sm font-medium">{group.label}</h2>
          <ul className="mt-1 space-y-1 text-sm">
            {group.entries.map((entry) => (
              <li key={entry.id} className="whitespace-pre-wrap">
                {entry.itemId ? (
                  <Link href={`/desk/items/${entry.itemId}`} className="hover:underline">
                    {entry.rawText}
                  </Link>
                ) : (
                  entry.rawText
                )}
                {entry.parseError ? <span className="ml-2 text-xs text-red-700">(not filed: {entry.parseError})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
```

`src/app/desk/streak-strip.tsx`:

```tsx
import type { Streak } from "@/modules/capture";

export function StreakStrip({ streak }: { streak: Streak }) {
  return (
    <section aria-label="Capture streak" className="space-y-1">
      <div className="flex gap-0.5">
        {streak.days.map((day) => (
          <span
            key={day.date}
            title={`${day.date}: ${day.count}`}
            className={`h-3 flex-1 rounded-sm ${day.count > 0 ? "bg-foreground" : "bg-muted"}`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Logged research on {streak.activeDays} of the last {streak.windowDays} days.
      </p>
    </section>
  );
}
```

Replace `src/app/desk/page.tsx`:

```tsx
import { addDays, istDate, istDayStartUtc } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { captureStreak, groupTodayByCompany, listCapturesSince } from "@/modules/capture";
import { requireAdmin } from "@/modules/identity";
import { CaptureBox } from "./capture-box";
import { StreakStrip } from "./streak-strip";
import { TodayList } from "./today-list";

export default async function DeskHome() {
  await requireAdmin();
  const today = istDate(new Date());
  const entries = await listCapturesSince(await createSupabaseServerClient(), istDayStartUtc(addDays(today, -29)));
  return (
    <div className="space-y-6">
      <CaptureBox />
      <StreakStrip streak={captureStreak(entries.map((e) => istDate(e.createdAt)), today)} />
      <TodayList groups={groupTodayByCompany(entries, today)} />
    </div>
  );
}
```

- [ ] **Step 7: Verify on a phone-sized screen**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green. With `pnpm dev`, signed in, in a 375 px wide window: the box is focused on load; Enter saves and clears; Shift+Enter adds a line; `t: $TCS deal wins slowing` appears under "TCS" and creates "TCS thesis" at `/desk/items`; with the network set to Offline in DevTools a capture shows "Saved on this device, will sync (1 waiting)" and syncs when back Online.

- [ ] **Step 8: Commit**

```bash
git add src/modules/capture src/app/desk
git commit -m "feat(capture): offline-first capture box, today by company, 30-day streak strip" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Three clocks - daily cron, the 15-minute pump, `/api/health` and the desk red strip (progress 1.10)

**Files:**
- Create: `src/modules/ops/{auth,steps,heartbeat,health,jobs,job-deps,index}.ts`, `src/app/api/cron/daily/route.ts`, `src/app/api/jobs/run/route.ts`, `src/app/api/health/route.ts`, `src/app/desk/health-strip.tsx`, `vercel.json`, `.github/workflows/pump.yml`
- Modify: `src/app/desk/layout.tsx` (full replacement below)
- Test: `src/modules/ops/auth.test.ts`, `src/modules/ops/steps.test.ts`, `src/modules/ops/health.test.ts`, `src/app/api/clocks.test.ts`

**Interfaces:**
- Consumes: `serverEnv()` (Task 5), `createSupabaseServiceClient()` (Task 5, allowed here only), `createSupabaseServerClient()`, `Db`, `dbError` (Task 5); SQL `heartbeats` grants (Task 3).
- Produces (from `@/modules/ops`): `isAuthorizedBearer(header: string | null, secret: string): boolean`; `type Step = { job: string; run: () => Promise<string | void> }`, `type StepResult = { job: string; ok: boolean; detail: string; ms: number }`, `runSteps(steps, record, now?): Promise<StepResult[]>`; `DAILY_STEPS`, `PUMP_STEPS`, `runDaily(repo: HeartbeatRepo, steps?): Promise<StepResult[]>`, `runPump(repo, steps?)` (Phase 2 adds the job drain to `PUMP_STEPS`; Phases 2-3 add prices, gate release and newsletter steps to `DAILY_STEPS`, each its own heartbeat); `interface HeartbeatRepo { record(beat: { job: string; ok: boolean; detail: string }): Promise<void>; latestOk(jobs: readonly string[]): Promise<Record<string, string | null>> }`, `createSupabaseHeartbeatRepo(db: Db)`, `createJobHeartbeatRepo()` (secret key); `HEALTH_RULES` (`heartbeat:pump` 120 min, `heartbeat:daily` 2160 min), `type HealthReport = { ok: boolean; checkedAt: string; checks: HealthCheck[] }`, `evaluateHealth(latest, now: Date): HealthReport`, `describeStale(report): string[]`, `getHealthReport(repo, now): Promise<HealthReport>`.
- Routes: `GET /api/cron/daily` and `POST /api/jobs/run` (both `Authorization: Bearer <CRON_SECRET>`, 401 otherwise, 500 if any step failed), `GET /api/health` (public, `Cache-Control: no-store`, 200 or 500).

- [ ] **Step 1: Write the failing unit tests.** `src/modules/ops/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAuthorizedBearer } from "./auth";

const SECRET = "s".repeat(64);

describe("isAuthorizedBearer", () => {
  it("accepts the exact bearer header", () => {
    expect(isAuthorizedBearer(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["missing header", null],
    ["wrong secret", `Bearer ${"x".repeat(64)}`],
    ["no Bearer prefix", SECRET],
  ])("rejects %s", (_label, header) => {
    expect(isAuthorizedBearer(header, SECRET)).toBe(false);
  });

  it("rejects everything when the secret is empty", () => {
    expect(isAuthorizedBearer("Bearer ", "")).toBe(false);
  });
});
```

`src/modules/ops/steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runSteps } from "./steps";

describe("runSteps", () => {
  it("runs every step even when one throws, writing one heartbeat per step", async () => {
    const beats: { job: string; ok: boolean; detail: string }[] = [];
    const results = await runSteps(
      [
        { job: "a", run: async () => Promise.reject(new Error("boom")) },
        { job: "b", run: async () => "done" },
        { job: "c", run: async () => undefined },
      ],
      async (beat) => void beats.push(beat),
    );
    expect(results.map((r) => [r.job, r.ok, r.detail])).toEqual([
      ["a", false, "boom"],
      ["b", true, "done"],
      ["c", true, "ok"],
    ]);
    expect(beats.map((b) => b.job)).toEqual(["a", "b", "c"]);
  });

  it("reports a failed heartbeat write instead of throwing", async () => {
    const results = await runSteps([{ job: "a", run: async () => "done" }], async () => Promise.reject(new Error("db down")));
    expect(results[0]).toMatchObject({ ok: false, detail: "done; heartbeat write failed: db down" });
  });
});
```

`src/modules/ops/health.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeStale, evaluateHealth } from "./health";

const NOW = new Date("2026-10-04T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe("evaluateHealth (spec s8 thresholds)", () => {
  it("is ok when the pump is under 2 h and the daily job under 36 h old", () => {
    const report = evaluateHealth({ "heartbeat:pump": minutesAgo(20), "heartbeat:daily": minutesAgo(30 * 60) }, NOW);
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => c.ageMinutes)).toEqual([20, 1800]);
  });

  it("fails when the pump is older than 2 h", () => {
    expect(evaluateHealth({ "heartbeat:pump": minutesAgo(121), "heartbeat:daily": minutesAgo(60) }, NOW).ok).toBe(false);
  });

  it("fails when the daily job is older than 36 h or has never run", () => {
    expect(evaluateHealth({ "heartbeat:pump": minutesAgo(5), "heartbeat:daily": minutesAgo(36 * 60 + 1) }, NOW).ok).toBe(false);
    expect(evaluateHealth({ "heartbeat:pump": minutesAgo(5), "heartbeat:daily": null }, NOW).ok).toBe(false);
  });

  it("explains stale clocks in plain English for the desk strip", () => {
    const report = evaluateHealth({ "heartbeat:pump": minutesAgo(300), "heartbeat:daily": null }, NOW);
    expect(describeStale(report)).toEqual(["the 15-minute pump last ran 5 h ago", "the daily job has never run"]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test src/modules/ops`
Expected: FAIL with `Failed to resolve import "./auth"`, `"./steps"`, `"./health"`.

- [ ] **Step 3: Implement the ops module.** `src/modules/ops/auth.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

/** Vercel cron and the GitHub pump send `Authorization: Bearer <CRON_SECRET>`. */
export function isAuthorizedBearer(header: string | null, secret: string): boolean {
  if (!header || secret.length === 0) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

`src/modules/ops/steps.ts`:

```ts
export type Step = { job: string; run: () => Promise<string | void> };
export type StepResult = { job: string; ok: boolean; detail: string; ms: number };
export type RecordHeartbeat = (beat: { job: string; ok: boolean; detail: string }) => Promise<void>;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Independent, individually try/caught steps, each writing its own heartbeat (ADR-001 s8.2). */
export async function runSteps(steps: readonly Step[], record: RecordHeartbeat, now: () => number = Date.now): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const step of steps) {
    const started = now();
    let result: StepResult;
    try {
      const detail = await step.run();
      result = { job: step.job, ok: true, detail: typeof detail === "string" ? detail : "ok", ms: now() - started };
    } catch (error) {
      result = { job: step.job, ok: false, detail: errorText(error).slice(0, 500), ms: now() - started };
    }
    try {
      await record({ job: result.job, ok: result.ok, detail: result.detail });
    } catch (error) {
      result = { ...result, ok: false, detail: `${result.detail}; heartbeat write failed: ${errorText(error)}`.slice(0, 500) };
    }
    results.push(result);
  }
  return results;
}
```

`src/modules/ops/heartbeat.ts`:

```ts
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

export interface HeartbeatRepo {
  record(beat: { job: string; ok: boolean; detail: string }): Promise<void>;
  latestOk(jobs: readonly string[]): Promise<Record<string, string | null>>;
}

export function createSupabaseHeartbeatRepo(db: Db): HeartbeatRepo {
  return {
    async record(beat) {
      // A write, not a read: this is what keeps the free project from pausing (ADR-001 s8.10).
      const { error } = await db.from("heartbeats").insert({ job: beat.job, ok: beat.ok, detail: beat.detail });
      if (error) throw dbError("ops.recordHeartbeat", error);
    },
    async latestOk(jobs) {
      const entries = await Promise.all(
        jobs.map(async (job) => {
          const { data, error } = await db
            .from("heartbeats")
            .select("ran_at")
            .eq("job", job)
            .eq("ok", true)
            .order("ran_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw dbError("ops.latestOk", error);
          return [job, data?.ran_at ?? null] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
  };
}
```

`src/modules/ops/health.ts`:

```ts
import type { HeartbeatRepo } from "./heartbeat";

export const HEALTH_RULES = [
  { job: "heartbeat:pump", maxAgeMinutes: 120, label: "the 15-minute pump" },
  { job: "heartbeat:daily", maxAgeMinutes: 36 * 60, label: "the daily job" },
] as const;

export type HealthCheck = {
  job: string;
  label: string;
  lastOkAt: string | null;
  ageMinutes: number | null;
  maxAgeMinutes: number;
  stale: boolean;
};
export type HealthReport = { ok: boolean; checkedAt: string; checks: HealthCheck[] };

export function evaluateHealth(latest: Record<string, string | null>, now: Date): HealthReport {
  const checks = HEALTH_RULES.map((rule): HealthCheck => {
    const lastOkAt = latest[rule.job] ?? null;
    const ageMinutes = lastOkAt === null ? null : Math.floor((now.getTime() - new Date(lastOkAt).getTime()) / 60_000);
    return {
      job: rule.job,
      label: rule.label,
      lastOkAt,
      ageMinutes,
      maxAgeMinutes: rule.maxAgeMinutes,
      stale: ageMinutes === null || ageMinutes > rule.maxAgeMinutes,
    };
  });
  return { ok: checks.every((c) => !c.stale), checkedAt: now.toISOString(), checks };
}

const formatAge = (minutes: number) => (minutes < 120 ? `${minutes} min` : `${Math.round(minutes / 60)} h`);

export function describeStale(report: HealthReport): string[] {
  return report.checks
    .filter((c) => c.stale)
    .map((c) => (c.ageMinutes === null ? `${c.label} has never run` : `${c.label} last ran ${formatAge(c.ageMinutes)} ago`));
}

export async function getHealthReport(repo: HeartbeatRepo, now: Date): Promise<HealthReport> {
  return evaluateHealth(await repo.latestOk(HEALTH_RULES.map((rule) => rule.job)), now);
}
```

`src/modules/ops/jobs.ts`:

```ts
import type { HeartbeatRepo } from "./heartbeat";
import { runSteps, type Step, type StepResult } from "./steps";

// Phase 1: each clock only proves it is alive. Later phases append steps here.
export const DAILY_STEPS: readonly Step[] = [{ job: "heartbeat:daily", run: async () => "alive" }];
export const PUMP_STEPS: readonly Step[] = [{ job: "heartbeat:pump", run: async () => "alive; the job queue arrives in Phase 2" }];

export function runDaily(repo: HeartbeatRepo, steps: readonly Step[] = DAILY_STEPS): Promise<StepResult[]> {
  return runSteps(steps, (beat) => repo.record(beat));
}

export function runPump(repo: HeartbeatRepo, steps: readonly Step[] = PUMP_STEPS): Promise<StepResult[]> {
  return runSteps(steps, (beat) => repo.record(beat));
}
```

`src/modules/ops/job-deps.ts`:

```ts
import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createSupabaseHeartbeatRepo, type HeartbeatRepo } from "./heartbeat";

/** Job code is the only place the secret-key client is created (ADR-001 s3). */
export function createJobHeartbeatRepo(): HeartbeatRepo {
  return createSupabaseHeartbeatRepo(createSupabaseServiceClient());
}
```

`src/modules/ops/index.ts`:

```ts
export { isAuthorizedBearer } from "./auth";
export { runSteps, type RecordHeartbeat, type Step, type StepResult } from "./steps";
export { createSupabaseHeartbeatRepo, type HeartbeatRepo } from "./heartbeat";
export { describeStale, evaluateHealth, getHealthReport, HEALTH_RULES, type HealthCheck, type HealthReport } from "./health";
export { DAILY_STEPS, PUMP_STEPS, runDaily, runPump } from "./jobs";
export { createJobHeartbeatRepo } from "./job-deps";
```

- [ ] **Step 4: Run the unit tests to make sure they pass**

Run: `pnpm test src/modules/ops`
Expected: PASS (auth 5, steps 2, health 4).

- [ ] **Step 5: Write the failing route tests** `src/app/api/clocks.test.ts`:

```ts
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  beats: [] as { job: string; ok: boolean; detail: string }[],
  latest: {} as Record<string, string | null>,
  failReads: false,
}));

vi.mock("@/modules/ops", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/ops")>();
  return {
    ...actual,
    createJobHeartbeatRepo: () => ({
      record: async (beat: { job: string; ok: boolean; detail: string }) => void fake.beats.push(beat),
      latestOk: async () => {
        if (fake.failReads) throw new Error("paused");
        return fake.latest;
      },
    }),
  };
});

import { GET as health } from "./health/route";
import { GET as daily } from "./cron/daily/route";
import { POST as pump } from "./jobs/run/route";

const SECRET = "c".repeat(64);
const authed = { authorization: `Bearer ${SECRET}` };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3100");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  vi.stubEnv("ADMIN_EMAIL", "admin@desk.test");
  vi.stubEnv("CRON_SECRET", SECRET);
  fake.beats.length = 0;
  fake.latest = {};
  fake.failReads = false;
});

describe("GET /api/cron/daily", () => {
  it("rejects calls without the bearer secret", async () => {
    expect((await daily(new NextRequest("http://x/api/cron/daily"))).status).toBe(401);
    expect(fake.beats).toEqual([]);
  });

  it("writes the daily heartbeat", async () => {
    const response = await daily(new NextRequest("http://x/api/cron/daily", { headers: authed }));
    expect(response.status).toBe(200);
    expect(fake.beats).toEqual([{ job: "heartbeat:daily", ok: true, detail: "alive" }]);
  });
});

describe("POST /api/jobs/run", () => {
  it("rejects calls without the bearer secret", async () => {
    expect((await pump(new NextRequest("http://x/api/jobs/run", { method: "POST" }))).status).toBe(401);
  });

  it("writes the pump heartbeat", async () => {
    const response = await pump(new NextRequest("http://x/api/jobs/run", { method: "POST", headers: authed }));
    expect(response.status).toBe(200);
    expect(fake.beats.map((b) => b.job)).toEqual(["heartbeat:pump"]);
  });
});

describe("GET /api/health", () => {
  it("is 200 and uncached when both clocks are fresh", async () => {
    fake.latest = { "heartbeat:pump": ago(10), "heartbeat:daily": ago(600) };
    const response = await health();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("is 500 when the pump is stale", async () => {
    fake.latest = { "heartbeat:pump": ago(180), "heartbeat:daily": ago(600) };
    expect((await health()).status).toBe(500);
  });

  it("is 500 when the database cannot be read", async () => {
    fake.failReads = true;
    const response = await health();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "database unreachable" });
  });
});
```

- [ ] **Step 6: Run them to make sure they fail**

Run: `pnpm test src/app/api`
Expected: FAIL with `Failed to resolve import "./health/route"`.

- [ ] **Step 7: The route handlers.** `src/app/api/cron/daily/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { createJobHeartbeatRepo, isAuthorizedBearer, runDaily } from "@/modules/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel cron, once a day on Hobby (vercel.json). Backstop clock (ADR-001 s8.2). */
export async function GET(request: NextRequest) {
  if (!isAuthorizedBearer(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const results = await runDaily(createJobHeartbeatRepo());
  const ok = results.every((r) => r.ok);
  return Response.json({ ok, results }, { status: ok ? 200 : 500 });
}
```

`src/app/api/jobs/run/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { createJobHeartbeatRepo, isAuthorizedBearer, runPump } from "@/modules/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Phase 2 drains jobs for <= 240 s here (spec s8)

/** Called every 15 minutes by .github/workflows/pump.yml. */
export async function POST(request: NextRequest) {
  if (!isAuthorizedBearer(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const results = await runPump(createJobHeartbeatRepo());
  const ok = results.every((r) => r.ok);
  return Response.json({ ok, results }, { status: ok ? 200 : 500 });
}
```

`src/app/api/health/route.ts`:

```ts
import { createJobHeartbeatRepo, getHealthReport } from "@/modules/ops";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Public, no secret: polled by the external uptime monitor (spec s8). Returns ages only. */
export async function GET() {
  try {
    const report = await getHealthReport(createJobHeartbeatRepo(), new Date());
    return Response.json(report, { status: report.ok ? 200 : 500, headers: NO_STORE });
  } catch {
    return Response.json({ ok: false, error: "database unreachable" }, { status: 500, headers: NO_STORE });
  }
}
```

- [ ] **Step 8: Run the route tests to make sure they pass**

Run: `pnpm test src/app/api`
Expected: PASS (7 tests).

- [ ] **Step 9: The desk red strip.** `src/app/desk/health-strip.tsx`:

```tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseHeartbeatRepo, describeStale, getHealthReport, type HealthReport } from "@/modules/ops";

const STRIP = "mb-4 rounded bg-red-700 px-3 py-2 text-sm text-white";

/** Spec s8-s9: the owner sees the same condition the uptime monitor alerts on, in plain English. */
export async function HealthStrip() {
  let report: HealthReport;
  try {
    report = await getHealthReport(createSupabaseHeartbeatRepo(await createSupabaseServerClient()), new Date());
  } catch {
    return (
      <p role="alert" className={STRIP}>
        The database cannot be reached right now. New captures stay saved on this device and sync when it is back.
      </p>
    );
  }
  if (report.ok) return null;
  return (
    <p role="alert" className={STRIP}>
      Background checks are late: {describeStale(report).join("; ")}. The uptime monitor has emailed Shlok and Aksh.
    </p>
  );
}
```

Replace `src/app/desk/layout.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/modules/identity";
import { signOut } from "@/modules/identity/actions";
import { HealthStrip } from "./health-strip";

export default async function DeskLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <header className="mb-4 flex items-center justify-between gap-2 text-sm">
        <nav className="flex gap-4">
          <Link href="/desk">Today</Link>
          <Link href="/desk/items">Items</Link>
        </nav>
        <form action={signOut}>
          <button type="submit" className="text-muted-foreground underline">
            Sign out
          </button>
        </form>
      </header>
      <HealthStrip />
      {children}
    </div>
  );
}
```

- [ ] **Step 10: The two external clocks.** `vercel.json` (Hobby allows one run per day; 00:30 UTC is 06:00 IST and may fire any time within that hour):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [{ "path": "/api/cron/daily", "schedule": "30 0 * * *" }]
}
```

`.github/workflows/pump.yml`:

```yaml
name: pump

# Primary clock (ADR-001 s8.2): every 15 minutes. GitHub may delay scheduled runs under load
# and disables them after 60 days without repository activity; the Vercel cron and the
# uptime monitor cover those gaps.
on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:

permissions: {}

concurrency:
  group: pump
  cancel-in-progress: false

jobs:
  pump:
    runs-on: ubuntu-latest
    timeout-minutes: 6
    steps:
      - name: POST /api/jobs/run
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          SITE_URL: ${{ secrets.SITE_URL }}
        run: |
          set -euo pipefail
          code=$(curl -sS -o response.json -w '%{http_code}' --max-time 290 \
            --retry 2 --retry-all-errors -X POST \
            -H "Authorization: Bearer ${CRON_SECRET}" "${SITE_URL}/api/jobs/run")
          cat response.json; echo
          test "$code" = "200"
```

- [ ] **Step 11: Verify locally, then deploy and prove all three clocks**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green (ESLint confirms `@/lib/supabase/service` is imported only in `src/modules/ops`).

```bash
git add src/modules/ops src/app/api src/app/desk/health-strip.tsx src/app/desk/layout.tsx vercel.json .github/workflows/pump.yml
git commit -m "feat(ops): daily cron, 15-minute pump, public health check, desk red strip" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin main
```

After the deployment (GitHub secrets `CRON_SECRET` and `SITE_URL` must exist, Task 0):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<production-domain>/api/cron/daily                     # 401
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<production-domain>/api/cron/daily               # {"ok":true,...}
gh workflow run pump.yml && sleep 60 && gh run list --workflow=pump.yml --limit 1                         # completed success
curl -s -w "\n%{http_code}\n" https://<production-domain>/api/health                                     # "ok":true ... 200
```

Expected as commented. Vercel > Settings > Cron Jobs lists `/api/cron/daily`. Then tick the Task 0 uptime-monitor box and confirm its first check is green.

---

### Task 14: End-to-end tests in CI and project memory (closes Plan 1A)

**Files:**
- Modify: `playwright.config.ts` (full replacement), `.github/workflows/ci.yml` (full replacement), `docs/progress.md`, `docs/project-memory/timeline.md` (append), `docs/specs/technical-debt.md` (append)
- Create: `e2e/auth.setup.ts`, `e2e/guard.spec.ts`, `e2e/clocks.spec.ts`, `e2e/desk-capture.spec.ts`, `e2e/desk-publish.spec.ts`
- Test: all of `e2e/` against a local Supabase stack

**Interfaces:**
- Consumes: every route and label from Tasks 6-13 (`/auth/confirm`, `Capture` textbox, `Kind`, `Title`, `Create item`, `Learning objective`, `Save details`, `Body (Markdown)`, `Change reason`, `Save revision`, `Publish revision #n`, `#gate`, `flagged-sentence`, `Reason for allowing this sentence`, `Allow sentence`, `Passed the gate`, `Live: revision`, `Unpublish`, `visibility` test id); `parseServerEnv` (Task 5); `seed.sql` admin email `admin@desk.test` (Task 3).
- Produces: a CI `e2e` job; storage state `e2e/.auth/admin.json` (git-ignored). Plan 1B adds public-page specs to the `anon` project at 375 px and 1280 px.

- [ ] **Step 1: Replace** `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;
const ADMIN_STATE = "e2e/.auth/admin.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "anon", testMatch: /(smoke|guard|clocks)\.spec\.ts/ },
    {
      name: "desk-mobile",
      testMatch: /desk-.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: ADMIN_STATE, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
    {
      name: "desk-desktop",
      testMatch: /desk-.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: ADMIN_STATE, viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 2: Sign-in setup** `e2e/auth.setup.ts` (decision D13):

```ts
import { createClient } from "@supabase/supabase-js";
import { expect, test as setup } from "@playwright/test";
import { parseServerEnv } from "../src/lib/env";

setup("sign in as the admin with a magic-link token", async ({ page }) => {
  const env = parseServerEnv(process.env);
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Signups are disabled for the public; the admin API still creates the one account.
  await admin.auth.admin.createUser({ email: env.ADMIN_EMAIL, email_confirm: true });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: env.ADMIN_EMAIL });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/desk`);
  await expect(page).toHaveURL(/\/desk$/);
  await page.context().storageState({ path: "e2e/.auth/admin.json" });
});
```

- [ ] **Step 3: Anonymous specs.** `e2e/guard.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("the desk requires sign-in", async ({ page }) => {
  await page.goto("/desk");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("the login form does not reveal who is allowed", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("stranger@example.com");
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("If this address is allowed");
});
```

`e2e/clocks.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { parseServerEnv } from "../src/lib/env";

test("pump and daily cron refuse calls without the secret", async ({ request }) => {
  expect((await request.post("/api/jobs/run")).status()).toBe(401);
  expect((await request.get("/api/cron/daily")).status()).toBe(401);
});

test("both heartbeats turn /api/health green", async ({ request }) => {
  const headers = { authorization: `Bearer ${parseServerEnv(process.env).CRON_SECRET}` };
  expect((await request.post("/api/jobs/run", { headers })).status()).toBe(200);
  expect((await request.get("/api/cron/daily", { headers })).status()).toBe(200);
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ ok: true });
});
```

- [ ] **Step 4: Desk specs** (run at 375 px and 1280 px). `e2e/desk-capture.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("a t: capture appears under its company today and files a thesis", async ({ page }) => {
  const tag = `e2e${Date.now().toString(36)}`;
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await expect(box).toBeFocused();
  await box.fill(`t: $E2ECO margins ${tag}`);
  await box.press("Enter");
  await expect(box).toHaveValue("");
  await expect(page.getByText(`$E2ECO margins ${tag}`)).toBeVisible();
  await page.goto("/desk/items");
  await expect(page.getByRole("link", { name: "E2ECO thesis" })).toBeVisible();
});

test("Shift+Enter adds a line instead of saving", async ({ page }) => {
  await page.goto("/desk");
  const box = page.getByRole("textbox", { name: "Capture" });
  await box.fill("first line");
  await box.press("Shift+Enter");
  await box.pressSequentially("second line");
  await expect(box).toHaveValue("first line\nsecond line");
});
```

`e2e/desk-publish.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("the gate blocks actionable language, accepts an allowance, publishes and retracts", async ({ page }) => {
  const title = `Capex cycles e2e${Date.now().toString(36)}`;
  await page.goto("/desk/items");
  await page.getByLabel("Kind").selectOption("learning");
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByLabel("Learning objective").fill("Recognise the late stage of a capex cycle.");
  await page.getByRole("button", { name: "Save details" }).click();

  const saveRevision = async (body: string, reason: string) => {
    await page.getByLabel("Body (Markdown)").fill(body);
    await page.getByLabel("Change reason").fill(reason);
    await page.getByRole("button", { name: "Save revision" }).click();
  };
  const gate = page.locator("#gate");

  // Blocked path: rule 1 with the exact sentence.
  await saveRevision("Utilisation peaked in 2024. You should buy the leader now.", "first draft");
  await page.getByRole("button", { name: /Publish revision/ }).click();
  await expect(gate.getByText("Blocked by the gate")).toBeVisible();
  await expect(gate.getByText("Rule 1").first()).toBeVisible();
  await expect(gate.getByTestId("flagged-sentence").first()).toContainText("You should buy the leader now.");

  // Educational usage: allowed sentence, then the happy path.
  await saveRevision("Utilisation peaked in 2024. Why I avoid target prices.", "explain my process");
  await page.getByRole("button", { name: /Publish revision/ }).click();
  await expect(gate.getByTestId("flagged-sentence").first()).toContainText("Why I avoid target prices.");
  await gate.getByLabel("Reason for allowing this sentence").fill("Explains my process, not a recommendation");
  await gate.getByRole("button", { name: "Allow sentence" }).click();
  await page.getByRole("button", { name: /Publish revision/ }).click();
  await expect(gate.getByText("Passed the gate")).toBeVisible();
  await expect(gate.getByText(/Live: revision #\d+/)).toBeVisible();
  await expect(page.getByTestId("visibility")).toHaveText("Public");

  // Retraction.
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByTestId("visibility")).toHaveText("Private");
});
```

- [ ] **Step 5: Run the e2e suite against the local stack**

```bash
pnpm db:reset
pnpm supabase status -o env > .supabase.env
set -a; . ./.supabase.env; set +a
export NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" SUPABASE_SECRET_KEY="$SECRET_KEY"
export NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 ADMIN_EMAIL=admin@desk.test CRON_SECRET=ci-only-cron-secret-0123456789abcdef0123
mv .env.local .env.local.off   # next start would otherwise load the hosted values
pnpm build && pnpm e2e
mv .env.local.off .env.local
```

Expected: `setup` 1 passed, `anon` 5 passed (smoke 1, guard 2, clocks 2), `desk-mobile` 3 passed, `desk-desktop` 3 passed. If `PUBLISHABLE_KEY` is empty, the installed CLI predates the new local keys: upgrade with `pnpm add -D supabase@latest` and rerun.

- [ ] **Step 6: Replace** `.github/workflows/ci.yml` (the `app` job no longer runs Playwright; `e2e` runs everything against a local stack):

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  app:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      # Placeholders so `next build` can evaluate modules; nothing calls Supabase at build time.
      NEXT_PUBLIC_SITE_URL: http://127.0.0.1:3100
      NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_ci_placeholder
      SUPABASE_SECRET_KEY: sb_secret_ci_placeholder
      ADMIN_EMAIL: admin@desk.test
      CRON_SECRET: ci-only-cron-secret-0123456789abcdef0123
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build

  db:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase start
      - run: supabase test db

  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    env:
      NEXT_PUBLIC_SITE_URL: http://127.0.0.1:3100
      ADMIN_EMAIL: admin@desk.test # matches supabase/seed.sql
      CRON_SECRET: ci-only-cron-secret-0123456789abcdef0123
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase start
      - name: Export local Supabase URL and keys
        run: |
          supabase status -o env > .supabase.env
          set -a; . ./.supabase.env; set +a
          test -n "${API_URL:-}" && test -n "${PUBLISHABLE_KEY:-}" && test -n "${SECRET_KEY:-}"
          {
            echo "NEXT_PUBLIC_SUPABASE_URL=${API_URL}"
            echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE_KEY}"
            echo "SUPABASE_SECRET_KEY=${SECRET_KEY}"
          } >> "$GITHUB_ENV"
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm build
      - run: pnpm e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report
          retention-days: 7
```

- [ ] **Step 7: Project memory.** In `docs/progress.md` tick 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7 and 1.10, and set the next task to "Plan 1B: 1.8 UI segments with Shlok, then 1.9 public pages, then 1.11". Append to `docs/project-memory/timeline.md`:

```markdown
## <date> - Plan 1A complete (private desk, schema, gate, capture, clocks)

**What happened:** Executed docs/plans/2026-10-04-phase-1a-core.md: migration 0001 with RLS, invoker views and publish_revision(); identity, research, compliance, capture, catalog and ops modules; three clocks live; CI runs unit, pgTAP and e2e.
**Discovered:** <surprises during execution, e.g. CLI version, Turbopack result>
**Assumed:** decisions D1-D14 in the plan (notably D2 EXECUTE to authenticated, D3 anon table grants mirroring the views, D4 recorded fail verdicts).
**Implications:** Plan 1B builds public pages only on public_items, public_item_revisions, public_companies, public_themes and tags reads with CACHE_TAGS.publicItems.
**Links:** ADR-001, docs/specs/2026-10-04-phase-1-core-design.md
```

Append to `docs/specs/technical-debt.md`:

```markdown
- 2026-10-04 (Plan 1A): publishing rule 4 (named-security recency) is not enforced until the Phase 3 ledger exists (decision D12).
- 2026-10-04 (Plan 1A): company one_liner and theme description_md are not publicly readable because they are not linted; Plan 1B decides how they reach public pages (decision D8).
- 2026-10-04 (Plan 1A): heartbeats are never pruned (~35k rows/year); add a prune step to DAILY_STEPS if the table passes 5 MB.
- 2026-10-04 (Plan 1A): alert emails come from the external uptime monitor; the React Email template in spec s4 (emails/alert-cron-silent.tsx) waits for Resend in Phase 5.
```

- [ ] **Step 8: Commit and confirm CI**

```bash
git add playwright.config.ts .github/workflows/ci.yml e2e docs/progress.md docs/project-memory/timeline.md docs/specs/technical-debt.md
git commit -m "test(e2e): admin sign-in, capture, publish gate and clocks in CI; close Plan 1A" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin main
gh run watch
```

Expected: `app`, `db` and `e2e` jobs all green.

---

## Coverage map (spec section -> task)

| Spec / ADR requirement | Task |
|---|---|
| s2 Admin `/desk/*` behind magic link limited to `ADMIN_EMAIL`, mobile-first | 6, 12, 14 |
| s2 No client accounts | 0 (signups off), 3 (`clients` value only in schema) |
| s3 Tables, columns, checks | 3 |
| s3 Indexes | 3 |
| s3 RLS on every table; admin all; anon views only; captures/gate_decisions/heartbeats admin-only | 3 (D3) |
| s3 `security_invoker` public views with the 30-day rule in SQL | 4 |
| s3 `is_admin()` and role from a setting, never `user_metadata` | 3 (D5) |
| s3 `publish_revision()` checks, `gate_decisions`, slug, every revision gated, guard trigger | 4, 9 (D1, D4) |
| s3 `unpublish_item()` + cache purge | 4, 9 |
| s3 `lint_allowances`, `allowed_by` in the decision, no rule override | 3, 8, 9 |
| s3 REVOKE EXECUTE by default; signups disabled; admin created by Shlok | 0, 3, 4 (D2) |
| s3 `item_revisions` append-only | 3 |
| s4 `identity` (isAdmin, requireAdmin, getClaims wrapper) | 6 |
| s4 `catalog` (subset: stubs from capture) | 11 |
| s4 `research` (createItem, addRevision, getItemWithHistory, diffRevisions) | 7 |
| s4 `capture` (parseCapture, saveCapture) | 10, 11, 12 |
| s4 `compliance` (lint, policy `sebi-unreg-2026-07`, publish, adversarial tests) | 8, 9 |
| s4 `lib/env.ts`, `lib/supabase/{server,browser,service,public}`, `proxy.ts` refresh only | 5 |
| s4 Import rule (ESLint) | 1 |
| s4 `components/ui` shadcn primitives | 1 |
| s4 `lib/markdown`, `components/desk`, public `(public)` routes, `emails/` | Plan 1B / Phase 5 (debt note in 14) |
| s5 One textarea, autofocus, Enter / Shift+Enter, offline queue | 12 |
| s5 Grammar table | 10 |
| s5 Stub company flagged for review; theme stub | 11 |
| s5 Stored verbatim before parsing | 3 (immutable `raw_text`), 11 |
| s5 Today grouped by company; 30-day streak strip | 12 |
| s6 "What would prove me wrong" required by lint | 8 |
| s6 Revision history + diff (private view) | 7 |
| s6-s7 Public thesis page, desk home | Plan 1B (views from Task 4; `captureStreak` from 12) |
| s8 `/api/cron/daily`, `/api/jobs/run` + GitHub pump, `/api/health` thresholds, uptime monitor, desk red strip | 0, 13 |
| s8 Lint scope: title, slug, learning objective, body, structured, OG derived | 8 |
| s9 Capture failure stays on device | 12 |
| s9 Gate failure returns rule + sentence, highlighted | 8, 9 |
| s9 Supabase unreachable banner on the desk | 13 |
| s9 Every server action re-checks `requireAdmin()` | 6, 7, 9, 11 |
| s10 Vitest: parseCapture, lint adversarial list, research service, env | 5, 7, 8, 10 |
| s10 pgTAP: RLS, invoker views, gate rejects direct updates and underage case studies, revision immutability | 3, 4 |
| s10 Playwright: magic link, capture, publish happy and blocked paths | 14 (public pages at 375/1280 px in Plan 1B) |
| s10 CI: lint, typecheck, vitest, Playwright on a local stack; Vercel preview per PR | 1, 4, 14 (previews: Vercel Git integration, Task 0) |
| ADR s6 / pitfalls s5 Turbopack CSS-404 smoke test with `--webpack` fallback | 2 |
| ADR s8.2, s8.10 three clocks, write-based keep-alive | 13 |
| ADR s8.3 gate on every revision, whole public surface | 4, 8, 9 |
| ADR s8.5 sentence allowlist editable without a developer | 9 |
| ADR s8.6 bypasses (REVOKE, signups, triggers) asserted by pgTAP | 3, 4 |
| ADR s8.9 retraction purges caches | 9 |

## Self-review (run against the spec after writing)

1. **Spec coverage:** every s3, s5, s8, s9 and s10 requirement in scope maps to a task above. Out-of-scope items (s6 public view, s7, `lib/markdown`, `components/desk`, `emails/`) are named in the map and in the debt note. Rule 4 is explicitly deferred (D12).
2. **Placeholder scan:** no "TBD", "TODO", "implement later" or "similar to Task N". Angle-bracket values (`<production-domain>`, `<project-ref>`, `<aksh-email>`, timeline fill-ins) are runtime values only Shlok has. Two conditional fallbacks are spelled out with exact commands: the `--webpack` build (Task 2 Step 5) and the migration file rename (Task 3 Step 6).
3. **Type consistency (fixed inline while writing):** `confirmAdminSession(db, adminEmail?)` matches its callers; `SubmitCaptureResult` carries `retry` and the capture box maps it to `SendOutcome`; `addAllowance` uses `ignoreDuplicates` because `authenticated` has no UPDATE on `lint_allowances`; `LintAllowed.field` is validated against `LINT_FIELDS` when reading decisions back; the gate test counts (22 + 30) match `plan()`; Vitest counts per task match the test files.

## Verified references (checked 2026-10-04)

| Fact used in this plan | Source |
|---|---|
| `create-next-app` flags incl. `--src-dir`, `--use-pnpm`, `--import-alias`, `--skip-install`, `--disable-git`, `--yes`, `--no-*` negation; `--cache-components` is on by default for App Router; `--agents-md` default | https://nextjs.org/docs/app/api-reference/cli/create-next-app and https://github.com/vercel/next.js/blob/canary/packages/create-next-app/index.ts |
| create-next-app refuses non-empty folders except `.claude`, `.git`, `.gitignore`, `docs` and a few others | https://github.com/vercel/next.js/blob/canary/packages/create-next-app/helpers/is-folder-empty.ts |
| Generated `eslint.config.mjs` (defineConfig + `eslint-config-next/core-web-vitals` + `/typescript`), `tsconfig.json` target ES2017 | https://github.com/vercel/next.js/tree/canary/packages/create-next-app/templates/app-tw/ts |
| `proxy.ts` exports `proxy` (or default) + `config.matcher`; Node runtime only; replaces `middleware.ts` | https://nextjs.org/docs/app/api-reference/file-conventions/proxy and https://nextjs.org/docs/app/guides/upgrading/version-16 |
| `after()` is imported from `next/server` (not needed in 1A; Phase 2 pump) | https://nextjs.org/docs/app/api-reference/functions/after |
| `updateTag` from `next/cache` works only in Server Actions; route handlers use `revalidateTag(tag, profile)` | https://nextjs.org/docs/app/api-reference/functions/updateTag |
| Vitest config: `vitest/config` `defineConfig`, `vite-tsconfig-paths` | https://nextjs.org/docs/app/guides/testing/vitest |
| Playwright `webServer`, test against `next start` | https://nextjs.org/docs/app/guides/testing/playwright |
| `createServerClient(url, key, { cookies: { getAll, setAll } })`; `setAll(cookies, headers)` with Cache-Control headers since `@supabase/ssr` 0.10.0; new client per request | https://github.com/supabase/ssr/blob/main/src/types.ts and https://github.com/supabase/ssr/blob/main/_autodocs/api-reference/createServerClient.md |
| Official Next.js server/browser/proxy client code with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `getClaims()` | https://github.com/supabase/supabase/tree/master/examples/auth/nextjs/lib/supabase |
| `auth.getClaims()` verifies the JWT (JWKS) and is preferred over `getUser`/`getSession` | https://supabase.com/docs/reference/javascript/auth-getclaims |
| `signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo } })` | https://supabase.com/docs/guides/auth/auth-email-passwordless |
| PKCE callback with `exchangeCodeForSession(code)`; token-hash confirm with `verifyOtp({ type, token_hash })` | https://supabase.com/docs/guides/auth/server-side/nextjs and https://supabase.com/docs/guides/auth/passwords |
| `auth.admin.generateLink({ type: "magiclink", email })` returns `hashed_token` | https://supabase.com/docs/reference/javascript/auth-admin-generatelink |
| Key formats `sb_publishable_...` / `sb_secret_...`; secret key server-only; env name `SUPABASE_SECRET_KEY` | https://supabase.com/docs/guides/getting-started/api-keys and https://supabase.com/docs/guides/auth/users |
| `alter default privileges for role postgres in schema public revoke ...` to stop automatic API grants | https://supabase.com/docs/guides/api/securing-your-api |
| CLI as dev dependency; `supabase init`, `link --project-ref`, `db push`, `gen types typescript --local`, `test db`, `status -o env` | https://supabase.com/docs/guides/cli, https://supabase.com/docs/reference/cli/supabase-test-db, https://supabase.com/docs/guides/local-development/cli-workflows, https://supabase.com/docs/guides/api/rest/generating-types |
| Local `status -o env` exposes `PUBLISHABLE_KEY` and `SECRET_KEY` (recent CLI) | https://github.com/orgs/supabase/discussions/42047 |
| pgTAP layout (`begin; plan(); ... finish(); rollback;`), `throws_ok(sql, '42501', null, desc)`, `set local role`, `request.jwt.claims` via `set_config` | https://supabase.com/docs/guides/local-development/testing/overview, https://supabase.com/docs/guides/database/postgres/row-level-security, https://supabase.com/docs/reference/server/middleware-withpostgresclient |
| shadcn `init` flags (`--defaults`, `--yes`, `--base`), `add` multiple components, pnpm runner `pnpm dlx` | https://ui.shadcn.com/docs/cli |
| Vercel cron: `crons` in `vercel.json` (or `vercel.ts`, not both); Hobby once per day, fires within the hour; GET with `Authorization: Bearer CRON_SECRET`; no retry, may duplicate; no redirects followed | https://vercel.com/docs/cron-jobs/manage-cron-jobs, https://vercel.com/docs/cron-jobs/usage-and-pricing, https://github.com/vercel/vercel/blob/main/packages/config/README.md |
| GitHub Actions `schedule` cron (5-minute minimum, default branch, delays at load, disabled after 60 days of inactivity on public repos); `workflow_dispatch` | https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule |
| Secrets passed to steps via `env: X: ${{ secrets.X }}` | https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets |
| Turbopack 16.3 CSS-chunk 404 on Vercel; workaround `next build --webpack`; no confirmed fix | https://community.vercel.com/t/turbopack-next-js-16-3-prerendered-html-references-css-chunk-that-404s/48100 |
| Zod 4: `z.url()`, `z.email()`, `z.guid()`, `z.iso.date()`, `.pipe()`, `safeParse` issues | https://zod.dev/api and https://zod.dev/error-formatting |
