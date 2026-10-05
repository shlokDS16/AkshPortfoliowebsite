-- The items_guard_publish trigger: publish_revision() is the only way to go public.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test');
insert into public.companies (id, slug, name, visibility)
  values ('cccccccc-0000-4000-8000-000000000001', 'pub-co', 'Pub Co', 'public');
insert into public.themes (id, slug, name, visibility)
  values ('eeeeeeee-0000-4000-8000-000000000001', 'pub-theme', 'Pub Theme', 'public');

-- g2 stays private for the first half; g1 is published through the gate for the second.
insert into public.items (id, kind, title, learning_objective) values
  ('d2000000-0000-4000-8000-000000000002', 'learning', 'Private item', 'Learn.');
insert into public.items (id, kind, title, company_id, theme_id, learning_objective, holds_position, data_as_of) values
  ('d1000000-0000-4000-8000-000000000001', 'learning', 'Public item',
   'cccccccc-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 'Learn.', 'no', current_date - 60);
insert into public.item_revisions (id, item_id, body_md) values
  ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'private v1'),
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'public v1'),
  ('e1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'public v2');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Direct publishing is impossible, even for the admin.
select throws_ok($$ update public.items set visibility = 'public' where id = 'd2000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'admin cannot set visibility = public directly');
select throws_ok($$ update public.items set status = 'published' where id = 'd2000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'admin cannot set status = published directly');
select throws_ok($$ insert into public.items (kind, title, visibility) values ('note', 'x', 'public') $$,
  '42501', null, 'admin cannot insert a public item');
select throws_ok($$ insert into public.items (kind, title, status) values ('note', 'x', 'published') $$,
  '42501', null, 'admin cannot insert a published item');
select throws_ok($$ insert into public.items (kind, title, published_at) values ('note', 'x', now()) $$,
  '42501', null, 'admin cannot insert an item with a published_at');

-- Ordinary editing of non-public items is untouched.
select lives_ok($$ update public.items set title = 'Renamed private item' where id = 'd2000000-0000-4000-8000-000000000002' $$,
  'admin can edit a private item');
select lives_ok($$
  update public.items set current_revision_id = 'e2000000-0000-4000-8000-000000000001'
   where id = 'd2000000-0000-4000-8000-000000000002'
$$, 'admin can point a private item at one of its own revisions');
select lives_ok($$ update public.items set visibility = 'clients' where id = 'd2000000-0000-4000-8000-000000000002' $$,
  'admin can move an item to clients (not public)');
select lives_ok($$ update public.items set visibility = 'private' where id = 'd2000000-0000-4000-8000-000000000002' $$,
  'admin can move it back to private');

-- The session switch cannot be flipped by an API role.
select set_config('app.publish_gate', 'on', true);
select throws_ok($$ update public.items set visibility = 'public' where id = 'd2000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'setting app.publish_gate as the admin role does not open the gate');
select throws_ok($$ insert into public.items (kind, title, visibility) values ('note', 'y', 'public') $$,
  '42501', null, 'nor does it allow inserting a public item');
select set_config('app.publish_gate', 'off', true);

-- Publish g1 through the gate.
select is((select verdict from public.publish_revision('d1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 'pol-1',
    '{"passed":true,"revisionId":"e1000000-0000-4000-8000-000000000001","policyVersion":"pol-1"}'::jsonb)),
  'pass', 'g1 is published through the gate');
select is(current_setting('app.publish_gate', true), 'off', 'the gate is closed again after publish_revision returns');

-- A public item cannot change what it shows except through the gate.
select throws_ok($$ update public.items set current_revision_id = 'e1000000-0000-4000-8000-000000000002'
  where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'advancing a public item outside the gate is blocked');
select throws_ok($$ update public.items set title = 'Buy now' where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'retitling a public item is blocked');
select throws_ok($$ update public.items set slug = 'other-slug' where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'changing the slug of a public item is blocked');
select throws_ok($$ update public.items set kind = 'note' where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'changing the kind of a public item is blocked');
select throws_ok($$ update public.items set company_id = null where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'unlinking the company of a public item is blocked');
select throws_ok($$ update public.items set theme_id = null where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'unlinking the theme of a public item is blocked');
select throws_ok($$ update public.items set learning_objective = 'Other' where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'changing the learning objective of a public item is blocked');
select throws_ok($$ update public.items set data_as_of = current_date - 1 where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'changing data_as_of of a public item is blocked');
select throws_ok($$ update public.items set holds_position = 'yes' where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'changing holds_position of a public item is blocked');
select throws_ok($$ update public.items set status = 'archived' where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'archiving a public item is blocked');
select throws_ok($$ update public.items set published_at = now() - interval '1 day' where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'rewriting published_at of a public item is blocked');
select results_eq($$
  select title, current_revision_id::text, visibility from public.items where id = 'd1000000-0000-4000-8000-000000000001'
$$, $$ values ('Public item'::text, 'e1000000-0000-4000-8000-000000000001'::text, 'public'::text) $$,
  'none of the blocked updates changed the public item');
select lives_ok($$ update public.items set title = title where id = 'd1000000-0000-4000-8000-000000000001' $$,
  'an update that changes nothing on a public item is allowed');

-- Outside the API roles: the owner is held to the same rule unless the gate is open.
reset role;
select throws_ok($$ update public.items set visibility = 'public' where id = 'd2000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'the table owner cannot publish without the gate either');
select set_config('app.publish_gate', 'on', true);
select lives_ok($$ update public.items set visibility = 'public' where id = 'd2000000-0000-4000-8000-000000000002' $$,
  'with the gate open (as publish_revision does, and fixtures may) the owner can');

select * from finish();
rollback;
