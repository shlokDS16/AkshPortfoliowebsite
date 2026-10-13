-- 20261013000010_ledger.sql: ideas, the sealed hash-chained idea_events, the event functions, chain verification
-- (Plan 3a Task 1; spec s5.1-5.3; ADR-005 s3.1, s3.2, s3.5). The thing an allocator will try to break.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(157);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');
insert into public.companies (id, slug, name, nse_symbol, isin) values
  ('cccccccc-0000-4000-8000-000000000001', 'kav', 'Kaveri Seed', 'KSCL', 'INE455F01025'),
  ('cccccccc-0000-4000-8000-000000000002', 'nosym', 'No Symbol Ltd', null, null);
insert into public.items (id, kind, title, company_id, learning_objective) values
  ('a1000000-0000-4000-8000-000000000001', 'thesis', 'Kaveri file', 'cccccccc-0000-4000-8000-000000000001', 'Learn.');

-- ids made inside the functions are parked here so later statements can name them
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, service_role;

-- 1. Structure.
select has_table('public', 'ideas', 'ideas exists');
select has_table('public', 'idea_events', 'idea_events exists');
select ok((select bool_and(c.relrowsecurity) from pg_class c
            where c.oid in ('public.ideas'::regclass, 'public.idea_events'::regclass)),
  'RLS is enabled on both tables');
select is((select count(*) from public.verify_ledger_chain() where ok and events = 0 and first_bad_seq is null), 1::bigint,
  'an empty chain verifies as ok with 0 events');

-- 2. Privileges: anon nothing at all; service_role nothing on the tables; authenticated reads and sets item_id only.
select is_empty($$
  select c.relname from pg_class c
   where c.oid in ('public.ideas'::regclass, 'public.idea_events'::regclass)
     and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
          or has_any_column_privilege('anon', c.oid, 'select,insert,update,references'))
$$, 'anon holds no privilege on ideas or idea_events');
select is_empty($$
  select c.relname from pg_class c
   where c.oid in ('public.ideas'::regclass, 'public.idea_events'::regclass)
     and (has_table_privilege('service_role', c.oid, 'select,insert,update,delete,truncate,references,trigger')
          or has_any_column_privilege('service_role', c.oid, 'select,insert,update,references'))
$$, 'service_role holds no privilege on ideas or idea_events');
select ok(has_table_privilege('authenticated', 'public.ideas', 'select')
      and has_table_privilege('authenticated', 'public.idea_events', 'select')
      and not has_table_privilege('authenticated', 'public.ideas', 'insert,delete,truncate')
      and not has_any_column_privilege('authenticated', 'public.idea_events', 'insert,update,references')
      and not has_table_privilege('authenticated', 'public.idea_events', 'delete,truncate')
      and has_column_privilege('authenticated', 'public.ideas', 'item_id', 'update')
      and not has_column_privilege('authenticated', 'public.ideas', 'status', 'update')
      and not has_column_privilege('authenticated', 'public.ideas', 'opened_at', 'update')
      and not has_column_privilege('authenticated', 'public.ideas', 'held', 'update')
      and not has_column_privilege('authenticated', 'public.ideas', 'horizon_days', 'update')
      and not has_column_privilege('authenticated', 'public.ideas', 'company_id', 'update'),
  'authenticated reads both tables, writes neither, and may update ideas.item_id only');
select is_empty($$
  select p.polname from pg_policy p
   where p.polrelid in ('public.ideas'::regclass, 'public.idea_events'::regclass)
     and (p.polroles = '{0}'::oid[] or p.polroles @> array['anon'::regrole::oid])
$$, 'no policy on either table reaches anon or PUBLIC');
select ok(not has_function_privilege('anon', 'public.open_idea(uuid, text, integer, boolean, text, uuid)', 'execute')
      and not has_function_privilege('anon', 'public.add_idea_event(uuid, text, text, jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.check_ledger_chain()', 'execute')
      and not has_function_privilege('anon', 'public.verify_ledger_chain()', 'execute'),
  'anon cannot execute any ledger function');
