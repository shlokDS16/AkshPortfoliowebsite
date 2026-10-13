# Backup and restore runbook

The free Supabase plan has no downloadable backups, and a free project is paused after about 7 days of low database activity (the data is kept and can be restored for 90 days). So the desk takes its own backup every night.

## What runs

- Workflow: `.github/workflows/backup.yml` ("backup" in the GitHub Actions tab). Daily at 21:00 UTC (02:30 IST); GitHub may start it a little late.
- It dumps three files from the hosted database with the pinned Supabase CLI (2.119.0): `roles.sql`, `schema.sql`, `data.sql`. It adds a `manifest.txt` (time, git commit, CLI version, row counts per table), packs them into one `.tar.gz`, and encrypts it with GPG (AES-256).
- Only the encrypted `.gpg` file is uploaded. The repository is public, so a plaintext backup must never be uploaded anywhere.
- The dump is database activity, which may help against the pause, but that is unverified. The daily heartbeat cron is the keep-awake mechanism, not this backup.
- Nothing runs until `backup.yml` is on the default branch `main`: GitHub only honours the schedule, and shows the Run workflow button, for workflows on the default branch. After the merge, run it once by hand and check it is green.
- Needs two repository secrets (Settings > Secrets and variables > Actions): `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`. The run fails with a clear message when either is missing, and GitHub emails the owner when a run fails.
  - `SUPABASE_DB_URL`: Dashboard > Connect > Session pooler connection string (the free plan's direct host is IPv6-only, which GitHub runners lack). Percent-encode special characters in the password (`@` becomes `%40`).
  - `BACKUP_PASSPHRASE`: a long random passphrase on ONE line; paste it with no trailing newline or space (in the secret box and in the password manager). It lives in Shlok's password manager and as the GitHub secret. Never put it in the repository, an issue or a chat. Lose it and the backups cannot be opened.

## If the nightly run fails (email from GitHub)

Open the failed run in the Actions tab and read the log. Check the secrets first: the usual causes are a wrong or missing `SUPABASE_DB_URL` or `BACKUP_PASSPHRASE`. If you reset the database password or change the pooler, update the `SUPABASE_DB_URL` secret, or every nightly run fails. After fixing, use Run workflow to take a backup straight away.

## Where the backups are

GitHub > repository > Actions > "backup" > pick a run > Artifacts > `db-backup-YYYY-MM-DD`. Artifacts expire after 90 days. Download the zip, unzip it, and you have `db-backup-<timestamp>.tar.gz.gpg`.

## Run a backup by hand

Actions > backup > Run workflow > Run. Do this before any risky change (a big migration, a Supabase plan change). A run on the same day replaces that day's artifact.

## Tools you need

- `gpg`: ships with Git for Windows (use Git Bash) or install Gpg4win; on Linux/macOS it is usually installed.
- `psql` (only for restoring): install the PostgreSQL client tools, or on Windows with Docker run psql from an image instead. The image tag must match the server's major version (Dashboard > Settings > Infrastructure; this repo's `supabase/config.toml` says 17):

```bash
MSYS_NO_PATHCONV=1 docker run --rm -it -v "$PWD:/r" -w /r postgres:17 psql \
  --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' --file data.sql \
  --dbname "$NEW_DB_URL"
```

## Open a backup

```bash
gpg --output bundle.tar.gz --decrypt db-backup-<timestamp>.tar.gz.gpg   # prompts for the passphrase
mkdir restore && tar -xzf bundle.tar.gz -C restore && cat restore/manifest.txt
```

`manifest.txt` lists the row counts at backup time. Check them against what you expect before restoring.

## Restore into a NEW Supabase project

Follows https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore (re-read it before a real restore).

1. Create a new Supabase project (Dashboard > New project). Note its database password.
2. In the new project, enable any non-default extensions the old one used (Database > Extensions) before restoring.
3. Get the new project's Session pooler connection string (Dashboard > Connect) as `NEW_DB_URL`. Percent-encode the password inside it (`@` becomes `%40`, `/` becomes `%2F`).
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

With the local stack running (`pnpm db:start`): `bash scripts/backup/restore-drill.sh --yes` (without `--yes` it only explains and exits). It refuses to run against anything but 127.0.0.1/localhost, wipes the LOCAL database, round-trips the backup format through encryption, restores it and compares row counts and per-table checksums. The last line is `PASS: ...` or `FAIL: ...`. Afterwards the local database is reset with the seed. Run it after any schema migration batch.

## Limits

- Artifacts expire after 90 days. Consider copying one backup a month to Shlok's drive (also logged in `docs/specs/technical-debt.md`).
- Storage buckets are not covered. None are used yet; revisit in Phase 2 when PDFs land in Storage.
- GitHub disables scheduled workflows after 60 days without repository activity; a manual run or any commit re-enables them.
- A backup is only as fresh as the last green run: check the Actions tab if you receive a failure email.

## Restoring the ledger (events must not be re-sealed)

(Rewritten in Plan 3a fix round 2, 2026-10-13: it now covers every ledger table, the sealed-day anchors, and what to do when a check stops the job.)

