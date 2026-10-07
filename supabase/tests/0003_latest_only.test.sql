-- publish_revision() publishes only the latest revision of an item (20261006000003_latest_only.sql).
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Stand-in for the compliance server action (ADR-003): it reaches publish_revision / unpublish_item as the
-- function owner, as the service client does, and passes the signed-in session's user as the verified actor.
-- The confinement itself (service_role only) is tested in 0004_gate_confinement.test.sql.
create function public.test_publish(p_item uuid, p_rev uuid, p_policy text, p_lint jsonb)
returns public.gate_decisions language sql security definer set search_path = ''
as $$ select * from public.publish_revision((select auth.uid()), p_item, p_rev, p_policy, p_lint) $$;
create function public.test_unpublish(p_item uuid)
returns text language sql security definer set search_path = ''
as $$ select public.unpublish_item((select auth.uid()), p_item) $$;
grant execute on function public.test_publish(uuid, uuid, text, jsonb), public.test_unpublish(uuid) to authenticated;

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test');

create function public.test_lint(p_rev uuid, p_passed boolean default true)
returns jsonb language sql immutable
as $$ select jsonb_build_object('passed', p_passed, 'revisionId', p_rev::text, 'policyVersion', 'sebi-unreg-2026-07') $$;
create function public.test_verdict(p_item uuid, p_rev uuid, p_passed boolean default true)
returns text language sql
as $$ select verdict from public.test_publish(p_item, p_rev, 'sebi-unreg-2026-07', public.test_lint(p_rev, p_passed)) $$;
grant execute on function public.test_lint(uuid, boolean), public.test_verdict(uuid, uuid, boolean) to authenticated;

insert into public.items (id, kind, title, learning_objective) values
  ('d1000000-0000-4000-8000-000000000001', 'learning', 'Two revisions', 'Learn.'),
  ('d2000000-0000-4000-8000-000000000002', 'learning', 'One revision', 'Learn.');
insert into public.item_revisions (id, item_id, body_md) values
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'v1'),
  ('e1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'v2'),
  ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'v1');

-- Structure (20261007000004 changed the signature and the grants): still definer with a pinned search_path,
-- executable by service_role only.
select is_definer('public', 'publish_revision', array['uuid', 'uuid', 'uuid', 'text', 'jsonb'], 'publish_revision is still SECURITY DEFINER');
select ok((select 'search_path=""' = any (p.proconfig) from pg_proc p
            where p.oid = 'public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure),
  'publish_revision still pins search_path to the empty path');
select ok(has_function_privilege('service_role', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute'),
  'only service_role can execute publish_revision');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- An older revision is a recorded failure with rule 'revision'; nothing is raised or changed.
select is(public.test_verdict('d1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001'),
  'fail', 'a revision with a newer sibling fails even with a clean lint');
select results_eq($$
  select f ->> 'rule', f ->> 'message'
    from public.gate_decisions g, jsonb_array_elements(g.reasons -> 'failures') f
   where g.revision_id = 'e1000000-0000-4000-8000-000000000001'
$$, $$ values ('revision'::text, 'A newer revision exists; publish the latest.'::text) $$,
  'the failure is recorded under rule revision, and it is the only one');
select results_eq($$
  select visibility, status, slug, current_revision_id::text, published_at from public.items
   where id = 'd1000000-0000-4000-8000-000000000001'
$$, $$ values ('private'::text, 'draft'::text, null::text, null::text, null::timestamptz) $$,
  'the item is left untouched');
select is(public.test_verdict('d1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', false),
  'fail', 'an older revision with a failing lint also fails');
select is((select count(*) from public.gate_decisions
            where revision_id = 'e1000000-0000-4000-8000-000000000001' and jsonb_array_length(reasons -> 'failures') = 2),
  1::bigint, 'the revision failure is combined with the lint failure, as every other failure is');
select is((select count(*) from public.gate_decisions where revision_id = 'e1000000-0000-4000-8000-000000000001'),
  2::bigint, 'every attempt on the older revision is recorded');

-- The latest revision passes and goes live.
select is(public.test_verdict('d1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002'),
  'pass', 'the latest revision passes');
select results_eq($$
  select visibility, current_revision_id::text from public.items where id = 'd1000000-0000-4000-8000-000000000001'
$$, $$ values ('public'::text, 'e1000000-0000-4000-8000-000000000002'::text) $$, 'and goes live');

-- Once a newer revision is saved, the live one can no longer be republished; the item stays public on it.
insert into public.item_revisions (id, item_id, body_md) values
  ('e1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'v3');
select is(public.test_verdict('d1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002'),
  'fail', 'the live revision cannot be republished once a newer one exists');
select results_eq($$
  select visibility, current_revision_id::text from public.items where id = 'd1000000-0000-4000-8000-000000000001'
$$, $$ values ('public'::text, 'e1000000-0000-4000-8000-000000000002'::text) $$, 'the item stays public on the live revision');
select is(public.test_verdict('d1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003'),
  'pass', 'the newest revision passes');

-- An item with a single revision is unaffected; a revision of another item still raises.
select is(public.test_verdict('d2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001'),
  'pass', 'a single-revision item publishes as before');
select throws_ok($$ select public.test_verdict('d2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000003') $$,
  'P0002', null, 'a revision of another item still raises');

select * from finish();
rollback;
