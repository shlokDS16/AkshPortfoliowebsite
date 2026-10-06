-- 20261007000004_hardening.sql, I2: the 30-day lag is counted in India time (Asia/Kolkata), whatever
-- session timezone a caller sets (PostgREST honours `Prefer: timezone=...` for anon). Kiritimati (UTC+14) and
-- Etc/GMT+12 (UTC-12) between them disagree with the IST date at every hour of the day, so reverting to
-- current_date fails at least one of the two blocks below whenever the suite runs.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test');

-- The IST calendar date, computed without the zone database: UTC wall clock plus 5 h 30 min.
create function public.test_ist_today() returns date language sql stable
as $$ select ((now() at time zone 'UTC') + interval '5 hours 30 minutes')::date $$;
create function public.test_ids() returns text language sql stable
as $$ select coalesce((select string_agg(title, ',' order by title) from public.items where kind = 'note'), '') || '|' ||
             coalesce((select string_agg(title, ',' order by title) from public.public_items where kind = 'note'), '') $$;
grant execute on function public.test_ist_today(), public.test_ids() to anon, service_role;

-- l30: public, data exactly 30 IST days old (visible). l29: 29 days old (held back).
select set_config('app.publish_gate', 'on', true);
insert into public.items (id, kind, title, visibility, status, data_as_of) values
  ('d1000000-0000-4000-8000-000000000001', 'note', 'l30', 'public', 'published', public.test_ist_today() - 30),
  ('d2000000-0000-4000-8000-000000000002', 'note', 'l29', 'public', 'published', public.test_ist_today() - 29);
insert into public.item_revisions (id, item_id, body_md) values
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'v1'),
  ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'v1');
update public.items set current_revision_id = 'e1000000-0000-4000-8000-000000000001'
 where id = 'd1000000-0000-4000-8000-000000000001';
update public.items set current_revision_id = 'e2000000-0000-4000-8000-000000000001'
 where id = 'd2000000-0000-4000-8000-000000000002';
select set_config('app.publish_gate', 'off', true);
insert into public.gate_decisions (item_id, revision_id, policy_version, verdict) values
  ('d1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07', 'pass'),
  ('d2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07', 'pass');
-- Case studies for the gate's own rule 3 check.
insert into public.items (id, kind, title, learning_objective, data_as_of) values
  ('d3000000-0000-4000-8000-000000000003', 'case_study', 'Case thirty', 'Learn.', public.test_ist_today() - 30),
  ('d4000000-0000-4000-8000-000000000004', 'case_study', 'Case twenty-nine', 'Learn.', public.test_ist_today() - 29);
insert into public.item_revisions (id, item_id, body_md) values
  ('e3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003', 'case'),
  ('e4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000004', 'case');

create function public.test_case_verdict(p_item uuid, p_rev uuid) returns text language sql
as $$ select verdict from public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001', p_item, p_rev,
       'sebi-unreg-2026-07', jsonb_build_object('passed', true, 'revisionId', p_rev::text,
       'policyVersion', 'sebi-unreg-2026-07')) $$;
grant execute on function public.test_case_verdict(uuid, uuid) to service_role;

-- The definitions no longer read the session date.
select ok((select prosrc not like '%current_date%' and prosrc like '%Asia/Kolkata%' from pg_proc
            where oid = 'private.is_lagged(date)'::regprocedure), 'is_lagged counts the lag in IST, not current_date');