select ok(has_function_privilege('authenticated', 'public.open_idea(uuid, text, integer, boolean, text, uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.add_idea_event(uuid, text, text, jsonb)', 'execute')
      and has_function_privilege('authenticated', 'public.check_ledger_chain()', 'execute')
      and not has_function_privilege('authenticated', 'public.verify_ledger_chain()', 'execute')
      and not has_function_privilege('service_role', 'public.open_idea(uuid, text, integer, boolean, text, uuid)', 'execute')
      and not has_function_privilege('service_role', 'public.add_idea_event(uuid, text, text, jsonb)', 'execute')
      and not has_function_privilege('service_role', 'public.check_ledger_chain()', 'execute')
      and has_function_privilege('service_role', 'public.verify_ledger_chain()', 'execute'),
  'the writers and the admin check are authenticated only; the job check is service_role only');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in ('seal_idea_event', 'ledger_chain_check', 'ledger_fail', 'validate_idea_stance', 'guard_idea_update')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute'))
$$, 'the private ledger helpers are executable by no API role');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.proname in ('open_idea', 'add_idea_event', 'check_ledger_chain', 'verify_ledger_chain', 'seal_idea_event',
                       'ledger_chain_check', 'ledger_fail', 'validate_idea_stance', 'guard_idea_update')
     and (not p.prosecdef and p.proname <> 'ledger_fail' and p.proname <> 'guard_idea_update'
          or not ('search_path=""' = any (coalesce(p.proconfig, '{}'::text[]))))
$$, 'every ledger function pins an empty search_path and the callable ones are SECURITY DEFINER');

-- 3. An admin session opens an idea: seq 1, sixty-four zeros before it, a chained second event.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into ctx select 'i1', public.open_idea('cccccccc-0000-4000-8000-000000000001',
    'outperform', 365, true, 'Seed pricing power. I expect it to beat the Nifty 50.') $$,
  'the admin opens an idea');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', 'Monsoon is on track.') $$,
  'the admin adds a note');
reset role;

select is((select count(*) from public.idea_events), 2::bigint, 'two events were written');
select is((select e.seq from public.idea_events e where e.kind = 'open'), 1::bigint, 'the first event has seq 1');
select is((select e.prev_hash from public.idea_events e where e.seq = 1), repeat('0', 64),
  'the first event is chained to sixty-four zeros');
select is((select e.prev_hash from public.idea_events e where e.seq = 2), (select e.hash from public.idea_events e where e.seq = 1),
  'the second event is chained to the first');
select is((select count(*) from public.idea_events e
            where e.hash = encode(sha256(convert_to(e.prev_hash || E'\n' || e.canonical, 'UTF8')), 'hex')), 2::bigint,
  'each hash is sha256(prev_hash || newline || canonical), recomputed here independently');
select is((select e.canonical::jsonb ->> 'words' from public.idea_events e where e.seq = 1),
  'Seed pricing power. I expect it to beat the Nifty 50.', 'the canonical text holds Aksh''s words');
select is((select e.canonical::jsonb ->> 'symbol' || '/' || (e.canonical::jsonb ->> 'isin') || '/' || (e.canonical::jsonb ->> 'company')
             from public.idea_events e where e.seq = 1),
  'KSCL/INE455F01025/Kaveri Seed', 'the canonical text freezes the symbol, ISIN and name as they stood');
select is((select e.canonical::jsonb -> 'stance' from public.idea_events e where e.seq = 1),
  '{"expects":"outperform","horizon_days":365,"held":true,"benchmark":"NIFTY 50"}'::jsonb,
  'the open event stance holds the structured choices');