**What the ledger is, and what can be rebuilt.** Five tables hold history that nothing can recompute, so they are restored together, from one backup, and never from different dates: `public.ideas` and `public.idea_events` (the hash chain, migration 0010), `public.ledger_anchors` (one sealed line per day, 0013), `public.corporate_actions` (Aksh's split, bonus and "no action" rows, 0011) and `public.idea_score_changes` (the restatement log, 0011). `public.idea_scores` is a recomputation: after a restore run `select public.score_ideas();` (or press Rescore) and it is rebuilt from the events, the prices and the actions. `prices_daily` and `market_days` come back with the dump; a missing day is refetched by the daily job.

Each event's time, number, random nonce, sealed text and hash are set by a trigger on every INSERT. A restore that lets that trigger fire (a plain `INSERT`, or `COPY` with triggers on) does not bring the old history back: it writes a NEW, internally valid chain with today's times and new hashes, and the chain check says "ok". The published fingerprints would then disagree with the database, and the original record is gone.

### The restore itself

1. Restore only from a full backup, in the order of the section above: roles, schema, then `SET session_replication_role = replica` and the data. The line keeps the seal trigger and the append-only triggers switched off, so every row goes in exactly as it was. Never replay events through `open_idea()` or `add_idea_event()`.
2. Restore into a new project, or a database whose ledger tables are empty. The load uses `COPY`/`INSERT` only. The two anchor guards (`ledger_anchors_guard`, `ledger_anchors_no_truncate`) are ALWAYS triggers: they keep firing under `replica`, and they refuse UPDATE, DELETE and TRUNCATE, so a dump that issues `TRUNCATE` or `DELETE` on `ledger_anchors` (a `--clean` restore, for instance) stops with "ledger_anchors is append-only". That is intended. Do not edit the dump by hand; restore into an empty database instead.
3. The one exception: replacing the rows of a ledger_anchors table that already has rows (a restore over an older copy), done by the database owner on purpose. Name the triggers, replace the rows, put the guards back and check them:

```sql
alter table public.ledger_anchors disable trigger ledger_anchors_guard;
alter table public.ledger_anchors disable trigger ledger_anchors_no_truncate;
-- replace the rows from the backup here (delete, then insert exactly the backup's rows)
alter table public.ledger_anchors enable always trigger ledger_anchors_guard;
alter table public.ledger_anchors enable always trigger ledger_anchors_no_truncate;
select tgname, tgenabled from pg_trigger
 where tgrelid = 'public.ledger_anchors'::regclass and not tgisinternal order by tgname;
```

   Both rows must read `A` (always). Never use `alter table ... enable trigger user` or `enable trigger all` for this table, and expect `pg_restore --disable-triggers` to do the same thing: they put the guards back as `O` (origin only), which `session_replication_role = replica` switches off. After ANY restore, run the `pg_trigger` query above; if a row reads `O`, run the two `enable always` lines.

### After the restore: verify, in this order, as the project owner

1. `select * from public.verify_ledger_chain();` The first column (`ok`) must be `true`, `events` must equal the `public.idea_events` count in `manifest.txt`, and `first_bad_seq` and `bad_idea` must be empty. A `bad_idea` means the `ideas` table does not match its events (a mixed restore) or a void was sealed after its window.
2. `select * from public.verify_ledger_anchors();` `ok` must be `true`, `days` must equal the `public.ledger_anchors` count in `manifest.txt`, and `first_bad_date` and `reason` must be empty. This compares every sealed day with the events as restored. It is what tells a faithful restore from a re-sealed one, or from a backup older than the last sealed day.
3. Compare the lines of `ledger_anchors` with the public gist (once the gist is switched on). If the gist holds days the restored database lacks, the backup is older than the record: do not publish anything, do not run `seal_ledger_days()` (it would seal the missing days from whatever the events now say), and tell Shlok.
4. Run `select public.score_ideas();`. It must complete; `select count(*) from public.idea_score_changes;` must not have grown (a faithful restore restates nothing).

### When a check stops the job

- **`seal_ledger_days()` raises `ledger:anchor_mismatch`** (the detail names the first date and the reason: `early_event`, `gap`, `count`, `seq`, `head`, `line`). Sealing stops for every later day until the owner acts; nothing is written. Read it with `select * from public.verify_ledger_anchors();`. The events and the sealed days disagree. Compare with the last good backup and the gist, find which side moved, and restore that side from the backup (steps 1 to 3 above). Never delete anchor rows to make the check pass: with the newest rows gone the next seal writes new ones from the events as they now stand, which blesses the change (spec s20, the known limit). Never re-seal a day that was already published. Record what happened in `docs/project-memory/timeline.md`.
- **`seal_ledger_days()` or `score_ideas()` raises `ledger:chain_broken`** (detail: `first_bad_seq`, `bad_idea`). Run `select * from public.verify_ledger_chain();`. If the events themselves are wrong, restore from the last good backup; never edit `idea_events`. If only `bad_idea` is set, an `ideas` row disagrees with its events: read the idea's events (`select seq, kind, recorded_at, stance from public.idea_events where idea_id = '<bad_idea>' order by seq;`) and put the `ideas` row back to what they say (status, `opened_at`, `closed_at`, `close_reason`, horizon, `held`, process call; `company_id`, `expects` and `created_at` are guarded by `ideas_guard_update`, so changing them needs that one trigger disabled for the statement and enabled again). Then run `verify_ledger_chain()` again until it says `ok`.
- **`score_ideas()` raises `ledger:projection_mismatch`** (detail: the idea). It is the same repair as a `bad_idea` above; the scores already stored stay as they were while it is unresolved.
