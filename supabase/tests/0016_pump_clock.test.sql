-- 20261014000016_pump_clock.sql: the database-driven 15-minute pump clock (docs/specs/2026-10-14-db-pump-clock.md).
-- register_clock_target stores the site origin; private.pump_tick (run by pg_cron) mints a ticket and queues one pg_net
-- request; redeem_pump_ticket accepts a ticket once, within two minutes.
-- The tests run as the database owner in ONE transaction, so now() does not move: age is tested by moving created_at back.
-- They count rows in net.http_request_queue and never wait for the HTTP call (nothing is sent: the transaction rolls back).
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(83);

-- 1. Extensions, tables, functions.
select ok(exists (select 1 from pg_extension where extname = 'pg_cron'), 'pg_cron is enabled');
select ok(exists (select 1 from pg_extension where extname = 'pg_net'), 'pg_net is enabled');
select has_table('private', 'clock_target', 'private.clock_target exists');
select has_table('private', 'pump_tickets', 'private.pump_tickets exists');
select ok((select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('private.clock_target'::regclass, 'private.pump_tickets'::regclass)), 'RLS is on for both tables');
select is_empty($$ select polname from pg_policy where polrelid in ('private.clock_target'::regclass, 'private.pump_tickets'::regclass) $$, 'neither table has a policy');
select is_empty($$
  select t.t, r.r from (values ('private.clock_target'), ('private.pump_tickets')) t(t), unnest(array['anon', 'authenticated', 'service_role', 'public']) r(r)
   where has_table_privilege(case when r.r = 'public' then 'anon' else r.r end, t.t, 'select,insert,update,delete,truncate,references,trigger')
      or has_any_column_privilege(case when r.r = 'public' then 'anon' else r.r end, t.t, 'select,insert,update,references')
$$, 'no API role holds a privilege on either table');
select has_function('public', 'register_clock_target', array['text'], 'register_clock_target(text) exists');
select has_function('public', 'redeem_pump_ticket', array['uuid'], 'redeem_pump_ticket(uuid) exists');
select has_function('private', 'pump_tick', array[]::name[], 'private.pump_tick() exists');
select is_definer('public', 'register_clock_target', array['text'], 'register_clock_target is SECURITY DEFINER');
select is_definer('public', 'redeem_pump_ticket', array['uuid'], 'redeem_pump_ticket is SECURITY DEFINER');
select is_definer('private', 'pump_tick', array[]::name[], 'pump_tick is SECURITY DEFINER');
select is((select count(*)::integer from pg_proc p
            where p.oid in ('public.register_clock_target(text)'::regprocedure, 'public.redeem_pump_ticket(uuid)'::regprocedure, 'private.pump_tick()'::regprocedure)
              and 'search_path=""' = any (coalesce(p.proconfig, '{}'::text[]))), 3, 'all three pin an empty search_path');

-- 2. Grants.
select ok(has_function_privilege('service_role', 'public.register_clock_target(text)', 'execute')
      and has_function_privilege('service_role', 'public.redeem_pump_ticket(uuid)', 'execute'), 'service_role can execute both public functions');
select ok(not has_function_privilege('anon', 'public.register_clock_target(text)', 'execute')
      and not has_function_privilege('anon', 'public.redeem_pump_ticket(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.register_clock_target(text)', 'execute')
      and not has_function_privilege('authenticated', 'public.redeem_pump_ticket(uuid)', 'execute'), 'anon and authenticated cannot execute either');
select ok(not has_function_privilege('anon', 'private.pump_tick()', 'execute')
      and not has_function_privilege('authenticated', 'private.pump_tick()', 'execute')
      and not has_function_privilege('service_role', 'private.pump_tick()', 'execute'), 'no API role can execute pump_tick');
select is_empty($$
  select p.proname from pg_proc p
   where p.oid in ('public.register_clock_target(text)'::regprocedure, 'public.redeem_pump_ticket(uuid)'::regprocedure, 'private.pump_tick()'::regprocedure)
     and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
$$, 'none carries a PUBLIC execute grant');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
     and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
         not in ('heartbeat_ages()', 'capture_days(p_days integer)', 'queue_age()', 'public_fact_checks()')
$$, 'anon can execute exactly queue_age, heartbeat_ages, capture_days and public_fact_checks');