select is((select (e.canonical::jsonb ->> 'at') = to_char(e.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
             from public.idea_events e where e.seq = 1),
  true, 'the canonical time is the stored recorded_at in UTC microseconds');
select is((select i.status || '/' || i.held || '/' || i.horizon_days || '/' || (i.opened_at = e.recorded_at)
             from public.ideas i join public.idea_events e on e.idea_id = i.id and e.seq = 1),
  'open/true/365/true', 'the idea projection starts open, held, 365 days, opened_at = the open event time');
select is((select count(*) from public.idea_events e where e.canonical ~* '(price|return|close_px|[0-9]+\.[0-9]{2}%)'),
  0::bigint, 'no sealed text carries a price or a return field');
select is((select count(*) from public.verify_ledger_chain() where ok and events = 2 and first_bad_seq is null), 1::bigint,
  'verify_ledger_chain is ok on the clean two-event chain');

-- 4. No caller can set an event's date, sequence or hash.
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname in ('open_idea', 'add_idea_event')
                         and exists (select 1 from unnest(coalesce(p.proargnames, '{}')) a
                                      where a ~* '(recorded|at|date|time|seq|hash|nonce|canonical)$')),
  'neither writer takes a date, sequence, hash, nonce or canonical argument');
select lives_ok($$ insert into public.idea_events (idea_id, kind, stance, body_md, seq, recorded_at, prev_hash, hash, canonical, nonce)
    values ((select v from ctx where k = 'i1'), 'note', '{}', 'Owner-written probe.', 999, '2001-01-01 00:00:00+00',
            repeat('a', 64), repeat('b', 64), 'forged', gen_random_uuid()) $$,
  'even the table owner''s insert is accepted only through the seal trigger');
select is((select e.seq from public.idea_events e where e.body_md = 'Owner-written probe.'), 3::bigint,
  'a supplied seq is overwritten by the trigger');
select ok((select e.recorded_at > now() - interval '1 hour' from public.idea_events e where e.body_md = 'Owner-written probe.'),
  'a supplied recorded_at is overwritten by the trigger');
select is((select e.prev_hash from public.idea_events e where e.seq = 3), (select e.hash from public.idea_events e where e.seq = 2),
  'a supplied prev_hash is overwritten by the trigger');
select ok((select e.canonical <> 'forged' and e.hash <> repeat('b', 64) from public.idea_events e where e.seq = 3),
  'a supplied canonical and hash are overwritten by the trigger');
select ok((select bool_and(e.recorded_at >= prev.recorded_at)
             from public.idea_events e join public.idea_events prev on prev.seq = e.seq - 1),
  'recorded_at never goes backwards as seq grows');
select is((select count(*) from public.verify_ledger_chain() where ok and events = 3), 1::bigint,
  'the chain is still clean after the owner-written probe');

-- 5. Append-only: nobody updates, deletes or truncates an event, and nobody inserts one directly.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ insert into public.idea_events (idea_id, kind, stance, body_md)
    values ((select v from ctx where k = 'i1'), 'note', '{}', 'direct') $$,
  '42501', null, 'the admin cannot INSERT into idea_events directly');
select throws_ok($$ update public.idea_events set body_md = 'edited' where seq = 1 $$, '42501', null,
  'the admin cannot UPDATE an event');
select throws_ok($$ update public.idea_events set recorded_at = '2001-01-01' where seq = 1 $$, '42501', null,
  'the admin cannot change an event''s date');
select throws_ok($$ delete from public.idea_events where seq = 1 $$, '42501', null, 'the admin cannot DELETE an event');
select throws_ok($$ truncate public.idea_events $$, '42501', null, 'the admin cannot TRUNCATE idea_events');
reset role;
set local role service_role;
select throws_ok($$ insert into public.idea_events (idea_id, kind, stance, body_md)
    values ((select v from ctx where k = 'i1'), 'note', '{}', 'direct') $$,
  '42501', null, 'service_role cannot INSERT into idea_events');
select throws_ok($$ update public.idea_events set body_md = 'edited' where seq = 1 $$, '42501', null,
  'service_role cannot UPDATE an event');
