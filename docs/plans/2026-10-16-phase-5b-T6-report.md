# Phase 5b Task 6 report: migrations 0022 (videos) and 0023 (distribution gate), pgTAP

Built 2026-10-16 by desk-backend on branch `phase-5b-videos` (stacked on `phase-5-distribution`, PR #11). Local Supabase only;
nothing pushed, nothing applied to the hosted project. Review is folded into Task 9.

## Before Task 6 (confirmed in this worktree)
- Last migration on the branch was `20261016000021_knowledge_gate.sql`; 0022 and 0023 were free. 5a has no migration and is not
  merged, so the branch stays stacked (no rebase).
- The latest `publish_revision()` was in 0021, and the `knowledge_gate_failures` line was the last check before the slug block.
- `items_kind_check` was last restated in 0020.
- `private.ledger_gate_item_failures(p_item_id uuid, p_company_id uuid, p_holds_position text, p_today date)` exists (0014).
- Q43 defaulted: videos are on Aksh's own channel and YouTube Studio offers the caption download.

## Built
- **0022 `supabase/migrations/20261017000022_videos.sql`** (spec s7.2)
  - `items_kind_check` adds `'video'` and keeps every earlier kind.
  - `video_sources` matches s7.2 and adds `created_at`.
    - The guard trigger `private.guard_video_source` is SECURITY INVOKER. It refuses any change to `id`, `item_id`, `youtube_id`
      or `created_at`, for every role including the owner. It also refuses any write to a machine column, on insert or update,
      unless the write comes from inside `record_video_fetch`. The test is the transaction-local `app.video_fetch` setting plus
      `current_user` being the function's owner, the same pattern as the publish guard.
    - `private.guard_video_source_delete` (definer) refuses a delete while the item is public.
    - `public.record_video_fetch(p_source_id, p_found, p_channel_id, p_own_channel, p_title, p_description, p_duration,
      p_privacy, p_published_at, p_problem) returns video_sources` is SECURITY DEFINER, has an empty search_path and is
      executable by service_role only. It sets `fetched_at = now()`.
    - With `p_found = false` it sets `privacy = 'gone'`, `fetched_at` and `fetch_problem`, and keeps the last data seen.
    - A null `p_found` raises `22023`; an unknown source raises `P0002`.
  - `video_transcripts` is append-only through `private.reject_mutation` (update, delete and truncate).
    - The BEFORE INSERT trigger `private.seal_video_transcript` validates the shape: an array of 1..5000 elements, each
      exactly `{s, t}`, `s` whole seconds >= 0 and never going back, `t` 1..500 characters and not blank. A failure raises `23514`.
    - The same trigger replaces `text_sha256` (sha256 hex of the UTF-8 texts joined by `\n`) and `words` with its own values,
      whatever the client sent.
  - RLS: the admin (`private.is_admin()`) can select both tables, insert a source's `(item_id, youtube_id)` only, insert a
    transcript, and delete a source. Anon gets row policies that repeat the public predicate. For a transcript that means only
    the one the current revision's `structured.transcriptId` names.
  - Views (both `security_invoker`, both select-only for anon and authenticated): `public_videos (item_id, youtube_id,
    duration_seconds, yt_published_at)` and `public_video_transcripts (item_id, segments)`.
  - Grants:
    - authenticated: select and delete on `video_sources`, insert `(item_id, youtube_id)` on it; select on `video_transcripts`,
      insert `(video_source_id, source, file_sha256, segments, text_sha256, words)` on it.
    - service_role: select on `video_sources` only.
    - anon: select `(id, item_id, youtube_id, duration_seconds, yt_published_at)` on `video_sources` and
      `(id, video_source_id, segments)` on `video_transcripts`.
- **0023 `supabase/migrations/20261017000023_distribution_gate.sql`** (spec s7.3)
  - `private.distribution_gate_failures(p_item_id, p_kind, p_company_id, p_data_as_of, p_revision_id, p_struct, p_lint) returns
    jsonb` is a SECURITY DEFINER function with an empty search_path, revoked from every API role. It returns `'[]'` for every
    kind but `video`.
    - For a video it returns `{rule: '12', code: '12.1'..'12.4', message}`. It locks the `video_sources` row `for share`.
  - `publish_revision()` is restated by copying the 0021 text programmatically; see the diff below. The revoke and the
    service_role-only grant are restated.
- **TS:** `src/modules/compliance/policy.ts` now has `POLICY_VERSION = "sebi-unreg-2026-07-v1.2"` and its doc comment names the
  v1.2 addendum. `src/lib/supabase/database.types.ts` is regenerated (`pnpm db:types`).

## Files
- Created:
  - `supabase/migrations/20261017000022_videos.sql` (255 lines)
  - `supabase/migrations/20261017000023_distribution_gate.sql` (273 lines; the restated gate is 161 of them)
  - `supabase/tests/0022_videos.test.sql` (65 tests)
  - `supabase/tests/0023_distribution_gate.test.sql` (76 tests)
  - this report
- Modified:
  - `supabase/tests/0001_core_grants.test.sql`: the view inventory gains exactly `public_video_transcripts` and
    `public_videos`; the service_role lists gain `video_sources` (select only).
  - `supabase/tests/0002_function_privileges.test.sql`: the service_role allowlist gains `record_video_fetch`. Five new tests
    (24 to 29): record_video_fetch is a definer function; it and the gate helper refuse anon and authenticated; the helper and
    the three trigger functions have no API role.
  - The policy literal `v1.1` becomes `v1.2` in the 15 pgTAP files and `src/components/desk/private/gate-dedupe.test.tsx`. Two
    test descriptions now say "pins policy v1.2". `0018_case_studies` still refuses the v1 string.
  - `src/modules/compliance/policy.ts`
  - `src/lib/supabase/database.types.ts`
  - `docs/project-memory/unanswered-questions.md` (Q47)

## Gate diff, 0021 against 0023 (`publish_revision` body, line by line)
```
13c13   c_policy constant text := 'sebi-unreg-2026-07-v1.1'  ->  'sebi-unreg-2026-07-v1.2'
113a114-116 (after the knowledge_gate_failures line):
  -- Phase 5 (rules 12, 13; v1.2 addendum). Recorded, never raised.
  v_failures := v_failures || private.distribution_gate_failures(v_item.id, v_item.kind, v_item.company_id, v_item.data_as_of,
                                                                 p_revision_id, v_struct, p_lint_result);
```
Nothing else changed. These are unchanged:
- the actor check, latest-only, lint and policy checks
- rules 3, 5 and 6, and the 3a ledger half
- the 3b rule 10 call and file-number rule (a video takes no number)
- the company and theme checks, the Phase 4 knowledge checks and the `for share` locks on themes and companies
- the slug, the update under `app.publish_gate`, and the revoke and grant

pgTAP pins this by function text: v1.2 and the ledger, case, knowledge and distribution calls are present, and the themes lock is
still `for share`.

## Verification
- `pnpm supabase db reset` applied cleanly through 0023.
- `pnpm supabase test db`: **32 files, 2430 tests, PASS**. The new files ran first against a database without the migrations,
  and every test failed.
- `rtk pnpm test`: **396 files, 5472 tests, passed**.
- `pnpm typecheck` passed (`next typegen && tsc`), and so did `rtk pnpm typecheck` once the route types existed. `rtk` runs tsc
  directly and skips `next typegen`, so on a fresh checkout it reports `PageProps`/`LayoutProps` errors. Use `pnpm typecheck`.
- `pnpm lint` exits 0.
- `policy.test.ts` passes: it reads the newest migration that defines `publish_revision` (0023) and finds v1.2.
- defenso `guard_code`: **not run**. This session has no ToolSearch and no `mcp__defenso__*` tool. I did a manual review in its
  place:
  - every new definer function has an empty search_path and no API grant except `record_video_fetch` (service_role).
  - the machine-column guard is SECURITY INVOKER, so its owner check can see the caller's role.
  - anon reads only the listed columns, and only for public video items.
  - no `user_metadata` and no `process.env` anywhere in this change.

## Deviations (conservative; for the Task 9 review)
1. **The tests are in two files.** `0022_videos.test.sql` covers the data layer and `0023_distribution_gate.test.sql` covers the
   gate and what the views show. The plan names only the first, but together they would pass 450 lines and the limit is 300.
2. **Anon gets base-table column grants and row policies on `video_sources` and `video_transcripts`.** A `security_invoker`
   view cannot work without them; the `concept_ids` grant in 0020 is the precedent. The view inventory gains exactly the two
   views. The anon columns are pinned exactly, and none is `channel_id`, `own_channel`, `yt_title`, `yt_description`,
   `privacy`, `fetched_at` or `fetch_problem`.
3. **The failure shape is `rule: '12'` with `code: '12.1'`..`'12.4'`**, the same as rule 10 (`rule '10'`, `code`).
   `decision.ts` already shows `message` when it has no wording for a code. Task 7 adds `RULE_TITLES["12"]`.
4. **Six rule 12 messages are not in spec s15.** They are listed under New strings and logged as Q47.
5. **Stricter than the spec text:**
   - a missing `chapters` key fails 12.4 (an empty array passes).
   - a transcript segment must have exactly the keys `s` and `t`, and its start may never go back.
   - a never-fetched source fails 12.1 with its own message instead of the "7 days" one.
   - `fetched_at` exactly 7 days old still passes; 7 days and one minute fails.
6. **Additions to the spec's column list:** `video_sources.created_at`. Also, the admin may delete a source (only while the item
   is not public, and an existing transcript blocks it through its foreign key). The spec implies this ("delete refused while
   the item is public"), but its grant list does not name it.

## For Task 7 (load-bearing)
- `transcriptSha` must be the lowercase sha256 hex of the UTF-8 segment texts joined by `"\n"`, with no trailing newline. That
  is exactly what the trigger computes. Test vectors:
  - `["Hello world.", "Second line here"]` gives `54cf37a1...318db5`
  - `["é", "b"]` gives `7148cd8e...527d12`
- The lint result must carry `transcriptSha` equal to the transcript the revision names. `structured` is
  `{schema: "video/1", youtubeId, transcriptId, transcriptSha, chapters: []}`, and `chapters` must always be present.
- `parseCaptions` must emit starts that never go back, and only `{s, t}` objects.
- `record_video_fetch` needs a `duration_seconds` > 0, so pass null for a live stream or `P0D`. Titles are at most 100
  characters, descriptions 5000 and the problem text 160; anything longer raises `23514`.
- **Gap:** spec s7.8 mentions a "Fetch again" request, but s7.2 has no column for it. Task 7 will need either a spec decision
  (for example, `fetch_requested_at`, written by the admin) or `fetchAgainAction` driving the fetch itself. I did not add a
  column without a spec.

## New strings (pending Shlok's approval; s15 already lists the rest)
- "This revision does not match the video's YouTube link." (12.1)
- "YouTube data has not been fetched yet." (12.1)
- "The transcript in this revision does not match the stored transcript." (12.2)
- "The lint did not check this transcript." (12.2)
- "A video that names a company needs a figures-to date at least 30 days old." (12.3)
- "Chapters must start at 0:00, number 3 to 100, rise in time and each have a title of 1 to 100 characters." (12.4)

From s15, used verbatim: "A video needs its transcript before it is listed.", "YouTube data is more than 7 days old. Fetch it
again.", "This video is private or gone on YouTube.", "This video is not from your channel."
