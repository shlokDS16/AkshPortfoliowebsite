#!/usr/bin/env bash
# Restore drill: proves the nightly backup format (roles / schema / data, encrypted bundle)
# restores into an empty schema built from migrations, against the LOCAL Supabase stack only.
# Runs in Git Bash on Windows and on Linux. Needs: pnpm, docker (or psql), gpg, tar.
#
# Steps: seed drill rows -> count + checksum -> dump (same commands as .github/workflows/backup.yml)
#   -> encrypt/decrypt round trip with a throwaway passphrase -> `supabase db reset --no-seed`
#   -> restore the DECRYPTED data file -> recount + checksum -> diff. Ends with a PASS/FAIL line.
# WARNING: wipes the local database (reset), then leaves it freshly reset with the seed.
set -euo pipefail
export MSYS_NO_PATHCONV=1

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
work="$(mktemp -d)"
pass="$(head -c 24 /dev/urandom | base64)"
trap 'rm -rf "$work"; unset pass' EXIT
mkdir "$work/gnupg"; chmod 700 "$work/gnupg" 2>/dev/null || true; export GNUPGHOME="$work/gnupg" # keep the throwaway keyring out of ~/.gnupg
fail() { echo "FAIL: $*" >&2; exit 1; }

# -- 1. Local stack only --------------------------------------------------------------------
db_url="$(pnpm --silent supabase status -o env 2>/dev/null | sed -n 's/^DB_URL="\(.*\)"$/\1/p')"
[ -n "$db_url" ] || fail "supabase status gave no DB_URL (is the local stack running? pnpm db:start)"
host="$(printf '%s' "$db_url" | sed -E 's#^[a-z]+://[^@]*@([^:/?]+).*#\1#')"
case "$host" in 127.0.0.1|localhost) ;; *) fail "refusing to run: DB host is '$host', not local" ;; esac

# -- psql: local binary if installed, else inside the Supabase DB container ------------------
project_id="$(sed -n 's/^project_id *= *"\(.*\)"/\1/p' supabase/config.toml | head -1)"
container="supabase_db_${project_id}"
psql_local() {
  if command -v psql >/dev/null 2>&1; then psql "$db_url" -v ON_ERROR_STOP=1 "$@"
  else docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 "$@"; fi
}
# Restore runs as the superuser: the local `postgres` role lacks grants on some storage.* tables
# that the data dump covers (the hosted project's postgres role is what the runbook uses).
psql_admin() {
  if command -v psql >/dev/null 2>&1; then psql "${db_url/\/\/postgres:/\/\/supabase_admin:}" -v ON_ERROR_STOP=1 "$@"
  else docker exec -i "$container" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; fi
}
# The CLI writes files itself; hand it a path native to the host OS (C:/... on Windows).
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

