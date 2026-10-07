# Report: nightly encrypted backup + restore drill

Status: DONE (workflow not triggered, no secrets set, hosted project untouched).

## Files
- .github/workflows/backup.yml (cron 0 21 * * * + workflow_dispatch; contents: read; concurrency group `backup`; 20 min)
- scripts/backup/restore-drill.sh (executable bit set), scripts/backup/row-counts.sql (shared by workflow manifest and drill)
- docs/runbooks/backup-and-restore.md
- docs/specs/technical-debt.md (appended 3 lines)
- .gitattributes (+ `*.sh text eol=lf` so a CRLF checkout cannot break the script)

## Verified
- Action pins (released tags, input names read from action.yml): supabase/setup-cli@v3.0.1 (input `version`, set 2.119.0), actions/upload-artifact@v7.0.2 (`retention-days`, `overwrite`, `if-no-files-found`), actions/checkout@v7.0.1. CI still uses setup-cli@v1 / checkout@v4 (untouched).
- Flags from `pnpm supabase db dump --help` (2.119.0): `--role-only`, `--data-only`, `--use-copy`, `--db-url`, `-f`. `db reset --no-seed` exists.
- actionlint (rhysd release binary): clean. `bash -n` on the drill: clean.
- Restore command in the runbook matches the Supabase guide (fetched 2026-10-07).

## Drill (local stack; I had to `pnpm supabase start` first, it was stopped)
PASS: restore drill, 13 tables, 8 rows, counts + md5 per table identical
Counts: auth.users 1, private.settings 1, public.companies 1, themes 1, items 1, item_revisions 1, profiles 1, heartbeats 1, rest 0. Drill seeds those rows itself (the dev DB was empty). Restore uses psql inside the DB container (no local psql) as supabase_admin: as `postgres` it fails with "permission denied for table buckets_vectors" (storage.* tables in the data dump).
Encrypt/decrypt round trip checked (cmp of decrypted data.sql; plaintext absent from .gpg). Local stack left freshly reset with seed.

## Open risks
- Hosted restore as `postgres` may hit the same storage.* permission error as local; the runbook says to ask rather than hand-edit. Not testable without a scratch hosted project (logged in technical-debt).
- schema.sql/roles.sql are dumped and encrypted but only data.sql is restore-tested (schema came from migrations).
- Cannot test the remote dump path (SUPABASE_DB_URL must be the percent-encoded Session pooler string; direct host is IPv6-only). First manual run via workflow_dispatch after the controller sets secrets is the real test.
- Manifest row counts need `psql` on the runner (preinstalled on ubuntu-latest); best effort, non-fatal.
- Scheduled workflows are disabled by GitHub after 60 days of repo inactivity (noted in runbook).
