# Backup and restore runbook

The free Supabase plan has no downloadable backups, and a free project is paused after about 7 days of low database activity (the data is kept and can be restored for 90 days). So the desk takes its own backup every night.

## What runs

- Workflow: `.github/workflows/backup.yml` ("backup" in the GitHub Actions tab). Daily at 21:00 UTC (02:30 IST); GitHub may start it a little late.
- It dumps three files from the hosted database with the pinned Supabase CLI (2.119.0): `roles.sql`, `schema.sql`, `data.sql`. It adds a `manifest.txt` (time, git commit, CLI version, row counts per table), packs them into one `.tar.gz`, and encrypts it with GPG (AES-256).
- Only the encrypted `.gpg` file is uploaded. The repository is public, so a plaintext backup must never be uploaded anywhere.
- The dump also counts as database activity, which helps keep the free project from being paused.
- Needs two repository secrets (Settings > Secrets and variables > Actions): `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`. The run fails with a clear message when either is missing, and GitHub emails the owner when a run fails.
  - `SUPABASE_DB_URL`: Dashboard > Connect > Session pooler connection string (the free plan's direct host is IPv6-only, which GitHub runners lack). Percent-encode special characters in the password (`@` becomes `%40`).
  - `BACKUP_PASSPHRASE`: a long random passphrase. It lives in Shlok's password manager and as the GitHub secret. Never put it in the repository, an issue or a chat. Lose it and the backups cannot be opened.

## Where the backups are

GitHub > repository > Actions > "backup" > pick a run > Artifacts > `db-backup-YYYY-MM-DD`. Artifacts expire after 90 days. Download the zip, unzip it, and you have `db-backup-<timestamp>.tar.gz.gpg`.

## Run a backup by hand

Actions > backup > Run workflow > Run. Do this before any risky change (a big migration, a Supabase plan change). A run on the same day replaces that day's artifact.

## Open a backup (needs gpg)

```bash
gpg --batch --pinentry-mode loopback --decrypt db-backup-<timestamp>.tar.gz.gpg > bundle.tar.gz   # asks for the passphrase
mkdir restore && tar -xzf bundle.tar.gz -C restore && cat restore/manifest.txt
```

`manifest.txt` lists the row counts at backup time. Check them against what you expect before restoring.

## Restore into a NEW Supabase project

Follows https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore (re-read it before a real restore).

1. Create a new Supabase project (Dashboard > New project). Note its database password.
2. In the new project, enable any non-default extensions the old one used (Database > Extensions) before restoring.
3. Get the new project's Session pooler connection string (Dashboard > Connect) as `NEW_DB_URL`.
4. From the `restore` folder, run:

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$NEW_DB_URL"
```

   Order matters: roles, then schema, then data. The `SET session_replication_role = replica` line switches triggers off for the load so rows go in exactly as they were.
5. Check: compare the row counts in the new project with `manifest.txt` (the SQL in `scripts/backup/row-counts.sql` prints the same list).
6. Point the app at the new project: update the Supabase URL and the publishable and secret keys in Vercel, and the `SUPABASE_DB_URL` GitHub secret. Users sign in again (sessions are new); the admin profile row comes back with the data.
7. Custom roles need their passwords set again by hand (`ALTER USER ... WITH PASSWORD ...`). If a restore stops on a permission error for a table in the `storage` or `auth` schema, note the message and ask for help; do not edit the dump by hand.

Files stored in Supabase Storage are NOT in this backup (see Limits).

## Resume a paused project

Dashboard > the paused project > Resume (or "Restore project"). Possible for 90 days after the pause; after that only the nightly backup above can bring the data back. The daily dump normally prevents the pause in the first place.

## Prove the format still restores (local, safe)

With the local stack running (`pnpm db:start`): `bash scripts/backup/restore-drill.sh`. It refuses to run against anything but 127.0.0.1/localhost, wipes the LOCAL database, round-trips the backup format through encryption, restores it and compares row counts and per-table checksums. The last line is `PASS: ...` or `FAIL: ...`. Afterwards the local database is reset with the seed. Run it after any schema migration batch.

## Limits

- Artifacts expire after 90 days. Consider copying one backup a month to Shlok's drive (also logged in `docs/specs/technical-debt.md`).
- Storage buckets are not covered. None are used yet; revisit in Phase 2 when PDFs land in Storage.
- GitHub disables scheduled workflows after 60 days without repository activity; a manual run or any commit re-enables them.
- A backup is only as fresh as the last green run: check the Actions tab if you receive a failure email.
