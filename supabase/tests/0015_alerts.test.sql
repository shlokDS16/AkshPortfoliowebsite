-- 20261014000015_alerts.sql: one incident at a time for the alert email (docs/specs/2026-10-14-alert-email-design.md s2, s4).
-- public.alert_step(red keys) decides everything under one lock and returns at most one row: the email to send ('open' or
-- 'closed'), or 'still_open' when an incident is open and no email is due. public.alert_sent(id, kind) stamps a send.
-- The tests run as the database owner in ONE transaction, so now() does not move: the 30-minute hold is tested by moving
-- last_red_at back, exactly as the clock would have.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(68);

-- 1. Structure and privileges.
select has_table('private', 'alert_incidents', 'private.alert_incidents exists');
select ok((select c.relrowsecurity from pg_class c where c.oid = 'private.alert_incidents'::regclass), 'RLS is enabled');
select is_empty($$ select polname from pg_policy where polrelid = 'private.alert_incidents'::regclass $$, 'RLS has no policies (service role reaches the table only through the functions)');
select is_empty($$
  select r from unnest(array['anon', 'authenticated', 'service_role']) r
   where has_table_privilege(r, 'private.alert_incidents', 'select,insert,update,delete,truncate,references,trigger')
      or has_any_column_privilege(r, 'private.alert_incidents', 'select,insert,update,references')
$$, 'no API role holds a privilege on the table');
select has_function('public', 'alert_step', array['text[]'], 'alert_step(text[]) exists');
select has_function('public', 'alert_sent', array['bigint', 'text'], 'alert_sent(bigint, text) exists');
select is_definer('public', 'alert_step', array['text[]'], 'alert_step is SECURITY DEFINER');
select is_definer('public', 'alert_sent', array['bigint', 'text'], 'alert_sent is SECURITY DEFINER');
select ok((select 'search_path=""' = any (p.proconfig) from pg_proc p where p.oid = 'public.alert_step(text[])'::regprocedure)
      and (select 'search_path=""' = any (p.proconfig) from pg_proc p where p.oid = 'public.alert_sent(bigint, text)'::regprocedure),
  'both pin an empty search_path');
select ok(has_function_privilege('service_role', 'public.alert_step(text[])', 'execute')
      and has_function_privilege('service_role', 'public.alert_sent(bigint, text)', 'execute'),
  'service_role can execute both');
select ok(not has_function_privilege('anon', 'public.alert_step(text[])', 'execute')
      and not has_function_privilege('anon', 'public.alert_sent(bigint, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.alert_step(text[])', 'execute')
      and not has_function_privilege('authenticated', 'public.alert_sent(bigint, text)', 'execute'),
  'anon and authenticated cannot execute either');
select is_empty($$
  select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('alert_step', 'alert_sent')
     and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
$$, 'neither carries a PUBLIC execute grant');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
     and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
         not in ('heartbeat_ages()', 'capture_days(p_days integer)', 'queue_age()', 'public_fact_checks()')