-- 3. The cron job exists once with the right schedule and command.
select is((select count(*)::integer from cron.job where jobname = 'desk-pump'), 1, 'exactly one cron job named desk-pump');
select is((select schedule from cron.job where jobname = 'desk-pump'), '4,19,34,49 * * * *', 'it runs at minutes 4, 19, 34, 49');
select is((select command from cron.job where jobname = 'desk-pump'), 'select private.pump_tick()', 'it runs private.pump_tick()');
-- The migration's schedule block is idempotent: running it again leaves one job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'desk-pump') then perform cron.unschedule('desk-pump'); end if;
end;
$$;
select lives_ok($$ select cron.schedule('desk-pump', '4,19,34,49 * * * *', 'select private.pump_tick()') $$, 'scheduling again works');
select is((select count(*)::integer from cron.job where jobname = 'desk-pump'), 1, 'still exactly one desk-pump job');

-- 4. tick with no target: nothing happens.
delete from private.clock_target;
delete from private.pump_tickets;
create temp table queue_before as select count(*)::integer as n from net.http_request_queue;
select lives_ok($$ select private.pump_tick() $$, 'pump_tick without a target runs');
select is((select count(*)::integer from private.pump_tickets), 0, 'no ticket without a target');
select is((select count(*)::integer from net.http_request_queue), (select n from queue_before), 'no request is queued without a target');

-- 5. register_clock_target: rejections.
select throws_ok($$ select public.register_clock_target(null) $$, '22023', null, 'null is rejected');
select throws_ok($$ select public.register_clock_target('') $$, '22023', null, 'empty is rejected');
select throws_ok($$ select public.register_clock_target('http://desk.example.com') $$, '22023', null, 'plain http on a real host is rejected');
select throws_ok($$ select public.register_clock_target('https://desk.example.com/') $$, '22023', null, 'a trailing slash is rejected');
select throws_ok($$ select public.register_clock_target('https://desk.example.com/api') $$, '22023', null, 'a path is rejected');
select throws_ok($$ select public.register_clock_target('https://desk.example.com?x=1') $$, '22023', null, 'a query is rejected');
select throws_ok($$ select public.register_clock_target('https://desk.example.com#frag') $$, '22023', null, 'a fragment is rejected');
select throws_ok($$ select public.register_clock_target('https://user@desk.example.com') $$, '22023', null, 'userinfo is rejected');
select throws_ok($$ select public.register_clock_target('https://user:pw@desk.example.com') $$, '22023', null, 'userinfo with a password is rejected');
select throws_ok($$ select public.register_clock_target('https://desk.example.com@evil.example.org') $$, '22023', null, 'an @ trick is rejected');
select throws_ok($$ select public.register_clock_target('https://localhost') $$, '22023', null, 'a dotless https host is rejected');
select throws_ok($$ select public.register_clock_target('https://10.0.0.1') $$, '22023', null, 'an IP address is rejected');
select throws_ok($$ select public.register_clock_target('https://169.254.169.254:80') $$, '22023', null, 'an IP address with a port is rejected');
select throws_ok($$ select public.register_clock_target('https://DESK.example.com') $$, '22023', null, 'upper case is rejected (send the lower-cased origin)');
select throws_ok($$ select public.register_clock_target('https://desk example.com') $$, '22023', null, 'a space is rejected');
select throws_ok($$ select public.register_clock_target('ftp://desk.example.com') $$, '22023', null, 'another scheme is rejected');
select throws_ok($$ select public.register_clock_target('http://localhost') $$, '22023', null, 'http localhost without a port is rejected');
select throws_ok($$ select public.register_clock_target('http://localhost:3100/x') $$, '22023', null, 'http localhost with a path is rejected');
select throws_ok($$ select public.register_clock_target('http://evil.example.com:3100') $$, '22023', null, 'http on another host is rejected');
select throws_ok($$ select public.register_clock_target('http://localhost.evil.com:3100') $$, '22023', null, 'a localhost look-alike is rejected');
select is((select count(*)::integer from private.clock_target), 0, 'nothing was stored by the rejected calls');

-- 6. register_clock_target: accepted, and a write only when it changed.
select is(public.register_clock_target('https://desk.example.com'), true, 'a plain https origin is stored (returns true)');
select is((select url from private.clock_target), 'https://desk.example.com', 'the row holds it');
update private.clock_target set updated_at = '2026-01-01 00:00+00';
select is(public.register_clock_target('https://desk.example.com'), false, 'the same address again writes nothing (returns false)');
select is((select updated_at from private.clock_target), '2026-01-01 00:00+00'::timestamptz, 'updated_at did not move');
select is(public.register_clock_target('http://127.0.0.1:3100'), true, 'http://127.0.0.1:<port> is accepted for local development');
select is((select updated_at > '2026-01-01 00:00+00' from private.clock_target), true, 'a changed address moves updated_at');
select is(public.register_clock_target('http://localhost:3100'), true, 'http://localhost:<port> is accepted');
select is(public.register_clock_target('https://aksh-desk.vercel.app'), true, 'a changed address replaces the row');
select is((select count(*)::integer from private.clock_target), 1, 'still a single row');

