# Phase 4 Learning graph (concepts on the revision, a private reading log, the month in review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** written 2026-10-15 by desk-architect on Shlok's delegation (he reviews and merges this evening). Branch `phase-4-learning-graph`, stacked on `phase-3b-case-studies` (PR #9, itself on PR #8; last migration 0019), worktree `.claude/worktrees/aksh-research-desk-4`. Not pushed. **Run "Before Task 1" first.** Code is given only where a decision is load-bearing; everything else names the interface, the tests and the commands.

**Goal:** every `#name` Aksh already writes becomes a concept with a desk page that gathers his learnings, files, process notes and reads on it; an item can carry up to 8 concepts, versioned on its revision; `r:` logs what he read in one action (private); "What I learned in {month}" is assembled from his dated learnings and reads without changing a word; and a concept he makes public gets a public page listing the gated notes and files that use it. Nothing a visitor sees changes at deploy.

**Architecture:** no new concept table: a concept is a screened `themes` row (D45). Links live in a new column `item_revisions.concept_ids uuid[]` that SQL carries forward when a write omits it (D47), so a link reaches the public only on a revision that passed `publish_revision()`. `concept_links` is an admin view over latest revisions; `concept_edges` is a small admin-only table of his own links (D49, private this phase). The gate gains one helper call (reading notes never publish; every linked concept must be public), policy version unchanged (D56). A new module `src/modules/knowledge/` builds the desk read models; the public side builds its concept views from the cached snapshot in `src/modules/showcase/concepts.ts` and never imports `knowledge`. No LLM, OCR, cron step or new dependency.

**Spec:** `docs/specs/2026-10-15-phase-4-learning-graph-design.md` (s1-s14; decisions D45-D62 in s13, copy in s14). **Rules:** `docs/compliance/publishing-rules.md` (rules 7, 8) and the v1.1 addendum (unchanged). No ADR changes.

**Scope:** progress items 4.1, 4.2, 4.3. Out: spec s12 (public edges, public reading log, public month page, typed relations, visual graph, concept merge or rename, LLM suggestions, `[[links]]`, case-page chips).

## Decisions taken on Shlok's behalf
The full table with the cost of each is spec s13 (D45-D62). The ones that shape the build:
| # | Decision | Cost if wrong |
|---|---|---|
| D45 | Concept = screened `themes` row; the roadmap's "concepts" table is `themes`, "concept_links" a view, "concept_edges" a table | An extra concept field is an additive column on `themes` |
| D47 | Links on the revision (`concept_ids`), null = carry (SQL trigger), explicit array only from the picker and capture | Concept changes add revisions; on a public item they wait for the gate |
| D49/D51 | Edges only from his taps, private; suggestions computed on read, never stored | No public "related" links; no dismiss for a suggestion |
| D52 | Reading log = kind `reading_note` via `r:`; refused by the gate in SQL | Public reads later: drop one SQL condition, add a route |
| D53 | Month page private; titles verbatim; no ledger lessons | No public month view |
| D55/D60 | Zero public change at deploy; public concept data loads optionally | None |

## Global constraints
- **Every public change goes through `publish_revision()`.** No change to `private.is_public_item`, `public_items`, `public_item_revisions`, the item and revision policies, the 30-day lag, `/api/health` or `private.settings`. Anon gains exactly: `select (concept_ids) on item_revisions`, `select on public_concept_links`, and the widened `themes_public_read` / `public_themes` predicate (spec s4). Concept edges and descriptions are never readable by anon.
- **His words and the machine never share a field.** His: titles, bodies, `description_md`, his edges, his concept choices. The machine's: dates, counts, groupings, suggestions, the fixed change-reason template; rendered in the machine face and labelled. Nothing re-words, shortens or summarises a title. No LLM, OCR or transcriber port anywhere in this phase (graph tests).
- **Public boundary:** `src/app/(public)/**`, `src/modules/showcase/**` and public components never import `@/modules/knowledge`, `@/modules/ledger`, `@/modules/cases`, `@/modules/valuation` or `src/components/desk/private/**`, and never name `concept_edges`, `concept_links` (the admin view) or `description_md` (`isolation.test.ts`).
- Wording: plain words; never "proof", "verified", "buy", "sell"; every new string pending Shlok's approval and listed in the task report (spec s14 is the starting list).
- Migrations local only; never edit one after it reaches hosted; `pnpm db:types` after Task 1. Supabase CLI via `pnpm supabase`. Files under 300 lines (migration 0021, a restated body, may reach about 200). TDD: the failing test is seen to fail first. Never two implementers at once. `defenso guard_code` on Tasks 1-3 if its server answers; otherwise the opus reviews stand in, as in 3a, 2.7 and 3b.
- No new runtime or dev dependency.