$$, 'anon can execute exactly queue_age, heartbeat_ages, capture_days and public_fact_checks');
select is((select count(*)::integer from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  4, 'anon executes exactly four functions in public');

-- 2. Nothing red, nothing open: no row, no incident.
select is_empty($$ select * from public.alert_step('{}') $$, 'no red and no incident: no row');
select is_empty($$ select * from public.alert_step(null) $$, 'a null red set reads as empty');
select is_empty($$ select * from public.alert_step(array['', null]) $$, 'empty and null keys are dropped');
select is((select count(*)::integer from private.alert_incidents), 0, 'no incident was opened');

-- 3. A red check opens an incident and asks for the open email.
select results_eq($$ select kind, keys from public.alert_step(array['queue', 'heartbeat:pump']) $$,
  $$ values ('open'::text, array['heartbeat:pump', 'queue']) $$, 'a red set opens an incident: kind open, keys sorted');
select is((select count(*)::integer from private.alert_incidents where closed_at is null), 1, 'exactly one open incident');
select is((select open_sent_at is null and closed_sent_at is null and closed_at is null from private.alert_incidents), true, 'it is open and nothing is marked sent');
create temp table inc as select id from private.alert_incidents;

-- 4. An open email not marked sent is returned again (the send failed, the next run retries).
select results_eq($$ select incident_id, kind from public.alert_step(array['queue']) $$,
  $$ select id, 'open'::text from inc $$, 'an unsent open email is offered again, for the same incident');
select is((select count(*)::integer from private.alert_incidents), 1, 'still one incident');

-- 5. Marking it sent stops the retry; new keys join the incident without a second email.
select lives_ok($$ select public.alert_sent((select id from inc), 'open') $$, 'alert_sent(open) runs');
select isnt((select open_sent_at from private.alert_incidents), null, 'open_sent_at is stamped');
update private.alert_incidents set open_sent_at = '2026-01-01 00:00+00';
select lives_ok($$ select public.alert_sent((select id from inc), 'open') $$, 'alert_sent(open) twice is harmless');
select is((select open_sent_at from private.alert_incidents), '2026-01-01 00:00+00'::timestamptz, 'the stamp is set only while null');
select results_eq($$ select incident_id, kind, keys from public.alert_step(array['ledger:prices']) $$,
  $$ select id, 'still_open'::text, array['heartbeat:pump', 'ledger:prices', 'queue'] from inc $$,
  'a new key joins the open incident; the answer is still_open, not a second email');
select is((select count(*)::integer from public.alert_step(array['queue']) where kind in ('open', 'closed')), 0, 'no email is due while it stays red');
select is((select count(*)::integer from private.alert_incidents), 1, 'still one incident');
select ok((select last_red_at >= opened_at from private.alert_incidents), 'last_red_at moved with the red checks');

-- 6. The 30-minute hold: clear for 29 minutes keeps it open; at 30 it closes.
update private.alert_incidents set last_red_at = now() - interval '29 minutes';
select results_eq($$ select kind from public.alert_step('{}') $$, $$ values ('still_open'::text) $$, 'clear for 29 minutes: still open');
select is((select closed_at from private.alert_incidents), null, 'not closed at 29 minutes');
update private.alert_incidents set last_red_at = now() - interval '29 minutes';
select is((select count(*)::integer from public.alert_step(array['queue'])), 1, 'red again during the hold: one row');
select ok((select now() - last_red_at < interval '1 minute' from private.alert_incidents), 'red again restarts the hold');
update private.alert_incidents set last_red_at = now() - interval '30 minutes';
select results_eq($$ select incident_id, kind from public.alert_step('{}') $$, $$ select id, 'closed'::text from inc $$,
  'clear for 30 minutes: closes, and the closed email is due (the open email was sent)');
select isnt((select closed_at from private.alert_incidents), null, 'closed_at is stamped');

-- 7. An unsent close email is offered again; once sent, silence.
select results_eq($$ select incident_id, kind from public.alert_step('{}') $$, $$ select id, 'closed'::text from inc $$, 'an unsent closed email is offered again');
select lives_ok($$ select public.alert_sent((select id from inc), 'closed') $$, 'alert_sent(closed) runs');
select isnt((select closed_sent_at from private.alert_incidents), null, 'closed_sent_at is stamped');
select is_empty($$ select * from public.alert_step('{}') $$, 'after both emails are sent: no row');

-- 8. A new red set after a close is a new incident (a new row, a new id).
select results_eq($$ select kind from public.alert_step(array['heartbeat:daily']) $$, $$ values ('open'::text) $$, 'red after a close opens a new incident');
select is((select count(*)::integer from private.alert_incidents), 2, 'two incidents in all');
select is((select count(*)::integer from private.alert_incidents where closed_at is null), 1, 'one of them open');

-- 9. Closing an incident whose open email was never sent sends no email at all.
update private.alert_incidents set last_red_at = now() - interval '45 minutes' where closed_at is null;
select is_empty($$ select * from public.alert_step('{}') $$, 'closed with the open email unsent: no closed email');
select is((select count(*)::integer from private.alert_incidents where closed_at is null), 0, 'it did close');
select is_empty($$ select * from public.alert_step('{}') $$, 'and nothing is offered later');
select lives_ok($$ select public.alert_sent((select max(id) from private.alert_incidents), 'closed') $$, 'a closed stamp without a sent open email is accepted as a no-op');
select is((select closed_sent_at from private.alert_incidents where id = (select max(id) from private.alert_incidents)), null, 'and it stamps nothing');

-- 10. One open incident at most, enforced by the index as well as by the function.
select results_eq($$ select kind from public.alert_step(array['queue']) $$, $$ values ('open'::text) $$, 'open a third incident');
select throws_ok($$ insert into private.alert_incidents (keys) values (array['x']) $$, '23505', null, 'a second open incident is refused by the partial unique index');
select throws_ok($$ insert into private.alert_incidents (keys, closed_at) values (array['x'], now() - interval '1 day') $$, '23514', null, 'a row closed before it opened is refused');
select throws_ok($$ insert into private.alert_incidents (keys, closed_at) values ('{}', now()) $$, '23514', null, 'an incident with no keys is refused');

-- 11. A stale pair: an old close email is offered before a new incident's open email; both arrive in turn.
update private.alert_incidents set closed_sent_at = null where id = (select min(id) from private.alert_incidents);
select results_eq($$ select kind from public.alert_step(array['queue']) $$, $$ values ('closed'::text) $$, 'the oldest pending email goes first (an earlier incident close)');
select lives_ok($$ select public.alert_sent((select min(id) from private.alert_incidents), 'closed') $$, 'it is marked sent');
select results_eq($$ select kind from public.alert_step(array['queue']) $$, $$ values ('open'::text) $$, 'then the open incident email');

-- 12. Bad input.
select throws_ok($$ select public.alert_sent(1, 'later') $$, '22023', null, 'alert_sent refuses an unknown kind');
select lives_ok($$ select public.alert_sent(-5, 'open') $$, 'alert_sent for an id that does not exist is a no-op');
select is((select count(*)::integer from public.alert_step((select array_agg('k' || g) from generate_series(1, 200) g))), 1, 'a huge red set is accepted');
select ok((select cardinality(keys) <= 50 from private.alert_incidents where closed_at is null), 'and the keys are capped at 50');
select ok((select max(char_length(k)) <= 80 from private.alert_incidents, unnest(keys) k), 'each key is capped at 80 characters');

-- 13. Behaviour through real roles.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.alert_step(array['queue']) $$, '42501', null, 'anon calling alert_step is denied');
select throws_ok($$ select public.alert_sent(1, 'open') $$, '42501', null, 'anon calling alert_sent is denied');
select throws_ok($$ select * from private.alert_incidents $$, '42501', null, 'anon cannot read the table');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select * from public.alert_step(array['queue']) $$, '42501', null, 'authenticated calling alert_step is denied');
select throws_ok($$ select * from private.alert_incidents $$, '42501', null, 'authenticated cannot read the table');
reset role;
set local role service_role;
select lives_ok($$ select * from public.alert_step(array['queue']) $$, 'service_role can call alert_step');
select throws_ok($$ select * from private.alert_incidents $$, '42501', null, 'service_role cannot read the table directly');
reset role;

select * from finish();
rollback;
