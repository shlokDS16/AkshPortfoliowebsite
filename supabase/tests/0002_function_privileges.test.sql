-- Function exposure: EXECUTE is closed by default and opened only for a short allowlist.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- publish_revision / unpublish_item: the admin session only (is_admin() is checked inside).
select ok(not has_function_privilege('anon', 'public.publish_revision(uuid, uuid, text, jsonb)', 'execute'),
  'anon cannot execute publish_revision');
select ok(has_function_privilege('authenticated', 'public.publish_revision(uuid, uuid, text, jsonb)', 'execute'),
  'authenticated (the admin session role) can execute publish_revision');
select ok(not has_function_privilege('service_role', 'public.publish_revision(uuid, uuid, text, jsonb)', 'execute'),
  'job code (service_role) cannot publish');
select ok(not has_function_privilege('anon', 'public.unpublish_item(uuid)', 'execute'),
  'anon cannot execute unpublish_item');
select ok(has_function_privilege('authenticated', 'public.unpublish_item(uuid)', 'execute'),
  'authenticated can execute unpublish_item');
select ok(not has_function_privilege('service_role', 'public.unpublish_item(uuid)', 'execute'),
  'service_role cannot unpublish');
select ok(has_function_privilege('anon', 'public.heartbeat_ages()', 'execute')
      and not has_function_privilege('authenticated', 'public.heartbeat_ages()', 'execute')
      and not has_function_privilege('service_role', 'public.heartbeat_ages()', 'execute'),
  'heartbeat_ages is granted to anon (the public health route) and to no other API role');

-- The allowlist: anything else in public is closed.
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
     and p.proname <> 'heartbeat_ages'
$$, 'anon can execute no function in public except heartbeat_ages');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
     and p.proname not in ('publish_revision', 'unpublish_item')
$$, 'authenticated can execute no function in public except publish_revision and unpublish_item');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('service_role', p.oid, 'execute')
$$, 'service_role can execute no function in public');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
$$, 'no function in public carries a PUBLIC execute grant');

-- Definer functions are pinned to an empty search_path.
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not ('search_path=""' = any (coalesce(p.proconfig, '{}'::text[])))
$$, 'every SECURITY DEFINER function in public pins an empty search_path');
select is_definer('public', 'publish_revision', array['uuid', 'uuid', 'text', 'jsonb'],
  'publish_revision is SECURITY DEFINER');
select is_definer('public', 'unpublish_item', array['uuid'], 'unpublish_item is SECURITY DEFINER');
select is_definer('public', 'heartbeat_ages', array[]::name[], 'heartbeat_ages is SECURITY DEFINER');

-- Behaviour, through real roles.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.publish_revision('d1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 'pol-1', '{}'::jsonb) $$,
  '42501', null, 'anon calling publish_revision is denied');
select throws_ok($$ select public.unpublish_item('d1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon calling unpublish_item is denied');
select throws_ok($$ select private.slugify('x') $$, '42501', null, 'anon cannot call the private slug helper');
reset role;
set local role service_role;
select throws_ok($$ select public.publish_revision('d1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 'pol-1', '{}'::jsonb) $$,
  '42501', null, 'service_role calling publish_revision is denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select private.slugify('x') $$, '42501', null, 'authenticated cannot call the private slug helper');

select * from finish();
rollback;
