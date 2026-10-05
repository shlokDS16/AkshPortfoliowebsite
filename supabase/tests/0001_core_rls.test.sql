-- Identity, row level security and what anon / a non-admin user can see.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- Fixtures, created as the migration owner (RLS does not apply to the owner).
insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'stranger@pgtap.test');

insert into public.companies (id, slug, name, one_liner, needs_review) values
  ('cccccccc-0000-4000-8000-00000000000a', 'visible-co', 'Visible Co', 'public one-liner', true),
  ('cccccccc-0000-4000-8000-00000000000b', 'hidden-co', 'Hidden Co', 'private one-liner', false);
insert into public.themes (id, slug, name) values
  ('eeeeeeee-0000-4000-8000-00000000000a', 'visible-theme', 'Visible Theme'),
  ('eeeeeeee-0000-4000-8000-00000000000b', 'hidden-theme', 'Hidden Theme');

-- 1 private draft, 2 public+published but inside the 30-day lag, 3 public+published
-- and old enough, 4 public+published with no data date, 5 public draft, 6 clients-only.
insert into public.items (id, kind, title, visibility, status, data_as_of, company_id, theme_id) values
  ('dddddddd-0000-4000-8000-000000000001', 'note', 'Private draft', 'private', 'draft', null,
     'cccccccc-0000-4000-8000-00000000000b', 'eeeeeeee-0000-4000-8000-00000000000b'),
  ('dddddddd-0000-4000-8000-000000000002', 'note', 'Too recent', 'public', 'published', current_date,
     null, null),
  ('dddddddd-0000-4000-8000-000000000003', 'thesis', 'Old enough', 'public', 'published', current_date - 40,
     'cccccccc-0000-4000-8000-00000000000a', 'eeeeeeee-0000-4000-8000-00000000000a'),
  ('dddddddd-0000-4000-8000-000000000004', 'learning', 'Undated', 'public', 'published', null,
     null, null),
  ('dddddddd-0000-4000-8000-000000000005', 'note', 'Public draft', 'public', 'draft', current_date - 40,
     null, null),
  ('dddddddd-0000-4000-8000-000000000006', 'note', 'Clients only', 'clients', 'published', current_date - 40,
     null, null);

-- Two revisions of the visible item; only the first has passed the gate.
insert into public.item_revisions (id, item_id, body_md) values
  ('99999999-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000003', 'passed'),
  ('99999999-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000003', 'not gated');
insert into public.gate_decisions (item_id, revision_id, policy_version, verdict) values
  ('dddddddd-0000-4000-8000-000000000003', '99999999-0000-4000-8000-000000000001', 'test', 'pass'),
  ('dddddddd-0000-4000-8000-000000000003', '99999999-0000-4000-8000-000000000002', 'test', 'fail');
insert into public.captures (raw_text) values ('fixture capture');
insert into public.heartbeats (job, ok) values ('fixture', true);

select is((select role from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'admin', 'the admin_email user gets role admin');
select is((select role from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  'client', 'any other user gets role client');
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint, 'RLS is enabled on every table in public');

-- The 30-day rule is written once.
select is(private.is_lagged(null), true, 'is_lagged: no data date is not lagged out');
select is(private.is_lagged(current_date - 30), true, 'is_lagged: exactly 30 days old passes');
select is(private.is_lagged(current_date - 29), false, 'is_lagged: 29 days old is held back');

-- The admin works through RLS.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$
  insert into public.items (id, kind, title)
  values ('dddddddd-0000-4000-8000-0000000000f1', 'note', 'Admin note')
$$, 'admin can create an item');
select is((select count(*) from public.items), 7::bigint, 'admin sees every item, drafts and private included');
select is((select count(*) from public.captures), 1::bigint, 'admin reads captures');
select is((select count(*) from public.gate_decisions), 2::bigint, 'admin reads gate decisions');
select is((select count(*) from public.heartbeats), 1::bigint, 'admin reads heartbeats');
select is((select count(*) from public.profiles), 2::bigint, 'admin reads profiles');

-- A signed-in non-admin sees and writes nothing, even rows anon can see.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is_empty($$ select id from public.items $$, 'non-admin reads no items');
select is_empty($$ select id from public.item_revisions $$, 'non-admin reads no revisions');
select is_empty($$ select id from public.companies $$, 'non-admin reads no companies');
select is_empty($$ select id from public.themes $$, 'non-admin reads no themes');
select is_empty($$ select id from public.captures $$, 'non-admin reads no captures');
select is_empty($$ select id from public.profiles $$, 'non-admin reads no profiles');
select throws_ok($$ insert into public.items (kind, title) values ('note', 'sneaky') $$,
  '42501', null, 'non-admin cannot create items');
select throws_ok($$
  update public.profiles set role = 'admin' where id = 'bbbbbbbb-0000-4000-8000-000000000002'
$$, '42501', null, 'non-admin cannot promote itself');

-- Anonymous visitors see only public + published + past the 30-day lag.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$ select id from public.items order by id $$,
  $$ values ('dddddddd-0000-4000-8000-000000000003'::uuid), ('dddddddd-0000-4000-8000-000000000004'::uuid) $$,
  'anon reads only public, published, lagged items');
select is_empty($$ select id from public.items where id = 'dddddddd-0000-4000-8000-000000000002' $$,
  'anon cannot read a public item still inside the 30-day lag');
select results_eq($$ select id from public.item_revisions $$,
  $$ values ('99999999-0000-4000-8000-000000000001'::uuid) $$,
  'anon reads only the revision that passed the gate');
select results_eq($$ select slug from public.companies $$,
  $$ values ('visible-co'::text) $$, 'anon reads only companies with a public lagged item');
select results_eq($$ select slug from public.themes $$,
  $$ values ('visible-theme'::text) $$, 'anon reads only themes with a public lagged item');
select lives_ok($$ select one_liner from public.companies $$,
  'anon can read the granted company columns');
select throws_ok($$ select needs_review from public.companies $$, '42501', null,
  'anon cannot read a column outside the public grant');
select throws_ok($$ select * from public.captures $$, '42501', null, 'anon cannot read captures');
select throws_ok($$ select * from public.gate_decisions $$, '42501', null, 'anon cannot read gate decisions');
select throws_ok($$ select * from public.heartbeats $$, '42501', null, 'anon cannot read heartbeats');
select throws_ok($$ insert into public.items (kind, title) values ('note', 'x') $$,
  '42501', null, 'anon cannot write items');

-- Changing the setting re-derives every role (owner context).
reset role;
update private.settings set value = 'stranger@pgtap.test' where key = 'admin_email';
select is((select role from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  'admin', 'changing admin_email promotes the new address');
select is((select role from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'client', 'changing admin_email demotes the old address');

select * from finish();
rollback;
