# Plan 3b Task 1 report: policy v1.1 in the database (migrations 0018, 0019)

Branch `phase-3b-case-studies`, local only, not pushed. Written 2026-10-15 by desk-backend.

## Built
- `private.case_switch(key)`: true only for the exact value `on` in `private.settings` (`ledger_reveal`, `ledger_chart`).
- `private.case_study_record(idea)`: the version 1 ledger record from the sealed events (words, time, choices and company read from the sealed text), the final score, `ledger_anchors` (`listed_on`) and, with `ledger_chart` on and every condition of rule 10.6 true, weekly fetched closes. Raises `case:not_closed`, `case:void`, `case:no_review`, `case:exit_pending` (P0001).
- `public.case_study_record(idea)` and `public.case_study_switches()`: admin doors (`private.is_admin()` first, error `forbidden`, 42501), granted to `authenticated` only.
- `private.case_gate_failures(item, kind, company, data_as_of, structured)`: rule 10 failures `case_kind`, `case_off`, `case_not_ready`, `ledger_check_failed`, `case_record`, `case_company`, `case_figures_to`, `case_open_idea`, `case_duplicate`, all with rule `10` and the spec s33.3 messages. Returns `[]` when `structured` has no `ledger` key.
- `public.publish_revision()` restated whole from 0014 with `c_policy = 'sebi-unreg-2026-07-v1.1'`, one call to the rule 10 helper, and no file number for a case study that carries a ledger record.
- `POLICY_VERSION` and `RULE_TITLES["10"]`; 12 pgTAP files re-pinned to the new version (0014 keeps its `like` check, now on the v1.1 string); allowlist in `0002_function_privileges` extended with the two doors.
- Types regenerated (`pnpm db:types`): `case_study_record`, `case_study_switches` added; nothing else changed.

## Files
- `supabase/migrations/20261015000018_case_record.sql` (246 lines), `supabase/migrations/20261015000019_case_gate.sql` (159 lines)
- `supabase/tests/0018_case_studies.test.sql` (530 lines, 134 assertions; over 300 like 0014's test, it is one fixture world)
- `src/modules/compliance/policy.ts`, `src/lib/supabase/database.types.ts`
- Re-pinned: `supabase/tests/0002_{catalog_guard,function_privileges,public_views,publish_gate,publish_guard,unpublish}`, `0003_latest_only`, `0004_{gate_confinement,ist_lag,slugify}`, `0005_casefile`, `0009_public_provenance`, `0014_ledger_gate` (`.test.sql`)

## Evidence
- `pnpm supabase db reset` clean (0018, 0019 applied); `pnpm supabase test db`: 29 files, 2168 assertions, PASS (0018: 134).
- The failing run was seen first (0018 against the old schema: `function private.case_study_record(uuid) does not exist`).
- `rtk pnpm test`: 324 files, 4726 tests pass (includes `policy.test.ts` finding the new `c_policy` in 0019). `pnpm typecheck` exit 0. `pnpm lint` exit 0.
- Grants proved by test: the three private helpers are executable by no API role; the two doors by `authenticated` only; `publish_revision` by `service_role` only; no API role can read or write `private.settings`; admin and client roles unchanged after inserting the switch rows. No `anon` grant added.

## Deviations and choices (all conservative; the opus review should look at each)
1. **figures_to also covers the exit date** (s33.2 says latest revealed entry and last chart point). The exit date is printed on the page; if the last review is sealed the same day as an after-3pm close, the exit close is a later date than every entry. With the chart on the two definitions are identical.
2. **Rule 10 is called for every revision, outside the `v_ledger` conditional** (plan text says inside the ledger block). Inside, a ledger case study filed under no company would skip rule 10 altogether; now it gets `case_company` and the rest. The helper returns at once for a revision with no `ledger` key.
3. **The helper runs the chain and sealed-day checks itself** and records `ledger_check_failed` under rule 10 (and stops), so the gate does not depend on the item naming a company for the ledger half to run.
4. **The helper is volatile and takes the chain advisory lock**, like `ledger_gate_item_failures`.
5. **More than 600 points gives `chart: null`**, not a cut series. D32 is read literally: any flag at all (including `implausible`), `entry_source` and `mark_source` both `nse_fetch`, and `factor` null or 1. Weekly point = last `nse_fetch` day of the ISO week with a fetched close for both the share and the index, strictly between entry and exit; a week with none contributes no point.
6. An unknown idea id is `case:not_closed`. A record whose `idea` is not a uuid is `ledger_check_failed` (builder unreadable), not an aborted publish.
7. **defenso `guard_code` was not callable in this session** (no tool search or tool exposed to this subagent). Not run; I reviewed both files by hand for the usual points (empty `search_path` and schema-qualified names on every definer function, revoke-then-grant by name, admin check first, no dynamic SQL, no `anon` path). The opus review stands in, as in 3a and 2.7.
8. The local Supabase stack was already running under the shared project id; I reset it from this worktree.

## New strings pending Shlok's approval
- The nine rule 10 messages of spec s33.3 are used verbatim (not new). The `case_not_ready` reasons are the four phrases of s33.3: "it is not closed", "it was withdrawn", "it has no lesson", "its exit price is not fixed".
- New (not in the spec): the rule 10 `ledger_check_failed` message: "The ledger failed its own check, so this case study cannot be published until it is looked at. Run the integrity check on the Ledger page."
- New: the rule title `RULE_TITLES["10"]` = "Rule 10: case studies from the ledger" (as the plan gives it).

## For the controller
- D38 cost applies as planned: after Shlok's `db push` of 0019 the live app must carry the new `POLICY_VERSION` (this branch does) or every publish is refused.
- `docs/progress.md` and the timeline are not touched here.
