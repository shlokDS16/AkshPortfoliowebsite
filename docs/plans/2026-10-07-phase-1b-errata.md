# Plan 1B errata (2026-10-07): binding corrections to `docs/plans/2026-10-06-phase-1b-ui.md`

Status: binding. Where this file and the plan disagree, this file wins; where this file is silent, the plan stands.
Source: pre-flight `.superpowers/sdd/2026-10-06-phase-1b-ui/preflight.md` (161 rows, 22 findings), controller rulings
R1-R22 (`.superpowers/sdd/2026-10-06-phase-1b-ui/progress.md:3`), Plan 1A ledger lines 106, 109, 125
(`.superpowers/sdd/2026-10-04-phase-1a-core/progress.md`). Real code checked at `phase-1a` 50f7841 plus the
Plan 1A Task 14 working tree (`playwright.config.ts`, `e2e/*`).

How to read: an implementer of Plan 1B Task N reads `## Amendment A1`, `## Global`, `## Task order` and `## Task N` only.
`P1234` = plan line. `file:12` = real code line. "Replace" means the plan's block is not built; the code here is.

## Amendment A1 (2026-10-07, controller) - binding, overrides the sections below

Plan 1A's final review added migration `20261007000004_hardening.sql` (already applied to the hosted project; never
edit it). Every Plan 1B reference to `20261007000004_casefile.sql`, `0004_*` tests or "migration 0004" for Plan 1B work
means the following instead:

A1.1 **File names** (replaces G13). The Plan 1B migration is `supabase/migrations/20261007000005_casefile.sql`; its
tests are `supabase/tests/0005_*.test.sql` (`0005_casefile`, `0005_names`). Existing `0004_*` test files belong to
the hardening migration: do not rename or replace them.

A1.2 **`publish_revision`** (replaces R2). Any redefinition starts from the 0004 body: signature
`publish_revision(p_actor uuid, p_item_id uuid, p_revision_id uuid, p_policy_version text, p_lint_result jsonb)`, the
`private.is_admin_user(p_actor)` check, the pinned policy version, IST dates, latest-only `revision` and recorded `slug`
failures. Keep the 0004 privileges: EXECUTE revoked from public/anon/authenticated/service_role, then granted to
service_role only.

A1.3 **`private.is_lagged`** (replaces R19's migration part). 0004 already counts the lag in IST. Do NOT redefine it in
0005 and do not create `0004_ist_lag`/`0005_ist_lag` tests for it (`0004_ist_lag.test.sql` exists). The TS `isLagged`
mirror and its comment cite `20261007000004_hardening.sql`.

A1.4 **`private.guard_publish_columns`** (replaces R3). Start from the 0004 body (line 176 of the hardening migration)
and only add `file_no` to the frozen set. `private.guard_catalog_public_columns` (0004) already freezes companies'
name/slug/nse_symbol/one_liner/sector/bse_code/isin and themes' name/slug while a public item links the row; the New
names screen (Task 13) must not update those columns on a linked row (archive instead, or expect the trigger error).

A1.5 **Gate calls** (ADR-003). Publish, unpublish and lint allowances run only through the existing server-only
`src/modules/compliance/gate-rpc.ts` (service client, verified admin id as `p_actor`). Allowance writes use
`public.add_lint_allowance` / `public.remove_lint_allowance`; authenticated cannot insert/update/delete
`lint_allowances`. No other Plan 1B file imports `@/lib/supabase/service` (G2 stands).

A1.6 **Login copy** (carried from the Plan 1A final review, Q9). The hosted magic link uses PKCE via `/auth/callback`
and only works in the browser that requested it. The styled `/login` page (whichever task restyles it) shows a short
same-browser instruction under the form.

A1.7 **Toast keeps `role="status"`** (supersedes G12's Toast sentence and Task 2 correction 2; ratification
ruling "gap-fill 6 REJECTED", `.superpowers/sdd/2026-10-06-phase-1b-ui/progress.md:5`). The Toast container is
`<div role="status" aria-live="polite" aria-atomic="true" ...>` and its test asserts the role. Any task that mounts
the Toast on a page whose Plan 1A e2e use a strict `page.getByRole("status")` changes those selectors to be specific
(by accessible name or text, e.g. `getByRole("status").filter({ hasText: ... })` or `getByText`), never removes a
status role. The rest of G12 stands (one `?notice=` status paragraph per item page; the capture status line on `/desk`).

## Global

G1. **Start condition.** Plan 1B starts only after Plan 1A Task 14 is committed (its e2e reorganisation is still in the
working tree). Never run two implementers at once (CLAUDE.md).

G2. **Env split** (replaces P29). Public values: `publicEnv()` in `src/lib/env.ts:42` (client-safe). Server secrets:
`serverEnv()` in `src/lib/env.server.ts:20` (`import "server-only"`). Only these two files read `process.env`
(`eslint.config.mjs:36-45`); config files may read `process.env.CI` / `NODE_ENV`. `@/lib/supabase/service` is
job code only (`eslint.config.mjs:13-16`); no Plan 1B file imports it.

G3. **Column grants mean explicit selects.** anon holds column-level SELECT only (`20261005000001_core.sql:414-419`,
`20261005000002_publish.sql:45-46`); every `.select()` names its columns, never `*`. New anon-visible columns need a
`grant select (col)` in the migration.

G4. **Module entries.** `src/app`, `src/modules` and (from Task 1, G4a) `src/components` import a module only through
`@/modules/<m>` (index), `@/modules/<m>/actions` or `@/modules/<m>/client` (ops also `health`, `jobs`)
(`eslint.config.mjs:9-12`). Client components import constants and types from `/client` entries
(`compliance/client.ts:1-5`, `capture/client.ts:1-21`), never from a server index (the compliance index pulls
`server-only` hashing, `compliance/hash.ts:1`). `src/lib` stays a leaf (`eslint.config.mjs:29-35`).
G4a. Task 1 adds to `eslint.config.mjs` after line 22:
`{ files: ["src/components/**/*.{ts,tsx}"], rules: restrict(NO_APP, MODULE_ENTRY_POINTS, NO_SECRET_CLIENT) },`

G5. **Fixed codes only in URLs** (R11; Plan 1A ruling, ledger:71). A desk action redirects only through
`failTo(path, error, label?)` / `doneTo(path, notice, hash?)` (`research/redirects.ts:8-17`); a page shows only
`errorText(code)` / `noticeText(code)` (`research/messages.ts:56-58,80-82`). No `encodeURIComponent(message)`, no
`?published=1`, no rendering of a raw search param. New codes are added to `research/messages.ts` by the task that
first needs them (listed per task). A new typed error is a `ResearchError` subclass (`research/errors.ts:4-6`, exported
from `@/modules/research`) defined in its own module's `errors.ts` (never in a `"use server"` file, which may export
only async functions), and its `code` string is added to `ERROR_CODE_BY_TYPED` (`research/messages.ts:30-37`).
Keep every existing code and notice (`messages.ts:9-23,68-76`).

G6. **Allowances are rule 1 only** (R9; `compliance/policy.ts`, `publish.ts:53-68`, `decisions.md:35`). No UI offers an
allowance for any other rule; an allowance form appears only for a rule-1 failure recorded by the latest gate decision
on the item's newest revision (`allowableHashes`, Task 12).