select ok((select prosrc not like '%current_date%' and prosrc like '%Asia/Kolkata%' from pg_proc
            where oid = 'public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure),
  'publish_revision counts the case-study lag in IST, not current_date');
select is((select p.provolatile::text from pg_proc p where p.oid = 'private.is_lagged(date)'::regprocedure),
  's', 'is_lagged stays STABLE');

-- Kiritimati, UTC+14: the session date is often a day ahead of India.
select set_config('timezone', 'Pacific/Kiritimati', true);
select is(private.is_lagged(public.test_ist_today() - 30), true, 'UTC+14: exactly 30 IST days is past the lag');
select is(private.is_lagged(public.test_ist_today() - 29), false, 'UTC+14: 29 IST days is held back');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('timezone', 'Pacific/Kiritimati', true);
select is(public.test_ids(), 'l30|l30', 'UTC+14: anon sees the 30-day item, not the 29-day one (table and view)');
reset role;
set local role service_role;
select set_config('timezone', 'Pacific/Kiritimati', true);
select is(public.test_case_verdict('d3000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000001'),
  'pass', 'UTC+14: the gate passes a case study exactly 30 IST days old');
select is(public.test_case_verdict('d4000000-0000-4000-8000-000000000004', 'e4000000-0000-4000-8000-000000000001'),
  'fail', 'UTC+14: the gate fails a case study 29 IST days old');
reset role;

-- Etc/GMT+12, UTC-12: the session date is often a day behind India.
select set_config('timezone', 'Etc/GMT+12', true);
select is(private.is_lagged(public.test_ist_today() - 30), true, 'UTC-12: exactly 30 IST days is past the lag');
select is(private.is_lagged(public.test_ist_today() - 29), false, 'UTC-12: 29 IST days is held back');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('timezone', 'Etc/GMT+12', true);
select is(public.test_ids(), 'l30|l30', 'UTC-12: anon sees the 30-day item, not the 29-day one (table and view)');
reset role;
set local role service_role;
select set_config('timezone', 'Etc/GMT+12', true);
select is(public.test_case_verdict('d3000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000001'),
  'pass', 'UTC-12: the gate passes a case study exactly 30 IST days old');
select is(public.test_case_verdict('d4000000-0000-4000-8000-000000000004', 'e4000000-0000-4000-8000-000000000001'),
  'fail', 'UTC-12: the gate fails a case study 29 IST days old');
reset role;

-- Etc/GMT-14 (the review's probe) and UTC: same answers.
select set_config('timezone', 'Etc/GMT-14', true);
select is(private.is_lagged(public.test_ist_today() - 30), true, 'UTC+14 (Etc/GMT-14): 30 IST days is past the lag');
select is(private.is_lagged(public.test_ist_today() - 29), false, 'UTC+14 (Etc/GMT-14): 29 IST days is held back');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('timezone', 'Etc/GMT-14', true);
select is(public.test_ids(), 'l30|l30', 'Etc/GMT-14: anon sees the same rows');
reset role;
select set_config('timezone', 'UTC', true);
select is(private.is_lagged(public.test_ist_today() - 30), true, 'UTC: 30 IST days is past the lag');
select is(private.is_lagged(public.test_ist_today() - 29), false, 'UTC: 29 IST days is held back');
select is(private.is_lagged(public.test_ist_today() - 31), true, 'UTC: 31 IST days is past the lag');
select is(private.is_lagged(null), true, 'no data date is not held back (unchanged)');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('timezone', 'UTC', true);
select is(public.test_ids(), 'l30|l30', 'UTC: anon sees the same rows');
reset role;

-- The two dates the review measured: whichever zone is set, the boundary date is the IST date minus 30.
select set_config('timezone', 'Pacific/Kiritimati', true);
select is((select max(d) from generate_series(public.test_ist_today() - 40, public.test_ist_today(), interval '1 day') g(t),
             lateral (select t::date as d) x where private.is_lagged(d)),
  public.test_ist_today() - 30, 'UTC+14: the newest lagged date is the IST date minus 30');
select set_config('timezone', 'Etc/GMT+12', true);
select is((select max(d) from generate_series(public.test_ist_today() - 40, public.test_ist_today(), interval '1 day') g(t),
             lateral (select t::date as d) x where private.is_lagged(d)),
  public.test_ist_today() - 30, 'UTC-12: the newest lagged date is the IST date minus 30');
select set_config('timezone', 'Asia/Kolkata', true);
select is((select max(d) from generate_series(public.test_ist_today() - 40, public.test_ist_today(), interval '1 day') g(t),
             lateral (select t::date as d) x where private.is_lagged(d)),
  public.test_ist_today() - 30, 'IST: the newest lagged date is the IST date minus 30');
select is(private.is_public_item('public', 'published', public.test_ist_today() - 29), false,
  'is_public_item follows the IST lag');
select is(private.is_public_item('public', 'published', public.test_ist_today() - 30), true,
  'is_public_item admits the IST boundary date');

select * from finish();
rollback;
