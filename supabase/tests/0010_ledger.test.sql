-- 20261013000010_ledger.sql: ideas, the sealed hash-chained idea_events, the event functions, chain verification
-- (Plan 3a Task 1; spec s5.1-5.3; ADR-005 s3.1, s3.2, s3.5). The thing an allocator will try to break.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(231);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');
insert into public.companies (id, slug, name, nse_symbol, isin) values
  ('cccccccc-0000-4000-8000-000000000001', 'kav', 'Kaveri Seed', 'KSCL', 'INE455F01025'),
  ('cccccccc-0000-4000-8000-000000000002', 'nosym', 'No Symbol Ltd', null, null),
  ('cccccccc-0000-4000-8000-000000000003', 'beta', 'Beta Ltd', 'BETA', 'INE000B01011');
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
select ok(not has_table_privilege('authenticated', 'public.ideas', 'trigger,references,truncate,delete,insert')
      and not has_table_privilege('authenticated', 'public.idea_events', 'trigger,references,truncate,delete,insert,update'),
  'authenticated holds no TRIGGER, REFERENCES, TRUNCATE, INSERT or DELETE on either table');
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
     and p.proname in ('seal_idea_event', 'ledger_chain_check', 'ledger_fail', 'validate_idea_stance', 'guard_idea_update',
                       'words_ok', 'idea_void_deadline')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute'))
$$, 'the private ledger helpers are executable by no API role');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.proname in ('open_idea', 'add_idea_event', 'check_ledger_chain', 'verify_ledger_chain', 'seal_idea_event',
                       'ledger_chain_check', 'ledger_fail', 'validate_idea_stance', 'guard_idea_update', 'words_ok',
                       'idea_void_deadline')
     and (not p.prosecdef and p.proname not in ('ledger_fail', 'guard_idea_update', 'words_ok', 'idea_void_deadline')
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
select is((select array_agg(k order by k collate "C") from public.idea_events e, jsonb_object_keys(e.canonical::jsonb) k where e.seq = 1),
  array['at', 'company', 'company_id', 'id', 'idea', 'isin', 'kind', 'nonce', 'seq', 'stance', 'symbol', 'v', 'words'],
  'the sealed text holds exactly the version 1 keys: no price, return or score among them');
select is((select e.canonical from public.idea_events e where e.seq = 1),
  (select '{"v" : 1, "seq" : 1, "id" : "' || e.id || '", "idea" : "' || e.idea_id || '", "kind" : "open", "at" : "'
          || to_char(e.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          || '", "company_id" : "cccccccc-0000-4000-8000-000000000001", "symbol" : "KSCL", "isin" : "INE455F01025", '
          || '"company" : "Kaveri Seed", "stance" : ' || e.stance::text
          || ', "words" : "Seed pricing power. I expect it to beat the Nifty 50.", "nonce" : "' || e.nonce || '"}'
     from public.idea_events e where e.seq = 1),
  'the sealed text of version 1 is exactly this literal shape (key order, spacing, escaping)');
select is((select e.canonical::jsonb ->> 'company_id' from public.idea_events e where e.seq = 1), 'cccccccc-0000-4000-8000-000000000001',
  'the company id is sealed with the event');
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
select throws_ok($$ insert into public.idea_events (idea_id, kind, stance, body_md)
    values ((select v from ctx where k = 'i1'), 'note', '{"price": 101.5}', 'A number the machine wrote') $$,
  'P0001', 'ledger:bad_stance', 'the table itself refuses a number in a note stance, whoever inserts');
select throws_ok($$ insert into public.idea_events (idea_id, kind, stance, body_md)
    values ((select v from ctx where k = 'i1'), 'open', '{"expects":"outperform","horizon_days":365,"held":true,"benchmark":"NIFTY 50","target":900}', 'x') $$,
  'P0001', 'ledger:bad_stance', 'the table refuses an unknown key in an open stance');
select throws_ok($$ insert into public.idea_events (idea_id, kind, stance, body_md)
    values ((select v from ctx where k = 'i1'), 'open', '{"expects":"outperform","horizon_days":5,"held":true,"benchmark":"NIFTY 50"}', 'x') $$,
  'P0001', 'ledger:bad_horizon', 'the table refuses an open stance with a horizon outside 30 to 3650');
select throws_ok($$ insert into public.idea_events (idea_id, kind, stance, body_md)
    values ((select v from ctx where k = 'i1'), 'open', '{"expects":"outperform","horizon_days":365,"held":true,"benchmark":"SENSEX"}', 'x') $$,
  'P0001', 'ledger:bad_stance', 'the table refuses a benchmark other than NIFTY 50');
select throws_ok($$ truncate public.ideas cascade $$, 'P0001', null, 'the owner''s TRUNCATE ... CASCADE of ideas reaches the append-only trigger');
select throws_ok($$ delete from public.ideas $$, '23503', null, 'the owner cannot delete an idea that has events (restrict)');

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
select lives_ok($$ insert into ctx select 'i2', public.open_idea('cccccccc-0000-4000-8000-000000000003', 'underperform', 90, false, 'Short idea.') $$,
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

-- void: inside the window only; a void idea takes nothing. The window is measured from the SEALED time of the open event
-- (round 2, N-2): the fixtures below move that sealed time with the owner's hand (trigger off) and put it back afterwards.
create temp table open_times as select e.idea_id, e.recorded_at from public.idea_events e where e.kind = 'open';
create function pg_temp.set_open(p_idea uuid, p_at timestamptz) returns void language plpgsql as $f$
begin
  alter table public.idea_events disable trigger idea_events_append_only;
  update public.idea_events set recorded_at = p_at where idea_id = p_idea and kind = 'open';
  alter table public.idea_events enable trigger idea_events_append_only;
end $f$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into ctx select 'i3', public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 180, true, 'Typo idea.') $$,
  'a third idea opens');
select lives_ok($$ insert into ctx select 'i4', public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 180, true, 'Old idea.') $$,
  'a fourth idea opens');