select throws_ok($$ delete from public.idea_events where seq = 1 $$, '42501', null, 'service_role cannot DELETE an event');
select throws_ok($$ truncate public.idea_events $$, '42501', null, 'service_role cannot TRUNCATE idea_events');
select throws_ok($$ select count(*) from public.idea_events $$, '42501', null, 'service_role cannot even read idea_events');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select count(*) from public.idea_events $$, '42501', null, 'anon cannot read idea_events');
select throws_ok($$ select count(*) from public.ideas $$, '42501', null, 'anon cannot read ideas');
select throws_ok($$ select public.add_idea_event(gen_random_uuid(), 'note', 'x') $$, '42501', null, 'anon cannot call add_idea_event');
select throws_ok($$ select * from public.verify_ledger_chain() $$, '42501', null, 'anon cannot call verify_ledger_chain');
select throws_ok($$ select * from public.check_ledger_chain() $$, '42501', null, 'anon cannot call check_ledger_chain');
reset role;
-- Even the owner, with the grants out of the picture, meets the append-only trigger.
select throws_ok($$ update public.idea_events set body_md = 'edited' where seq = 1 $$, 'P0001', null,
  'the owner''s UPDATE of an event is refused by the append-only trigger');
select throws_ok($$ delete from public.idea_events where seq = 1 $$, 'P0001', null,
  'the owner''s DELETE of an event is refused by the append-only trigger');
select throws_ok($$ truncate public.idea_events $$, 'P0001', null,
  'the owner''s TRUNCATE of idea_events is refused by the append-only trigger');

-- 6. A non-admin session sees nothing and writes nothing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.ideas), 0::bigint, 'a non-admin sees no ideas');
select is((select count(*) from public.idea_events), 0::bigint, 'a non-admin sees no events');
select throws_ok($$ select public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 365, true, 'x') $$,
  '42501', null, 'a non-admin cannot open an idea');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', 'x') $$,
  '42501', null, 'a non-admin cannot add an event');
select throws_ok($$ select * from public.check_ledger_chain() $$, '42501', null, 'a non-admin cannot run the admin chain check');
select lives_ok($$ update public.ideas set item_id = 'a1000000-0000-4000-8000-000000000001' $$,
  'a non-admin''s item_id update is not an error, it matches no row (RLS)');
reset role;
select is((select count(*) from public.ideas where item_id is not null), 0::bigint, 'a non-admin changed no idea');

-- 7. The admin: item_id is the one editable column; the state columns are not.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ update public.ideas set item_id = 'a1000000-0000-4000-8000-000000000001' where id = (select v from ctx where k = 'i1') $$,
  'the admin can link an idea to a company file (item_id)');
select throws_ok($$ update public.ideas set status = 'closed' where id = (select v from ctx where k = 'i1') $$, '42501', null,
  'the admin cannot update ideas.status directly');
select throws_ok($$ update public.ideas set opened_at = now() - interval '2 days' where id = (select v from ctx where k = 'i1') $$,
  '42501', null, 'the admin cannot update ideas.opened_at');
select throws_ok($$ insert into public.ideas (company_id, expects, horizon_days, held)
    values ('cccccccc-0000-4000-8000-000000000001', 'outperform', 365, true) $$, '42501', null,
  'the admin cannot INSERT an idea directly');
select throws_ok($$ delete from public.ideas where id = (select v from ctx where k = 'i1') $$, '42501', null,
  'the admin cannot DELETE an idea');
reset role;
select is((select i.item_id from public.ideas i where i.id = (select v from ctx where k = 'i1')),
  'a1000000-0000-4000-8000-000000000001'::uuid, 'item_id was set');

-- 8. Refusals at the door: codes and the stance shape per kind.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.open_idea('cccccccc-0000-4000-8000-000000000002', 'outperform', 365, true, 'x') $$,
  'P0001', 'ledger:no_symbol', 'a company with no NSE symbol is refused');
select throws_ok($$ select public.open_idea(gen_random_uuid(), 'outperform', 365, true, 'x') $$,
  'P0002', null, 'an unknown company is P0002');
