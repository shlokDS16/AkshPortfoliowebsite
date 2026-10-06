-- A company or theme cannot leave 'public' while a public item still links to it.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test');

-- co-1 / th-1 are used by a public item; co-2 / th-2 only by a private item; co-3 by nothing.
insert into public.companies (id, slug, name, visibility) values
  ('cccccccc-0000-4000-8000-000000000001', 'co-1', 'Co 1', 'public'),
  ('cccccccc-0000-4000-8000-000000000002', 'co-2', 'Co 2', 'public'),
  ('cccccccc-0000-4000-8000-000000000003', 'co-3', 'Co 3', 'private');
insert into public.themes (id, slug, name, visibility) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'th-1', 'Theme 1', 'public'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'th-2', 'Theme 2', 'public');
insert into public.items (id, kind, title, company_id, theme_id, learning_objective, holds_position) values
  ('d1000000-0000-4000-8000-000000000001', 'learning', 'Public item', 'cccccccc-0000-4000-8000-000000000001',
   'eeeeeeee-0000-4000-8000-000000000001', 'Learn.', 'no'),
  ('d2000000-0000-4000-8000-000000000002', 'learning', 'Private item', 'cccccccc-0000-4000-8000-000000000002',
   'eeeeeeee-0000-4000-8000-000000000002', 'Learn.', 'no');
insert into public.item_revisions (id, item_id, body_md) values
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'v1');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select verdict from public.publish_revision('d1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 'pol-1',
    '{"passed":true,"revisionId":"e1000000-0000-4000-8000-000000000001","policyVersion":"pol-1"}'::jsonb)),
  'pass', 'precondition: the first item is public');

-- Rejected while a public item uses it.
select throws_ok($$ update public.companies set visibility = 'private' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514', null, 'a company used by a public item cannot go private');
select throws_ok($$ update public.companies set visibility = 'clients' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514', null, 'nor to clients');
select throws_ok($$ update public.themes set visibility = 'private' where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  '23514', null, 'a theme used by a public item cannot go private');
select results_eq($$ select visibility from public.companies where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  array['public'], 'the rejected update changed nothing');

-- Allowed paths.
select lives_ok($$ update public.companies set name = 'Co 1 renamed' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'other columns of a used company can change');
select lives_ok($$ update public.companies set visibility = 'private' where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'a company used only by a private item can go private');
select lives_ok($$ update public.themes set visibility = 'private' where id = 'eeeeeeee-0000-4000-8000-000000000002' $$,
  'a theme used only by a private item can go private');
select lives_ok($$ update public.companies set visibility = 'public' where id = 'cccccccc-0000-4000-8000-000000000003' $$,
  'a private company can be made public');

-- After unpublishing, the way is open.
select is(public.unpublish_item('d1000000-0000-4000-8000-000000000001'), 'public-item-d10000',
  'the public item is unpublished');
select lives_ok($$ update public.companies set visibility = 'private' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'the company can go private once the item is unpublished');
select lives_ok($$ update public.themes set visibility = 'private' where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  'and so can the theme');

select * from finish();
rollback;
