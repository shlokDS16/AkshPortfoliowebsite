-- Privileges: what each API role can touch, and nothing else.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Table-level access.
select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'select')
$$, 'anon has no table-level SELECT on any public table');
select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'insert,update,delete,truncate'))
$$, 'anon has no write privilege on any public table');
select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and has_table_privilege('authenticated', c.oid, 'truncate')
$$, 'authenticated cannot TRUNCATE any public table');
select ok(not has_table_privilege('authenticated', 'public.item_revisions', 'update')
      and not has_table_privilege('authenticated', 'public.item_revisions', 'delete'),
  'authenticated cannot update or delete revisions');
select ok(not has_table_privilege('authenticated', 'public.gate_decisions', 'insert')
      and not has_table_privilege('authenticated', 'public.heartbeats', 'insert'),
  'authenticated cannot write gate decisions or heartbeats');
select ok(not has_table_privilege('authenticated', 'public.captures', 'delete'),
  'authenticated cannot delete captures');
select ok(has_table_privilege('service_role', 'public.heartbeats', 'select')
      and has_table_privilege('service_role', 'public.heartbeats', 'insert'),
  'service_role can read and write heartbeats');
select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'heartbeats'
     and has_table_privilege('service_role', c.oid, 'select,insert,update,delete')
$$, 'service_role has no privilege on any other public table');

-- Column-level public tier (anon): only what the public views need.
select ok(has_column_privilege('anon', 'public.companies', 'one_liner', 'select')
      and has_column_privilege('anon', 'public.companies', 'visibility', 'select')
      and has_column_privilege('anon', 'public.companies', 'nse_symbol', 'select'),
  'anon can select the public company columns');
select ok(not has_column_privilege('anon', 'public.companies', 'needs_review', 'select')
      and not has_column_privilege('anon', 'public.companies', 'isin', 'select')
      and not has_column_privilege('anon', 'public.companies', 'bse_code', 'select'),
  'anon cannot select the other company columns');
select ok(has_column_privilege('anon', 'public.themes', 'name', 'select')
      and not has_column_privilege('anon', 'public.themes', 'description_md', 'select')
      and not has_column_privilege('anon', 'public.themes', 'needs_review', 'select'),
  'anon theme access is limited to the public columns');
select ok(has_column_privilege('anon', 'public.items', 'title', 'select')
      and has_column_privilege('anon', 'public.items', 'holds_position', 'select')
      and not has_column_privilege('anon', 'public.items', 'search', 'select')
      and not has_column_privilege('anon', 'public.items', 'updated_at', 'select'),
  'anon item access is limited to the public columns');
select ok(has_column_privilege('anon', 'public.item_revisions', 'body_md', 'select')
      and not has_column_privilege('anon', 'public.item_revisions', 'author', 'select')
      and not has_column_privilege('anon', 'public.item_revisions', 'schema_version', 'select'),
  'anon revision access is limited to the public columns');

-- Functions.
select ok(has_function_privilege('anon', 'private.is_admin()', 'execute')
      and has_function_privilege('authenticated', 'private.is_admin()', 'execute'),
  'is_admin is executable by the roles whose RLS predicates call it');
select ok(has_function_privilege('anon', 'private.revision_passed(uuid)', 'execute')
      and has_function_privilege('anon', 'private.is_lagged(date)', 'execute')
      and has_function_privilege('anon', 'private.is_public_item(text, text, date)', 'execute')
      and has_function_privilege('authenticated', 'private.is_public_item(text, text, date)', 'execute'),
  'the other RLS helpers are executable by anon');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.proname not in ('is_admin', 'revision_passed', 'is_lagged', 'is_public_item')
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))
$$, 'no other function in public or private is executable by anon or authenticated');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
$$, 'every SECURITY DEFINER function pins search_path');
select is(
  (select p.provolatile::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_lagged'),
  's', 'is_lagged is STABLE');

-- private.settings is closed to every API role.
select ok(not has_table_privilege('anon', 'private.settings', 'select')
      and not has_table_privilege('authenticated', 'private.settings', 'select')
      and not has_table_privilege('service_role', 'private.settings', 'select'),
  'private.settings is not readable by API roles');

-- Default privileges: a table created later is closed by default.
create table public.grants_probe (id int);
select ok(not has_table_privilege('anon', 'public.grants_probe', 'select')
      and not has_table_privilege('authenticated', 'public.grants_probe', 'select')
      and not has_table_privilege('service_role', 'public.grants_probe', 'select'),
  'a new public table is not granted to API roles by default');

-- Default privileges: a function created later, in either schema, is closed by default
-- (implicit PUBLIC EXECUTE included, which is why the revoke in the migration is global).
create function private.grants_probe() returns int language sql as 'select 1';
select ok(not has_function_privilege('anon', 'private.grants_probe()', 'execute')
      and not has_function_privilege('authenticated', 'private.grants_probe()', 'execute')
      and not has_function_privilege('service_role', 'private.grants_probe()', 'execute'),
  'a new function in private is not executable by API roles by default');
create function public.grants_probe() returns int language sql as 'select 1';
select ok(not has_function_privilege('anon', 'public.grants_probe()', 'execute')
      and not has_function_privilege('authenticated', 'public.grants_probe()', 'execute')
      and not has_function_privilege('service_role', 'public.grants_probe()', 'execute'),
  'a new function in public is not executable by API roles by default');

-- Behaviour of the closed paths, through real roles.
set local role service_role;
select lives_ok($$ insert into public.heartbeats (job, ok) values ('probe', true) $$,
  'service_role can write a heartbeat');
select throws_ok($$ select * from public.items $$, '42501', null,
  'service_role cannot read items');
reset role;
set local role anon;
select throws_ok($$ select * from private.settings $$, '42501', null,
  'anon cannot read private.settings');

select * from finish();
rollback;