select throws_ok($$ select public.open_idea('cccccccc-0000-4000-8000-000000000001', 'sideways', 365, true, 'x') $$,
  'P0001', 'ledger:bad_stance', 'an unknown direction is refused');
select throws_ok($$ select public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 29, true, 'x') $$,
  'P0001', 'ledger:bad_horizon', 'a horizon under 30 days is refused');
select throws_ok($$ select public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 3651, true, 'x') $$,
  'P0001', 'ledger:bad_horizon', 'a horizon over 3650 days is refused');
select throws_ok($$ select public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 365, null, 'x') $$,
  'P0001', 'ledger:bad_stance', 'a missing held flag is refused');
select throws_ok($$ select public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 365, true, '   ') $$,
  'P0001', 'ledger:words_required', 'empty words are refused when opening');
select throws_ok($$ select public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 365, true, repeat('w', 10001)) $$,
  'P0001', 'ledger:words_required', 'words over 10,000 characters are refused');
select throws_ok($$ select public.add_idea_event(gen_random_uuid(), 'note', 'x') $$, 'P0002', null, 'an unknown idea is P0002');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'open', 'again') $$,
  'P0001', 'ledger:bad_kind', 'an open event cannot be added to an existing idea');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'rumour', 'x') $$,
  'P0001', 'ledger:bad_kind', 'an unknown kind is refused');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', '') $$,
  'P0001', 'ledger:words_required', 'a note with no words is refused');
-- one unknown key per kind
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', 'x', '{"price":101}') $$,
  'P0001', 'ledger:bad_stance', 'note refuses an unknown key');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'revise', 'x', '{"expects":"underperform"}') $$,
  'P0001', 'ledger:bad_stance', 'revise refuses a change of direction (expects)');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'upsize', 'x', '{"target":1}') $$,
  'P0001', 'ledger:bad_stance', 'upsize refuses an unknown key');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'downsize', 'x', '{"held":true,"qty":1}') $$,
  'P0001', 'ledger:bad_stance', 'downsize refuses an unknown key');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'close', 'x', '{"reason":"other","pnl":1}') $$,
  'P0001', 'ledger:bad_stance', 'close refuses an unknown key');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'void', 'x', '{"why":"typo"}') $$,
  'P0001', 'ledger:bad_stance', 'void refuses an unknown key');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', 'x', '[]') $$,
  'P0001', 'ledger:bad_stance', 'a stance that is not an object is refused');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', 'x', 'null'::jsonb) $$,
  'P0001', 'ledger:bad_stance', 'a JSON null stance is refused');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'revise', 'x', '{"horizon_days":10}') $$,
  'P0001', 'ledger:bad_horizon', 'revise refuses a horizon under 30');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'revise', 'x', '{"horizon_days":"90"}') $$,
  'P0001', 'ledger:bad_stance', 'revise refuses a horizon that is not a whole number');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'downsize', 'x', '{}') $$,
  'P0001', 'ledger:bad_stance', 'downsize needs held');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'close', 'x', '{}') $$,
  'P0001', 'ledger:bad_stance', 'close needs a reason');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'close', 'x', '{"reason":"fun"}') $$,
  'P0001', 'ledger:bad_stance', 'close refuses an unknown reason');

-- each accepted shape (on idea i1) and its effect on the projection
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'revise', 'Giving it longer.', '{"horizon_days":730}') $$,
  'revise accepts horizon_days');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'revise', 'Same horizon, clearer words.') $$,
  'revise accepts an empty stance (words only)');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'downsize', 'Trimmed.', '{"held":true}') $$,
  'downsize accepts held=true');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'downsize', 'Out of it for now.', '{"held":false}') $$,
  'downsize accepts held=false');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'upsize', 'Back in.') $$,
  'upsize accepts an empty stance');
