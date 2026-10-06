-- unpublish_item(): retraction, and the way back through the gate.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(22);

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
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'stranger@pgtap.test');

-- u1 gets published and retracted; u2 is never published.
insert into public.items (id, kind, title, learning_objective) values
  ('d1000000-0000-4000-8000-000000000001', 'learning', 'Retract me', 'Learn.'),
  ('d2000000-0000-4000-8000-000000000002', 'learning', 'Never published', 'Learn.');
insert into public.item_revisions (id, item_id, body_md) values
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'v1'),
  ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'v1');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select verdict from public.test_publish('d1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07',
    '{"passed":true,"revisionId":"e1000000-0000-4000-8000-000000000001","policyVersion":"sebi-unreg-2026-07"}'::jsonb)),
  'pass', 'precondition: u1 is published');
-- Revision 2 is added only now: publish_revision() refuses a revision that has a newer sibling.
insert into public.item_revisions (id, item_id, body_md) values
  ('e1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'v2');

-- Backdate the first publish (owner, gate open) so "republishing keeps the first date" is observable.
reset role;
select set_config('app.publish_gate', 'on', true);
update public.items set published_at = now() - interval '5 days' where id = 'd1000000-0000-4000-8000-000000000001';
select set_config('app.publish_gate', 'off', true);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(public.test_unpublish('d1000000-0000-4000-8000-000000000001'), 'retract-me-d10000',
  'unpublish returns the slug for cache purge');
select results_eq($$
  select visibility, status, current_revision_id::text, slug from public.items
   where id = 'd1000000-0000-4000-8000-000000000001'
$$, $$ values ('private'::text, 'published'::text, 'e1000000-0000-4000-8000-000000000001'::text,
               'retract-me-d10000'::text) $$,
  'the item becomes private; status, current revision and slug are kept so it can be republished');
select is((select count(*) from public.gate_decisions where item_id = 'd1000000-0000-4000-8000-000000000001'
            and verdict = 'pass'), 1::bigint, 'the audit trail of the earlier publish is intact');
select is(public.test_unpublish('d1000000-0000-4000-8000-000000000001'), 'retract-me-d10000',
  'unpublishing twice is harmless');
select is(public.test_unpublish('d2000000-0000-4000-8000-000000000002'), null,
  'an item that never had a slug returns null');
select throws_ok($$ select public.test_unpublish('ffffffff-0000-4000-8000-00000000000f') $$,
  'P0002', null, 'an unknown item raises');

-- Gone from the public surface.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is_empty($$ select id from public.public_items $$, 'the retracted item leaves public_items');
select is_empty($$ select id from public.public_item_revisions $$, 'its revisions leave public_item_revisions');
select is_empty($$ select id from public.items $$, 'anon cannot read it from the base table either');
select is_empty($$ select id from public.item_revisions $$, 'nor its revisions');

-- Not an admin, not allowed.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.test_unpublish('d1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'a signed-in non-admin cannot unpublish');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.unpublish_item('aaaaaaaa-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon cannot unpublish, even naming the admin as the actor');

-- Editing and republishing.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ update public.items set visibility = 'public' where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'a retracted item cannot be made public by a direct update');
select lives_ok($$ update public.items set title = 'Retract me, revised' where id = 'd1000000-0000-4000-8000-000000000001' $$,
  'a retracted item can be edited');
select is((select verdict from public.test_publish('d1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000002', 'sebi-unreg-2026-07',
    '{"passed":false,"revisionId":"e1000000-0000-4000-8000-000000000002","policyVersion":"sebi-unreg-2026-07"}'::jsonb)),
  'fail', 'a failed gate on a retracted item records a fail verdict');
select results_eq($$
  select visibility, status, current_revision_id::text,
         (select count(*) from public.gate_decisions g
           where g.revision_id = 'e1000000-0000-4000-8000-000000000002' and g.verdict = 'fail')
    from public.items where id = 'd1000000-0000-4000-8000-000000000001'
$$, $$ values ('private'::text, 'published'::text, 'e1000000-0000-4000-8000-000000000001'::text, 1::bigint) $$,
  'the failed gate leaves the retracted item private on its old revision and records the fail row');
select is((select verdict from public.test_publish('d1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000002', 'sebi-unreg-2026-07',
    '{"passed":true,"revisionId":"e1000000-0000-4000-8000-000000000002","policyVersion":"sebi-unreg-2026-07"}'::jsonb)),
  'pass', 'republishing a retracted item goes through the gate');
select results_eq($$
  select visibility, current_revision_id::text, slug from public.items where id = 'd1000000-0000-4000-8000-000000000001'
$$, $$ values ('public'::text, 'e1000000-0000-4000-8000-000000000002'::text, 'retract-me-d10000'::text) $$,
  'it is public again on the new revision and keeps its original slug');
select ok((select published_at < now() - interval '4 days' from public.items
            where id = 'd1000000-0000-4000-8000-000000000001'),
  'republishing keeps the original first-publish date');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$ select title, rev_no from public.public_items $$,
  $$ values ('Retract me, revised'::text, 2) $$, 'public_items shows the edited title on revision 2');
select results_eq($$ select rev_no from public.public_item_revisions order by rev_no $$,
  array[1, 2], 'and both gated revisions are in the public history');

select * from finish();
rollback;