## Before Task 1 (controller)
- `graph-memory brief` in the worktree (if "no graph here", `graph-memory init` once). If PR #8 and PR #9 have merged, rebase onto `main`; otherwise stay stacked (no Phase 4 migration may reach hosted before 0019).
- The worktree shows 9 modified files that differ only in line endings (CRLF): `git diff --ignore-cr-at-eol --stat` is empty. Restore them (`git checkout -- <the 9 paths>`) so no implementer commits them; `capture-bar.tsx` and `desk-tabs.tsx` are among them and Task 4 edits the first.
- `ls supabase/migrations`: 0019 is the last; 0020 and 0021 are free (`20261016000020_knowledge.sql`, `20261016000021_knowledge_gate.sql`). If not, renumber files, the test file and every mention here and in the spec.
- Confirm three facts this plan relies on (checked 2026-10-15): the items kind check is the inline `items_kind_check` (`20261005000001_core.sql` line 145); the latest `publish_revision()` body is `20261015000019_case_gate.sql` (162 lines; `v_struct` loaded at line 48; the `theme` check at lines 113-117); `supabase/tests/0002_publish_gate.test.sql` line 218 pins rule `theme` (unchanged by this plan).
- Hand each implementer: this plan's task, the spec sections named in it, and the files named in it. Nothing else.

## Model assignment and sizing
| Task | Agent (model) | Review | Tokens (rough) |
|---|---|---|---|
| 1 Migrations 0020, 0021 and pgTAP | desk-backend (sonnet) | **opus** (grants, policies, definer trigger, the gate) | 330k build + 150k review = 480k |
| 2 Write path: research, capture, catalog, lint, wording | desk-backend (sonnet) | folded into Task 7 | 280k |
| 3 `knowledge` module (desk read models, edges, month, suggestions) | desk-backend (sonnet) | folded into Task 7 | 230k |
| 4 Desk screens | desk-ui (model: sonnet) | folded into Task 7 | 340k |
| 5 Public concept pages and the Concepts line | desk-ui (model: sonnet) | folded into Task 7 | 260k |
| 6 E2E full loop, guide | desk-backend (sonnet) | folded into Task 7 | 180k |
| 7 Whole-branch review, one fix wave, close-out | **opus** review; desk-backend (sonnet) fix wave | - | 200k + 250k = 450k |
| **Total** | | | **2.22M; with a 20% margin about 2.7M** |

Pacing: Tasks 1-3 (about 0.99M) leave a tested back end and change nothing visible. If the week is tight, cut in this order: the desk-home month line (about 20k), the "Seen together" suggestions (about 40k), the public `/concepts` index (about 30k; concept pages stay reachable from the Concepts line). Never cut the Task 1 opus review or Task 7.

---

### Task 1: Migrations 0020 (knowledge) and 0021 (gate), pgTAP

Build: `desk-backend` (sonnet). Review: **opus**. Size: 480k.

**Files:** Create `supabase/migrations/20261016000020_knowledge.sql`, `supabase/migrations/20261016000021_knowledge_gate.sql`, `supabase/tests/0020_knowledge.test.sql`. Modify the anon grant inventory test (`grep -ln "column_privileges\|to anon" supabase/tests`; extend it with exactly the three anon additions), `supabase/tests/0002_function_privileges.test.sql` (the two new private functions are executable by no API role), `src/lib/supabase/database.types.ts` (`pnpm db:types`).

