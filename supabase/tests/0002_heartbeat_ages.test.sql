-- heartbeat_ages(): the only door from anon to the heartbeats table, used by /api/health.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- daily: an old ok row, then a newer failing row. pump: an old failing row, then a newer ok row.
insert into public.heartbeats (job, ran_at, ok, detail) values
  ('heartbeat:daily', now() - interval '5 hours', true,  'older ok'),
  ('heartbeat:daily', now() - interval '2 hours', false, 'secret failure detail'),
  ('heartbeat:pump',  now() - interval '3 hours', false, 'older failure'),
  ('heartbeat:pump',  now() - interval '30 minutes', true, null);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$
  select job, age_seconds::int, ok from public.heartbeat_ages() order by job
$$, $$ values ('heartbeat:daily'::text, 7200, false), ('heartbeat:pump'::text, 1800, true) $$,
  'anon gets one row per job: the latest run, its age in seconds and its outcome');
select is((select pg_typeof(age_seconds)::text from public.heartbeat_ages() limit 1), 'numeric',
  'age_seconds is numeric');
select is((select count(*) from jsonb_object_keys(
            (select to_jsonb(h) from public.heartbeat_ages() h limit 1))), 3::bigint,
  'only job, age_seconds and ok are returned (no detail)');
select throws_ok($$ select * from public.heartbeats $$, '42501', null,
  'anon still cannot read the heartbeats table itself');

reset role;
delete from public.heartbeats;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is_empty($$ select * from public.heartbeat_ages() $$, 'no heartbeats, no rows');

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select * from public.heartbeat_ages() $$, '42501', null,
  'a signed-in session is not granted it (admin reads the table through RLS)');
reset role;
set local role service_role;
select throws_ok($$ select * from public.heartbeat_ages() $$, '42501', null,
  'service_role is not granted it either');

select * from finish();
rollback;