reset role;
select is((select i.horizon_days || '/' || i.held from public.ideas i where i.id = (select v from ctx where k = 'i1')),
  '730/true', 'the projection follows revise, downsize and upsize (730 days, held again)');

-- 9. State rules.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into ctx select 'i2', public.open_idea('cccccccc-0000-4000-8000-000000000001', 'underperform', 90, false, 'Short idea.') $$,
  'a second idea opens');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'review', 'x', '{"process":"sound","tags":["none"]}') $$,
  'P0001', 'ledger:not_closed', 'review on an open idea fails');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'close', 'It played out.', '{"reason":"played_out"}') $$,
  'close is accepted');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'note', 'Afterthought.') $$,
  'a note after a close passes');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'close', 'again', '{"reason":"other"}') $$,
  'P0001', 'ledger:not_open', 'close after close fails');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'upsize', 'x') $$,
  'P0001', 'ledger:not_open', 'upsize on a closed idea fails');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'revise', 'x', '{"horizon_days":100}') $$,
  'P0001', 'ledger:not_open', 'revise on a closed idea fails');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'void', 'x') $$,
  'P0001', 'ledger:not_open', 'void on a closed idea fails');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'open', 'x') $$,
  'P0001', 'ledger:bad_kind', 'no event re-opens a closed idea');
-- one unknown key and the other shapes of review
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'review', 'x', '{"process":"sound","tags":["none"],"score":9}') $$,
  'P0001', 'ledger:bad_stance', 'review refuses an unknown key');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'review', 'x', '{"process":"lucky","tags":["none"]}') $$,
  'P0001', 'ledger:bad_stance', 'review refuses an unknown process');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'review', 'x', '{"process":"sound","tags":["bad_luck"]}') $$,
  'P0001', 'ledger:bad_stance', 'review refuses an unknown tag');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'review', 'x', '{"process":"sound","tags":[]}') $$,
  'P0001', 'ledger:bad_stance', 'review needs at least one tag');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'review', 'x', '{"process":"sound","tags":"none"}') $$,
  'P0001', 'ledger:bad_stance', 'review tags must be a list');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'review', 'x', '{"process":"sound","tags":["none","none"]}') $$,
  'P0001', 'ledger:bad_stance', 'review refuses a repeated tag');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'review', 'Sound call, unlucky timing.',
    '{"process":"sound","tags":["timing","luck"]}') $$, 'review on a closed idea passes');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i2'), 'review', 'On reflection the call was flawed.',
    '{"process":"flawed","tags":["thesis"]}') $$, 'a later review replaces the earlier verdict');
reset role;
select is((select i.status || '/' || i.held || '/' || i.close_reason || '/' || i.process_call || '/' || (i.closed_at is not null)
             from public.ideas i where i.id = (select v from ctx where k = 'i2')),
  'closed/false/played_out/flawed/true', 'the projection follows close and the latest review');
select is((select (i.closed_at = e.recorded_at) from public.ideas i join public.idea_events e on e.idea_id = i.id and e.kind = 'close'
            where i.id = (select v from ctx where k = 'i2')), true, 'closed_at is the close event''s recorded_at');

-- a closed idea can never be re-opened, not even by the table owner
select throws_ok($$ update public.ideas set status = 'open' where id = (select v from ctx where k = 'i2') $$, 'P0001', null,
  'a closed idea cannot be re-opened (guard trigger, even for the owner)');
select throws_ok($$ update public.ideas set status = 'void' where id = (select v from ctx where k = 'i2') $$, 'P0001', null,
  'a closed idea cannot become void');
select throws_ok($$ update public.ideas set closed_at = null where id = (select v from ctx where k = 'i2') $$, 'P0001', null,
  'the close time of a closed idea cannot be cleared');
select throws_ok($$ update public.ideas set expects = 'outperform' where id = (select v from ctx where k = 'i2') $$, 'P0001', null,
  'the direction of an idea never changes');
select throws_ok($$ update public.ideas set company_id = 'cccccccc-0000-4000-8000-000000000002' where id = (select v from ctx where k = 'i2') $$,
  'P0001', null, 'the company of an idea never changes');