G7. **Reuse, never copy** (R20): `istDate`/`istTime` (`src/lib/dates.ts`), `ItemKind`/`HoldsPosition`/`isItemId`
(`@/modules/research`, `research/schema.ts:9,12,19`), `describeStale` (`ops/health.ts:67-75`, which uses `formatAge`),
`decisionFromRow` (`compliance/decision.ts:70-91`), `captureSpans` (Task 11, the parser's own scanner),
`webStorage`/`resolveStorageInfo` (`capture/storage.ts:23-57`). `src/lib/desk-types.ts` keeps its
`HoldsPosition` copy (forced by the lib-leaf rule) with an equality test (Task 7).

G8. **Capture queue** (R6, R7). One queue per tab, built with
`createCaptureQueue(resolveStorageInfo(() => webStorage(window.localStorage)).storage, { withLock })` and reached only
through `deskQueue()` (Task 10). Never `createCaptureQueue(window.localStorage)` (`StorageLike` needs `keys()`,
`capture/storage.ts:4-10`). Drops keep their reason (`SendVerdict`, `capture/queue.ts:23`).

G9. **e2e structure** (R13, R14). Reconcile, never replace, the Plan 1A Task 14 config (`playwright.config.ts:10-41`).
Final project list after Task 16 (all `testMatch` use the anchored `spec()` helper, `playwright.config.ts:10`):

| Project | testMatch | depends on | added by |
|---|---|---|---|
| `anon` | `spec("smoke\|auth\|guard\|clocks")` | none | 1A |
| `setup` | `/[\\/]auth\.setup\.ts$/` | `anon` | 1A |
| `desk-mobile`, `desk-desktop` | `spec("desk-[a-z0-9-]+")` (digits: R14) | `setup` | 1A; regex changed in Task 10 |
| `seed` | `/[\\/]seed[\\/]seed\.setup\.ts$/` | `setup` | Task 13 |
| `public-375`, `public-375-dark`, `public-1280`, `public-1280-dark` | `spec("public-[a-z0-9-]+")` | `seed` | Task 14 |
| `reduced-motion` | `spec("motion")` | `seed` | Task 16 |

Existing specs are updated in place: `desk-capture.spec.ts`, `desk-capture-screen.spec.ts`, `desk-clocks.spec.ts`,
`desk-gate.spec.ts`, `desk-items.spec.ts`, `auth.spec.ts`, `guard.spec.ts`, `clocks.spec.ts`, `smoke.spec.ts`. There
is no `e2e/desk-publish.spec.ts`. `retries: 0` stays.

G10. **No hosted seeding, no push, no deploy** (R15). The `seed` project runs only against the local stack
(`e2e/support/stack.ts:18-44` refuses non-local URLs). Agents never run `git push`, `pnpm db:push`, `supabase db push`,
`vercel` or any command against the hosted project. Hosted trial content is entered by Aksh through the desk UI.

G11. **Commit trailer.** Each implementer ends its commit with its own model's trailer
(`Co-Authored-By: <your model name> <noreply@anthropic.com>`; ledger:68), replacing the fixed trailer in every
plan "Commit" step and in P30.

G12. **One `role="status"` per desk page.** Plan 1A desk e2e use strict `page.getByRole("status")`
(`desk-gate.spec.ts:20,30,52,55,70`, `desk-items.spec.ts:37,44,80,94,130`). The only status roles allowed on item pages
are the `?notice=` paragraph; the Toast is an `aria-live` region without a role (Task 2). On `/desk` the capture status
line is the status role; notices there are fine (no spec reads status there).

G13. Migration is `supabase/migrations/20261007000004_casefile.sql` with tests `supabase/tests/0004_*.test.sql` (R1).
Every mention of `20261006000003_casefile.sql` / `0003_casefile.test.sql` in the plan (P109, P5912, P6043, P6047,
P6298, P12095, P12166) means these.

## Task order

Unchanged: 1-6, then 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16.
- Task 7 before 8 still works: Task 7 is pure TypeScript plus `buildLintInput` (Plan 1A code only). Task 8 must precede
  9 (`file_no`, `capture_days`), 11 (`listKnownTokens` reads `company_aliases`, `ignored_tokens`, `archived_at`) and 13.
- Task 8 regenerates `database.types.ts`; Tasks 9, 11, 13 rely on the regenerated types.
- Task 10 now owns the refile action and the body-limit message (R18) because it builds the Needs-you tray.
- Task 13 now owns the `ensureStub` changes (aliases, ignored tokens, slug-clash fallback) because New names writes the
  rows they read.

## Task 1

Corrections: 6.
1. **format.ts reuses dates.ts** (R20). Replaces P467-484. Add to `src/lib/dates.ts` after line 9:
   ```ts
   /** "14:05": the time in India, to the minute. */
   export function istTime(at: Date | string): string {
     return istTimeFormat.format(new Date(at));
   }
   ```
   and change `istDateTime` (`dates.ts:12-14`) to `return \`${istDate(at)} ${istTime(at)} IST\`;`. Add one case to
   `src/lib/dates.test.ts`: `expect(istTime("2026-10-04T08:35:00Z")).toBe("14:05")`. In `format.ts` delete `IST_DAY`,
   `IST_TIME`, import `{ istDate, istTime } from "./dates"`, and use
   `isoDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : istDate(v)` and `formatTime = (v) => istTime(v)`.
   `format.test.ts` (P146-183) unchanged.
2. `desk-types.ts` keeps `HOLDS_POSITION_VALUES`/`HoldsPosition` (P449-450); comment: "Mirrors
   `research/schema.ts:6` (lib cannot import modules); casefile/schema.test.ts asserts equality."
3. P313 comment: "Task 13 adds src/app/desk".
4. ESLint block G4a (one line in `eslint.config.mjs`).
5. P785: `--project=anon` runs smoke, auth, guard and clocks and needs the local stack (`supabase start`); only smoke is
   asserted here.
6. P29 and P30 superseded by G2 and G11.

Tests: `src/lib/dates.test.ts` (+1). Must stay green: all Plan 1A unit tests, `e2e/smoke.spec.ts`.
Depends on: Plan 1A complete (G1).

## Task 2

Corrections: 3.
1. **SegmentedControl test asserts something** (R21). Replaces P933-950 (first `it`). Use three items
   (`chart`, `table`, `notes`); after the click assertion add `onValueChange.mockClear();`, dispatch `ArrowLeft` (from
   the checked `chart`, wrapping), and assert `expect(onValueChange).toHaveBeenCalledExactlyOnceWith("notes")`.
2. **Toast has no status role** (G12). Replaces P1435-1438: the container is
   `<div aria-live="polite" aria-atomic="true" className="…same classes…">` (no `role`).
3. **Toast test restores timers on failure** (R21). Replaces P1050-1062:
   ```tsx
   describe("Toast", () => {
     afterEach(() => vi.useRealTimers());
     it("announces politely without a status role and clears after 4 s", () => {
       vi.useFakeTimers();
       const { result } = renderHook(() => useToast());
       act(() => result.current[1]("Saved 14:05 · private note"));
       const { container, rerender } = render(<Toast message={result.current[0]} />);
       const region = container.firstElementChild!;
       expect(region).toHaveAttribute("aria-live", "polite");
       expect(region).not.toHaveAttribute("role");
       expect(region).toHaveTextContent("Saved 14:05 · private note");
       act(() => vi.advanceTimersByTime(4000));
       rerender(<Toast message={result.current[0]} />);
       expect(region).toBeEmptyDOMElement();
     });
   });
   ```
   (`afterEach` added to the file's vitest import.)

Tests: as above. Depends on: Task 1.

## Task 3, Task 4, Task 5, Task 6

No corrections beyond Global. (Task 10 adds a `variant="desk"` to Task 3's `StreakStrip`.)

## Task 7

Corrections: 4. Replaces P4886 (consumes), P5251-5284, P5325-5340.
1. **New Step 0: one shared lint-input builder** (R10). Create `src/modules/compliance/lint-input.ts`:
   ```ts
   import type { PublishContext } from "./repo";
   import type { LintInput } from "./rules";

   /** The one mapping from stored rows to the lint's input. The gate (publish.ts) and the editor preview (preview.ts) both use it. */
   export function buildLintInput(ctx: PublishContext, today: string): LintInput {
     const { item, revision } = ctx;
     return {
       revisionId: revision.id, kind: item.kind, title: item.title, slug: item.slug, learningObjective: item.learningObjective,
       bodyMd: revision.bodyMd, structured: revision.structured, changeReason: revision.changeReason,
       companyName: ctx.companyName, companyOneLiner: ctx.companyOneLiner, themeName: ctx.themeName,
       companyId: item.companyId, holdsPosition: item.holdsPosition, dataAsOf: item.dataAsOf,
       today, allowances: new Set(ctx.allowances),
     };
   }
   ```
   In `compliance/publish.ts:26-43` replace the inline object with `const lint = lintText(buildLintInput(ctx, deps.today()));`.
   Export from `compliance/index.ts`: `export { buildLintInput } from "./lint-input";`. `publish.test.ts` must stay green
   unchanged.
2. **seed-content.test uses the gate's input** (replaces P5268-5272, P5277-5280). Build a `PublishContext`
   (`compliance/repo.ts:8-26`) per fixture and lint `lintText(buildLintInput(ctx, TODAY))`:
   ```ts
   const ctxFor = (o: { kind: ItemKind; title: string; learningObjective: string; bodyMd: string; structured: Record<string, unknown>;
     changeReason: string; companyId: string | null; companyName: string | null; holdsPosition: HoldsPosition | null; dataAsOf: string | null }): PublishContext => ({
     item: { id: "00000000-0000-4000-8000-0000000000aa", kind: o.kind, title: o.title, slug: null, learningObjective: o.learningObjective,
       companyId: o.companyId, holdsPosition: o.holdsPosition, dataAsOf: o.dataAsOf, visibility: "private" },
     revision: { id: "00000000-0000-4000-8000-0000000000bb", bodyMd: o.bodyMd, structured: o.structured, changeReason: o.changeReason },
     companyName: o.companyName, companyOneLiner: null, themeName: null, allowances: [],
   });
   ```
   Files: `kind: "thesis"`, `companyId: "00000000-0000-4000-8000-000000000001"`, `companyName: file.name`,
   `holdsPosition: "no"`, `dataAsOf: addDays(TODAY, -45)`, `changeReason: rev.reason`, `structured: caseFile`.
   Notes: `companyId: null`, `companyName: null`, `holdsPosition: null`, `dataAsOf: null`, `changeReason: note.reason`,
   `structured: {}`. Imports: `buildLintInput, lintText, type PublishContext` from `@/modules/compliance`;
   `type HoldsPosition, type ItemKind` from `@/modules/research`. Change reasons and company names are now linted too.
3. **Lag counts in India time** (R19). `lag.ts` code (P5327-5340) stands; replace its doc comment with
   "Mirrors SQL `private.is_lagged(d)` as redefined in 20261007000004: `d <= (now() at time zone 'Asia/Kolkata')::date - 30`.
   Callers pass `today = istDate(now)`." Add to `schema.test.ts` (or a new `lag.test.ts`):
   `isLagged("2026-09-06", "2026-10-06") === true`, `isLagged("2026-09-07", "2026-10-06") === false`,
   `withheldUntil("2026-09-07", "2026-10-06") === "2026-10-07"`.
4. **HoldsPosition mirror test** (G7). Append to `schema.test.ts`:
   `expect([...HOLDS_POSITION_VALUES]).toEqual([...HOLDS_POSITIONS])` (`@/lib/desk-types`, `@/modules/research`).

Tests: `src/modules/casefile/*.test.ts` as planned plus items 2-4. Must stay green: `src/modules/compliance/publish.test.ts`,
`lint*.test.ts`. Depends on: Plan 1A Tasks 7-9 (`diffRevisions`, `splitSentences`, `lintText`), Task 1.

## Task 8

Corrections: 9. Replaces the whole of P5911-5914 (file list), P5917-5923 (interfaces), P5925-6012 (pgTAP), P6038-6041,
P6043-6231 (migration), P6233-6236 (expected), and edits P6243-6301.

**Files.** Create `supabase/migrations/20261007000004_casefile.sql`, `supabase/tests/0004_casefile.test.sql`,
`supabase/tests/0004_ist_lag.test.sql`, `supabase/tests/0004_names.test.sql`,
`docs/architecture/ADR-002-casefile-structure-and-file-numbers.md`. Modify `supabase/tests/0002_public_views.test.sql`
(lines 42, 44, 96-98), `supabase/tests/0002_function_privileges.test.sql:26-30`, `supabase/tests/0001_core_rls.test.sql:68-69`,
`supabase/tests/0002_publish_gate.test.sql:39,41`, `src/lib/supabase/database.types.ts` (regenerated). Never edit
0001-0003 migrations (applied to hosted, ledger:90,96).

**Produces.** `items.file_no` (D8), `public_items.file_no` (last column), D9 thesis rule, `capture_days(p_days)` (D10),
`private.is_lagged` in IST (R19, also used by the rule-3 check in `publish_revision`), `companies.archived_at`,
`themes.archived_at`, `public.company_aliases(symbol, company_id)`, `public.ignored_tokens(kind, token)` (R17, admin-only).

**Migration** (complete; `publish_revision` is the `20261006000003_latest_only.sql:9-119` body with only the marked
changes; the guard is the `20261005000002_publish.sql:65-104` body with only the two `file_no` checks added):
```sql
-- =============================================================================
-- 20261007000004_casefile.sql - Plan 1B: the 30-day lag in India time (R19), permanent file
-- numbers (D8), the figures-to rule for files (D9), public capture days (D10), and the New names
-- tables (R17). ADR-002. Continues 20261006000003_latest_only.sql. 0001-0003 are applied to the
-- hosted project: nothing here edits them; each changed function is restated whole.
-- =============================================================================

-- 17. The 30-day lag, counted in India time. Same signature: every policy, view and function that
-- calls it (is_public_item, the public_* views, publish_revision rule 3) follows. casefile/lag.ts mirrors it.
create or replace function private.is_lagged(d date)
returns boolean language sql stable set search_path = ''
as $$
  select d is null or d <= (now() at time zone 'Asia/Kolkata')::date - 30;
$$;
revoke execute on function private.is_lagged(date) from public, anon, authenticated, service_role;
grant execute on function private.is_lagged(date) to anon, authenticated;

-- 18. File numbers (design-dna 11: "File 03", never reused). Assigned only inside publish_revision().
create sequence private.file_no_seq as integer start with 1 minvalue 1 maxvalue 999 no cycle;
revoke all on sequence private.file_no_seq from public, anon, authenticated, service_role;
alter table public.items add column file_no integer unique check (file_no between 1 and 999);
grant select (file_no) on public.items to anon;

-- 19. The publish guard: `create or replace function private.guard_publish_columns()` with the body of
-- 20261005000002_publish.sql:65-104 copied verbatim (owner check, published_at frozen on every row), plus
-- exactly two inserted checks (shown here as the only lines that differ from 0002):
--   (a) inside the INSERT branch, after the visibility/status/published_at check:
--         if new.file_no is not null then
--           raise exception 'items: file_no is assigned only by publish_revision()' using errcode = '42501';
--         end if;
--   (b) right after the published_at check (0002 lines 80-82):
--         if new.file_no is distinct from old.file_no then
--           raise exception 'items: file_no is assigned only by publish_revision()' using errcode = '42501';
--         end if;
-- `git diff --no-index` of the two function bodies must show only (a) and (b). The trigger (0002:106-108) is unchanged.

-- 20. public_items: 20261005000002 section 11 columns and predicate unchanged, file_no appended.
create or replace view public.public_items with (security_invoker = true) as
select i.id, i.kind, i.slug, i.title, i.company_id, i.theme_id, i.published_at, i.data_as_of,
       i.learning_objective, i.holds_position,
       r.id as revision_id, r.rev_no, r.body_md, r.structured, r.schema_version,
       r.created_at as revised_at,
       i.file_no
from public.items i
join public.item_revisions r on r.id = i.current_revision_id
where private.is_public_item(i.visibility, i.status, i.data_as_of);
revoke all on public.public_items from public, anon, authenticated, service_role;
grant select on public.public_items to anon, authenticated;

-- 21. publish_revision: the 20261006000003 body (latest-only 'revision' and recorded 'slug' failures kept),
-- plus rule 3 in India time (R19), the figures-to rule for files (D9) and file numbers (D8).
create or replace function public.publish_revision(
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
  v_slug     text;
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

  if exists (select 1
               from public.item_revisions older
               join public.item_revisions newer on newer.item_id = older.item_id and newer.rev_no > older.rev_no
              where older.id = p_revision_id) then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'revision', 'message', 'A newer revision exists; publish the latest.'));
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
  if v_item.learning_objective is null or length(trim(v_item.learning_objective)) = 0 then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '6', 'message', 'A learning objective is required.'));
  end if;
  if v_item.company_id is not null and v_item.holds_position is null then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '5', 'message', 'holds_position is required when a company is named.'));
  end if;
  -- CHANGED (R19): the lag is private.is_lagged (India time), not current_date (UTC).
  if v_item.kind = 'case_study'
     and (v_item.data_as_of is null or not private.is_lagged(v_item.data_as_of)) then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '3', 'message', 'A case study needs data_as_of at least 30 days old.'));
  end if;
  -- NEW (D9): a company file needs a figures-to date.
  if v_item.kind = 'thesis' and v_item.data_as_of is null then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', '3', 'message', 'A file needs a figures-to date (data_as_of).'));
  end if;
  -- Rule '4' (named-security recency) is reserved: it needs the Phase 3 ledger, and
  -- that phase's migration replaces this function to add the check.
  if exists (select 1 from public.companies c
             where c.id = v_item.company_id and c.visibility <> 'public') then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'company', 'message', 'The linked company is not public.'));
  end if;
  if exists (select 1 from public.themes t
             where t.id = v_item.theme_id and t.visibility <> 'public') then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'theme', 'message', 'The linked theme is not public.'));
  end if;

  v_slug := coalesce(v_item.slug,
              coalesce(nullif(private.slugify(v_item.title), ''), 'item') || '-' || left(v_item.id::text, 6));
  if v_item.slug is null
     and exists (select 1 from public.items o where o.slug = v_slug and o.id <> v_item.id) then
    v_failures := v_failures || jsonb_build_array(jsonb_build_object(
      'rule', 'slug', 'message', format('The slug %s is already used by another item; rename this item.', v_slug)));
  end if;

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
           published_at = coalesce(published_at, now()),
           slug = v_slug,
           -- NEW (D8): a file's first pass takes the next number; it never changes or returns.
           file_no = case when v_item.kind in ('thesis', 'case_study')
                          then coalesce(v_item.file_no, nextval('private.file_no_seq')::integer)
                          else v_item.file_no end
     where id = p_item_id;
    perform set_config('app.publish_gate', 'off', true);
  end if;

  return v_decision;
end;
$$;

-- 22. Public capture days: distinct India dates only (segment 2: "streak shown as counts only").
create function public.capture_days(p_days integer default 30)
returns table (day date)
language sql stable security definer set search_path = ''
as $$
  select distinct (c.created_at at time zone 'Asia/Kolkata')::date
    from public.captures c
   where (c.created_at at time zone 'Asia/Kolkata')::date
         > (now() at time zone 'Asia/Kolkata')::date - least(greatest(p_days, 1), 60)
   order by 1;
$$;

-- 23. New names (R17). "Same as X" records an alias and archives the stub; "Not a company/theme"
-- records an ignored token and archives the stub. catalog ensureStub reads both before creating a stub.
alter table public.companies add column archived_at timestamptz;
alter table public.themes add column archived_at timestamptz;

create table public.company_aliases (
  symbol     text primary key
             check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9][A-Z0-9&-]{0,19}$' and symbol ~ '[A-Z]'),
  company_id uuid not null references public.companies (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index company_aliases_company_id_idx on public.company_aliases (company_id);

create table public.ignored_tokens (
  kind       text not null check (kind in ('symbol', 'theme')),
  token      text not null,
  created_at timestamptz not null default now(),
  primary key (kind, token),
  check ((kind = 'symbol' and token = upper(token) and token ~ '^[A-Z0-9][A-Z0-9&-]{0,19}$' and token ~ '[A-Z]')
      or (kind = 'theme' and token ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(token) <= 80))
);

alter table public.company_aliases enable row level security;
alter table public.ignored_tokens  enable row level security;
create policy company_aliases_admin_all on public.company_aliases for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy ignored_tokens_admin_all on public.ignored_tokens for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on public.company_aliases, public.ignored_tokens from public, anon, authenticated, service_role;
-- No UPDATE or DELETE: decisions are not undone in Phase 1 (D24).
grant select, insert on public.company_aliases, public.ignored_tokens to authenticated;

-- 24. Function privileges (create or replace keeps grants; restated so this file reads alone).
revoke execute on function public.publish_revision(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.publish_revision(uuid, uuid, text, jsonb) to authenticated;
revoke execute on function public.capture_days(integer) from public, anon, authenticated, service_role;
grant execute on function public.capture_days(integer) to anon;
```

**pgTAP** (R4: every expected `pass` publishes the item's latest revision). Fixture dates use
`(now() at time zone 'Asia/Kolkata')::date - N`, never `current_date`. Helper functions as in
`supabase/tests/0003_latest_only.test.sql:11-17`.
- `0004_casefile.test.sql`: `items.file_no` exists; anon has column SELECT on it; insert with `file_no` → 42501; admin
  `update … set file_no` on a private item → 42501, and on a public item → 42501; thesis with `data_as_of` null → `fail`,
  failures contain `{"rule":"3","message":"A file needs a figures-to date (data_as_of)."}`; thesis A (two revisions,
  publish the newer) → `pass` and gets a number; thesis B → `pass`, number = A + 1; publishing A's older revision now →
  `fail` with rule `revision` (0003 behaviour kept); insert A's third revision, publish it → `pass`, number unchanged;
  `unpublish_item(A)` then publish the third revision again → `pass`, number unchanged; a learning note passes with
  `file_no` null; two learning items titled "Dup" with ids sharing the first 6 characters → second publish `fail` with
  rule `slug` (0003 slug failure kept); `public_items` (as anon) exposes `file_no` for A; `capture_days(30)` returns
  exactly the distinct IST dates of captures at now(), now() (twice) and now() − 5 days, not the one at − 40 days;
  `capture_days(1000)` returns no date older than 60 days (capture at − 70 days absent); `capture_days` executable by
  anon only; `publish_revision` still SECURITY DEFINER with `search_path=""`.
- `0004_ist_lag.test.sql`: `is_lagged(null)` true; `is_lagged(ist_today - 30)` true; `is_lagged(ist_today - 29)` false;
  `pg_get_functiondef('private.is_lagged(date)'::regprocedure)` contains `Asia/Kolkata`; still STABLE and executable by
  anon and authenticated; a case study with `data_as_of = ist_today - 29` → `fail` rule 3, with `ist_today - 30` → `pass`;
  as anon, a published learning item with `data_as_of = ist_today - 29` is absent from `public_items` and one at
  `ist_today - 30` is present.
- `0004_names.test.sql`: both tables exist with RLS enabled; `companies.archived_at`, `themes.archived_at` exist and anon
  has no SELECT on them; anon has no privilege on either table; authenticated has SELECT and INSERT, not UPDATE or DELETE;
  service_role has none; as admin: insert alias `('KAVPUMPS', <company>)` and ignored `('symbol','AND')`,
  `('theme','misc')` and read them back; lower-case alias symbol → 23514; `('theme','Bad Slug')` → 23514; kind `'other'`
  → 23514; alias to a missing company → 23503; as a signed-in non-admin (`role = 'client'` profile): selects return no
  rows and insert → 42501.
- Contract edits: P6014-6036 stand (`0002_public_views.test.sql:96-98` gains `file_no`;
  `0002_function_privileges.test.sql:26-30` allowlist gains `capture_days`).
- **IST boundary edits in existing tests** (R19; otherwise they fail 18:30-24:00 UTC): replace `current_date` with
  `(now() at time zone 'Asia/Kolkata')::date` at `0001_core_rls.test.sql:68,69`, `0002_public_views.test.sql:42,44`,
  `0002_publish_gate.test.sql:39,41`. Other `current_date` uses (±40, ±60, −1, 0) are far from the boundary and stay.

**Steps 3 and 5 expected** (replaces P6041, P6236): `pnpm db:reset && pnpm db:test` fails first on the three `0004_*`
files and `0002_public_views`; after the migration every file passes, including the unchanged
`0002_publish_guard.test.sql` (30) and `0003_latest_only.test.sql` (16).

**ADR-002 edits** (P6243-6293): in "2. Current state" add "publish_revision is the 20261006000003 latest-only body";
in "4. Recommendation" add two sentences: "The 30-day lag is counted in India time in one SQL helper
(`private.is_lagged`) that the views, RLS and the gate share; `casefile/lag.ts` mirrors it. New names records
`company_aliases` and `ignored_tokens` and archives the stub (`archived_at`) instead of deleting it." In
"3. Options" add: "New names: (i) null the stub's symbol: rejected, the next capture recreates the stub; (ii) an alias
column on companies: rejected, one company can have many aliases; (iii) alias and ignored-token tables read by the
stub lookup: chosen." Commit paths (P6298): the four new files, the edited tests, `database.types.ts`, the ADR.

Depends on: Plan 1A Tasks 3-4 and the 0003 migration (`20261006000003_latest_only.sql`). Local stack only (G10).

## Task 9

Corrections: 2.
1. `ItemKind` (R20). Replaces P6662: `import type { ItemKind } from "@/modules/research";` plus
   `export type { ItemKind };` in `src/modules/showcase/types.ts`.
2. `today` for the snapshot is `istDate(new Date())` (P6789 stands); `buildFileView`/notes pass that `today` to
   `isLagged`/`withheldUntil` (R19).

Tests: unchanged. Depends on: Task 7, Task 8 (regenerated types), Plan 1A `createSupabasePublicClient`
(`src/lib/supabase/public.ts:11`), `CACHE_TAGS` (`src/lib/cache-tags.ts:2`), `captureStreak` (`capture/index.ts:23`).

## Task 10

Corrections: 13. Replaces P7068-7080 (files/interfaces), P7082-7141, P7196-7210, P7256-7281, P7289-7433,
P7435-7465 (strip text only), P7693-7739, P7741-7839, P7841, P7843-7846.

**Files.** Create `src/modules/ops/liveness.ts`, `src/modules/compliance/blocked.ts`, `src/modules/catalog/counts.ts`,
`src/modules/capture/refile.ts`, `src/components/desk/private/desk-queue.ts`, `use-queue-state.ts`, `desk-shell.tsx`,
`desk-tabs.tsx`, `liveness-strip.tsx`, `offline-strip.tsx`, `tray.tsx`, `needs-you-card.tsx`, `queued-card.tsx`,
`today-list.tsx`, `src/app/desk/desk-data.ts`. Modify `src/app/desk/layout.tsx`, `src/app/desk/page.tsx`,
`src/app/desk/capture-box.tsx` (queue access only), `src/components/desk/streak-strip.tsx` (variant),
`src/modules/research/{schema,messages,index}.ts`, `src/modules/capture/{service,repo,types,messages,index,actions}.ts`,
`src/modules/compliance/index.ts`, `src/modules/ops/index.ts`, `src/modules/catalog/index.ts`,
`src/test/fakes/capture-repo.ts`, `src/test/fakes/research-repo.ts`, `playwright.config.ts` (desk regex),
`e2e/desk-clocks.spec.ts:16`, `e2e/desk-capture.spec.ts` (append). Delete `src/app/desk/health-strip.tsx`,
`src/app/desk/health-strip.test.ts` (cases ported below), `src/app/desk/today-list.tsx`, `src/app/desk/streak-strip.tsx`.
Keep `src/app/desk/capture-box.tsx` and `rejected-list.tsx` until Task 11.

1. **Liveness on ClockCheck** (R5). `src/modules/ops/liveness.ts`:
   ```ts
   import type { Db } from "@/lib/supabase/types";
   import { createSupabaseHeartbeatRepo } from "./heartbeat";
   import { describeStale, getHealthReport, type HealthReport } from "./health";

   export type LivenessState = { status: "ok" } | { status: "late"; problems: string[] } | { status: "unreachable" };

   /** The same per-clock rule as /api/health (health.ts checkClock), in describeStale's words. */
   export function livenessFromReport(report: HealthReport): LivenessState {
     return report.ok ? { status: "ok" } : { status: "late", problems: describeStale(report) };
   }

   /** Read through the session client the caller passes (RLS), never the secret-key client. */
   export async function getLiveness(db: Db, now = new Date()): Promise<LivenessState> {
     try {
       return livenessFromReport(await getHealthReport(createSupabaseHeartbeatRepo(db), now));
     } catch {
       return { status: "unreachable" };
     }
   }
   ```
   Export from `ops/index.ts`: `export { getLiveness, livenessFromReport, type LivenessState } from "./liveness";`.
   No `ageText`. `ops.graph.test.ts` must stay green.
   `liveness.test.ts` (replaces P7082-7119) builds reports with the real `evaluateHealth` (`ops/index.ts:7`) at
   `NOW = 2026-10-06T08:35:00Z`: fresh pump 10 min + daily 600 min → `{ status: "ok" }`; pump 300 min + daily null →
   `problems: ["the 15-minute pump last ran 5 h ago", "the daily job has never run"]`; pump 5 min failed →
   `["the 15-minute pump's last run failed 5 min ago"]`; a `Db` whose `from()` throws → `{ status: "unreachable" }`;
   a recording fake `Db` shows `from("heartbeats")` was called on the db passed in (ported from `health-strip.test.ts:54-58`).
2. **LivenessStrip text** (replaces the `<span>`s at P7449-7460; add `data-testid="health-strip"` to the root `div`):
   late → `<strong>Background jobs are late:</strong> {state.problems.join("; ")}. Your notes are safe; documents wait
   until the jobs run. The uptime monitor has emailed Shlok and Aksh.`; unreachable → `<strong>The database cannot be
   reached right now.</strong> New captures stay saved on this device and sync when it is back.` (Plan 1A wording,
   `health-strip.tsx:17,24`; keeps `e2e/desk-clocks.spec.ts:27,37,38` green). Shell test (P7180-7193) asserts these
   texts and that `"hunter2"` never appears.
3. **Blocked items via decisionFromRow** (R20). `src/modules/compliance/blocked.ts` replaces P7340-7373:
   ```ts
   import { dbError } from "@/lib/supabase/errors";
   import type { Db } from "@/lib/supabase/types";
   import { decisionFromRow, type DecisionRow } from "./decision";

   export type BlockedItem = { itemId: string; title: string; decidedAt: string; failureCount: number };
   type Row = DecisionRow & { item_id: string };
   const COLUMNS = "id, item_id, revision_id, verdict, policy_version, decided_at, reasons";

   /** Rows newest first. Blocked = the latest decision failed; the count is the gate panel's own (decisionFromRow). */
   export function latestFailures(rows: Row[]): Omit<BlockedItem, "title">[] {
     const seen = new Set<string>();
     const out: Omit<BlockedItem, "title">[] = [];
     for (const row of rows) {
       if (seen.has(row.item_id)) continue;
       seen.add(row.item_id);
       const decision = decisionFromRow(row);
       if (decision.verdict === "fail") out.push({ itemId: row.item_id, decidedAt: decision.decidedAt, failureCount: decision.failures.length });
     }
     return out;
   }

   export async function listBlockedItems(db: Db): Promise<BlockedItem[]> {
     const decisions = await db.from("gate_decisions").select(COLUMNS).order("decided_at", { ascending: false }).limit(200);
     if (decisions.error) throw dbError("compliance.listBlocked", decisions.error);
     const blocked = latestFailures(decisions.data ?? []);
     if (blocked.length === 0) return [];
     const titles = await db.from("items").select("id, title").in("id", blocked.map((b) => b.itemId));
     if (titles.error) throw dbError("compliance.listBlockedTitles", titles.error);
     const byId = new Map((titles.data ?? []).map((t) => [t.id, t.title]));
     return blocked.map((b) => ({ ...b, title: byId.get(b.itemId) ?? "Untitled item" }));
   }
   ```
   Export from `compliance/index.ts`; also `export type { BlockedItem } from "./blocked";` in `compliance/client.ts`.
   `blocked.test.ts`: rows carry full `DecisionRow` fields (`id`, `revision_id`, `policy_version`); item a's reasons
   `{ failures: [{ rule: "lint", message: "The text lint did not pass." }], lint: { findings: [f("1"), f("2")], allowedBy: [] } }`
   with `f = (rule) => ({ rule, field: "body", sentence: "s", sentenceHash: "h", match: "m", message: "x" })`; b newest
   pass then older fail; c fails rules 5 and 6. Expected `[{ itemId: "a", …, failureCount: 2 }, { itemId: "c", …, failureCount: 2 }]`.
4. **One queue per tab** (R6, R7, G8). `src/components/desk/private/desk-queue.ts` (moves `capture-box.tsx:23-40`):
   ```ts
   "use client";

   import { submitCapture } from "@/modules/capture/actions";
   import {
     createCaptureQueue, resolveStorageInfo, webStorage,
     type CaptureQueue, type CaptureSource, type FlushResult, type LockRunner, type QueuedCapture, type SendVerdict,
   } from "@/modules/capture/client";

   export const QUEUE_EVENT = "desk:queue";
   export type QueueEventDetail = { kind: "enqueued" } | { kind: "flushed"; sent: number } | { kind: "dismissed" };
   const LOCK_NAME = "desk-capture-flush";

   /** One flush at a time across tabs where the browser supports it; within a tab the queue is single-flight. */
   const withLock: LockRunner = async (fn) => {
     if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request(LOCK_NAME, fn);
     return fn();
   };

   async function sendToServer(entry: QueuedCapture): Promise<SendVerdict> {
     const response = await submitCapture({ clientId: entry.clientId, rawText: entry.rawText, source: entry.source });
     if (response.ok) return "sent";
     return response.retry ? "retry" : { outcome: "drop", reason: response.code };
   }

   let instance: { queue: CaptureQueue; durable: boolean } | null = null;

   /** The tab's one queue (Plan 1A Task 12 ruling 1). Browser only: call from effects and handlers, never in render. */
   export function deskQueue(): { queue: CaptureQueue; durable: boolean } {
     if (!instance) {
       const info = resolveStorageInfo(() => webStorage(window.localStorage));
       instance = { queue: createCaptureQueue(info.storage, { withLock }), durable: info.durable };
     }
     return instance;
   }

   /** Tests only: forget the tab's queue. */
   export function resetDeskQueueForTests(): void {
     instance = null;
   }

   const notify = (detail: QueueEventDetail) => window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail }));

   export const detectSource = (): CaptureSource => (window.matchMedia("(pointer: coarse)").matches ? "mobile" : "web");

   /** Queue first (spec s9): the thought is on the device before any network call. */
   export function enqueueCapture(rawText: string): string {
     const clientId = crypto.randomUUID();
     deskQueue().queue.enqueue({ clientId, rawText, source: detectSource(), queuedAt: new Date().toISOString() });
     notify({ kind: "enqueued" });
     return clientId;
   }

   export async function flushDeskQueue(): Promise<FlushResult> {
     const result = await deskQueue().queue.flush(sendToServer);
     notify({ kind: "flushed", sent: result.sent });
     return result;
   }

   /** Where one capture ended up after a flush: still waiting, refused (kept under Needs attention), or sent. */
   export function outcomeOf(clientId: string): "queued" | "dropped" | "sent" {
     const { queue } = deskQueue();
     if (queue.list().some((e) => e.clientId === clientId)) return "queued";
     if (queue.listRejected().some((e) => e.clientId === clientId)) return "dropped";
     return "sent";
   }

   export function dismissRejected(clientId: string): void {
     deskQueue().queue.dismissRejected(clientId);
     notify({ kind: "dismissed" });
   }
   // dismissCorrupt(key: string): the same, calling deskQueue().queue.dismissCorrupt(key).
   ```
5. `src/components/desk/private/use-queue-state.ts` (replaces P7399-7433):
   ```ts
   "use client";

   import { useEffect, useState, useSyncExternalStore } from "react";
   import { isCaptureStorageKey, type CorruptCapture, type RejectedCapture } from "@/modules/capture/client";
   import { deskQueue, QUEUE_EVENT } from "./desk-queue";

   export type DeskQueueView = { waiting: number; rejected: RejectedCapture[]; corrupt: CorruptCapture[]; durable: boolean };
   const EMPTY: DeskQueueView = { waiting: 0, rejected: [], corrupt: [], durable: true };

   /** The tab's queue as React state: this tab's changes (QUEUE_EVENT) and other tabs' (storage event). */
   export function useDeskQueue(): DeskQueueView {
     const [view, setView] = useState(EMPTY);
     useEffect(() => {
       const read = () => {
         const { queue, durable } = deskQueue();
         setView({ waiting: queue.list().length, rejected: queue.listRejected(), corrupt: queue.listCorrupt(), durable: durable && queue.isDurable() });
       };
       const onStorage = (event: StorageEvent) => void (isCaptureStorageKey(event.key) && read());
       read();
       window.addEventListener(QUEUE_EVENT, read);
       window.addEventListener("storage", onStorage);
       return () => {
         window.removeEventListener(QUEUE_EVENT, read);
         window.removeEventListener("storage", onStorage);
       };
     }, []);
     return view;
   }

   export function useQueuedCount(): number {
     return useDeskQueue().waiting;
   }

   // `subscribe` and `useOnline` exactly as P7421-7432.
   ```
6. **CaptureBox uses the tab queue** (targeted edits to `src/app/desk/capture-box.tsx`; behaviour unchanged, so
   `e2e/desk-capture-screen.spec.ts` stays green): delete lines 23, 26-40 and `queueRef` (45); `getQueue` (53-61) becomes
   `const { queue, durable } = deskQueue(); if (!durable) setDurable(false); return queue;`; line 72 becomes
   `const result = await flushDeskQueue();`; line 120 becomes `enqueueCapture(rawText);`; lines 144 and 153 become
   `dismissRejected(entry.clientId);` / `dismissCorrupt(entry.key);`; add a `QUEUE_EVENT` listener calling `syncView`
   next to the storage listener (93-99). Imports from `@/components/desk/private/desk-queue`.
7. **OfflineStrip / QueuedCard tests** (replace P7196-7203 and P7273-7280): enqueue with
   `deskQueue().queue.enqueue({...})`, then
   `act(() => window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { kind: "enqueued" } })))`;
   `afterEach(() => { resetDeskQueueForTests(); window.localStorage.clear(); })`.
8. **Today list grouped by company** (spec s5; `capture/today.ts:7`; fixed codes, R22). `today-list.tsx` replaces P7695-7739:
   ```tsx
   import Link from "next/link";
   import { formatTime } from "@/lib/format";
   import { filingErrorText, parseCapture, type TodayGroup } from "@/modules/capture";

   const KIND_WORD = { note: "private note", thesis: "thesis", learning: "learning note", process: "process note" } as const;

   /** Today's captures grouped by company (spec s5), newest first; kind and time per row (segment 4 C). */
   export function TodayList({ groups }: { groups: TodayGroup[] }) {
     if (groups.length === 0) return null;
     return (
       <div className="space-y-4">
         {groups.map((group) => (
           <div key={group.key}>
             <h3 className="font-mono text-mono-label uppercase text-ink-muted">{group.label}</h3>
             <ol className="divide-y divide-rule">
               {group.entries.map((e) => (
                 <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-(--row-y)">
                   <div>
                     <p className="whitespace-pre-wrap text-body text-ink">
                       {e.itemId ? <Link href={`/desk/items/${e.itemId}`} className="text-ink no-underline hover:underline">{e.rawText}</Link> : e.rawText}
                     </p>
                     <p className="text-small text-ink-muted">
                       {KIND_WORD[parseCapture(e.rawText).kind]}
                       {e.parseError ? <span className="text-warn"> · {filingErrorText(e.parseError)}</span> : null}
                     </p>
                   </div>
                   <span className="text-small tabular-nums text-ink-muted">{formatTime(e.createdAt)}</span>
                 </li>
               ))}
             </ol>
           </div>
         ))}
       </div>
     );
   }
   ```
   Trays test (P7256-7271): two groups (`KAVPUMP` with a linked thesis at 08:35Z; `No company` with
   `parseError: "filing-failed"`); assert heading `KAVPUMP`, `14:05`, the link, `"private note · Saved, but not filed as
   an item yet."`, and that the text never contains `filing-failed`.
9. **StreakStrip desk variant** (keeps `desk-capture-screen.spec.ts:52` and `desk-home.test.ts:42` unchanged): in
   `src/components/desk/streak-strip.tsx` widen `variant` to `"tile" | "rail" | "desk"`; for `"desk"` the sentence is
   `` `Logged research on ${daysLogged} of the last ${days} days.` `` and no "Last entry".
10. **Body limit and refile** (R18). In `research/schema.ts` add
    `export const BODY_TOO_LONG_MESSAGE = "This revision is too long (200,000 characters max). Start a new item or shorten it.";`
    and use `.max(200_000, BODY_TOO_LONG_MESSAGE)` at lines 24 and 35; export it from `research/index.ts`. In
    `research/messages.ts` add ERRORS `"body-too-long": BODY_TOO_LONG_MESSAGE` text verbatim and
    `"capture-not-refilable": "This capture is already filed, or is still being filed. Reload in a minute."`, typed map
    `CAPTURE_NOT_REFILABLE: "capture-not-refilable"`, NOTICES `refiled: "Filed."`.
    Capture: `FILING_ERRORS = ["filing-failed", "link-failed", "thesis-full"]` with text `"thesis-full": "Saved, but the
    thesis is at its length limit (200,000 characters), so this was not added. Start a new item or shorten the thesis."`
    (`capture/messages.ts:40-50`). In `saveCapture`'s filing catch (`service.ts:94-104`) record
    `error: bodyTooLong(error) ? "thesis-full" : "filing-failed"` and return that code, where
    `const bodyTooLong = (e: unknown) => e instanceof ZodError && e.issues.some((i) => i.message === BODY_TOO_LONG_MESSAGE);`.
    Export `fileCapture` from `service.ts` (internal; used by refile). `CaptureListEntry` gains `parsedMissing: boolean`
    (`types.ts:18-27`), set in `toListEntry` as `asRecord(r.parsed) === null` (`repo.ts:50-61`). `CaptureRepo` gains
    `findById(id: string): Promise<CaptureRecord | null>` (select `CAPTURE_COLUMNS` by id). `ResearchRepo` gains
    `findRevisionContaining(text: string, sinceIso: string, untilIso: string): Promise<{ itemId: string } | null>`
    (select `item_id, body_md` from `item_revisions` between the two times, ordered by `created_at`, limit 50, first row
    whose `body_md.includes(text)`). Update both fakes.
    `src/modules/capture/refile.ts`:
    ```ts
    import { ensureCompany, ensureTheme } from "@/modules/catalog";
    import { ResearchError } from "@/modules/research";
    import { parseCapture } from "./parse";
    import { fileCapture, type SaveCaptureDeps } from "./service";
    import type { CaptureListEntry } from "./types";

    export const REFILE_AFTER_MS = 10 * 60_000;
    const LINK_WINDOW_MS = 15 * 60_000;

    export class CaptureNotRefilableError extends ResearchError {
      readonly code = "CAPTURE_NOT_REFILABLE";
      constructor() { super("This capture is already filed, or is still being filed. Reload in a minute."); this.name = "CaptureNotRefilableError"; }
    }

    type RefileView = Pick<CaptureListEntry, "itemId" | "parseError" | "parsedMissing" | "createdAt">;

    /** No item, and either a recorded filing failure, or no parse at all after 10 minutes (killed function, lost link). */
    export function needsRefile(entry: RefileView, now: Date): boolean {
      if (entry.itemId !== null) return false;
      if (entry.parseError === "filing-failed") return true;
      return entry.parsedMissing && now.getTime() - new Date(entry.createdAt).getTime() >= REFILE_AFTER_MS;
    }

    /** Files a stored capture again. If an item already holds its text (the link was lost), links that item instead. */
    export async function refileCapture(deps: SaveCaptureDeps, captureId: string, now: Date): Promise<{ itemId: string }> {
      const record = await deps.captures.findById(captureId);
      const error = record?.parsed?.error;
      const view: RefileView | null = record && {
        itemId: record.itemId,
        parseError: error === "filing-failed" ? "filing-failed" : null,
        parsedMissing: record.parsed === null,
        createdAt: record.createdAt,
      };
      if (!record || !view || !needsRefile(view, now)) throw new CaptureNotRefilableError();
      const parsed = parseCapture(record.rawText);
      const until = new Date(new Date(record.createdAt).getTime() + LINK_WINDOW_MS).toISOString();
      const existing = await deps.research.findRevisionContaining(parsed.body, record.createdAt, until);
      const filed = existing
        ? {
            itemId: existing.itemId,
            company: parsed.symbols[0] ? await ensureCompany(deps.catalog, parsed.symbols[0]) : null,
            theme: parsed.themes[0] ? await ensureTheme(deps.catalog, parsed.themes[0]) : null,
          }
        : await fileCapture(deps, parsed);
      await deps.captures.attach(record.id, {
        parsed: { ...parsed },
        itemId: filed.itemId,
        companyId: filed.company?.id ?? null,
        themeId: filed.theme?.id ?? null,
      });
      return { itemId: filed.itemId };
    }
    ```
    (Task 13 changes the two `ensure*` calls to the first-resolved helper.) Export `needsRefile`, `refileCapture`,
    `CaptureNotRefilableError`, `REFILE_AFTER_MS` from `capture/index.ts`. Append to `capture/actions.ts`:
    ```ts
    export async function refileCaptureAction(captureId: string): Promise<void> {
      await requireAdmin();
      if (!isItemId(captureId)) failTo("/desk", new CaptureNotRefilableError(), "capture");
      try {
        await refileCapture(createCaptureDeps(await createSupabaseServerClient()), captureId, new Date());
      } catch (error) {
        failTo("/desk", error, "capture");
      }
      revalidatePath("/desk");
      doneTo("/desk", "refiled");
    }
    ```
    (imports `doneTo, failTo, isItemId` from `@/modules/research`, `CaptureNotRefilableError, refileCapture` from
    `./refile`). Thesis-full rows are not refilable (they would fail again) and show their text only.
11. **NeedsYouCard form action.** Add optional `form?: { label: string; action: () => Promise<void> }` to the props
    (P7640); render `<form action={form.action} className="mt-3"><Button type="submit">{form.label}</Button></form>`
    after the link. Never both `action` and `form`.
12. **Routes.** `src/app/desk/desk-data.ts` (one read per request for layout and page, preflight row 120):
    ```ts
    import { cache } from "react";
    import { createSupabaseServerClient } from "@/lib/supabase/server";
    import { countNamesToReview } from "@/modules/catalog";

    /** Read once per request (layout badge and home tray). A failed read shows 0; the name only is logged. */
    export const namesToReview = cache(async (): Promise<number> => {
      try {
        return await countNamesToReview(await createSupabaseServerClient());
      } catch (error) {
        console.error("desk: could not count new names", error instanceof Error ? error.name : typeof error);
        return 0;
      }
    });
    ```
    `countNamesToReview` (P7384-7392) adds `.is("archived_at", null)` to both queries. Layout (replaces P7743-7764):
    `const [liveness, names] = await Promise.all([getLiveness(await createSupabaseServerClient()), namesToReview()]);`
    then `<DeskShell names={names} liveness={liveness} signOut={signOut}>`. Page (replaces P7768-7839), keeping Plan 1A's
    never-blank fallback (`src/app/desk/page.tsx:9-17,27-31`):
    ```tsx
    /** Name only in the log: a database message can carry row data. */
    async function read<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
      try { return await load(); } catch (error) {
        console.error(`desk home: could not load ${label}`, error instanceof Error ? error.name : typeof error);
        return fallback;
      }
    }

    export default async function DeskHome({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
      await requireAdmin();
      const { error, notice } = await searchParams;
      const db = await createSupabaseServerClient();
      const now = new Date();
      const today = istDate(now);
      const [entries, blocked, names] = await Promise.all([
        read<CaptureListEntry[] | null>("captures", () => listCapturesSince(db, istDayStartUtc(addDays(today, -29))), null),
        read<BlockedItem[]>("blocked items", () => listBlockedItems(db), []),
        namesToReview(),
      ]);
      const unfiled = (entries ?? []).filter((e) => needsRefile(e, now) || e.parseError === "thesis-full");
      const groups = entries === null ? [] : groupTodayByCompany(entries, today);
      const errorMessage = errorText(error);
      const noticeMessage = noticeText(notice);
      return (
        <div className="space-y-(--block-gap)">
          <h1 className="sr-only">Desk</h1>
          {errorMessage ? <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">{errorMessage}</p> : null}
          {noticeMessage ? <p className="rounded-sm border border-rule px-3 py-2 text-small text-ink">{noticeMessage}</p> : null}
          <CaptureBox />
          {entries === null ? (
            <p role="alert" className="text-small text-ink-muted">Could not load today&apos;s captures. New captures are still saved; reload to try again.</p>
          ) : null}
          <div className="grid gap-(--block-gap) desk:grid-cols-2">
            <Tray title="Needs you" count={blocked.length + unfiled.length + (names > 0 ? 1 : 0)} empty={{ body: "Nothing needs you. New gate failures and new names appear here." }}>
              {/* blocked cards exactly as P7808-7817 */}
              {unfiled.map((e) => (
                <NeedsYouCard
                  key={e.id}
                  tone="warn"
                  stateWord="Not filed"
                  title={e.rawText.split("\n")[0]}
                  body={filingErrorText(e.parseError === "thesis-full" ? "thesis-full" : "filing-failed")}
                  form={e.parseError === "thesis-full" ? undefined : { label: "File it now", action: refileCaptureAction.bind(null, e.id) }}
                />
              ))}
              {/* names card and <QueuedCard /> exactly as P7818-7827 */}
            </Tray>
            <Tray title="Today" count={groups.reduce((n, g) => n + g.entries.length, 0)} empty={{ body: "Nothing captured yet today." }}>
              <TodayList groups={groups} />
            </Tray>
          </div>
          {entries === null ? null : (
            <section aria-label="Capture streak">
              <StreakStrip variant="desk" {...toStreakData(captureStreak(entries.map((e) => istDate(e.createdAt)), today))} />
            </section>
          )}
        </div>
      );
    }
    ```
    (Imports: `filingErrorText, groupTodayByCompany, listCapturesSince, needsRefile, captureStreak, toStreakData, type
    CaptureListEntry` from `@/modules/capture`; `refileCaptureAction` from `@/modules/capture/actions`;
    `listBlockedItems, type BlockedItem` from `@/modules/compliance`; `errorText, noticeText` from `@/modules/research`.)
    The notice paragraph carries no role on `/desk` (the capture status line is the status role there).
13. **Tests and specs.** Update `src/app/desk/desk-home.test.ts` (keep both cases and their assertions): call
    `DeskHome({ searchParams: Promise.resolve({}) })`; add mocks `vi.mock("@/modules/compliance", () => ({ listBlockedItems: vi.fn(async () => []) }))`,
    `vi.mock("./desk-data", () => ({ namesToReview: vi.fn(async () => 0) }))`,
    `vi.mock("@/modules/capture/actions", () => ({ refileCaptureAction: vi.fn() }))`.
    `capture/repo.test.ts`: assert `parsedMissing` true for `parsed: null`. Add `src/modules/capture/refile.test.ts`
    (fakes): filing-failed refiles at once; parsed-null refiles only at ≥ 10 min; a capture whose text already sits in a
    revision written after it links that item and creates none; a filed capture throws `CaptureNotRefilableError`.
    `src/modules/capture/service.test.ts`: a `t:` append past 200,000 records `thesis-full`.
    `playwright.config.ts:13`: `testMatch: spec("desk-[a-z0-9-]+")` (R14). `e2e/desk-clocks.spec.ts:16`: link name
    `"Capture"` (D18 renamed the tab). Append to `e2e/desk-capture.spec.ts`: "refile files a failed capture, and links an
    item whose capture link was lost" (filing-failed via the broken `insertItem` of lines 95-98, then `refileCapture`
    → `item_id` set; a broken `captures.attach` save, then `refileCapture(deps, id, new Date(Date.now() + 11 * 60_000))`
    → same item id, one item with that text).

Must stay green: `e2e/desk-capture-screen.spec.ts` (unchanged), `e2e/desk-items.spec.ts`, `e2e/desk-gate.spec.ts`,
`e2e/desk-clocks.spec.ts` (line 16 only edited), `src/modules/capture/*.test.ts`, `ops.graph.test.ts`.
Depends on: Plan 1A Tasks 6, 11-13; Plan 1B Tasks 2, 3, 9 (`toStreakData`).

## Task 11

Corrections: 12. Replaces P7860-7871, P7873-7903 (extended), P7970, P8013-8053, P8077-8121, P8135-8145 (two lines),
P8167-8198, P8200-8267, P8480-8565 (edits), P8567-8630, P8632-8684 (edits), P8686-8843, P8845, P8850.

**Files.** Create `src/modules/capture/highlight.ts`, `compose.ts`, `src/modules/catalog/tokens.ts`,
`src/components/desk/private/{use-capture-save,token-class,capture-field,capture-receipt,capture-text,grammar-key-row,capture-button,capture-sheet,capture-status,capture-dock}.tsx/ts`.
`git mv src/app/desk/capture-box.tsx src/components/desk/private/capture-bar.tsx` and
`git mv src/app/desk/rejected-list.tsx src/components/desk/private/needs-attention.tsx`, then restyle (R7: move and
restyle, never rewrite the queue logic). Modify `src/modules/capture/parse.ts`, `client.ts`, `index.ts`,
`src/components/desk/private/use-queue-state.ts`, `today-list.tsx`, `src/app/desk/{layout,page,desk-data}.tsx/ts`,
`src/app/desk/desk-home.test.ts` (mock path), `e2e/desk-capture.spec.ts` (P8057-8070 appended as planned).
In this task `capture-box.tsx:N` means line N of `git show 50f7841:src/app/desk/capture-box.tsx` (before Task 10's edits).

1. **One scanner** (R20). Do not export the regexes (P8077). In `parse.ts` replace `parseCapture` (`parse.ts:71-88`) with:
   ```ts
   export type CaptureSpanKind = "prefix" | "symbol" | "theme" | "url";
   /** A token exactly as parseCapture reads it, placed in the raw text (start inclusive, end exclusive). */
   export type CaptureSpan = { kind: CaptureSpanKind; start: number; end: number; value: string };

   // One scanner for parseCapture and the highlighter, so colour and filing can never disagree.
   function scan(raw: string): { kind: CaptureKind; body: string; spans: CaptureSpan[] } {
     const prefix = PREFIX_RE.exec(raw);
     const kind: CaptureKind = prefix ? (PREFIXES[prefix[1].toLowerCase()] ?? "note") : "note";
     const rest = prefix ? raw.slice(prefix[0].length) : raw;
     const bodyStart = raw.length - rest.length + (rest.length - rest.trimStart().length);
     const body = rest.trim();
     const spans: CaptureSpan[] = [];
     if (prefix) {
       const at = prefix[0].indexOf(prefix[1]);
       spans.push({ kind: "prefix", start: at, end: at + 2, value: prefix[1].toLowerCase() });
     }
     // Mask URLs (same length) so a "#fragment" or "$" inside one is never read as a token.
     const masked = body.replace(URL_RE, (m) => " ".repeat(m.length));
     for (const m of masked.matchAll(SYMBOL_RE)) {
       const token = m[2].replace(/[&-]+$/, "");
       const value = token.toUpperCase();
       // NSE symbols may start with a digit (5PAISA, 360ONE) but must contain a letter, so "$500" is a price.
       if (!/[A-Z]/.test(value) || AMOUNT_RE.test(value)) continue;
       const start = bodyStart + m.index + m[1].length;
       spans.push({ kind: "symbol", start, end: start + 1 + token.length, value });
     }
     for (const m of masked.matchAll(THEME_RE)) {
       const token = m[2].replace(/-+$/, "");
       const start = bodyStart + m.index + m[1].length;
       spans.push({ kind: "theme", start, end: start + 1 + token.length, value: token.toLowerCase() });
     }
     for (const m of body.matchAll(URL_RE)) {
       const url = trimUrl(m[0]);
       if (url) spans.push({ kind: "url", start: bodyStart + m.index, end: bodyStart + m.index + url.length, value: url });
     }
     return { kind, body, spans: spans.sort((a, b) => a.start - b.start) };
   }

   export function captureSpans(raw: string): CaptureSpan[] {
     return scan(raw).spans;
   }

   export function parseCapture(raw: string): ParsedCapture {
     const { kind, body, spans } = scan(raw);
     const values = (k: CaptureSpanKind) => unique(spans.filter((s) => s.kind === k).map((s) => s.value));
     const firstLine = (body.split(/\r?\n/)[0] ?? "").trim();
     const title = truncateUnits(firstLine.replace(URL_RE, "").replace(/\s+/g, " ").trim(), TITLE_MAX) || "Untitled capture";
     return { kind, symbols: values("symbol"), themes: values("theme"), urls: values("url"), title, firstLine, body };
   }
   ```
   `parse.test.ts` (all 54+) must pass unchanged. Add `captureSpans, type CaptureSpan, type CaptureSpanKind` to
   `capture/client.ts` and `capture/index.ts`.
2. **Highlighter on the spans** (replaces P8079-8121):
   ```ts
   import { captureSpans, type CaptureSpan } from "./parse";

   export type CaptureTokenKind = "plain" | "key" | "company" | "company-new" | "theme" | "theme-new" | "url";
   export type CaptureToken = { text: string; kind: CaptureTokenKind };
   export type KnownTokens = {
     symbols: ReadonlySet<string>; themes: ReadonlySet<string>; ignoredSymbols: ReadonlySet<string>; ignoredThemes: ReadonlySet<string>;
   };

   function kindOf(span: CaptureSpan, known: KnownTokens): CaptureTokenKind {
     if (span.kind === "prefix") return "key";
     if (span.kind === "url") return "url";
     if (span.kind === "symbol") return known.ignoredSymbols.has(span.value) ? "plain" : known.symbols.has(span.value) ? "company" : "company-new";
     return known.ignoredThemes.has(span.value) ? "plain" : known.themes.has(span.value) ? "theme" : "theme-new";
   }

   /** Live colouring (segment 4 A) from the parser's own spans; colour never changes the text. */
   export function highlightCapture(raw: string, known: KnownTokens): CaptureToken[] {
     const tokens: CaptureToken[] = [];
     let at = 0;
     for (const span of captureSpans(raw)) {
       if (span.start < at) continue;
       if (span.start > at) tokens.push({ text: raw.slice(at, span.start), kind: "plain" });
       tokens.push({ text: raw.slice(span.start, span.end), kind: kindOf(span, known) });
       at = span.end;
     }
     if (at < raw.length) tokens.push({ text: raw.slice(at), kind: "plain" });
     return tokens;
   }
   ```
   Tests: every `known` gains `ignoredSymbols: new Set<string>(), ignoredThemes: new Set<string>()`; add cases
   "`$500` and `$5M` stay plain", "a `#frag` inside a URL is part of the URL, not a theme", "an ignored `$AND` is plain".
3. **Receipt skips ignored tokens** (P8139-8140): `const symbol = parsed.symbols.find((s) => !known.ignoredSymbols.has(s));`
   `const theme = parsed.themes.find((t) => !known.ignoredThemes.has(t));` (mirrors Task 13's first-resolved filing).
   Add a compose test: `"$AND $KAVPUMP"` with `AND` ignored → company chip `$KAVPUMP`.
4. **Known tokens include aliases and ignored tokens** (R17). `catalog/tokens.ts` replaces P8177-8196:
   ```ts
   export type KnownTokenLists = { symbols: string[]; themes: string[]; ignoredSymbols: string[]; ignoredThemes: string[] };

   /** Screened, non-archived companies and themes plus aliases are known; ignored tokens colour as plain text. */
   export async function listKnownTokens(db: Db): Promise<KnownTokenLists> {
     const [companies, aliases, themes, ignored] = await Promise.all([
       db.from("companies").select("nse_symbol").eq("needs_review", false).is("archived_at", null).not("nse_symbol", "is", null),
       db.from("company_aliases").select("symbol"),
       db.from("themes").select("slug").eq("needs_review", false).is("archived_at", null),
       db.from("ignored_tokens").select("kind, token"),
     ]);
     for (const r of [companies, aliases, themes, ignored]) if (r.error) throw dbError("catalog.knownTokens", r.error);
     return {
       symbols: [...(companies.data ?? []).flatMap((c) => (c.nse_symbol ? [c.nse_symbol] : [])), ...(aliases.data ?? []).map((a) => a.symbol)],
       themes: (themes.data ?? []).map((t) => t.slug),
       ignoredSymbols: (ignored.data ?? []).filter((i) => i.kind === "symbol").map((i) => i.token),
       ignoredThemes: (ignored.data ?? []).filter((i) => i.kind === "theme").map((i) => i.token),
     };
   }
   ```
   `useKnown` (P8296-8298) builds all four sets. `src/app/desk/desk-data.ts` adds
   `export const knownTokens = cache(async (): Promise<KnownTokenLists> => …)` with the same try/log/fallback
   (`{ symbols: [], themes: [], ignoredSymbols: [], ignoredThemes: [] }`); layout and page call it.
5. **Lifecycle once per tab** (moves `capture-box.tsx:81-114`). Append to `use-queue-state.ts`:
   ```ts
   const RETRY_MS = 30_000;

   /** Mounted once (CaptureDock): first flush, online, 30 s retry while anything waits, and a warning before
    *  closing when nothing survives a reload (Plan 1A Task 12 rulings). */
   export function useQueueLifecycle(onSent: () => void): void {
     const { waiting, durable } = useDeskQueue();
     const flush = useCallback(async () => {
       if ((await flushDeskQueue()).sent > 0) onSent();
     }, [onSent]);
     // The three effects of src/app/desk/capture-box.tsx:81-90, 102-106 and 108-114, verbatim (they call this `flush`).
     // Its focus line (82) is not moved: the bar focuses itself.
   }
   ```
   (`useCallback` and `flushDeskQueue` added to its imports.)
6. **Save path** (replaces P8202-8267):
   ```ts
   "use client";

   import { useRouter } from "next/navigation";
   import { useCallback } from "react";
   import { useToast } from "@/components/ui/toast";
   import { formatTime } from "@/lib/format";
   import { enqueueCapture, flushDeskQueue, outcomeOf } from "./desk-queue";

   /** Queue first, then flush the tab's one queue. A refusal keeps the text under Needs attention with its reason. */
   export function useCaptureSave() {
     const router = useRouter();
     const [toast, showToast] = useToast();
     const save = useCallback(async (rawText: string, label: string): Promise<void> => {
       const clientId = enqueueCapture(rawText);
       await flushDeskQueue();
       const outcome = outcomeOf(clientId);
       if (outcome === "queued") showToast("Saved on this phone. It will sync.");
       if (outcome !== "sent") return; // "dropped": the text waits under Needs attention with its reason
       showToast(`Saved ${formatTime(new Date().toISOString())} · ${label}`);
       router.refresh();
     }, [router, showToast]);
     return { toast, save };
   }
   ```
7. **Status line and durable warning, shared** (Plan 1A wording, `capture-box.tsx:159-186`).
   `capture-status.tsx`:
   ```tsx
   "use client";

   import { useEffect, useState } from "react";
   import { QUEUE_EVENT, type QueueEventDetail } from "./desk-queue";
   import { useDeskQueue } from "./use-queue-state";

   export function CaptureStatus({ dirty }: { dirty: boolean }) {
     const { waiting, durable } = useDeskQueue();
     const [saved, setSaved] = useState(false);
     useEffect(() => {
       const on = (event: Event) => {
         const detail = (event as CustomEvent<QueueEventDetail>).detail;
         if (detail?.kind === "enqueued") setSaved(false);
         else if (detail?.kind === "flushed" && detail.sent > 0) setSaved(true);
       };
       window.addEventListener(QUEUE_EVENT, on);
       return () => window.removeEventListener(QUEUE_EVENT, on);
     }, []);
     const text = waiting > 0 ? `Saved on this device, will sync (${waiting} waiting).` : saved && !dirty ? "Saved." : "";
     return (
       <>
         <p role="status" className="min-h-5 text-small text-ink-muted">{text}</p>
         {durable ? null : (
           <p role="alert" className="text-small text-bad">
             Offline saving is unavailable on this device (browser storage is blocked or full). Captures that cannot reach the desk are
             kept only until you close or reload this page.
           </p>
         )}
       </>
     );
   }
   ```
8. **Needs attention** (moved `rejected-list.tsx`, R7): keep `AttentionItem`, the section
   `aria-label="Needs attention"`, heading "Needs attention (still on this device)", `data-testid="attention-text"`,
   "Copy text", "Dismiss", "Copied." / "Copy is blocked here; select the text above."; token classes only
   (`border-bad`, `bg-surface-2`, `text-ink-muted`). Add `export function NeedsAttention()` in the same file that reads
   `useDeskQueue()` and builds the items exactly as `capture-box.tsx:138-157`, with `onDismiss` calling
   `dismissRejected` / `dismissCorrupt` from `desk-queue.ts`; it renders `<RejectedList items={…} />`.
9. **CaptureBar** (the moved `capture-box.tsx`, replaces P8569-8630). Keep the file's role and text; replace its
   body with:
   ```tsx
   export function CaptureBar({ known }: { known: KnownTokenLists }) {
     const sets = useKnown(known);
     const field = useRef<HTMLTextAreaElement>(null);
     const [value, setValue] = useState("");
     const { toast, save } = useCaptureSave();
     const insert = useTokenInsert(field, value, setValue);
     const receipt = captureReceipt(value, sets);
     useEffect(() => field.current?.focus(), []);
     async function submit() {
       const raw = value;
       if (raw.trim() === "") return;
       setValue(""); // already safe: save() queues on the device before any network call
       try {
         await save(raw, receiptLabel(receipt));
       } finally {
         field.current?.focus();
       }
     }
     return (
       <section aria-label="Capture a thought" className="space-y-2 rounded-sm border border-rule bg-surface p-3">
         <CaptureField ref={field} id="capture-bar" value={value} onChange={setValue} onSubmit={submit} known={sets}
           placeholder="What did you just notice?   $company  #theme  t:  l:  p:" />
         <CaptureReceipt model={receipt} />
         <CaptureStatus dirty={value !== ""} />
         <div className="desk:hidden"><GrammarKeyRow onInsert={insert} /></div>
         <NeedsAttention />
         <Toast message={toast} />
       </section>
     );
   }
   ```
   (`CaptureReceipt` loses its `queued` prop, P8384-8388; the status line says it.) The desk breakpoint placeholder
   switch (P8581-8591, P8612) is dropped: one placeholder.
10. **CaptureSheet** edits (P8507-8553): `const { toast, save } = useCaptureSave();`; `submit` =
    `const raw = value; if (raw.trim() === "") return; setValue(""); await save(raw, receiptLabel(receipt)); if (window.matchMedia("(pointer: coarse)").matches) onOpenChange(false);`;
    replace the `state === "error"` block (P8540-8547) with `<CaptureStatus dirty={value !== ""} /><NeedsAttention />`;
    `CaptureReceipt` without `queued`; Save button `disabled={!value.trim()}` with label "Save".
    **CaptureDock** edits (P8654, P8660-8665): delete `useCaptureSave` and the flush effect; add
    `const router = useRouter(); const refresh = useCallback(() => router.refresh(), [router]); useQueueLifecycle(refresh);`.
11. **TodayList colouring** (replaces P8688-8735): keep Task 10's grouped list; add prop `known: KnownTokenLists`
    and render `<CaptureText raw={e.rawText} known={sets} />` (sets built with all four lists) inside the existing
    link/span. Routes: layout passes `capture={<CaptureDock known={await knownTokens()} />}` (replaces P8741-8767);
    page replaces `<CaptureBox />` with `<CaptureBar known={known} />` and `<TodayList groups={groups} known={known} />`,
    reading `knownTokens()` in its `Promise.all` (replaces P8771-8843; Task 10's fallbacks stay).
12. **Tests.** `capture.test.tsx` CaptureDock cases (replace P8013-8053) with
    `afterEach(() => { resetDeskQueueForTests(); window.localStorage.clear(); })`:
    (a) sheet save with `{ ok: true, captureId: "c1", itemId: null, duplicate: false, parseError: null }` →
    field empty and `screen.getByText(/^Saved \d{2}:\d{2} · \$KAVPUMP$/)`; (b) `{ ok: false, retry: false, code: "too-long", message: "x" }` →
    field empty, `getByRole("region", { name: "Needs attention" })` holds "keep me" and "too long to capture";
    (c) `mockRejectedValue(new TypeError("Failed to fetch"))` → toast text "Saved on this phone. It will sync.",
    status "Saved on this device, will sync (1 waiting).", a `desk.captureQueue.v1:` key in `localStorage`.
    `desk-home.test.ts`: mock `@/components/desk/private/capture-bar` (returns the `BOX` div) instead of `./capture-box`,
    and `./desk-data` also returns `knownTokens: async () => ({ symbols: [], themes: [], ignoredSymbols: [], ignoredThemes: [] })`.
    Run (replaces P8850): `pnpm exec playwright test --project=setup --project=desk-mobile --project=desk-desktop`.

Must stay green unchanged: `e2e/desk-capture-screen.spec.ts` (all 10), `e2e/auth.setup.ts:14`, `parse.test.ts`,
`queue.test.ts`, `client.test.ts`. Depends on: Task 8 (tables), Task 10 (`desk-queue.ts`, `use-queue-state.ts`,
`TodayList`, `desk-data.ts`), Task 2 (`Toast`, `sheetMotion`).

## Task 12

Corrections: 16. Replaces P8866-8878, P8887-8894, P8919-8941 (extended), P8949-8956, P8992-9071 (edits),
P9079-9124 (lint input), P9129-9169 (allowable), P9208-9251, P9275-9316, P9339-9356, P9383, P9410-9436 (text),
P9446-9490 (edits), P9498, P9554-9585, P9587-9677 (edits), P9693-9717 (key), P9794-9833, P9835-9873, P9875-9943,
P9981-9985, P10001-10050, P10055, P10060.

**Revised D17 (R8).** The preview is advisory and computed on the server from the latest saved revision with
`buildLintInput` (no TS slug). "Run the publishing gate on revision #n" is always enabled when a candidate exists; the
gate decides and records. "Allow sentence" appears only for a rule-1 failure recorded on the latest revision; after
allowing, Aksh runs the gate again.

1. **Preview lint input** (R10). In `preview.ts` delete the `slugify` import and the `lintText({...})` literal
   (P9100-9104); use `const lint = lintText(buildLintInput(ctx, today));`.
2. **Allowable = recorded rule-1 failure on the latest revision** (R8, R9). Add to `compliance/decision.ts`:
   ```ts
   /** Rule 1 hashes the latest recorded decision flagged on the item's newest revision: the only sentences an allowance may cover. */
   export function allowableHashes(decision: GateDecision | null, latestRevisionId: string | null): Set<string> {
     if (!decision || !latestRevisionId || decision.revisionId !== latestRevisionId) return new Set();
     return new Set(decision.failures.flatMap((f) => (f.rule === "1" && f.sentenceHash ? [f.sentenceHash] : [])));
   }
   ```
   `allowFlaggedSentence` (`publish.ts:58-68`) uses it: `if (!allowableHashes(decision, latestRevisionId).has(sentenceHash)) return false;`
   (`publish.test.ts` stays green). Export from `compliance/index.ts` and `compliance/client.ts`. `annotateBody` gains a
   fourth parameter `allowable: ReadonlySet<string>` and sets
   `allowable: f.rule === "1" && allowable.has(f.sentenceHash!)` (replaces P9137's `f.rule === "1" || f.rule === "2"`).
3. **Client entry for types.** `compliance/client.ts` adds
   `export type { AllowanceRecord, AnnotatedBody, BodyFlag, BodySegment, ChecklistItem, ChecklistState } from "./preview";`.
   Client components (`gate-note.tsx`, `publish-checklist.tsx`, `allowance-form.tsx`) and `body-preview.tsx` import types
   and `RULE_TITLES` from `@/modules/compliance/client` (replaces P9454, P9498, P9597).
4. **Test fixtures match the real types.** `preview.test.ts` `ctx()` (P8887-8894): `revision` gains
   `changeReason: null`; add `companyName: "Kaveri Pumps (fictional)", companyOneLiner: null, themeName: null`.
   Annotate tests call `annotateBody(body, lint, allowances, new Set([hash]))`; add "a rule-1 flag not in the recorded set
   is not allowable" and "a rule-2 flag is never allowable". `publish.test.ts` hand-check fixture (P8949-8956): revision
   gains `changeReason: null`, context gains `companyName: null, companyOneLiner: null, themeName: null`.
5. **Actions** (R12, R11). Create `src/modules/compliance/errors.ts`:
   ```ts
   import { ResearchError } from "@/modules/research";

   export class HandCheckRequiredError extends ResearchError {
     readonly code = "HAND_CHECK_REQUIRED";
     constructor() { super("Tick the rule 4 check before running the gate on a file that names a company."); this.name = "HandCheckRequiredError"; }
   }
   export class FileStructureError extends ResearchError {
     readonly code = "FILE_STRUCTURE";
     constructor() { super("The file's view, tests and facts do not line up yet. The checklist names what is missing."); this.name = "FileStructureError"; }
   }
   ```
   In `compliance/actions.ts`: `publishRevision` keeps `assertIds` and the not-found mapping (`actions.ts:37-49`) and only
   gains `options: PublishOptions = {}` passed to `runPublishGate`. **Delete `publishRevisionAction`** (`actions.ts:61-72`):
   it would bypass the rule-4 hand check; port its `actions.test.ts` cases to `publishCheckedAction`. Append:
   ```ts
   /** The editor's "Run the publishing gate". Server backstops for the hand check (D16) and the file structure; the
    *  database gate decides and records every attempt. No override. */
   export async function publishCheckedAction(itemId: string, revisionId: string, formData: FormData): Promise<void> {
     await requireAdmin();
     if (!isItemId(itemId) || !isItemId(revisionId)) failTo(itemPath(itemId), new ItemNotFoundError(String(itemId)), "compliance");
     let decision: GateDecision;
     try {
       const ctx = await (await deps()).repo.loadPublishContext(itemId, revisionId);
       if (!ctx) throw new ItemNotFoundError(itemId);
       const rule4 = formData.get("rule4") === "on";
       if (ctx.item.companyId && !rule4) throw new HandCheckRequiredError();
       const isFile = ctx.item.kind === "thesis" || ctx.item.kind === "case_study";
       if (isFile && fileProblems(ctx.revision.bodyMd, ctx.revision.structured).length > 0) throw new FileStructureError();
       decision = await publishRevision(itemId, revisionId, { handChecks: ctx.item.companyId ? { rule4 } : {} });
     } catch (error) {
       failTo(itemPath(itemId), error, "compliance");
     }
     if (decision.verdict === "pass") doneTo(itemPath(itemId), "published", "#gate");
     redirect(`${itemPath(itemId)}#gate`);
   }

   export async function removeAllowanceAction(itemId: string, sentenceHash: string): Promise<void> {
     await requireAdmin();
     if (!isItemId(itemId)) failTo("/desk/items", new ItemNotFoundError(String(itemId)), "compliance");
     if (!/^[0-9a-f]{64}$/.test(sentenceHash)) failTo(itemPath(itemId), new InvalidInputError(), "compliance");
     try {
       await (await deps()).repo.removeAllowance(itemId, sentenceHash);
     } catch (error) {
       failTo(itemPath(itemId), error, "compliance");
     }
     revalidatePath(itemPath(itemId));
     doneTo(itemPath(itemId), "allowance-removed", "#gate");
   }
   ```
   (imports `fileProblems` from `@/modules/casefile/client`, the two errors from `./errors`, `type PublishOptions`.)
   D16's `handChecks` is stored inside `reasons.lint` as planned (P9172); Q8 stays open (R18).
6. **Messages** (`research/messages.ts`). ERRORS: `"hand-check-required"`, `"file-structure"` (texts as the classes),
   `"facts-sheet-invalid": "The facts sheet has a problem; the line is marked in the editor."`,
   `"name-not-screened": "Screen this name on the New names tab first."`; typed map `HAND_CHECK_REQUIRED`,
   `FILE_STRUCTURE`, `FACTS_SHEET_INVALID`, `NAME_NOT_SCREENED`. NOTICES:
   `"allowance-removed": "Allowance removed. Run the publishing gate again."`,
   `"company-public": "Company made public. It is listed only once a file that names it passes the gate."`, and change
   `"allowance-saved"` to `"Sentence allowed. Run the publishing gate again."` (`desk-gate.spec.ts:52` matches
   "Sentence allowed"). `messages.test.ts` covers each new code.
7. **saveCaseFileRevisionAction** (replaces P9277-9316; R12). `src/modules/casefile/errors.ts`:
   `export class FactsSheetError extends ResearchError { readonly code = "FACTS_SHEET_INVALID"; … }` (message as item 6).
   ```ts
   "use server";

   import { revalidatePath } from "next/cache";
   import { createSupabaseServerClient } from "@/lib/supabase/server";
   import { requireAdmin } from "@/modules/identity";
   import { addRevision, createSupabaseResearchRepo, doneTo, failTo, getItemWithHistory, isItemId, ItemNotFoundError } from "@/modules/research";
   import { FactsSheetError } from "./errors";
   import { parseFactsSheet } from "./sheet";

   /** Aksh's words (bodyMd) and the facts (structured) as one append-only revision; they never share a field. */
   export async function saveCaseFileRevisionAction(itemId: string, formData: FormData): Promise<void> {
     await requireAdmin();
     if (!isItemId(itemId)) failTo("/desk/items", new ItemNotFoundError(String(itemId)));
     const back = `/desk/items/${itemId}`;
     const body = formData.get("bodyMd");
     const reason = formData.get("changeReason");
     const sheet = formData.get("factsSheet");
     let pendingGate: boolean;
     try {
       const repo = createSupabaseResearchRepo(await createSupabaseServerClient());
       let structured: Record<string, unknown>;
       if (typeof sheet === "string") {
         const { caseFile, errors } = parseFactsSheet(sheet);
         if (errors.length > 0) throw new FactsSheetError();
         structured = caseFile;
       } else {
         structured = (await getItemWithHistory(repo, itemId))?.revisions[0]?.structured ?? {};
       }
       pendingGate = (
         await addRevision(repo, {
           itemId,
           bodyMd: typeof body === "string" ? body : "",
           structured,
           changeReason: typeof reason === "string" && reason.trim() !== "" ? reason.trim() : null,
         })
       ).pendingGate;
     } catch (error) {
       failTo(back, error);
     }
     revalidatePath(back);
     doneTo(back, pendingGate ? "revision-pending-gate" : "revision-saved");
   }
   ```
   A body over 200,000 shows `body-too-long` (Task 10) through `errorCode`.
8. **Company actions** (replaces P9333-9356). `setCompanyPublic` refuses an unscreened or archived stub:
   `update({ visibility: "public" }).eq("id", id).eq("needs_review", false).is("archived_at", null).select("id")`; no row →
   `throw new NameNotScreenedError()` (in `src/modules/catalog/errors.ts`, code `NAME_NOT_SCREENED`). `getCompanyBrief`
   stands. Action:
   ```ts
   export async function makeCompanyPublicAction(companyId: string, itemId: string): Promise<void> {
     await requireAdmin();
     const back = isItemId(itemId) ? `/desk/items/${itemId}` : "/desk/items";
     if (!isItemId(companyId) || !isItemId(itemId)) failTo(back, new InvalidInputError(), "catalog");
     try {
       await setCompanyPublic(await createSupabaseServerClient(), companyId);
     } catch (error) {
       failTo(back, error, "catalog");
     }
     revalidatePath(back);
     doneTo(back, "company-public", "#gate");
   }
   ```
9. **GatedSentence testid** (P9383): `data-testid="preview-flag"` (the recorded panel keeps `flagged-sentence`).
   gate.test.tsx uses `preview-flag`.
10. **GateNote / AllowanceForm copy** (R9). Rule 2 message ends "Rule 2 has no allowance; rewrite it." The allowable
    explanation (P9471-9474) reads "Rule 1 matched "{match}". The gate recorded this sentence, so if it explains your
    process rather than a view on the stock, you can allow this one sentence, with a reason." A rule-1 flag that is not
    allowable shows "Run the publishing gate; if it records this sentence under rule 1 you can then allow it with a
    reason." AllowanceForm help (P9435-9436): "Covers this exact sentence only; editing it runs the check again. Only
    rule 1 sentences can be allowed; no other rule has an allowance."
11. **PublishBar** (replaces P9556-9585): always enabled (pending only), the rule-4 tick inside the form:
    ```tsx
    "use client";

    import { useFormStatus } from "react-dom";
    import { Button } from "@/components/ui/button";

    function Submit({ label }: { label: string }) {
      const { pending } = useFormStatus();
      return (
        <Button type="submit" disabled={pending} aria-describedby="publish-reason">
          {pending ? "Running the gate…" : label}
        </Button>
      );
    }

    type Rule4 = { company: string; checked: boolean; onChange(checked: boolean): void };
    type Props = { action: (formData: FormData) => Promise<void>; label: string; summary: string; rule4: Rule4 | null };

    /** Sticky on phone. Never disabled by the preview (R8): the database gate decides and records. */
    export function PublishBar({ action, label, summary, rule4 }: Props) {
      return (
        <form action={action} className="sticky bottom-(--tab-bar-h) z-(--z-tab-bar) -mx-(--gutter) border-t border-rule bg-paper px-(--gutter) py-3 desk:static desk:mx-0 desk:px-0">
          {rule4 ? (
            <label className="mb-2 flex min-h-11 items-start gap-3 text-small text-ink">
              <input type="checkbox" name="rule4" checked={rule4.checked} onChange={(e) => rule4.onChange(e.target.checked)} className="mt-0.5 size-[18px] accent-ink" />
              <span>I have not changed my stance on {rule4.company} in my private notes in the last 30 days.</span>
            </label>
          ) : null}
          <Submit label={label} />
          <p id="publish-reason" className="mt-1 text-small text-ink-muted">{summary}</p>
        </form>
      );
    }
    ```
12. **PublishChecklist** edits (P9600-9676): drop the `published` prop and the "Passed the gate." paragraph (G12; the
    notice "Published." says it); drop `id="gate"` from the section (moves to the page's aside); delete the standalone
    checkbox (P9658-9663); render `PublishBar` with `summary = failing || (rule4Needed && !rule4) ? \`Preview: ${reason}. The gate decides and records the result; you can run it now.\` : "Preview passes. The gate decides and records the result."`
    and `rule4 = rule4Needed && companyName ? { company: companyName, checked: rule4, onChange: setRule4 } : null`; when
    `publishAction` is null and not live, show "Save a revision to publish it."; keep "Live: revision #n" and "Unpublish".
    gate.test PublishChecklist cases: the button "Run the publishing gate on revision #2" is enabled with a failing rule;
    the summary reads "Preview: 1 rule fails · rule 4 unchecked. …"; ticking the box puts `rule4=on` in the form.
13. **Recorded decision panel** (keeps Plan 1A gate behaviour and its e2e hooks).
    `git mv src/app/desk/items/[id]/gate-panel.tsx src/components/desk/private/gate-decision.tsx`; export
    `GateDecisionPanel({ itemId, decision, decisionRevNo, latestId })`; delete its publish/unpublish buttons, "Live:" line
    and "Save a revision" line (`gate-panel.tsx:50-67`); `stale = decision !== null && decision.revisionId !== latestId`;
    keep every `data-testid` (`gate-decision`, `data-verdict`, `gate-failure`, `data-rule`, `flagged-sentence` with
    `<mark>`, `flagged-match`, `stale-decision`), the "Passed/Blocked by the gate, revision #n (IST time, policy)" line,
    "In: {field}", the allow form (rule 1, not stale, label "Reason for allowing this sentence", button "Allow sentence")
    and "Allowed as educational usage: …"; token classes only (`border-bad`, `bg-bad-wash`, no `red-*`).
14. **History** (replaces P9835-9873; keeps `e2e/desk-items.spec.ts` diff assertions):
    `git mv src/app/desk/items/[id]/history.tsx src/components/desk/private/history.tsx`, restyle only (add →
    `bg-ins`, remove → `text-ink-muted`, borders → `border-rule`); keep `#n`, "current", "waiting for the gate", the
    `?from=&to=` "diff" links, `data-testid="diff"`, `data-op`. The public RevisionDiff stays public-only.
15. **Editor route.** `load.ts` (replaces P9805-9832): as planned plus `pending` from `getItemWithHistory`, a fourth
    `Promise.all` entry `getLatestDecision(compliance, item.id)`, `decisionRevNo` (as `page.tsx:61` of Plan 1A), and
    `body = annotateBody(ctx.revision.bodyMd, preview.lint, allowances, allowableHashes(decision, latest?.id ?? null))`;
    return `decision` and `decisionRevNo`. Page (replaces P9877-9942): `isItemId(id)` (not `z.guid`); searchParams
    `{ error, notice, from, to }`; header keeps "… · current revision #n" (Plan 1A `page.tsx:37`); `errorText` alert,
    `noticeText` `<p role="status">`, the public-only `pending-gate` banner (Plan 1A `page.tsx:50-55`, token classes);
    `<aside id="gate" tabIndex={-1} …>` holds `PublishChecklist` (`publishLabel = \`Run the publishing gate on revision #${candidate.revNo}\``)
    then `GateDecisionPanel`; main column: `BodyPreview`, `MetaForm` (unchanged), `RevisionEditor key={latest?.id ?? "none"}`
    (reset after save, as `revision-form.tsx:12`), `WordingGuide`, `History`. No `<fieldset>` may precede MetaForm's
    (`desk-items.spec.ts` lifts the first one). Items list page (P9981-9985): `errorText(error)` as Plan 1A
    `items/page.tsx:13`. Delete `revision-form.tsx`; `gate-panel.tsx` and `history.tsx` are moved, not deleted.
16. **e2e** (replaces P10003-10050, P10055; R13). No `desk-publish.spec.ts`. Edit `e2e/desk-gate.spec.ts`: button
    regexes at lines 34, 47, 54, 66, 83, 98, 105 become `/^Run the publishing gate on revision #N$/` (same N); everything
    else stays. Append one test: "the advisory preview marks a sentence before any run, and the gate button stays
    enabled": learning item with an objective, save "You should buy the leader now." → `getByTestId("preview-flag")`
    contains it, the run button is enabled, no "Allow this sentence" button; run the gate → `gate-decision` is `fail` and
    the preview now offers "Allow this sentence". Run (replaces P10055): the desk projects pass; per project
    desk-capture 9, desk-capture-screen 10, desk-clocks 3, desk-gate 5, desk-items 5.

Must stay green: `e2e/desk-items.spec.ts` (unchanged), `e2e/desk-capture*.spec.ts`, `compliance/publish.test.ts`,
`compliance/actions.test.ts` (ported cases), `research/messages.test.ts`. Depends on: Tasks 7 (`buildLintInput`,
`fileProblems` inputs), 10 (messages pattern), 11; Plan 1A Tasks 7-9.

## Task 13

Corrections: 11. Replaces P10069-10080, P10082-10120, P10184-10235, P10246-10272 (two filters), P10281-10308,
P10411-10427 (error), P10430-10438, P10451-10469, P10525-10541; adds a catalog step.

**Files.** Create `src/lib/sectors.ts`, `src/modules/catalog/names.ts`, `src/modules/catalog/errors.ts` additions,
`src/components/desk/private/name-card.tsx`, `stub-company-list.tsx`, `src/app/desk/names/page.tsx`,
`src/app/desk/companies/page.tsx` (created: there is no Plan 1A file, R16), `e2e/seed/seed.setup.ts`. Modify
`src/modules/catalog/{service,repo,types,index,actions}.ts`, `src/test/fakes/catalog-repo.ts`,
`src/modules/catalog/service.test.ts`, `src/modules/capture/{service,refile}.ts` (+tests), `src/components/tokens-guard.test.ts`,
`playwright.config.ts`, `e2e/desk-capture.spec.ts` (append), `e2e/guard.spec.ts:16`.

1. **CatalogRepo** (`catalog/types.ts:83-88`) gains `findCompanyByAlias(symbol: string): Promise<Company | null>` and
   `isIgnored(kind: "symbol" | "theme", token: string): Promise<boolean>`. Supabase repo:
   ```ts
   async findCompanyByAlias(symbol) {
     const { data, error } = await db.from("company_aliases").select(`company:companies(${COMPANY_COLUMNS})`).eq("symbol", symbol).maybeSingle();
     if (error) throw dbError("catalog.findCompanyByAlias", error);
     return data?.company ? toCompany(data.company) : null;
   },
   async isIgnored(kind, token) {
     const { data, error } = await db.from("ignored_tokens").select("token").eq("kind", kind).eq("token", token).maybeSingle();
     if (error) throw dbError("catalog.isIgnored", error);
     return data !== null;
   },
   ```
   Fake: `aliases: Map<string, string>` (symbol → company id), `ignored: Set<string>` (`${kind}:${token}`) and the two
   methods.
2. **ensureStub consults ignored tokens and aliases, with a slug-clash fallback** (R17, R18). Replace
   `catalog/service.ts:15-79` (keep `InvalidCatalogTokenError`, `NSE_SYMBOL`, `titleCase`; move the two existing
   `key` bodies unchanged into `function companyKey(token: string): string` (lines 47-51) and
   `function themeKey(token: string): string` (lines 65-69)):
   ```ts
   type StubKind<T> = {
     ignoredAs: "symbol" | "theme";
     key(token: string): string;
     find(repo: CatalogRepo, key: string): Promise<T | null>;
     /** The slug for the nth insert attempt (1-based), or null when this kind has no fallback. */
     slug(key: string, attempt: number): string | null;
     insert(repo: CatalogRepo, key: string, slug: string): Promise<T>;
   };

   const MAX_SLUG_ATTEMPTS = 5;

   /**
    * Ignored tokens file as plain text (null). Otherwise find (aliases first for companies) or create a stub flagged for
    * review. A unique violation with the row now present is a concurrent capture's stub; one without is a slug clash
    * ($M-AND-M after $M&M), so the next suffixed slug is tried.
    */
   async function ensureStub<T>(kind: StubKind<T>, repo: CatalogRepo, token: string): Promise<T | null> {
     const key = kind.key(token);
     if (await repo.isIgnored(kind.ignoredAs, key)) return null;
     const existing = await kind.find(repo, key);
     if (existing) return existing;
     let lastError: unknown = null;
     for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
       const slug = kind.slug(key, attempt);
       if (slug === null) break;
       try {
         return await kind.insert(repo, key, slug);
       } catch (error) {
         if (!isUniqueViolation(error)) throw error;
         const raced = await kind.find(repo, key);
         if (raced) return raced;
         lastError = error;
       }
     }
     throw lastError;
   }

   const companyKind: StubKind<Company> = {
     ignoredAs: "symbol",
     key: companyKey,
     find: async (repo, symbol) => (await repo.findCompanyByAlias(symbol)) ?? (await repo.findCompanyBySymbol(symbol)),
     slug: (symbol, attempt) => (attempt === 1 ? slugify(symbol) || "company" : `${slugify(symbol) || "company"}-${attempt}`),
     insert: (repo, symbol, slug) => repo.insertCompany({ slug, name: symbol, nseSymbol: symbol, needsReview: true }),
   };

   const themeKind: StubKind<Theme> = {
     ignoredAs: "theme",
     key: themeKey,
     find: (repo, slug) => repo.findThemeBySlug(slug),
     slug: (slug, attempt) => (attempt === 1 ? slug : null),
     insert: (repo, slug, s) => repo.insertTheme({ slug: s, name: titleCase(slug), needsReview: true }),
   };

   export const ensureCompany = (repo: CatalogRepo, symbol: string): Promise<Company | null> => ensureStub(companyKind, repo, symbol);
   export const ensureTheme = (repo: CatalogRepo, token: string): Promise<Theme | null> => ensureStub(themeKind, repo, token);
   ```
   `service.test.ts`: lines 38-43 become "falls back to a suffixed slug on a slug clash": after `M&M`,
   `ensureCompany(repo, "M-AND-M")` → `{ nseSymbol: "M-AND-M", slug: "m-and-m-2" }`; add "an ignored symbol returns null
   and creates nothing", "an alias returns the target company", "an ignored theme returns null"; use `!` where a test
   reads properties. `e2e/desk-capture.spec.ts:78-82` stays valid.
3. **Filing uses the first resolvable token** (`capture/service.ts:49-51`):
   ```ts
   async function firstResolved<T>(tokens: string[], resolve: (token: string) => Promise<T | null>): Promise<T | null> {
     for (const token of tokens) {
       const found = await resolve(token);
       if (found) return found;
     }
     return null;
   }
   ```
   `const company = await firstResolved(parsed.symbols, (s) => ensureCompany(deps.catalog, s));` and likewise for
   themes; same helper in `refile.ts`'s link branch. Test: `"$AND $KAVPUMP note"` with `AND` ignored files under KAVPUMP.
4. **names.ts decisions** (replaces P10194-10235; R17). Keep `NameToScreen`, `NameDecision`, `suggestMatch`:
   ```ts
   export type NameStub = { type: "company" | "theme"; id: string; key: string | null };
   export type NameOp =
     | { op: "insert"; table: "company_aliases" | "ignored_tokens"; row: Record<string, string> }
     | { op: "update"; table: "companies" | "themes" | "items" | "captures"; set: Record<string, string | boolean | null>; match: Record<string, string>; privateOnly?: boolean };

   /** The writes a decision makes, in order; each is idempotent, so a half-finished decision can be made again. */
   export function planDecision(stub: NameStub, d: NameDecision, now: string): NameOp[] {
     const table = stub.type === "company" ? "companies" : "themes";
     const column = stub.type === "company" ? "company_id" : "theme_id";
     if (d.kind === "new") {
       return [{ op: "update", table, set: { name: d.name, ...(stub.type === "company" ? { sector: d.sector } : {}), needs_review: false }, match: { id: stub.id } }];
     }
     if (d.kind === "merge" && stub.type !== "company") throw new InvalidInputError();
     const record: NameOp[] =
       stub.key === null
         ? []
         : d.kind === "merge"
           ? [{ op: "insert", table: "company_aliases", row: { symbol: stub.key, company_id: d.intoId } }]
           : [{ op: "insert", table: "ignored_tokens", row: { kind: stub.type === "company" ? "symbol" : "theme", token: stub.key } }];
     const target = d.kind === "merge" ? d.intoId : null;
     return [
       ...record,
       { op: "update", table: "items", set: { [column]: target }, match: { [column]: stub.id }, privateOnly: true },
       { op: "update", table: "captures", set: { [column]: target }, match: { [column]: stub.id } },
       { op: "update", table, set: { needs_review: false, archived_at: now }, match: { id: stub.id } },
     ];
   }

   /** Only an unscreened, live stub can be decided. */
   async function loadStub(db: Db, type: "company" | "theme", id: string): Promise<NameStub> {
     const { data, error } =
       type === "company"
         ? await db.from("companies").select("key:nse_symbol, needs_review, archived_at").eq("id", id).maybeSingle()
         : await db.from("themes").select("key:slug, needs_review, archived_at").eq("id", id).maybeSingle();
     if (error) throw dbError("catalog.loadStub", error);
     if (!data || !data.needs_review || data.archived_at) throw new InvalidInputError();
     return { type, id, key: data.key };
   }

   export async function decideName(db: Db, type: "company" | "theme", id: string, decision: NameDecision, now = new Date()): Promise<void> {
     const stub = await loadStub(db, type, id);
     if (decision.kind !== "new") {
       const column = type === "company" ? "company_id" : "theme_id";
       const linked = await db.from("items").select("id", { count: "exact", head: true }).eq(column, id).eq("visibility", "public");
       if (linked.error) throw dbError("catalog.decideName.publicCheck", linked.error);
       if ((linked.count ?? 0) > 0) throw new NameOnPublicItemError();
     }
     if (decision.kind === "merge") {
       const target = await db.from("companies").select("id").eq("id", decision.intoId).eq("needs_review", false).is("archived_at", null).neq("id", id).maybeSingle();
       if (target.error) throw dbError("catalog.decideName.target", target.error);
       if (!target.data) throw new InvalidInputError();
     }
     for (const op of planDecision(stub, decision, now.toISOString())) {
       if (op.op === "insert") {
         const { error } = await db.from(op.table).upsert(op.row as never, { onConflict: op.table === "company_aliases" ? "symbol" : "kind,token", ignoreDuplicates: true });
         if (error) throw dbError(`catalog.decideName.${op.table}`, error);
         continue;
       }
       let query = db.from(op.table).update(op.set as never);
       for (const [column, value] of Object.entries(op.match)) query = query.eq(column, value);
       if (op.privateOnly) query = query.neq("visibility", "public");
       const { error } = await query;
       if (error) throw dbError(`catalog.decideName.${op.table}`, error);
     }
   }
   ```
   `catalog/errors.ts` adds `NameOnPublicItemError` (code `NAME_ON_PUBLIC_ITEM`). `listNamesToScreen`: add
   `.is("archived_at", null)` to all three company/theme queries (P10248-10250). `names.test.ts` (replaces
   P10099-10119): "new" → one update with `needs_review: false`; company "merge" → alias insert `{ symbol: "KAVPUMPS",
   company_id: "c1" }`, items (privateOnly), captures, archive `{ needs_review: false, archived_at: NOW }`; theme
   "plain" → ignored insert `{ kind: "theme", token: "capex" }`, items, captures, archive; theme "merge" throws
   `InvalidInputError`; a stub with `key: null` has no insert op.
5. **decideNameAction** (replaces P10284-10305; R11, R12):
   ```ts
   const decisionInput = z.discriminatedUnion("kind", [
     z.object({ kind: z.literal("new"), name: z.string().trim().min(1, "Give the name.").max(120), sector: z.enum(SECTORS, "Choose a sector from the list.").nullable() }),
     z.object({ kind: z.literal("merge"), intoId: z.guid() }),
     z.object({ kind: z.literal("plain") }),
   ]);

   export async function decideNameAction(id: string, type: "company" | "theme", formData: FormData): Promise<void> {
     await requireAdmin();
     if (!isItemId(id) || (type !== "company" && type !== "theme")) failTo("/desk/names", new InvalidInputError(), "catalog");
     const text = (key: string) => {
       const v = formData.get(key);
       return typeof v === "string" ? v : undefined;
     };
     const parsed = decisionInput.safeParse({
       kind: text("kind"),
       name: text("name"),
       sector: type === "company" ? (text("sector") ?? null) : null,
       intoId: text("intoId"),
     });
     if (!parsed.success) failTo("/desk/names", parsed.error, "catalog");
     try {
       await decideName(await createSupabaseServerClient(), type, id, parsed.data);
     } catch (error) {
       failTo("/desk/names", error, "catalog");
     }
     revalidatePath("/desk", "layout");
     doneTo("/desk/names", "name-saved");
   }
   ```
   Messages: ERRORS `"name-required": "Give the name."`, `"choose-sector": "Choose a sector from the list."`,
   `"name-on-public-item": "A public item names this. Unpublish that item before changing what this name is."`; typed
   map `NAME_ON_PUBLIC_ITEM`; NOTICES `"name-saved": "Saved. The name is screened."`.
6. **Names page** (P10411-10427): searchParams `{ error, notice }`; render `errorText(error)` (alert) and
   `noticeText(notice)` (`<p role="status">`); never the raw param.
7. **/desk/companies** (R16): create `src/app/desk/companies/page.tsx` with the redirect code of P10432-10437.
8. **Guard spec** (`e2e/guard.spec.ts:16`): the signed-out loop also covers `"/desk/names"` and `"/desk/companies"`.
9. **e2e for aliases and ignored tokens.** Append to `e2e/desk-capture.spec.ts`: with the admin `db`, capture
   `$E2E${RUN}S` (stub) and `$E2E${RUN}T` (decided "new"), `decideName(db, "company", stubId, { kind: "merge", intoId })`,
   then a new capture of the stub symbol links `company_id = intoId` and no new company row appears; a second stub decided
   `{ kind: "plain" }`, then capturing it files with `company_id` null.
10. **Seed** (replaces P10451-10469, P10529-10530; R15). `saveRevision` waits for
    `expect(page.getByRole("status")).toHaveText(/^Revision saved\.$|waiting for the publishing gate/)`. `publish`:
    ```ts
    async function publish(page: Page, company: string | null) {
      if (company) {
        const make = page.getByRole("button", { name: `Make ${company} public` });
        if (await make.isVisible()) {
          await make.click();
          await expect(page.getByRole("status")).toContainText("Company made public");
        }
        await page.getByRole("checkbox", { name: /I have not changed my stance on/ }).check();
      }
      await page.getByRole("button", { name: /^Run the publishing gate on revision #\d+$/ }).click();
      await expect(page.getByRole("status")).toHaveText("Published.");
      await expect(page.locator("#gate").getByTestId("gate-decision")).toHaveAttribute("data-verdict", "pass");
    }
    ```
    Seed project `testMatch: /[\\/]seed[\\/]seed\.setup\.ts$/` (G9). The seed runs only on the local stack: Step 6 is
    `supabase start`, `pnpm db:reset`, then the Playwright command; never with hosted values.
11. `tokens-guard.test.ts` ROOTS gains `"src/app/desk"` (P10440 stands); by now every desk file uses token classes.

Must stay green: `src/modules/catalog/service.test.ts` (edited as above), `capture/service.test.ts`,
`e2e/desk-capture.spec.ts` existing tests, `e2e/guard.spec.ts`. Depends on: Task 8 (tables, `archived_at`), Tasks 10-12
(labels, notices, refile helper), Plan 1A Task 14 harness (`e2e/auth.setup.ts`, `ADMIN_STATE` at `e2e/support/stack.ts:9`).

## Task 14

Corrections: 4.
1. Interface P10564: `Unavailable({ heading?: string })` (as the code at P10815).
2. About fallback date (P11388): `istDate(new Date())` from `@/lib/dates` (IST, R22).
3. Public projects (replaces P11466-11477): `testMatch: spec("public-[a-z0-9-]+")` (G9); everything else stands.
4. Run (P11505-11508): `supabase start && pnpm db:reset`, then the planned Playwright command (local stack only).

Must stay green: `anon` (smoke replaced as planned, auth, guard, clocks), all desk projects. Depends on: Tasks 9, 13.

## Task 15

Corrections: 2.
1. P11537: `import { buildFileView } from "@/modules/showcase";` (index entry, G4).
2. P11783 `<Unavailable heading="Case file" />` matches Task 14 item 1.

Depends on: Task 14.

## Task 16

Corrections: 7. Replaces P11900 (project note), P11947-11955, P12038, P12094-12096, P12142-12146, P12148-12155,
P12166, P12177-12179.
1. `e2e/desk-a11y.spec.ts` keeps its name; it runs because Task 10 changed the desk regex to `desk-[a-z0-9-]+` (R14).
2. **No wall-clock assertion in e2e** (R21). Replace the 5-second test with:
   ```ts
   test("a capture on /desk is acknowledged and stored (R2 row 4; unlock-to-saved is timed by hand in the trial)", async ({ page }, testInfo) => {
     await page.goto("/desk");
     const box = page.getByRole("textbox", { name: "Capture" });
     const text = `timed capture ${Date.now().toString(36)}`;
     const started = Date.now();
     await box.fill(text);
     await box.press("Enter");
     await expect(page.getByText(/^Saved \d{2}:\d{2} · private note$/)).toBeVisible();
     testInfo.annotations.push({ type: "capture-ms", description: String(Date.now() - started) });
     await expect(page.getByRole("region", { name: "Today" })).toContainText(text);
   });
   ```
3. `reduced-motion` project: `testMatch: spec("motion")` (G9).
4. Trial "Before day 1" (replaces P12095-12096): "Shlok applies `20261007000004_casefile.sql` to the hosted project
   himself (`pnpm db:push`), then `pnpm db:types` shows no diff." and "No seeding of the hosted project (R15): Aksh enters
   his own trial content through the desk; the fictional seed exists only on local stacks."
5. "Before any public launch" (P12142-12146) gains: "ADR-003 written and implemented: `publish_revision()` must not
   trust a client-supplied `p_lint_result` (Q8, `docs/project-memory/unanswered-questions.md`); until then the rule-4
   hand check (D16) is stored in that same jsonb." Unpublishing seed content applies only to stacks where it was seeded.
6. Totals (replaces P12155): `setup` 1, `seed` 1, `anon` 18 (smoke 1, auth 5, guard 7, clocks 5); per desk project 38
   (desk-capture 10, desk-capture-screen 10, desk-clocks 3, desk-gate 5, desk-items 5, desk-a11y 5); public projects and
   `reduced-motion` as planned.
7. Timeline (P12166): "migration 20261007000004 (IST lag, file numbers, figures-to rule, capture days, New names
   tables)". Debt (P12177-12179): "New names runs four idempotent writes (record, items, captures, archive) without a
   transaction"; delete the `t:$SYM` highlighter bullet (Task 11's shared scanner removes that gap); add "Refile has no
   lock: two simultaneous clicks can file one capture twice" and "Q8: publish_revision trusts the lint result (ADR-003
   before launch)".

Depends on: Task 15. Agents do not push, deploy or seed hosted (G10).