**0020, spec s4 exactly.** Load-bearing points:
- `alter table public.items drop constraint items_kind_check, add constraint items_kind_check check (kind in ('note','thesis','learning','case_study','process','reading_note'));`
- `alter table public.item_revisions add column concept_ids uuid[] check (concept_ids is null or (cardinality(concept_ids) <= 8 and array_position(concept_ids, null) is null));` then the BEFORE INSERT trigger `item_revisions_carry_concepts` on `private.carry_concept_ids()` (security definer, `set search_path = ''`, revoked from `public, anon, authenticated, service_role`), the three steps of spec s4. Order-keeping dedupe: `select array_agg(id order by min_ord) from (select id, min(ord) min_ord from unnest(...) with ordinality u(id, ord) group by id) s` restricted to non-archived themes. Unknown id: `23503`, message `concept_ids: unknown concept`. The append-only guard on `item_revisions` is untouched (an UPDATE of `concept_ids` must still be refused).
- `alter table public.themes add constraint themes_public_is_screened check (visibility <> 'public' or (needs_review = false and archived_at is null));`
- `concept_edges` with the checks, unique, index, RLS and grants of spec s4 (policies `to authenticated` gated on `private.is_admin()`, so the pg_policies invariant test passes).
- `public.concept_links` view (security_invoker), revoke from `public, anon, service_role`, grant select to `authenticated`. Null elements and archived themes filtered.
- `grant select (concept_ids) on public.item_revisions to anon;` then `drop policy themes_public_read` and re-create it with the widened predicate; `create or replace view public.public_themes` (same three columns, widened predicate; privileges are kept); `public.public_concept_links` view (`item_id, revision_id, concept_id, position`), revoke all, grant select to `anon, authenticated`.
- Restate `private.guard_catalog_visibility()` and `private.guard_catalog_public_columns()` from `20261007000004_hardening.sql` section 7 and `20261005000002_publish.sql`, widening only the themes clause; keep the triggers (create or replace keeps them).

**0021:** `publish_revision` restated whole from 0019 (copy, do not retype), with only: `v_concepts uuid[]` declared; `select r.structured, r.concept_ids into v_struct, v_concepts`; the `theme` failure's message becomes `'The linked concept is not public.'` (rule code `theme` unchanged; no test pins the old text); after the `theme` check:
```sql
-- Phase 4 (spec s5): a reading note never publishes; every linked concept must be public. Recorded, never raised.
v_failures := v_failures || private.knowledge_gate_failures(v_item.kind, v_item.theme_id, v_concepts);
```
`private.knowledge_gate_failures(p_kind text, p_theme_id uuid, p_concepts uuid[]) returns jsonb` (security definer, `search_path = ''`, revoked from all API roles) returns the failures of spec s5, each `jsonb_build_object('rule', ..., 'message', ...)` like the existing ones, `'[]'` when none. `c_policy` unchanged. Restate the revoke and the service-role-only grant on `publish_revision`.

**Tests first (`0020_knowledge.test.sql`; copy the admin-session helpers from `0014_ledger_gate.test.sql`):**
- Kinds: `reading_note` accepted; `reading` refused.
- Carry: a second revision without `concept_ids` copies the first's; a first revision copies `theme_id` (and `'{}'` when none); explicit `'{}'` clears; `[b, a, b]` stores `[b, a]`; an archived theme is dropped; an unknown id raises `23503`; 9 ids raise `23514`; an UPDATE of `concept_ids` is refused by the append-only guard.
- Themes: setting `visibility = 'public'` on a stub or an archived theme fails the check; on a screened live theme it passes.
- Edges: `(b, a)` with `b > a` refused; duplicate refused; non-admin `authenticated` reads 0 rows and cannot insert; `anon` and `service_role` have no privilege; no UPDATE privilege for anyone.
- `concept_links`: latest revision only; legacy null reads as `theme_id`; archived filtered; `anon` has no select; non-admin `authenticated` reads 0 rows.
- Public: a public theme linked only through the CURRENT revision of a public item is visible to `anon` in `themes` and `public_themes`; linked only by a pending (newer, ungated) revision it is not; a private theme never; a public item still inside the 30-day lag hides it; `public_concept_links` lists current and older passed revisions, never a failed or pending one, never a private item, only public concepts, and applies the legacy rule.
- Guards: a public theme cannot be set private, nor its name or slug changed, while the current revision of a public item links it through `concept_ids`; the existing `theme_id` behaviour unchanged.
- Gate: `reading_note` refused (rule `reading_note`); a linked private concept refused (rule `concept`, the message names it); a stub refused; a concept equal to `theme_id` reported once (by `theme` only); an archived id ignored; all concepts public passes and the item appears in `public_items`; every existing gate test passes unchanged; `publish_revision` executable by `service_role` only; `c_policy` still `sebi-unreg-2026-07-v1.1`.