select throws_ok($$ update public.ideas set status = 'closed', closed_at = null where id = (select v from ctx where k = 'i1') $$,
  '23514', null, 'a closed idea must carry its close time and reason (check constraint)');

-- void: within 24 hours only; a void idea takes nothing
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into ctx select 'i3', public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 180, true, 'Typo idea.') $$,
  'a third idea opens');
select lives_ok($$ insert into ctx select 'i4', public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 180, true, 'Old idea.') $$,
  'a fourth idea opens');
reset role;
update public.ideas set opened_at = opened_at - interval '25 hours' where id = (select v from ctx where k = 'i4');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i4'), 'void', 'Too late.') $$,
  'P0001', 'ledger:void_too_late', 'void after 24 hours fails');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i4'), 'note', 'Still an open idea.') $$,
  'an idea past 24 hours still takes notes');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i3'), 'void', 'Wrong company.') $$,
  'void within 24 hours passes');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i3'), 'note', 'x') $$,
  'P0001', 'ledger:is_void', 'a note on a void idea fails');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i3'), 'close', 'x', '{"reason":"other"}') $$,
  'P0001', 'ledger:is_void', 'a close on a void idea fails');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i3'), 'void', 'x') $$,
  'P0001', 'ledger:is_void', 'a second void fails');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i3'), 'review', 'x', '{"process":"sound","tags":["none"]}') $$,
  'P0001', 'ledger:is_void', 'a review on a void idea fails');
reset role;
select is((select i.status from public.ideas i where i.id = (select v from ctx where k = 'i3')), 'void', 'the voided idea shows void');
select is((select count(*) from public.idea_events e where e.idea_id = (select v from ctx where k = 'i3')), 2::bigint,
  'a void idea stays in the chain (open and void events)');
select throws_ok($$ update public.ideas set status = 'open' where id = (select v from ctx where k = 'i3') $$, 'P0001', null,
  'a void idea cannot be re-opened');

-- 10. The check functions through the right roles, then the attacks on the chain.
select is((select count(*) from public.verify_ledger_chain() where ok and first_bad_seq is null and events = (select count(*) from public.idea_events)),
  1::bigint, 'the whole chain built through the functions verifies');
set local role service_role;
select is((select count(*) from public.verify_ledger_chain() where ok), 1::bigint, 'service_role runs verify_ledger_chain');
select throws_ok($$ select * from public.check_ledger_chain() $$, '42501', null, 'service_role cannot run the admin check');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.check_ledger_chain() where ok), 1::bigint, 'the admin runs check_ledger_chain');
select throws_ok($$ select * from public.verify_ledger_chain() $$, '42501', null, 'authenticated cannot run the job check');
reset role;

-- The owner (a stolen database password, not an API role) switches the guards off and tampers. The check must find it.
create temp table saved_events as select * from public.idea_events where seq in (1, 4);
create temp table saved_words as select e.seq, e.body_md from public.idea_events e where e.seq = 5;
select is((select count(*) from saved_events), 2::bigint, 'events 1 and 4 saved for the removal tests');
alter table public.idea_events disable trigger user;

update public.idea_events set canonical = replace(canonical, 'Monsoon', 'Drought') where seq = 2;
select is((select first_bad_seq from public.verify_ledger_chain()), 2::bigint,
  'a changed sealed text is caught at its own seq');
update public.idea_events set canonical = replace(canonical, 'Drought', 'Monsoon') where seq = 2;
select is((select ok from public.verify_ledger_chain()), true, 'restored: the chain verifies again');

update public.idea_events set body_md = 'Rewritten after the fact.' where seq = 5;
select is((select first_bad_seq from public.verify_ledger_chain()), 5::bigint,
  'a changed body_md column that no longer matches the sealed text is caught');
