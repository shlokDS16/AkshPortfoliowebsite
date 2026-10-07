-- 20261007000005_casefile.sql: permanent file numbers (D8), the figures-to rule for files (D9) and public
-- capture days (D10). Plan 1B, ADR-002. Builds on the 0004 gate (service_role only, p_actor, latest-only).
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- Stand-ins for the compliance server action (ADR-003): they reach the gate functions as the function owner,
-- as the service client does, and pass the signed-in session's user as the verified actor.
create function public.test_publish(p_item uuid, p_rev uuid) returns text
language sql security definer set search_path = ''
as $$ select verdict from public.publish_revision((select auth.uid()), p_item, p_rev, 'sebi-unreg-2026-07',
  jsonb_build_object('passed', true, 'revisionId', p_rev::text, 'policyVersion', 'sebi-unreg-2026-07')) $$;
create function public.test_unpublish(p_item uuid) returns text
language sql security definer set search_path = ''
as $$ select public.unpublish_item((select auth.uid()), p_item) $$;
create function public.test_file_no(p_item uuid) returns integer
language sql security definer set search_path = ''
as $$ select file_no from public.items where id = p_item $$;
grant execute on function public.test_publish(uuid, uuid), public.test_unpublish(uuid),
  public.test_file_no(uuid) to authenticated;

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test');

insert into public.companies (id, slug, name, visibility) values
  ('cccccccc-0000-4000-8000-000000000001', 'kav', 'Kaveri', 'public'),
  ('cccccccc-0000-4000-8000-000000000002', 'sah', 'Sahyadri', 'public');
insert into public.items (id, kind, title, company_id, learning_objective, holds_position, data_as_of) values
  ('a1000000-0000-4000-8000-000000000001', 'thesis', 'Kaveri file', 'cccccccc-0000-4000-8000-000000000001', 'Learn A.', 'no',
   (now() at time zone 'Asia/Kolkata')::date - 3),
  ('a2000000-0000-4000-8000-000000000002', 'thesis', 'Sahyadri file', 'cccccccc-0000-4000-8000-000000000002', 'Learn B.', 'no',
   (now() at time zone 'Asia/Kolkata')::date - 3),
  ('a3000000-0000-4000-8000-000000000003', 'thesis', 'Undated file', 'cccccccc-0000-4000-8000-000000000001', 'Learn C.', 'no', null),
  ('a4000000-0000-4000-8000-000000000004', 'learning', 'A note', null, 'Learn D.', null, null),
  ('a5000000-0000-4000-8000-000000000005', 'case_study', 'An old case', null, 'Learn E.', null,
   (now() at time zone 'Asia/Kolkata')::date - 40),
  ('a6a6a6a6-0000-4000-8000-000000000006', 'learning', 'Dup', null, 'Learn F.', null, null),
  ('a6a6a6a6-0000-4000-8000-000000000007', 'learning', 'Dup', null, 'Learn G.', null, null);
insert into public.item_revisions (id, item_id, body_md) values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'R1'),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'R2'),
  ('b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'R1'),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'R1'),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', 'R1'),
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005', 'R1'),
  ('b6000000-0000-4000-8000-000000000006', 'a6a6a6a6-0000-4000-8000-000000000006', 'R1'),
  ('b6000000-0000-4000-8000-000000000007', 'a6a6a6a6-0000-4000-8000-000000000007', 'R1');
insert into public.captures (raw_text, created_at) values
  ('today one', now()), ('today two', now()),
  ('five days ago', now() - interval '5 days'), ('forty days ago', now() - interval '40 days'),
  ('fifty-nine days ago', now() - interval '59 days'), ('seventy days ago', now() - interval '70 days');

-- Structure.
select has_column('public', 'items', 'file_no', 'items has a file_no column');
select ok(has_column_privilege('anon', 'public.items', 'file_no', 'select'),
  'anon may read file_no (public_items needs it)');
select ok(has_function_privilege('anon', 'public.capture_days(integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.capture_days(integer)', 'execute')
      and not has_function_privilege('service_role', 'public.capture_days(integer)', 'execute'),
  'capture_days is granted to anon only');
select is_definer('public', 'capture_days', array['integer'], 'capture_days is SECURITY DEFINER');
select is_definer('public', 'publish_revision', array['uuid', 'uuid', 'uuid', 'text', 'jsonb'],
  'publish_revision is still SECURITY DEFINER');