reset role;
insert into open_times select e.idea_id, e.recorded_at from public.idea_events e
 where e.kind = 'open' and e.idea_id in (select v from ctx where k in ('i3', 'i4'));
select pg_temp.set_open((select v from ctx where k = 'i4'),
  (select o.recorded_at - interval '25 hours' from open_times o where o.idea_id = (select v from ctx where k = 'i4')));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i4'), 'void', 'Too late.') $$,
  'P0001', 'ledger:void_too_late', 'void after 24 hours fails');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i4'), 'note', 'Still an open idea.') $$,
  'an idea past 24 hours still takes notes');
reset role;
-- N-2: moving the projection column opens no window. The deadline never reads ideas.opened_at.
update public.ideas set opened_at = clock_timestamp() where id = (select v from ctx where k = 'i4');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i4'), 'void', 'Too late, with opened_at moved.') $$,
  'P0001', 'ledger:void_too_late', 'N-2: a void is still refused after ideas.opened_at was moved to now (the sealed open decides)');
reset role;
select throws_ok($$ insert into public.idea_events (idea_id, kind, stance, body_md)
    values ((select v from ctx where k = 'i4'), 'void', '{}', 'Written straight into the table.') $$,
  'P0001', 'ledger:void_too_late', 'N-2: the seal trigger itself refuses a late void, whoever inserts it');
select throws_ok($$ insert into public.idea_events (idea_id, kind, stance, body_md)
    values (gen_random_uuid(), 'void', '{}', 'A void for an idea with no sealed open event.') $$,
  'P0001', 'ledger:void_too_late', 'a void with no sealed open event to measure from is refused (fail closed)');