**Acceptance:** `pnpm supabase db reset`, then the full pgTAP suite green; `pnpm test`, typecheck and lint green; the anon inventory test lists exactly the three additions.

- [ ] Steps: failing pgTAP, 0020, 0021, reset and test, grants tests, `pnpm db:types`, `pnpm test`, commit `feat(knowledge): concepts on the revision, concept edges, reading notes; the gate keeps reads private and concepts public-only (migrations 0020, 0021)`.

---

### Task 2: The write path: research, capture, catalog, lint, wording

Build: `desk-backend` (sonnet). Review: folded into Task 7. Size: 280k.

**Files:** Modify `src/modules/research/` (`schema.ts`: `ITEM_KINDS` gains `reading_note`, `createItemInput` and `addRevisionInput` gain `conceptIds: uuid[] | null` (max 8, default null); `types.ts` (`Revision.conceptIds: string[] | null`); `repo.ts` (read and write `concept_ids`; omit the key when null); `service.ts` (`appendRevision` accepts `conceptIds`; new `setItemConcepts(repo, itemId, conceptIds, names)` per spec s7: latest body and structured copied, change reason from the template, `theme_id` synced on a private item only); `index.ts`). `src/modules/capture/` (`parse.ts`: `r:` and kind `reading_note`, `PREFIX_RE` `[tlpr]`; `service.ts` `fileCapture`: every resolved theme in order, at most 8, into `conceptIds`, `t:` append unions with the previous revision's; `highlight.ts`, receipt and messages). `src/modules/catalog/` (`setThemePublic(db, id)` mirroring `setCompanyPublic`, refusing a stub or archived row with `NameNotScreenedError`; `updateConceptDescription(db, id, text | null)` trimmed, at most 2000 UTF-16 units; `listConcepts(db)` screened live rows; `getConceptBySlug(db, slug)`; `makeConceptPublicAction(conceptId, itemId)` in `actions.ts` beside `makeCompanyPublicAction`). `src/modules/compliance/` (`rules.ts`: `LintInput.conceptNames: string[]`, `conceptSlugs: string[]`; `lint.ts` lints each as a plain field `conceptName` / `conceptSlug` with hyphens read as spaces; `repo.ts` loads the live concepts of the revision being gated; `lint-input.ts`; `policy.ts` rule labels `concept: "Linked concept"`, `reading_note: "Reading log"`, `theme` label to "Linked concept" too). User-facing "theme" strings to "concept" (spec s7 last bullet; `grep -rn -i "theme" src/lib/messages.ts src/modules/capture src/components/desk/private/name-card.tsx src/components/desk/private/grammar-key-row.tsx src/components/desk/private/capture-receipt.tsx`, and the unit tests that assert them).

**Tests first:** `parseCapture("r: Marks memo #rates")` gives kind `reading_note`, `R:` too, the prefix span highlighted, every existing grammar test unchanged; capture with `#a #b` files `conceptIds` `[a, b]` in order, 10 tags file 8 and the receipt line, no tag files null; `t:` append with `#c` on a thesis whose last revision has `[a]` writes `[a, c]`, with no tag writes null; `setItemConcepts` makes one revision with the same body and structured, the template reason ("Concepts: added A, B." / "Concepts: removed C." / both parts), syncs `theme_id` on a private item and leaves it on a public one (the pending revision is written); `setThemePublic` refuses a stub and an archived row; description over 2000 refused, blank stored as null; lint: a concept named "Exit multiples" is one rule-1 finding on `conceptName`, slug `exit-multiples` one on `conceptSlug`, an allowance on that sentence applies; `repo.ts` drops archived ids; the renamed strings.

**Acceptance:** unit, typecheck and lint green; no public file changed; `research`, `capture`, `catalog` graph tests still pass.

- [ ] Steps: failing tests, research, capture, catalog, lint, wording, commit `feat(capture): r: logs a read; every #name links a concept on the revision; concepts can be made public and are linted with the revision`.

---

### Task 3: The `knowledge` module

Build: `desk-backend` (sonnet). Review: folded into Task 7. Size: 230k.

**Files:** Create `src/modules/knowledge/` (`index.ts`, `actions.ts`, `client.ts` (pure: `monthOf`, `groupMonth`, `suggestRelated`, view types), `service.ts`, `repo.ts`, `types.ts`, `service.test.ts`, `client.test.ts`, `knowledge.graph.test.ts`). Modify `eslint.config.mjs` only if the module entry rule needs it (it should not: `index`, `actions`, `client` are already the allowed entries).

**Interfaces (server only; the admin's cookie client, never the service client):**
- `repo`: `linksForConcept(id)`, `allLinks()` (from `concept_links`), `edgesFor(id)`, `insertEdge(a, b)` (normalised `a < b`, conflict ignored, so a double tap makes one row), `deleteEdge(a, b)`, `itemsCreatedBetween(fromIso, toIso, kinds)`. Concept rows only through `@/modules/catalog`; items only through `@/modules/research` or the `concept_links` view (no direct `themes` or `items` table access: R3 row 6).
- `service`: `conceptIndex()`, `conceptPage(slug)` (spec s7 groups, newest first; status; description; related; suggestions), `monthPage(month)` (India month boundaries; groups by first live concept by name, "No concept" last; reads by date; counts; titles exactly as stored), `linkConcepts(a, b)` (self refused), `unlinkConcepts(a, b)`, `monthCounts(month)` for the desk home line.
- `actions`: `requireAdmin()` first; `linkConceptsAction`, `unlinkConceptsAction`, `saveConceptsAction(itemId, ids)` (calls research `setItemConcepts`), `saveDescriptionAction`, `makePublicAction` (calls catalog). Errors map to plain sentences in `src/lib/messages.ts` (keys prefixed `concept-`).
- `suggestRelated(links, edges, conceptId)`: concepts sharing at least 2 items with this one, not this one, not already related, at most 3, ordered by shared count then name.

**Tests first:** India month boundaries (`2026-10-31T19:00:00Z` is in November; `2026-09-30T18:29:59Z` is in September); grouping and order; a title with odd punctuation and trailing spaces is returned byte-identical; reads listed by date; empty month; `suggestRelated` thresholds, exclusions and order; edge normalisation, idempotence and the self-link refusal; legacy items appear through `theme_id`; stubs and archived handled; `knowledge.graph.test.ts`: no LLM, OCR or transcriber port, no `@/lib/supabase/service`, never imports `@/modules/ledger`, `@/modules/cases`, `@/modules/valuation`, and `@/modules/showcase` never reaches `@/modules/knowledge`.

**Acceptance:** unit, typecheck and lint green; no public file changed.

- [ ] Steps: failing tests, client, repo, service, actions, graph test, commit `feat(knowledge): concept pages, his links, suggestions computed on read, and the month assembled from his dated notes`.

---

### Task 4: Desk screens

Build: `desk-ui` (model override: sonnet). Review: folded into Task 7. Size: 340k.

desk-ui builds on the decided desk system (segment 4 trays, design-dna tokens); no Mobbin round. It records its layout picks in `docs/design/decisions.md` as "delegated by Shlok 2026-10-15".

**Files:** Create `src/app/desk/concepts/page.tsx`, `src/app/desk/concepts/[slug]/page.tsx`, `src/app/desk/learned/page.tsx`, `src/components/desk/private/concepts/` (`concept-list.tsx`, `concept-page.tsx`, `concept-chips.tsx`, `concept-picker.tsx`, `related-concepts.tsx`, `seen-together.tsx`, `month-page.tsx`, tests). Modify `src/app/desk/items/[id]/page.tsx` and `load.ts` (the Concepts row; no publish panel for `reading_note`), `src/components/desk/private/publish-checklist.tsx` (one line per non-public linked concept, mirroring the company line), `src/app/desk/items/page.tsx` (header links; the `reading_note` tab labelled "Reads"), `src/app/desk/page.tsx` (the month line), `src/components/desk/private/grammar-key-row.tsx` and `capture-bar.tsx` (`r:`).

**Behaviour:** spec s7 exactly, strings from s14. The suggestions block sits below "Related concepts", headed and captioned as the machine's, in the machine face. The picker is keyboard-complete (a listbox with type-ahead), at most 8, order = tap order, shows "Up to 8. Saving makes a new version.". Double submit of "Link" or "Save concepts" makes one edge or one revision (pending button). 375 px first.

**Tests first:** each state of the concept page (private, public, stub; empty groups hidden; suggestions present and absent); the item row (chips, picker limits, save); the checklist line for a private, a stub and a public concept; a reading note shows the private line and no publish panel; the month page (empty, two groups and "No concept", reads, navigation); the key row shows `r:`.

**Acceptance:** unit, typecheck, lint, build green; `e2e/desk-a11y.spec.ts` extended to `/desk/concepts`, one concept page and `/desk/learned` passes; every new string listed in the report.

- [ ] Steps: failing tests, components, routes, item page and checklist, capture key row, commit `feat(desk): concept pages, concepts on every item, the reading log and the month in review`.

---

### Task 5: Public concept pages and the Concepts line

Build: `desk-ui` (model override: sonnet). Review: folded into Task 7. Size: 260k.

**Files:** Modify `src/modules/showcase/types.ts` (`PublicSnapshot.concepts: PublicConceptRow[]` (`id, slug, name`), `conceptLinks: { itemId; revisionId; conceptId; position }[]`), `repo.ts` (`listConcepts()` from `public_themes`, `listConceptLinks()` from `public_concept_links`; both optional like `factChecks`: on error return `[]` and log the code only), `loader.ts`/`loadSnapshot`. Create `src/modules/showcase/concepts.ts` (+ `.test.ts`): `listConceptSummaries(s)`, `buildConceptView(s, slug)`, `itemConcepts(s, itemId)` (current revision only, by `position`). Modify `file.ts` and `notes.ts` view models (a `concepts` list), `src/components/desk/note-article.tsx` and the file page section that ends the VIEW block (desk-ui picks the exact spot; never inline in prose). Create `src/components/desk/concept-line.tsx`, `src/app/(public)/concepts/page.tsx`, `src/app/(public)/concepts/[slug]/page.tsx` (`revalidate = 3600`, `generateStaticParams` returns `[]`, snapshot only, `notFound()` when absent or empty). Extend `src/modules/showcase/isolation.test.ts` (Global constraints).

**Behaviour:** spec s8 and the s14 public strings. "Since {date}" = the earliest gated revision of the item that lists the concept (the D25 rule, from `conceptLinks` joined to `revisions`). Hrefs from the existing builders (`/companies/[slug]` for files, `/notes`, `/process`, `caseHref` for ledger cases); a public item of kind `note` is listed under "Notes".

**Tests first:** a snapshot with no concept data renders every existing page model unchanged and `/concepts` 404s (the deploy state); a concept linked only by an older revision of an item is not on that item's line but its "Since" date comes from the first linking revision; summaries A to Z with counts; a ledger case listed through `caseHref`; the Concepts line absent when the current revision has none; the optional loads swallow an error and log only the code; the isolation test.

**Acceptance:** 375 px first, no horizontal scroll, reduced motion honoured, no client JavaScript added; unit, typecheck, lint, `pnpm build` and `pnpm check:bundles` green; axe runs in Task 6.

- [ ] Steps: failing tests, snapshot, builders, components, routes, isolation, commit `feat(public): concept pages and a Concepts line on files and notes, shown only once a gated revision links a public concept`.

---

### Task 6: The full loop end to end; the guide

Build: `desk-backend` (sonnet). Review: folded into Task 7. Size: 180k.

**Files:** Create `e2e/concepts.spec.ts`. Modify `playwright.config.ts` (project `concepts`: depends on every `public-*` project, `reduced-motion`, `desk-mobile`, `desk-desktop` and `cases`; `signout` also depends on `concepts`), `docs/guide/using-the-desk.md` (section "Concepts, reads and your month"), `docs/guide/aksh-quick-guide.md` (two lines: `#name` makes a concept; `r:` logs a read).

**The spec (local stack, admin session, then signed out at 375 and 1280):** capture `l: <unique title> #e2e-moats #e2e-cycles`; screen both on Names as new concepts; the item shows both chips; the concept page lists the note under Learnings; "Link" from "Related concepts" relates them (a double tap makes one); capture `r: <unique title> #e2e-moats` and see it under Reads and on `/desk/learned`; add a learning objective; publish: refused with one line per concept (the first through rule `theme`, the second through rule `concept`); "Make public" on both; publish passes; signed out: `/concepts` lists both, `/concepts/e2e-moats` lists the note with "Since", the note page shows the Concepts line, axe clean on the three pages; `/desk` reading note shows no publish panel. Cleanup in `afterAll`: unpublish the note through the desk's Unpublish so later projects see the deploy state.

**Acceptance:** the full e2e suite passes with the new project (no other spec changed except `playwright.config.ts`); the guide section read aloud is plain words.

- [ ] Steps: spec, config, guide, full e2e, commit `test(e2e): concepts end to end, from a capture to a public concept page; guide`.

---

### Task 7: Whole-branch review, one fix wave, close-out

Review: **opus** over the branch diff (R1 rows 1, 2, 3, 6, 7; R2 rows 2, 4, 5, 7; R3 all; spec s4, s5 and s9 line by line against 0020 and 0021; the anon inventory; the isolation and graph tests; every new string against spec s14 and the banned words; that no write path sends an explicit empty `concept_ids` except the picker). This is also the review of Tasks 2-6. Fix wave: `desk-backend` (sonnet). Size: 450k.

**Files:** whatever the review names; `docs/specs/technical-debt.md` (close the Plan 1B line "Theme pages are not public in Phase 1" and log deferrals); a spec amendment section for anything built differently; the timeline entry; `graph-memory sync`. `docs/progress.md` is the controller's.

**Acceptance:** every finding fixed or logged with a reason; pgTAP, unit, typecheck, lint, build, `check:bundles` and e2e green; CI green on the PR; the report lists every new string for Shlok's approval.

**Release for Shlok (none of it makes anything public):** (1) PR #8 and PR #9 merged first, in order; (2) hosted dry run lists exactly 0020 and 0021; push them, then merge this PR (the app tolerates either order for public pages (D60), but the desk's Concepts row needs 0020); (3) on hosted, `select count(*) from public.themes where visibility = 'public'` is 0 before the push (the new check would refuse otherwise; it cannot be non-zero today).

## Conflict watch
| Tasks | Shared file / interface | Risk | Resolution |
|---|---|---|---|
| 1 | migration numbers 0020, 0021 | another branch takes them | renumber before Task 1 |
| 1 | `publish_revision` (latest body 0019) | a partial copy drops rule 4, rule 10, figures-to or file numbers | copy the 0019 body whole; every existing gate pgTAP passes untouched |
| 1 | `themes_public_read`, `public_themes`, catalog guards | the widened predicate loses the `theme_id` clause | tests for both clauses |
| 1 | anon grant inventory and `0002_function_privileges` tests | new grants or functions fail them | extend in Task 1 with exactly the listed additions |
| 1, 2 | `database.types.ts` | stale types | `pnpm db:types` at the end of Task 1 |
| 2 | research insert paths (`createItem`, `addRevision`, `appendRevision`, casefile saves, `cases` drafting) | a path sends `concept_ids: []` and drops links | null means carry; only `setItemConcepts` and capture send arrays; Task 7 greps every insert |
| 2 | capture strings and `e2e/desk-capture*.spec.ts` | the rename breaks text assertions | update assertions in Task 2 for unit, Task 6 runs the full e2e |
| 2 | `ITEM_KINDS` | a kind switch without a `reading_note` branch | typecheck; showcase `isKind` stays as is (no public reading notes) |
| 4 | `capture-bar.tsx` (CRLF noise in the worktree) | committing line-ending churn | restored before Task 1 |
| 4 | `publish-checklist.tsx` | the concept lines disturb the rule-4 hand check | lines added after the company line; existing checklist tests unchanged |
| 5 | `file.ts`, `notes.ts`, home counts | a concept line where none is public; changed counts | the deploy-state tests in Task 5 |
| 6 | `playwright.config.ts` order; `signout` | a published e2e note leaks into public-* assertions | `concepts` runs after them and unpublishes in `afterAll` |
| all | `src/lib/messages.ts` | key collisions | prefix `concept-`; sequential tasks |