select ok((select 'search_path=""' = any (p.proconfig) from pg_proc p
            where p.oid = 'public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure)
      and (select 'search_path=""' = any (p.proconfig) from pg_proc p
            where p.oid = 'public.capture_days(integer)'::regprocedure),
  'both functions pin search_path to the empty path');
select ok(has_function_privilege('service_role', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('public', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute'),
  'publish_revision keeps the 0004 confinement: service_role only');
select ok(not exists (select 1 from pg_proc p where p.oid = 'private.is_lagged(date)'::regprocedure
                         and p.prosrc not like '%Asia/Kolkata%'),
  'the 0004 IST lag helper is untouched by this migration');

-- Nobody sets a file number from a session: not on insert, not on update, private or public row.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ insert into public.items (kind, title, file_no) values ('thesis', 'Forged', 7) $$,
  '42501', 'items: file_no is assigned only by publish_revision()', 'a file number cannot be inserted directly');
select throws_ok($$ update public.items set file_no = 99 where id = 'a3000000-0000-4000-8000-000000000003' $$,
  '42501', 'items: file_no is assigned only by publish_revision()', 'the admin cannot set a file number on a private item');

-- The figures-to rule (D9).
select is(public.test_publish('a3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000001'),
  'fail', 'a thesis without a figures-to date fails');
select is((select reasons -> 'failures' from public.gate_decisions where revision_id = 'b3000000-0000-4000-8000-000000000001'),
  '[{"rule":"3","message":"A file needs a figures-to date (data_as_of)."}]'::jsonb,
  'and records exactly the rule 3 figures-to failure');
select is(public.test_file_no('a3000000-0000-4000-8000-000000000003'), null::integer, 'a failed publish takes no number');

-- Numbers: assigned on the first pass, in order, never changed (D8).
select is(public.test_publish('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002'),
  'pass', 'a dated thesis (latest revision) passes with data newer than 30 days');
select ok(public.test_file_no('a1000000-0000-4000-8000-000000000001') between 1 and 999,
  'the first pass assigns a file number');
select is(public.test_publish('a2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001'),
  'pass', 'a second thesis passes');
select is(public.test_file_no('a2000000-0000-4000-8000-000000000002') - public.test_file_no('a1000000-0000-4000-8000-000000000001'),
  1, 'the next file takes the next number');
select is(public.test_publish('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001'),
  'fail', 'the older revision of a numbered file fails (0004 latest-only kept)');
select is((select reasons -> 'failures' -> 0 ->> 'rule' from public.gate_decisions
            where revision_id = 'b1000000-0000-4000-8000-000000000001'), 'revision', 'with rule revision');
insert into public.item_revisions (id, item_id, body_md)
  values ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'R3');
select is(public.test_publish('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000003'),
  'pass', 'a newer revision of the file passes');
select is(public.test_file_no('a2000000-0000-4000-8000-000000000002') - public.test_file_no('a1000000-0000-4000-8000-000000000001'),
  1, 'a revision keeps the file number');
select lives_ok($$ select public.test_unpublish('a1000000-0000-4000-8000-000000000001') $$, 'unpublish the first file');
select is(public.test_publish('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000003'),
  'pass', 'republishing passes');
select is(public.test_file_no('a2000000-0000-4000-8000-000000000002') - public.test_file_no('a1000000-0000-4000-8000-000000000001'),
  1, 'unpublish and republish keep the number: never reassigned, never reused');
select throws_ok($$ update public.items set file_no = 99 where id = 'a1000000-0000-4000-8000-000000000001' $$,
  '42501', 'items: file_no is assigned only by publish_revision()', 'the admin cannot set a file number on a public item');
select is(public.test_publish('a4000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000001'),
  'pass', 'a learning note passes without a figures-to date');
select is(public.test_file_no('a4000000-0000-4000-8000-000000000004'), null::integer, 'notes get no file number');
select is(public.test_publish('a5000000-0000-4000-8000-000000000005', 'b5000000-0000-4000-8000-000000000001'),
  'pass', 'a lagged case study passes');
select is(public.test_file_no('a5000000-0000-4000-8000-000000000005') - public.test_file_no('a2000000-0000-4000-8000-000000000002'),
  1, 'a case study takes the next file number');

-- The slug failure of 0004 is kept: two items whose ids share six characters clash on first publish.
select is(public.test_publish('a6a6a6a6-0000-4000-8000-000000000006', 'b6000000-0000-4000-8000-000000000006'),
  'pass', 'the first "Dup" passes');
select is(public.test_publish('a6a6a6a6-0000-4000-8000-000000000007', 'b6000000-0000-4000-8000-000000000007'),
  'fail', 'the second "Dup" fails on the slug clash');
select is((select reasons -> 'failures' -> 0 ->> 'rule' from public.gate_decisions
            where revision_id = 'b6000000-0000-4000-8000-000000000007'), 'slug', 'and the failure names rule slug');

-- Public side.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok((select file_no from public.public_items where id = 'a5000000-0000-4000-8000-000000000005') is not null,
  'public_items exposes file_no (for a file whose data is past the 30-day lag)');
select is((select count(*) from public.public_items where id = 'a1000000-0000-4000-8000-000000000001'), 0::bigint,
  'a numbered thesis still inside the 30-day lag is absent from public_items');
select is((select count(*) from public.items where id = 'a1000000-0000-4000-8000-000000000001'), 0::bigint,
  'and absent from items for anon (the public read policy re-checks the lag)');
select results_eq($$ select day from public.capture_days(30) order by day $$,
  $$ values ((now() at time zone 'Asia/Kolkata')::date - 5), ((now() at time zone 'Asia/Kolkata')::date) $$,
  'capture_days(30) returns the distinct IST dates inside the window and nothing else (D10)');
select results_eq($$ select day from public.capture_days(1000) order by day $$,
  $$ values ((now() at time zone 'Asia/Kolkata')::date - 59), ((now() at time zone 'Asia/Kolkata')::date - 40),
            ((now() at time zone 'Asia/Kolkata')::date - 5), ((now() at time zone 'Asia/Kolkata')::date) $$,
  'capture_days is capped at 60 days: the capture 70 days back is absent');
select results_eq($$ select day from public.capture_days(0) $$,
  $$ values ((now() at time zone 'Asia/Kolkata')::date) $$, 'a non-positive window still returns today only');

select * from finish();
rollback;