-- put the fixture back: the sealed open event and the projection agree again
select pg_temp.set_open((select v from ctx where k = 'i4'), (select o.recorded_at from open_times o where o.idea_id = (select v from ctx where k = 'i4')));
update public.ideas i set opened_at = (select o.recorded_at from open_times o where o.idea_id = i.id) where i.id = (select v from ctx where k = 'i4');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
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
select is((select count(*) from public.verify_ledger_chain() where ok), 1::bigint,
  'with the fixture put back, the sealed open event and the ideas row agree and the chain verifies');

-- Void window (spec D5, amended): until the EARLIER of 24 hours and the next 15:00 IST after opening.
select is(private.idea_void_deadline('2026-03-02 14:59:59+05:30'), '2026-03-02 15:00:00+05:30'::timestamptz,
  'opened one second before 15:00 IST: the window closes at 15:00 the same day');
select is(private.idea_void_deadline('2026-03-02 15:00:00+05:30'), '2026-03-03 15:00:00+05:30'::timestamptz,
  'opened at 15:00:00 IST sharp: that close is already gone, so the window runs to 15:00 the next day (24 hours)');
select is(private.idea_void_deadline('2026-03-02 15:00:01+05:30'), '2026-03-03 15:00:00+05:30'::timestamptz,
  'opened one second after 15:00 IST: the window closes at 15:00 the next day (under 24 hours)');
select is(private.idea_void_deadline('2026-03-02 00:00:00+05:30'), '2026-03-02 15:00:00+05:30'::timestamptz,
  'opened at midnight IST: 15 hours, not 24');
select is(private.idea_void_deadline('2026-03-02 09:30:00+00'), '2026-03-03 15:00:00+05:30'::timestamptz,
  'the zone of the input does not matter: 09:30Z is 15:00 IST sharp, so the window runs to the next day');
select is(private.idea_void_deadline('2026-03-02 23:50:00+05:30'), '2026-03-03 15:00:00+05:30'::timestamptz,
  'opened late evening IST: the window closes at 15:00 IST the next day');
-- Entry-close cut-off, independent of the hour the suite runs: b is the latest 15:00 IST that is at least a second old.
-- The sealed open of i5 is dated one second before it (14:59:59 IST), so its window ended at b; the void below is sealed
-- after b (always) and less than 24 hours after the open (always, except within two seconds of 15:00 IST), which is exactly
-- what the old 24-hour rule would have allowed.
create temp table cutoff as
  select case when b0 > now() - interval '1 second' then b0 - interval '1 day' else b0 end as b
    from (select (date_trunc('day', (now() - interval '1 second') at time zone 'Asia/Kolkata') + interval '15 hours')
                   at time zone 'Asia/Kolkata' as b0) t;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into ctx select 'i5', public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 90, true, 'Opened, then the close came.') $$,
  'a fifth idea opens');
reset role;
insert into open_times select e.idea_id, e.recorded_at from public.idea_events e
 where e.kind = 'open' and e.idea_id = (select v from ctx where k = 'i5');
select pg_temp.set_open((select v from ctx where k = 'i5'), (select b - interval '1 second' from cutoff));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i5'), 'void', 'Too late for the entry close.') $$,
  'P0001', 'ledger:void_too_late', 'void is refused once the 15:00 IST entry close has passed, inside the 24 hours');
reset role;
select pg_temp.set_open((select v from ctx where k = 'i5'), (select o.recorded_at from open_times o where o.idea_id = (select v from ctx where k = 'i5')));

-- One direction at a time per company.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.open_idea('cccccccc-0000-4000-8000-000000000001', 'underperform', 90, false, 'The other side.') $$,
  'P0001', 'ledger:opposite_open', 'an opposite idea cannot be opened while an open idea on the company exists');
select lives_ok($$ select public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 90, true, 'Same side again.') $$,
  'the same direction can be opened again');
select lives_ok($$ select public.open_idea('cccccccc-0000-4000-8000-000000000003', 'outperform', 90, true, 'Beta: the earlier underperform idea is closed.') $$,
  'a closed idea does not block the opposite direction (Beta)');
