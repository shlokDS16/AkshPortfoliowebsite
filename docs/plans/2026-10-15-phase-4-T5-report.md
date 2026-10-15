# Phase 4 Task 5 report: public concept pages and the Concepts line

Branch `phase-4-learning-graph`, built on 574a762. Local only, not pushed. Built by desk-ui; review folded into Task 7.
No SQL changed (Task 1's 2281 pgTAP tests stand). No desk (private) file changed. Layout picks are in `docs/design/decisions.md` ("Plan 4 Task 5", delegated by Shlok 2026-10-15, pending his approval).

## What was built
- **Snapshot** (`src/modules/showcase`): `PublicSnapshot.concepts` (`id, slug, name`) and `conceptLinks` (`itemId, revisionId, conceptId, position`). `repo.listConcepts()` reads `public_themes` and `repo.listConceptLinks()` reads `public_concept_links`, both with explicit column lists (`CONCEPT_COLUMNS = "id, slug, name"`). Both are optional like `factChecks`: an error returns `[]` and logs only the code. The links read is paged (`readAllPages`, ordered by revision, position, concept) because it is the one read that can pass PostgREST's 1000-row answer (8 rows per revision). The cache key moved to `showcase-snapshot-v3`; every reader treats a missing field as empty (a snapshot cached by an earlier deployment has none).
- **Builders** (`concepts.ts`): `itemConcepts(s, itemId)` (current revision only, by `position`, each once, only ids the snapshot knows), `listConceptSummaries(s)` (A to Z, count line "2 notes · 1 file"), `buildConceptView(s, slug)` (fixed standfirst; "Notes" and "Applied in"; newest first by the date shown). `FileView.concepts` and `NoteView.concepts` carry the line.
- **Components** (`src/components/desk/`): `concept-line.tsx` (the line), `concept-list.tsx` (the index), `concept-page.tsx`. The line sits at the end of the VIEW block on a file and after the body on a note, never in the prose.
- **Routes**: `/concepts` and `/concepts/[slug]` (`revalidate = 3600`, `generateStaticParams` returns `[]`, snapshot only, `notFound()` when absent or empty). `RailCurrent` gained `"concepts"` (no rail entry, no tab).
- **Isolation** (`isolation.test.ts`): the 3b private-module test now includes `modules/knowledge`; a new block follows imports transitively from `app/(public)`, `modules/showcase`, `components/desk/case` and every top-level public component, and pins: no import of `@/modules/knowledge` or `components/desk/private`, no name `concept_edges`, admin `concept_links` (a lookbehind keeps `public_concept_links` legal), `description_md` in any of their own files, no import of `@/modules/catalog` from showcase or the public pages, and that the repo reads only `public_themes`, `public_concept_links` and the three-column list.

## The binding notes
1. **Every public concept list is built from `public_concept_links`**, never from `theme_id`. A public concept nothing links is not on `/concepts` and its page is a 404 (tested at builder, page and e2e level).
2. **`position` has gaps**: order is by value (no density assumed); the primary concept is the lowest present.
3. **An unknown id is never rendered**: a link to a concept not in `public_themes` is dropped everywhere (tested: the uuid does not appear in any model).
4. **Current revisions only**: an item's line and its place on a concept page come from links whose `revisionId` equals the item's current revision. An older passed revision's link only supplies the "Since" date (the first gated revision that listed the concept, D25).
5. **Deploy state (D55/D56)**: with no concept data, `/concepts` and `/concepts/x` are 404, no file or note carries a line, the existing view models gain only `concepts: []`. Pinned by unit tests (including a legacy snapshot with the fields missing) and by `e2e/public-concepts.spec.ts` (run against the freshly reset local database).

## Evidence
- Red seen before green: the builders (module missing), the repo (columns and methods missing), the components (modules missing), the pages (route missing), the isolation block (files missing).
- `rtk pnpm test`: 381 files, 5318 tests pass (Task 4 left 378 files, 5270). `rtk pnpm typecheck`: clean (after `next typegen`, which the typed `PageProps` routes need on a fresh checkout). `rtk pnpm lint`: clean. `pnpm build` with the CI placeholder env: passes, `/concepts` and `/concepts/[slug]` listed; `pnpm check:bundles` passes (no client JavaScript added: all new components are server components).
- e2e on the local stack (setup, seed, then public projects 375 and 1280, light and dark): deploy state, `public-a11y`, `public-cases`, `public-file`, `public-site`, `public-concepts` all pass (104 passed, 14 skipped: the published halves of `public-cases` and `public-concepts` skip because nothing is public); `public-perf` passes at both sizes.
- Published half, verified once by hand: I linked two public concepts to the seeded note and file through the real gate (temporary spec, deleted), then ran `public-concepts`, `public-a11y` and `public-perf` on all four public projects: `/concepts`, `/concepts/[slug]` and the note and file pages carrying the line pass axe WCAG 2.2 A/AA in both schemes, one h1, no horizontal scroll at 375, line links at least 44 px tall on the phone; LCP and CLS budgets hold. (Four `public-file` and `public-site` assertions failed in that polluted run only because my fixture changed the seeded change reasons; they pass on the reset database.) The local database was then reset (`pnpm supabase db reset`), so it is back to the deploy state for Task 6.

## Strings pending Shlok's approval (new this task; the first group is spec s14 verbatim)
- s14 as written: `/concepts` title "Concepts" and standfirst "The ideas Aksh uses to read a business, each with the notes and files where it comes up."; concept standfirst "Notes and case files by Aksh Agrawal that use {name}, newest first."; headings "Notes" and "Applied in"; "Since {date}"; line label "Concepts".
- New, not in s14: tag "CONCEPT" on the concept page; the index count line "{n} note(s) · {m} file(s)" (a part with none is left out; case studies count as files); meta titles "Concepts" and "{name}" with those two standfirsts as descriptions; the unavailable headings "Concepts" and "Concept"; the screen-reader name "Concepts" of the line's list.

## Choices where the brief left room (conservative reading each time)
1. **A file is listed only when its company page is the one that serves it** (`servedFiles`: the thesis, else the lowest-numbered file), so a link never lands on a page that does not carry the concept. A concept linked only on a company's second file does not appear for that file.
2. **A public item of kind `note` has no page**, so it is listed under "Notes" as plain text with no link (and counted). The plan said "listed under Notes"; a link to `/notes` would point at a list that does not show it.
3. **Newest first means by the "Since" date shown**, ties by title, so the order can be checked by eye. (Not by `revisedAt`.)
4. **Counts on the index** are "notes" and "files" (case studies are files); the plan says "notes and files that use it".
5. **A closed case page is unchanged** (spec s8), so a concept page links to it but the case page carries no line back.
6. **`/concepts/[slug]` is built from `conceptLinks` joined to the items the site already shows**; it re-checks nothing in SQL (the views do), but a file still goes through `files()`' lag check and a case through `ledgerCases()`.

## Concerns for the reviewer
- The Concepts line and the concept page are only as fresh as the 1-hour snapshot unless a publish calls `updateTag(CACHE_TAGS.publicItems)`; "Make public" on a concept alone calls nothing, which is right (it exposes nothing by itself).
- `e2e/public-concepts.spec.ts` matches the `public-*` projects, so it runs there in the deploy state. Task 6's `concepts` project should add a `concepts-public-{375,1280}` pair like `cases-public-*` so its published half runs after the loop leaves a concept public (config is Task 6's).
- An item with 8 concepts shows eight bordered links that wrap (fine at 375: tested by the 44 px target check with two; not seen with eight).
- No sitemap or share image exists for public pages, so none was added for concepts.
- defenso `guard_code`: not run (no such tool in this subagent, as in Tasks 1-4). No request body, auth or database code was written; the only new read is two anon views by name.
