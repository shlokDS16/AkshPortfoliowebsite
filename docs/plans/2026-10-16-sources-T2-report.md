# Task 2 report: migrations 0026 (sources) and 0027 (rule 14 gate), policy v1.3 (Phase 5d)

Built by desk-backend (opus) on 2026-10-16. Branch `phase-5d-sources`, code commit 7f42317. Not pushed. Local Supabase only.

## Result
Tests first: `0026_sources.test.sql` and `0027_sources_gate.test.sql` were run before either migration existed (both failed: no
tables), then the grant inventories in 0001/0002 failed on exactly the additions before they were updated. Everything is green now.

## Built
- `supabase/migrations/20261019000026_sources.sql` (370 lines)
  - `public.source_links` as spec s4, with SQL checks: https link at most 2,000 characters; `youtube_id` set exactly for YouTube and
    `url_key = 'yt:' || youtube_id`; a web key never starts `yt:`; note at most 4,000; title 1..300 and site name 1..120 with no
    control characters; `channel_url` only on `https://www.youtube.com/` and only for YouTube; `thumb_path = 'yt/<thumb_sha256>.jpg'`
    and only for YouTube; `fetch_problem` one of the eight codes of spec s6.4 (`purged` included).
  - `source_link_companies` and `source_link_concepts` (pair keys, `on delete restrict`, an index on the second column), 5 and 8 per
    link counted under the link's row lock.
  - Guard trigger `private.guard_source_link` (the 0022 pattern): machine columns change only inside `record_source_fetch` or
    `purge_stale_source_data` (flag plus owner check); the link, its key, kind and id are fixed. The same trigger computes
    `meta_sha` (the plan's formula; null when nothing was read) and `meta_since` (moves only when `meta_sha` changes; nobody can set it)
    on every insert and update, so a client-sent hash is ignored on every path.
  - `public.record_source_fetch(p_link_id, p_found, p_title, p_site_name, p_channel_url, p_thumb_path, p_thumb_sha256, p_problem,
    p_gone) returns text`: found replaces the machine data, sets `fetched_at` once and `checked_at` now, attempts 0; gone clears every
    machine text and the picture and sets `gone`; neither (a failed read) records the problem and counts the attempt, keeping the
    earlier data and `checked_at`. Returns the previous picture path only when no link uses it any more (two videos can share
    identical thumbnail bytes).
  - `public.purge_stale_source_data() returns setof text`: YouTube links with data and no successful check in 30 days lose title,
    name, channel and picture (`fetch_problem = 'purged'`); returns the paths no link still uses.
  - Archive guard (definer) and company-unlink guard (definer, locks the link first) through
    `private.studied_is_public(link, company default null)`; message "It is on the public file. Save a revision without it first.",
    SQLSTATE 23514.
  - RLS and grants: admin select all three; insert `(url, url_key, kind, youtube_id, note)`; update `(note, archived_at)`; insert and
    delete join rows. No delete of a link for any role. service_role: select on `source_links` only.
  - `public.public_studied` (security_invoker) and the private bucket `source-thumbs` (200 KB = 204,800 bytes, `image/jpeg`); storage
    policies: admin reads every picture, anon reads one only while `public_studied` shows its `thumb_path`. No write policy (the
    service role writes and deletes).
- `supabase/migrations/20261019000027_sources_gate.sql` (381 lines; 262 of them are the two copied bodies)
  - New `private.studied_gate_failures(item, kind, company, struct, lint)` (codes 14.1-14.3, each link held `for share`).
  - `private.distribution_gate_failures` replaced (same signature).
  - `public.publish_revision` restated from 0023 with `c_policy = 'sebi-unreg-2026-07-v1.3'`; revoke and grant restated.
- `src/modules/compliance/policy.ts`: `POLICY_VERSION = "sebi-unreg-2026-07-v1.3"`, `RULE_TITLES["14"] = "Rule 14: outside sources"`
  (+ test). `src/lib/supabase/database.types.ts` regenerated (additions only).
- Tests changed: every `sebi-unreg-2026-07-v1.2` pin in 18 pgTAP files and 2 vitest files moved to v1.3 (descriptions too; refusal
  tests of v1.1 left as they were). 0001 grant inventory: `public_studied` in the anon view list, `studied_shown` in the private
  allowlist, `source_links` in the two service_role table lists. 0002: `record_source_fetch`, `purge_stale_source_data` in the
  service_role allowlist plus one assertion for the new functions (plan 36 to 37).

## Anon surface (all of it)
- `select` on `public.public_studied`: `item_id, position (from 1), kind, url, saved_on (IST date), note (the entry note)`, and
  `title, site_name, channel_url, thumb_path, thumb_sha256` only for an entry with `show: true` and the link's current hash; else null.
  Rows: entries of the current, passed revision of a visible (`is_public_item`) thesis or non-ledger case study, link not gone.
- Column `select (id, kind, url, created_at, gone)` on `public.source_links`, row policy `source_links_public_read` (the same
  predicate, inline). Nothing on the join tables.
- `execute` on `private.studied_shown(uuid, text)` (also authenticated): returns the machine data only for a link that a visible
  file's current passed revision lists with `show: true` and exactly the current hash; any other call returns no row (tested as
  anon with the hidden link's real hash).
- `select` on `storage.objects` in `source-thumbs` where the name is a `thumb_path` of `public_studied`.

## Gate diff summary
- `publish_revision`: one line differs from 0023 (`c_policy`), checked by `diff` of the copied block. Every earlier check is the
  copied text: actor, latest only, lint, policy, rules 3, 5, 6, ledger half, rule 10, company, theme, knowledge checks, the themes
  and companies `for share`, rules 12 and 13 through the helper, slug, file number. `private.gate_policy()` (0025) now reads v1.3, so
  the letters send check moves with it (tested).
- `distribution_gate_failures`: five lines differ from 0025 (a `v_studied` variable, its assignment first, and `|| v_studied` on the
  three returns). The video and letter branches are otherwise byte for byte.
- Rule 14 (every kind): a `studied` key on anything but a thesis or non-ledger case study is 14.1 alone; otherwise 14.1 shape (not a
  list; more than 12; per entry: exactly the four keys, lower-case uuid, boolean `show`, `metaSha` 64 hex or null, note string at most
  500; duplicate link), 14.2 (missing or archived; gone; not attached to the file's company), 14.3 (`show: true` needs the current
  hash and the hash in `p_lint -> 'studied'`; `show: false` needs no hash). Failures carry `entry` (position from 1).

## Deviations (read these)
1. **Machine data masked through a definer helper, not anon column grants (Q57 logged).** Spec s4 lists anon column grants for the
   view's columns. A column grant cannot follow an entry's `show` tick, so anon could have read, over REST, the third-party title of a
   source shown as a plain link, which rule 14.3 says is not shown. Built: the masked columns come only through
   `private.studied_shown`; anon holds five plain columns.
2. **`private.studied_is_public` is not called by the anon policy.** The plan's privilege list says no API role executes it, but a
   policy runs its functions as the caller, so the anon policy repeats the predicate inline (the 0022 pattern). The helper serves only
   the two guard triggers and deliberately ignores the item's 30-day lag (a file waiting out its lag still blocks archive/unlink).
3. **Unlink is refused only for the company of a public file that shows the link**; removing another company from the same link is
   allowed (14.2 only needs the file's company).
4. **A failed read does not touch `checked_at` or `fetched_at`.** Otherwise a timeout would restart the 30-day purge clock.
   Consequence for Task 3: "Read again" cannot take its 1-minute cooldown from `fetched_at` (set once, at the first read).
5. **`meta_sha` is null when nothing was read** (rather than a hash of kind and empty strings), so a never-read or purged link can
   never be shown with a title; 14.3 refuses `show: true` against a null hash.
6. Files over 300 lines: 0026 (370) and 0027 (381, of which 262 are the copied `publish_revision` and distribution bodies);
   `0027_sources_gate.test.sql` 316.

## New strings (pending Shlok's approval; none is advice language)
- SQL errors: "It is on the public file. Save a revision without it first." (spec); "A source can be attached to at most 5
  companies."; "A source can be attached to at most 8 concepts."
- Gate: "Outside sources go on a company file." (spec 14.1); "The outside sources in this revision are not a list. Save the sources
  again."; "A file can show at most 12 outside sources."; "Outside source {n} is not in the expected form. Save the sources
  again."; "Outside source {n} is listed twice."; "Outside source {n} was archived or removed. Save the sources again."; "Outside
  source {n} is no longer on YouTube. Save the sources again without it."; "Outside source {n} is not attached to this file's
  company."; "YouTube or the page changed since you chose it. Save the sources again." (spec 14.3); "The wording check did not
  read outside source {n}. Run the check again."; "Outside source {n} is not shown but carries a title check. Save the sources again."
- Rule label: "Rule 14: outside sources".

## Release consequence
Push 0026 and 0027 to the hosted project and merge the code at once. Between the two, every publish is refused: the hosted
`publish_revision` accepts only v1.3 while the deployed code still sends v1.2 (as 3b and 5b).

## Evidence (HEAD 7f42317)
- `pnpm supabase db reset` then `pnpm supabase test db`: Files=37, Tests=2798, PASS.
- `pnpm vitest run --testTimeout=60000 --maxWorkers=3`: 480 files, 6532 tests passed.
- `pnpm typecheck`: clean. `rtk pnpm lint`: clean.
- defenso `guard_code`: not run. This session exposes no ToolSearch tool, so the deferred `mcp__defenso__guard_code` could not be
  loaded; the Task 5 opus review stands in, as the plan allows.