select throws_ok($$ select public.open_idea('cccccccc-0000-4000-8000-000000000003', 'underperform', 90, false, 'Now it is open on the other side.') $$,
  'P0001', 'ledger:opposite_open', 'but the new open idea now blocks the first direction (Beta)');

-- Words: all whitespace counts as nothing, and the cap is on the text as typed.
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', E'\n') $$, 'P0001', 'ledger:words_required', 'a lone newline is not words');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', E'\t') $$, 'P0001', 'ledger:words_required', 'a lone tab is not words');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', E' \r\n\f\v ') $$, 'P0001', 'ledger:words_required', 'mixed ASCII whitespace is not words');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', chr(160) || chr(8203) || chr(65279)) $$,
  'P0001', 'ledger:words_required', 'no-break space, zero-width space and byte-order mark are not words');
select throws_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', repeat(' ', 10000) || 'x') $$,
  'P0001', 'ledger:words_required', 'one letter padded to 10,001 characters is refused (the cap is on the raw text)');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', repeat(chr(233), 10000)) $$,
  'exactly 10,000 characters is accepted');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note',
    'q"uote \ back' || E'\n\t' || 'ünï 日本語 ' || chr(128512) || '", "nonce" : "00000000-0000-0000-0000-000000000000"}' || E'\r') $$,
  'hostile words (quotes, backslash, newline, tab, non-ASCII, emoji, a fake JSON tail) are accepted');
reset role;
select is((select e.canonical::jsonb ->> 'words' = e.body_md and left(e.body_md, 13) = 'q"uote \ back'
             and e.canonical::jsonb ->> 'nonce' = e.nonce::text and e.nonce <> '00000000-0000-0000-0000-000000000000'
             from public.idea_events e order by e.seq desc limit 1),
  true, 'the hostile words are sealed byte for byte and cannot forge the nonce');

-- Time zone and date style of the session do not change what is sealed or how it is checked.
set local timezone = 'Asia/Kolkata';
set local datestyle = 'SQL, DMY';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', 'Written from a session set to IST.') $$,
  'an event is sealed from a session set to Asia/Kolkata with DMY dates');