update public.idea_events set body_md = (select w.body_md from saved_words w) where seq = 5;
select is((select ok from public.verify_ledger_chain()), true, 'restored: the body_md matches the sealed text again');

update public.idea_events set recorded_at = recorded_at + interval '1 second' where seq = 3;
select is((select first_bad_seq from public.verify_ledger_chain()), 3::bigint, 'a changed date is caught');
update public.idea_events set recorded_at = recorded_at - interval '1 second' where seq = 3;

update public.idea_events set stance = '{"note":"x"}' where seq = 3;
select is((select first_bad_seq from public.verify_ledger_chain()), 3::bigint, 'a changed stance is caught');
update public.idea_events set stance = '{}' where seq = 3;

update public.idea_events set prev_hash = repeat('1', 64) where seq = 1;
select is((select first_bad_seq from public.verify_ledger_chain()), 1::bigint, 'a first event that does not start from zeros is caught');
update public.idea_events set prev_hash = repeat('0', 64) where seq = 1;

update public.idea_events set seq = -1 where seq = 2;
update public.idea_events set seq = 2 where seq = 3;
update public.idea_events set seq = 3 where seq = -1;
select is((select first_bad_seq from public.verify_ledger_chain()), 2::bigint, 'two events swapped in order are caught');
update public.idea_events set seq = -1 where seq = 2;
update public.idea_events set seq = 2 where seq = 3;
update public.idea_events set seq = 3 where seq = -1;
select is((select ok from public.verify_ledger_chain()), true, 'restored: the order is back and the chain verifies');

delete from public.idea_events where seq = 4;
select is((select first_bad_seq from public.verify_ledger_chain()), 5::bigint,
  'a removed event (a gap in seq) is caught at the next event');
insert into public.idea_events (id, seq, idea_id, kind, recorded_at, stance, body_md, nonce, canonical, prev_hash, hash)
  select id, seq, idea_id, kind, recorded_at, stance, body_md, nonce, canonical, prev_hash, hash
    from saved_events where seq = 4;
select is((select ok from public.verify_ledger_chain()), true, 'restored: the removed event is back and the chain verifies');

delete from public.idea_events where seq = 1;
select is((select first_bad_seq from public.verify_ledger_chain()), 2::bigint, 'a removed first event is caught');
insert into public.idea_events (id, seq, idea_id, kind, recorded_at, stance, body_md, nonce, canonical, prev_hash, hash)
  select id, seq, idea_id, kind, recorded_at, stance, body_md, nonce, canonical, prev_hash, hash
    from saved_events where seq = 1;
select is((select ok from public.verify_ledger_chain()), true, 'restored: the first event is back and the chain verifies');

insert into public.idea_events (id, seq, idea_id, kind, recorded_at, stance, body_md, nonce, canonical, prev_hash, hash)
  select gen_random_uuid(), (select max(x.seq) + 1 from public.idea_events x), idea_id, kind, recorded_at, stance, body_md,
         gen_random_uuid(), canonical, repeat('0', 64), repeat('f', 64)
    from saved_events where seq = 4;
select is((select first_bad_seq from public.verify_ledger_chain()), (select max(x.seq) from public.idea_events x),
  'an event inserted behind the trigger''s back, with a made-up hash, is caught at its seq');
delete from public.idea_events where hash = repeat('f', 64);
select is((select ok from public.verify_ledger_chain()), true, 'restored: the forged row is gone and the chain verifies');

alter table public.idea_events enable trigger user;
select is((select count(*) from pg_trigger t where t.tgrelid = 'public.idea_events'::regclass and not t.tgisinternal and t.tgenabled <> 'O'),
  0::bigint, 'every idea_events trigger is enabled again');
select throws_ok($$ update public.idea_events set body_md = 'edited' where seq = 1 $$, 'P0001', null,
  'the append-only trigger works again');
select is((select count(*) from public.verify_ledger_chain() where ok and events = (select count(*) from public.idea_events)), 1::bigint,
  'the final chain verifies end to end');

select * from finish();
rollback;
