-- Exact row counts for every base table in public and private, plus auth.users.
-- Output (psql -At -F ' '): "<schema>.<table> <count>", sorted. Used by the nightly backup
-- manifest and by scripts/backup/restore-drill.sh (before/after diff). Read-only.
select table_schema || '.' || table_name || ' ' ||
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text
  from information_schema.tables
 where table_type = 'BASE TABLE'
   and (table_schema in ('public', 'private') or (table_schema = 'auth' and table_name = 'users'))
 order by 1;