reset role;
select ok((select (e.canonical::jsonb ->> 'at') ~ 'Z$'
             and (e.canonical::jsonb ->> 'at')::timestamptz = e.recorded_at
             and (e.canonical::jsonb ->> 'at') = to_char(e.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
             from public.idea_events e order by e.seq desc limit 1),
  'under an IST session the sealed time is still UTC, ends in Z, and is the same instant as recorded_at');
select is((select count(*) from public.verify_ledger_chain() where ok), 1::bigint, 'the chain verifies under an IST session');
reset timezone;
reset datestyle;
select is((select count(*) from public.verify_ledger_chain() where ok), 1::bigint, 'and again under the default session');

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

-- Fail-closed (review I-2) and the self-consistency limits (review I-1). From here the helpers re-hash from a seq
-- (what a rewriter with the triggers off would do) and put the whole table back from a snapshot.
create temp table saved_all as select * from public.idea_events;
create function pg_temp.rehash_from(p_seq bigint) returns void language plpgsql as $f$
declare r record; v_prev text;
begin
  select e.hash into v_prev from public.idea_events e where e.seq = p_seq - 1;
  v_prev := coalesce(v_prev, repeat('0', 64));
  for r in select * from public.idea_events where seq >= p_seq order by seq loop
    update public.idea_events
       set prev_hash = v_prev, hash = encode(sha256(convert_to(v_prev || E'\n' || r.canonical, 'UTF8')), 'hex')
     where seq = r.seq returning hash into v_prev;
  end loop;
end $f$;
create function pg_temp.restore_all() returns void language plpgsql as $f$
begin
  delete from public.idea_events;
  insert into public.idea_events (id, seq, idea_id, kind, recorded_at, stance, body_md, nonce, canonical, prev_hash, hash)
    select id, seq, idea_id, kind, recorded_at, stance, body_md, nonce, canonical, prev_hash, hash from pg_temp.saved_all order by seq;
end $f$;

-- a sealed text that lost, gained, renamed or changed a key, with every hash recomputed to agree
update public.idea_events set canonical = (canonical::jsonb - 'nonce')::text where seq = 2;
select pg_temp.rehash_from(2);
select is((select first_bad_seq from public.verify_ledger_chain()), 2::bigint, 'a sealed text missing a key is caught even though every hash agrees');
select pg_temp.restore_all();
update public.idea_events set canonical = (canonical::jsonb || '{"price": 101.5}')::text where seq = 2;
select pg_temp.rehash_from(2);
select is((select first_bad_seq from public.verify_ledger_chain()), 2::bigint, 'a sealed text with an extra key (a price) is caught');
select pg_temp.restore_all();
update public.idea_events set canonical = replace(canonical, '"words"', '"wurds"') where seq = 2;
select pg_temp.rehash_from(2);
select is((select first_bad_seq from public.verify_ledger_chain()), 2::bigint, 'a sealed text with a renamed key is caught');
select pg_temp.restore_all();
update public.idea_events set canonical = jsonb_set(canonical::jsonb, '{v}', '2')::text where seq = 2;
select pg_temp.rehash_from(2);
select is((select first_bad_seq from public.verify_ledger_chain()), 2::bigint, 'a sealed text claiming another version is caught');
select pg_temp.restore_all();
update public.idea_events set canonical = jsonb_set(canonical::jsonb, '{company_id}', 'null')::text where seq = 2;
select pg_temp.rehash_from(2);
select is((select first_bad_seq from public.verify_ledger_chain()), 2::bigint, 'a sealed text with a null company id is caught');
select pg_temp.restore_all();
select is((select ok from public.verify_ledger_chain()), true, 'restored from the snapshot: the chain verifies');

-- a NULL column must fail the check, not slip through it
alter table public.idea_events alter column nonce drop not null;
update public.idea_events set nonce = null where seq = 2;
select is((select first_bad_seq from public.verify_ledger_chain()), 2::bigint, 'a NULL column (nonce) is caught: the comparison fails closed');
select pg_temp.restore_all();
alter table public.idea_events alter column nonce set not null;
select is((select ok from public.verify_ledger_chain()), true, 'restored: nonce is NOT NULL again and the chain verifies');

-- one column at a time, with the sealed text left alone
update public.idea_events set idea_id = (select v from ctx where k = 'i2') where seq = 2;
select is((select first_bad_seq from public.verify_ledger_chain()), 2::bigint, 'an event moved onto another idea (idea_id) is caught');
select pg_temp.restore_all();
update public.idea_events set kind = 'revise' where seq = 2;
select is((select first_bad_seq from public.verify_ledger_chain()), 2::bigint, 'a changed kind is caught');
select pg_temp.restore_all();
update public.idea_events set nonce = gen_random_uuid() where seq = 2;
select is((select first_bad_seq from public.verify_ledger_chain()), 2::bigint, 'a changed nonce is caught');
select pg_temp.restore_all();
update public.idea_events set id = gen_random_uuid() where seq = 2;
select is((select first_bad_seq from public.verify_ledger_chain()), 2::bigint, 'a changed event id is caught');
select pg_temp.restore_all();

-- a time that steps back against the previous seq, hashes and sealed text re-agreeing
update public.idea_events e
   set recorded_at = n.t, canonical = replace(e.canonical, e.canonical::jsonb ->> 'at', to_char(n.t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
  from (select x.recorded_at - interval '1 second' as t from public.idea_events x where x.seq = 2) n
 where e.seq = 3;
select pg_temp.rehash_from(3);
select is((select first_bad_seq from public.verify_ledger_chain()), 3::bigint, 'an event dated before the one ahead of it is caught');
select pg_temp.restore_all();

-- KNOWN LIMITS (review I-1). These pass the chain check, because nothing inside the table can tell them from the truth.
-- Only a comparison with the days already sealed and published (Task 3, Task 8) can. Pinned so nobody claims otherwise.
update public.idea_events set body_md = 'Monsoon failed.', canonical = replace(canonical, 'Monsoon is on track.', 'Monsoon failed.') where seq = 2;
select pg_temp.rehash_from(2);
select is((select ok from public.verify_ledger_chain()), true,
  'KNOWN LIMIT: a rewritten event whose hash and every later hash are recomputed still verifies (the chain is consistent with itself, not proof of no change)');
select pg_temp.restore_all();
delete from public.idea_events where seq = (select max(seq) from pg_temp.saved_all);
select is((select ok from public.verify_ledger_chain()), true,
  'KNOWN LIMIT: a removed last event (a note) still verifies; only the sealed days can witness it');
select pg_temp.restore_all();
select is((select ok from public.verify_ledger_chain()), true, 'restored from the snapshot: the chain verifies');

-- The replay: the ideas table against what the sealed events say (review I-3). Hashes are untouched in all of these.
alter table public.ideas disable trigger ideas_guard_update;
create temp table saved_ideas as select * from public.ideas;
create function pg_temp.restore_ideas() returns void language sql as $f$
  update public.ideas i
     set company_id = s.company_id, item_id = s.item_id, expects = s.expects, horizon_days = s.horizon_days, held = s.held,
         status = s.status, opened_at = s.opened_at, closed_at = s.closed_at, close_reason = s.close_reason,
         process_call = s.process_call
    from pg_temp.saved_ideas s where s.id = i.id
$f$;
select is((select ok from public.verify_ledger_chain()), true, 'before the replay attacks the ideas agree with their events');

update public.ideas set status = 'open', closed_at = null, close_reason = null where id = (select v from ctx where k = 'i2');
select is((select bad_idea from public.verify_ledger_chain()), (select v from ctx where k = 'i2'),
  'a closed idea turned back to open is reported by id');
select is((select first_bad_seq from public.verify_ledger_chain()), (select min(seq) from public.idea_events where idea_id = (select v from ctx where k = 'i2')),
  'and by the first seq of its events');
select pg_temp.restore_ideas();
update public.ideas set company_id = 'cccccccc-0000-4000-8000-000000000001' where id = (select v from ctx where k = 'i2');
select is((select bad_idea from public.verify_ledger_chain()), (select v from ctx where k = 'i2'),
  'an idea re-pointed at another company is reported (the company id is sealed)');
select pg_temp.restore_ideas();
update public.ideas set opened_at = opened_at + interval '1 hour' where id = (select v from ctx where k = 'i1');
select is((select bad_idea from public.verify_ledger_chain()), (select v from ctx where k = 'i1'), 'a moved opened_at is reported');
select pg_temp.restore_ideas();
update public.ideas set closed_at = closed_at + interval '1 hour' where id = (select v from ctx where k = 'i2');
select is((select bad_idea from public.verify_ledger_chain()), (select v from ctx where k = 'i2'), 'a moved closed_at is reported');
select pg_temp.restore_ideas();
update public.ideas set expects = 'underperform' where id = (select v from ctx where k = 'i1');
select is((select bad_idea from public.verify_ledger_chain()), (select v from ctx where k = 'i1'), 'a flipped direction is reported');
select pg_temp.restore_ideas();
update public.ideas set horizon_days = 60 where id = (select v from ctx where k = 'i1');
select is((select bad_idea from public.verify_ledger_chain()), (select v from ctx where k = 'i1'), 'a changed horizon is reported');
select pg_temp.restore_ideas();
update public.ideas set held = not held where id = (select v from ctx where k = 'i1');
select is((select bad_idea from public.verify_ledger_chain()), (select v from ctx where k = 'i1'), 'a flipped held flag is reported');
select pg_temp.restore_ideas();
update public.ideas set process_call = 'sound' where id = (select v from ctx where k = 'i2');
select is((select bad_idea from public.verify_ledger_chain()), (select v from ctx where k = 'i2'), 'a changed process call is reported');
select pg_temp.restore_ideas();
update public.ideas set close_reason = 'other' where id = (select v from ctx where k = 'i2');
select is((select bad_idea from public.verify_ledger_chain()), (select v from ctx where k = 'i2'), 'a changed close reason is reported');
select pg_temp.restore_ideas();
update public.ideas set status = 'open' where id = (select v from ctx where k = 'i3');
select is((select bad_idea from public.verify_ledger_chain()), (select v from ctx where k = 'i3'), 'a void idea shown as open is reported');
select pg_temp.restore_ideas();
insert into public.ideas (id, company_id, expects, horizon_days, held)
  values ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'outperform', 365, true);
select is((select bad_idea from public.verify_ledger_chain()), 'dddddddd-0000-4000-8000-000000000001'::uuid,
  'an idea with no sealed open event is reported');
delete from public.ideas where id = 'dddddddd-0000-4000-8000-000000000001';
select is((select ok from public.verify_ledger_chain()), true, 'restored: ideas and events agree again');
alter table public.ideas enable trigger ideas_guard_update;

alter table public.idea_events enable trigger user;
select is((select count(*) from pg_trigger t where t.tgrelid = 'public.idea_events'::regclass and not t.tgisinternal and t.tgenabled <> 'O'),
  0::bigint, 'every idea_events trigger is enabled again');
select throws_ok($$ update public.idea_events set body_md = 'edited' where seq = 1 $$, 'P0001', null,
  'the append-only trigger works again');
select is((select count(*) from public.verify_ledger_chain() where ok and events = (select count(*) from public.idea_events)), 1::bigint,
  'the final chain verifies end to end');

-- N-2, the replay: a void sealed after the deadline counted from the sealed open time is reported even when every hash agrees.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into ctx select 'i6', public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 90, true, 'Typo, to be withdrawn at once.') $$,
  'a sixth idea opens');
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i6'), 'void', 'Withdrawn straight away.') $$,
  'and is withdrawn inside its window');