# Per-table row counts, plus one md5 fingerprint per table (catches wrong values, not just counts).
snapshot() {
  psql_local -At -F ' ' -f - < scripts/backup/row-counts.sql
  psql_local -At -F ' ' -f - <<'SQL'
select 'md5:' || table_schema || '.' || table_name || ' ' ||
       (xpath('/row/c/text()', query_to_xml(format(
         'select md5(coalesce(string_agg(t::text, ''|'' order by t::text), '''')) as c from %I.%I t',
         table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables
 where table_type = 'BASE TABLE'
   and (table_schema in ('public', 'private') or (table_schema = 'auth' and table_name = 'users'))
 order by 1;
SQL
}

dump_all() { # same commands as the workflow, --db-url form
  local d; d="$(native "$1")"
  pnpm --silent supabase db dump --db-url "$db_url" --role-only -f "$d/roles.sql" >/dev/null
  pnpm --silent supabase db dump --db-url "$db_url" -f "$d/schema.sql" >/dev/null
  pnpm --silent supabase db dump --db-url "$db_url" --use-copy --data-only -f "$d/data.sql" >/dev/null 2>&1
}

# -- 2. Make sure there is something to lose -------------------------------------------------
echo "== seeding drill rows"
psql_local -q -f - <<'SQL'
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'drill@example.test', now(), now())
on conflict (id) do nothing;
insert into public.companies (id, slug, name, nse_symbol)
values ('00000000-0000-4000-8000-0000000000c1', 'drill-co', 'Drill Co', 'DRILL')
on conflict (id) do nothing;
insert into public.themes (id, slug, name)
values ('00000000-0000-4000-8000-0000000000e1', 'drill-theme', 'Drill theme')
on conflict (id) do nothing;
insert into public.items (id, kind, slug, title, company_id, theme_id, learning_objective)
values ('00000000-0000-4000-8000-0000000000a1', 'note', 'drill-note', 'Drill note',
        '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 'restore drill')
on conflict (id) do nothing;
insert into public.item_revisions (id, item_id, body_md, change_reason)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
        E'Body with a tab\tand unicode: Rs 1,00,000 crore \u20b9', 'drill')
on conflict (id) do nothing;
update public.items set current_revision_id = '00000000-0000-4000-8000-0000000000b1'
 where id = '00000000-0000-4000-8000-0000000000a1' and current_revision_id is null;
insert into public.heartbeats (job, ok, detail) values ('restore-drill', true, 'seed');
SQL

echo "== counts before"
snapshot > "$work/before.txt"
grep -v '^md5:' "$work/before.txt"

# -- 3. Dump, bundle, encrypt, decrypt -------------------------------------------------------
echo "== dump"
mkdir "$work/dump"
dump_all "$work/dump"
for f in roles.sql schema.sql data.sql; do [ -s "$work/dump/$f" ] || fail "$f is empty"; done
{ echo "created_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"; echo "drill: true"; } > "$work/dump/manifest.txt"
tar -czf "$work/bundle.tar.gz" -C "$work/dump" manifest.txt roles.sql schema.sql data.sql
printf '%s' "$pass" | gpg --batch --yes --pinentry-mode loopback --symmetric --cipher-algo AES256 \
  --passphrase-fd 0 --output "$work/bundle.tar.gz.gpg" "$work/bundle.tar.gz"
rm -f "$work/bundle.tar.gz"
if grep -q 'drill@example.test' "$work/bundle.tar.gz.gpg"; then fail "plaintext visible in the .gpg file"; fi
mkdir "$work/restored"
printf '%s' "$pass" | gpg --batch --pinentry-mode loopback --passphrase-fd 0 --decrypt \
  "$work/bundle.tar.gz.gpg" 2>/dev/null | tar -xzf - -C "$work/restored"
cmp -s "$work/dump/data.sql" "$work/restored/data.sql" || fail "decrypted data.sql differs from the dump"
echo "encrypt/decrypt round trip ok ($(wc -c < "$work/bundle.tar.gz.gpg" | tr -d ' ') bytes encrypted)"

# -- 4. Empty schema from migrations, restore data only ---------------------------------------
echo "== reset (--no-seed) and restore"
pnpm --silent supabase db reset --no-seed >/dev/null 2>&1 || fail "supabase db reset --no-seed failed"
empty_items="$(psql_local -At -c 'select count(*) from public.items')"
[ "$empty_items" = "0" ] || fail "schema was not empty after reset (items=$empty_items)"
psql_admin -q --single-transaction -f - < "$work/restored/data.sql" >/dev/null 2>"$work/restore.err" \
  || { cat "$work/restore.err" >&2; fail "psql restore of data.sql failed"; }

# -- 5. Compare ------------------------------------------------------------------------------
echo "== counts after"
snapshot > "$work/after.txt"
tables="$(grep -vc '^md5:' "$work/before.txt")"
if diff -u "$work/before.txt" "$work/after.txt" > "$work/diff.txt"; then result=PASS; else result=FAIL; cat "$work/diff.txt" >&2; fi

echo "== leaving the local stack usable (db reset with seed)"
pnpm --silent supabase db reset >/dev/null 2>&1 || echo "warning: final db reset failed; run pnpm db:reset" >&2

rows="$(grep -v '^md5:' "$work/after.txt" | awk '{s+=$2} END {print s}')"
if [ "$result" = PASS ]; then verdict=identical; else verdict=DIFFER; fi
echo "$result: restore drill, $tables tables, $rows rows, counts + md5 per table $verdict"
[ "$result" = PASS ]
