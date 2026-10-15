# Phase 4 Task 1 report: migrations 0020 (knowledge) and 0021 (gate), pgTAP

Branch `phase-4-learning-graph`, built on 9765ad8. Local only, not pushed. Built by desk-backend (sonnet); review: opus (pending).

## What was built
- `supabase/migrations/20261016000020_knowledge.sql` (spec s4): `reading_note` kind; `item_revisions.concept_ids` with the
  8-element / no-null check and the `private.carry_concept_ids()` BEFORE INSERT trigger; `themes_public_is_screened`;
  `concept_edges` (admin-only RLS, select/insert/delete, no update); `concept_links` (admin view); anon `select (concept_ids)`;
  widened `themes_public_read` and `public_themes`; `public_concept_links`; the two catalog guards widened for themes.
- `supabase/migrations/20261016000021_knowledge_gate.sql` (spec s5, 187 lines): `private.knowledge_gate_failures()` and
  `publish_revision()` restated whole from 0019 by script (diff against 0019 is +38/-13: `v_concepts`, the combined select, the
  theme message, one helper call, the header). `c_policy` unchanged.
- `supabase/tests/0020_knowledge.test.sql` (101 assertions, written first and seen to fail: 0 of 116 planned ran before the
  migrations). Edited `0001_core_grants.test.sql` (+2: exact anon column set on `item_revisions`; `public_concept_links` open,
  `concept_links` and `concept_edges` closed to anon) and `0002_function_privileges.test.sql` (+3: both new private functions
  refused to anon and authenticated).
- `src/lib/supabase/database.types.ts` regenerated (additions only). `src/modules/research/repo.ts`: one line, `RevisionRow`
  omits `concept_ids` so typecheck stays green until Task 2 reads it (same pattern as `ItemRow` omitting `file_no`).

## Evidence
- `pnpm supabase db reset`: clean, 21 migrations applied.
- `pnpm supabase test db`: 30 files, 2281 tests, PASS (all earlier gate and public-view tests unchanged).
- `rtk pnpm test`: 348 files, 5014 tests pass. `pnpm typecheck` and `pnpm lint`: clean.
- `supabase db lint --level warning`: nothing from 0020 or 0021 (one existing warning in `private.ledger_chain_check`).
- defenso `guard_code`: not run. The tool is not reachable from this subagent (no tool search, no `mcp__defenso__*` tool). The opus
  review stands in, as in 3a, 2.7 and 3b.

## Choices where the brief left room (conservative reading each time)
1. Trigger: an explicit unknown id raises `23503 concept_ids: unknown concept`; a CARRIED id whose theme row is gone is dropped
   silently, so one bad row cannot block every later revision of an item. A null element in an explicit array raises `23514`
   from the trigger itself (it runs before the check constraint, and would otherwise report `23503`). More than 8 ids is
   refused by the check constraint (`23514`), after dedupe and archived-dropping.
2. Carry source: the latest revision with a non-null array (equal to "the previous revision" in practice, because the trigger
   never stores null). An explicit `'{}'` is carried as `'{}'` and does not fall back to `theme_id`.
3. `position` in both link views is the ordinality of the stored array, so it has gaps when an archived or no-longer-public
   concept is filtered (`alpha@2` with nothing at 1). Task 3/5 should not assume a dense 1..n; "primary concept" is the lowest
   position present.
4. `public_concept_links` and the widened `public_themes` repeat the full public predicate instead of leaning on RLS (the admin
   passes every base-table policy; this is why the existing views do the same).
5. `knowledge_gate_failures` is `stable`, `security definer`, `search_path = ''`, and groups ids so a duplicate in a hand-made
   array is reported once. Failure order: `reading_note` first, then concepts in array order.

## Concerns for the reviewer
- `themes_public_is_screened` is added with a plain ADD CONSTRAINT, so it validates existing rows. If the hosted project holds
  any public theme that is a stub (`needs_review`) or archived, the migration fails there. Nothing in the code made a stub public
  before Phase 4, but check hosted before applying (query: `select slug from themes where visibility = 'public' and (needs_review or archived_at is not null)`).
- The constraint also means a public theme can no longer be archived (it must go private first, which the guards allow only when
  no public item's current revision links it). Intended, but Task 4's archive action must say so.
- Guards read `items.visibility = 'public'` (as before), not `is_public_item`, so a public item still inside the 30-day lag also
  blocks changes to its concepts. Conservative; matches the existing `theme_id` behaviour.
- Only the CURRENT revision protects a concept from going private or being renamed. An older passed revision may name a concept
  that later goes private; `public_concept_links` filters it out (tested with item 54 and theta).
- Existing rows keep `concept_ids` null (no backfill); `concept_links` and `public_concept_links` read them as `theme_id`.