reset role;
select is((select count(*) from public.verify_ledger_chain() where ok), 1::bigint, 'a void sealed inside its window verifies');
create function pg_temp.shift_last(p_by interval) returns void language plpgsql as $f$
declare v_seq bigint := (select max(x.seq) from public.idea_events x);
begin
  update public.idea_events e
     set recorded_at = e.recorded_at + p_by,
         canonical = replace(e.canonical, e.canonical::jsonb ->> 'at',
                             to_char((e.recorded_at + p_by) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
   where e.seq = v_seq;
  perform pg_temp.rehash_from(v_seq);
end $f$;
alter table public.idea_events disable trigger user;
select pg_temp.shift_last(interval '3 days');
select is((select bad_idea from public.verify_ledger_chain()), (select v from ctx where k = 'i6'),
  'N-2: a void dated three days after its sealed open (sealed text and every hash re-agreeing) is reported by the replay');
select pg_temp.shift_last(interval '-3 days');
alter table public.idea_events enable trigger user;
select is((select count(*) from public.verify_ledger_chain() where ok), 1::bigint, 'put back: the chain verifies again');

-- The seal never lets a time step back: even if the previous event is dated ahead of the clock (a clock correction).
alter table public.idea_events disable trigger user;
update public.idea_events set recorded_at = recorded_at + interval '2 days' where seq = (select max(seq) from public.idea_events);
alter table public.idea_events enable trigger user;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.add_idea_event((select v from ctx where k = 'i1'), 'note', 'Sealed after the clock stepped back.') $$,
  'an event is sealed while the previous one is dated in the future');
reset role;
select ok((select e.recorded_at >= p.recorded_at from public.idea_events e join public.idea_events p on p.seq = e.seq - 1
            where e.seq = (select max(seq) from public.idea_events)),
  'the new event is dated no earlier than the one before it');

select * from finish();
rollback;