-- 7. tick with a target: one ticket, one queued request with the ticket in a header.
select lives_ok($$ select private.pump_tick() $$, 'pump_tick with a target runs');
select is((select count(*)::integer from private.pump_tickets), 1, 'one ticket was inserted');
select is((select count(*)::integer from net.http_request_queue) - (select n from queue_before), 1, 'one request was queued');
select is((select url from net.http_request_queue order by id desc limit 1), 'https://aksh-desk.vercel.app/api/jobs/tick', 'it targets <site>/api/jobs/tick');
select is((select (headers::jsonb) ->> 'x-pump-ticket' from net.http_request_queue order by id desc limit 1), (select token::text from private.pump_tickets), 'it carries the ticket in x-pump-ticket');
select is((select timeout_milliseconds from net.http_request_queue order by id desc limit 1), 10000, 'its timeout is 10 seconds');
select is((select used_at from private.pump_tickets), null, 'the ticket is not used yet');

-- 8. tick prunes tickets older than a day, and keeps newer ones.
insert into private.pump_tickets (created_at) values (now() - interval '25 hours'), (now() - interval '23 hours');
select lives_ok($$ select private.pump_tick() $$, 'a second tick runs');
select is((select count(*)::integer from private.pump_tickets where created_at < now() - interval '1 day'), 0, 'tickets older than a day are gone');
select is((select count(*)::integer from private.pump_tickets), 3, 'the recent ones stay (the first, the 23-hour one, the new one)');

-- 9. redeem: true once, false on reuse, false when old, false for unknown or null.
delete from private.pump_tickets;
insert into private.pump_tickets (token) values ('11111111-1111-4111-8111-111111111111');
select is(public.redeem_pump_ticket('11111111-1111-4111-8111-111111111111'), true, 'a fresh ticket redeems');
select isnt((select used_at from private.pump_tickets where token = '11111111-1111-4111-8111-111111111111'), null, 'and is marked used');
select is(public.redeem_pump_ticket('11111111-1111-4111-8111-111111111111'), false, 'a second redeem of the same ticket is false');
insert into private.pump_tickets (token, created_at) values ('22222222-2222-4222-8222-222222222222', now() - interval '2 minutes 1 second');
select is(public.redeem_pump_ticket('22222222-2222-4222-8222-222222222222'), false, 'a ticket older than 2 minutes is false');
select is((select used_at from private.pump_tickets where token = '22222222-2222-4222-8222-222222222222'), null, 'and is left unused');
insert into private.pump_tickets (token, created_at) values ('33333333-3333-4333-8333-333333333333', now() - interval '1 minute 59 seconds');
select is(public.redeem_pump_ticket('33333333-3333-4333-8333-333333333333'), true, 'a ticket just inside 2 minutes redeems');
select is(public.redeem_pump_ticket('44444444-4444-4444-8444-444444444444'), false, 'an unknown token is false');
select is(public.redeem_pump_ticket(null), false, 'null is false');

-- 10. Behaviour through real roles.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.redeem_pump_ticket('11111111-1111-4111-8111-111111111111') $$, '42501', null, 'anon calling redeem_pump_ticket is denied');
select throws_ok($$ select public.register_clock_target('https://evil.example.com') $$, '42501', null, 'anon calling register_clock_target is denied');
select throws_ok($$ select * from private.pump_tickets $$, '42501', null, 'anon cannot read the tickets');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.redeem_pump_ticket('11111111-1111-4111-8111-111111111111') $$, '42501', null, 'authenticated calling redeem_pump_ticket is denied');
select throws_ok($$ select * from private.clock_target $$, '42501', null, 'authenticated cannot read the target');
reset role;
set local role service_role;
select lives_ok($$ select public.redeem_pump_ticket('44444444-4444-4444-8444-444444444444') $$, 'service_role can call redeem_pump_ticket');
select throws_ok($$ select * from private.pump_tickets $$, '42501', null, 'service_role cannot read the tickets directly');
select throws_ok($$ select private.pump_tick() $$, '42501', null, 'service_role cannot run pump_tick');
reset role;

select * from finish();
rollback;
