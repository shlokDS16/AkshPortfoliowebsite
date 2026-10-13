-- 20261013000013_ledger_anchors.sql: one sealed fingerprint line per IST day, and the comparison of every sealed day with the
-- events as they stand now (Plan 3a Task 3; spec s5.5, s9, s17; ADR-005 s3.3). The point of the file: the chain check alone is
-- blind to an owner who rewrites an event and re-hashes everything after it; the anchors are what catches that.
-- Calendar: March 2026. Events sit at Mar 2 10:00 IST, Mar 2 23:59 IST, Mar 3 00:01 IST, Mar 5 12:00 IST, Mar 5 18:00 IST
-- and one event "now". Fixtures move event times with the triggers off and RE-SEAL the whole chain (pg_temp.reseal), so
-- the chain check passes; the tamper scenarios do the same on purpose, as a database owner could.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(135);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');
insert into public.companies (id, slug, name, nse_symbol, isin) values
  ('cccccccc-0000-4000-8000-000000000001', 'kav', 'Kaveri Seed', 'KSCL', 'INE455F01025');
-- The owner plays the admin session for fixtures (the writers read the caller from the claims, not the role).
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 1. Structure and privileges.
select has_table('public', 'ledger_anchors', 'ledger_anchors exists');
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.ledger_anchors'::regclass), 'RLS is enabled');
select has_function('public', 'seal_ledger_days', array[]::name[], 'seal_ledger_days() exists');
select has_function('public', 'verify_ledger_anchors', array[]::name[], 'verify_ledger_anchors() exists');
select has_function('public', 'check_ledger_anchors', array[]::name[], 'check_ledger_anchors() exists');
select is_empty($$
  select 1 where has_table_privilege('anon', 'public.ledger_anchors', 'select,insert,update,delete,truncate,references,trigger')
     or has_any_column_privilege('anon', 'public.ledger_anchors', 'select,insert,update,references')
$$, 'anon holds no privilege on ledger_anchors');
select ok(has_table_privilege('service_role', 'public.ledger_anchors', 'select')
      and not has_table_privilege('service_role', 'public.ledger_anchors', 'insert,update,delete,truncate,references,trigger')
      and has_column_privilege('service_role', 'public.ledger_anchors', 'published_at', 'update')
      and has_column_privilege('service_role', 'public.ledger_anchors', 'anchor_version', 'update')
      and not has_column_privilege('service_role', 'public.ledger_anchors', 'line', 'update')
      and not has_column_privilege('service_role', 'public.ledger_anchors', 'head_hash', 'update')
      and not has_column_privilege('service_role', 'public.ledger_anchors', 'event_count', 'update')
      and not has_column_privilege('service_role', 'public.ledger_anchors', 'anchor_date', 'update')
      and not has_any_column_privilege('service_role', 'public.ledger_anchors', 'insert,references'),
  'service_role reads anchors and may update published_at and anchor_version only');
select ok(has_table_privilege('authenticated', 'public.ledger_anchors', 'select')
      and not has_table_privilege('authenticated', 'public.ledger_anchors', 'insert,delete,truncate,references,trigger')
      and not has_any_column_privilege('authenticated', 'public.ledger_anchors', 'insert,update,references'),
  'authenticated may only read anchors');
select is_empty($$
  select p.polname from pg_policy p
   where p.polrelid = 'public.ledger_anchors'::regclass
     and (p.polroles = '{0}'::oid[] or p.polroles @> array['anon'::regrole::oid] or p.polcmd <> 'r')
$$, 'the only policy on ledger_anchors is a SELECT policy and it does not reach anon or PUBLIC');
select ok(not has_function_privilege('anon', 'public.seal_ledger_days()', 'execute')
      and not has_function_privilege('anon', 'public.verify_ledger_anchors()', 'execute')
      and not has_function_privilege('anon', 'public.check_ledger_anchors()', 'execute'),
  'anon cannot execute any anchor function');
select ok(has_function_privilege('service_role', 'public.seal_ledger_days()', 'execute')
      and has_function_privilege('service_role', 'public.verify_ledger_anchors()', 'execute')
      and not has_function_privilege('service_role', 'public.check_ledger_anchors()', 'execute')
      and not has_function_privilege('authenticated', 'public.seal_ledger_days()', 'execute')
      and not has_function_privilege('authenticated', 'public.verify_ledger_anchors()', 'execute')
      and has_function_privilege('authenticated', 'public.check_ledger_anchors()', 'execute'),
  'sealing and the job comparison are service_role only; the admin comparison is authenticated only');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in ('anchor_line_v1', 'ledger_anchor_check', 'seal_ledger_days_to', 'guard_ledger_anchor')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute'))
$$, 'the private anchor helpers are executable by no API role');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.proname in ('seal_ledger_days', 'verify_ledger_anchors', 'check_ledger_anchors', 'ledger_anchor_check',
                       'seal_ledger_days_to', 'anchor_line_v1', 'guard_ledger_anchor')
     and (not ('search_path=""' = any (coalesce(p.proconfig, '{}'::text[])))
          or (not p.prosecdef and p.proname not in ('anchor_line_v1', 'guard_ledger_anchor')))
$$, 'every anchor function pins an empty search_path and the callable ones are SECURITY DEFINER');

-- 2. Nothing sealed yet and no event yet: the comparison is ok over zero days and sealing writes nothing.
select is((select count(*) from public.verify_ledger_anchors() where ok and days = 0 and first_bad_date is null and reason is null),
  1::bigint, 'no anchors: the comparison is ok over 0 days');
select is(private.seal_ledger_days_to(date '2026-03-06'), 0, 'no event yet: sealing returns 0');
set local role service_role;
select is(public.seal_ledger_days(), 0, 'no event yet: the service_role door also returns 0');
reset role;
select is((select count(*) from public.ledger_anchors), 0::bigint, 'no event yet: no anchor row was written');

-- 3. Fixtures: one idea, six events.
create temp table ctx (k text primary key, v uuid);
create function pg_temp.at(p_words text, p_ist text) returns void language plpgsql as $$
begin
  alter table public.idea_events disable trigger user;
  update public.idea_events set recorded_at = (p_ist::timestamp at time zone 'Asia/Kolkata') where body_md = p_words;
  alter table public.idea_events enable trigger user;
end $$;
-- Re-seal the whole chain exactly as the seal trigger would have: order by time, renumber, rebuild every sealed text,
-- re-hash. This is what an owner who rewrites history would do; the ledger check then passes.
create function pg_temp.reseal() returns void language plpgsql as $$
declare
  r record; v_prev text := repeat('0', 64); v_seq bigint := 0; v_canon text; v_hash text;
begin
  alter table public.idea_events disable trigger user;
  alter table public.ideas disable trigger ideas_guard_update;
  update public.idea_events set seq = -seq;
  for r in select e.*, c.id as cid, c.nse_symbol as csym, c.isin as cisin, c.name as cname
             from public.idea_events e join public.ideas i on i.id = e.idea_id join public.companies c on c.id = i.company_id
            order by e.recorded_at, e.seq desc loop
    v_seq := v_seq + 1;
    v_canon := json_build_object('v', 1, 'seq', v_seq, 'id', r.id, 'idea', r.idea_id, 'kind', r.kind,
      'at', to_char(r.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'company_id', r.cid, 'symbol', r.csym, 'isin', r.cisin, 'company', r.cname,
      'stance', r.stance, 'words', r.body_md, 'nonce', r.nonce)::text;
    v_hash := encode(sha256(convert_to(v_prev || E'\n' || v_canon, 'UTF8')), 'hex');
    update public.idea_events set seq = v_seq, prev_hash = v_prev, canonical = v_canon, hash = v_hash where id = r.id;
    v_prev := v_hash;
  end loop;
  update public.ideas i set opened_at = (select e.recorded_at from public.idea_events e where e.idea_id = i.id and e.kind = 'open');
  alter table public.ideas enable trigger ideas_guard_update;
  alter table public.idea_events enable trigger user;
end $$;

insert into ctx select 'i1', public.open_idea('cccccccc-0000-4000-8000-000000000001', 'outperform', 365, true, 'Open words alpha');
select public.add_idea_event((select v from ctx where k = 'i1'), 'note', 'Note beta');
select public.add_idea_event((select v from ctx where k = 'i1'), 'note', 'Note gamma');
select public.add_idea_event((select v from ctx where k = 'i1'), 'note', 'Note delta');
select public.add_idea_event((select v from ctx where k = 'i1'), 'note', 'Note epsilon');
select public.add_idea_event((select v from ctx where k = 'i1'), 'note', 'Note zeta, written today');
select pg_temp.at('Open words alpha', '2026-03-02 10:00');
select pg_temp.at('Note beta',        '2026-03-02 23:59');
select pg_temp.at('Note gamma',       '2026-03-03 00:01');
select pg_temp.at('Note delta',       '2026-03-05 12:00');
select pg_temp.at('Note epsilon',     '2026-03-05 18:00');
select pg_temp.reseal();
select is((select ok from public.verify_ledger_chain()), true, 'fixtures: the re-sealed chain verifies');
select is((select string_agg(left(body_md, 9), '|' order by seq) from public.idea_events),
  'Open word|Note beta|Note gamm|Note delt|Note epsi|Note zeta', 'fixtures: events are in time order, seq 1 to 6');

-- 4. Sealing: Mar 2 to Mar 5 are sealed, in a session whose time zone is not IST. Today's event (seq 6) is not.
set local timezone = 'America/Los_Angeles';
select is(private.seal_ledger_days_to(date '2026-03-06'), 4, 'four closed days are sealed (Mar 2, 3, 4, 5)');
set local timezone = 'UTC';
select is((select string_agg(anchor_date::text || ':' || event_count, ' ' order by anchor_date) from public.ledger_anchors),
  '2026-03-02:2 2026-03-03:1 2026-03-04:0 2026-03-05:2',
  'IST day boundaries: 23:59 IST on Mar 2 and 00:01 IST on Mar 3 are different days whatever the session zone (Mar 2: 2, Mar 3: 1)');
select is((select string_agg(coalesce(first_seq::text, '-') || '-' || coalesce(last_seq::text, '-'), ' ' order by anchor_date) from public.ledger_anchors),
  '1-2 3-3 --- 4-5', 'first and last seq per day; the empty day has none');
select is((select head_hash from public.ledger_anchors where anchor_date = '2026-03-02'), (select hash from public.idea_events where seq = 2),
  'a day''s head is its last event hash');
select is((select head_hash from public.ledger_anchors where anchor_date = '2026-03-04'), (select hash from public.idea_events where seq = 3),
  'the empty day repeats the previous head');
select is((select head_hash from public.ledger_anchors where anchor_date = '2026-03-05'), (select hash from public.idea_events where seq = 5),
  'the head moves on again after the empty day');
select is((select line from public.ledger_anchors where anchor_date = '2026-03-02'),
  format('{"v":1,"date":"2026-03-02","count":2,"first_seq":1,"last_seq":2,"hashes":["%s","%s"],"head":"%s"}',
    (select hash from public.idea_events where seq = 1), (select hash from public.idea_events where seq = 2),
    (select hash from public.idea_events where seq = 2)),
  'the stored line is the compact JSON with the day''s event hashes in seq order');
select is((select line from public.ledger_anchors where anchor_date = '2026-03-04'),
  format('{"v":1,"date":"2026-03-04","count":0,"first_seq":null,"last_seq":null,"hashes":[],"head":"%s"}',
    (select hash from public.idea_events where seq = 3)),
  'an empty day is a count-0 line with the previous head');
select is((select array_agg(k order by k) from public.ledger_anchors a, jsonb_object_keys(a.line::jsonb) k where a.anchor_date = '2026-03-02'),
  array['count', 'date', 'first_seq', 'hashes', 'head', 'last_seq', 'v'],
  'a line holds exactly v, date, count, first_seq, last_seq, hashes and head');
select is_empty($$
  select a.anchor_date from public.ledger_anchors a
   where a.line ~* '(kaveri|kscl|INE455|alpha|beta|gamma|delta|epsilon|zeta|outperform|close)'
$$, 'no line holds a company, a symbol, an ISIN, a word of Aksh''s or a price');
select is((select count(*) from public.ledger_anchors where line like '%' || (select hash from public.idea_events where seq = 6) || '%'),
  0::bigint, 'today''s event is in no line');
select is((select count(*) from public.ledger_anchors where anchor_date >= (now() at time zone 'Asia/Kolkata')::date), 0::bigint,
  'no row for today (the still-open day)');
select is((select count(*) from public.ledger_anchors where published_at is not null or anchor_version is not null), 0::bigint,
  'a new row is unpublished');

-- 5. Idempotent: a second pass seals nothing, changes nothing.
create temp table anchors_before as select * from public.ledger_anchors;
select is(private.seal_ledger_days_to(date '2026-03-06'), 0, 'a second pass seals nothing');
select is((select count(*) from public.ledger_anchors a join anchors_before b using (anchor_date)
            where a.line = b.line and a.head_hash = b.head_hash and a.created_at = b.created_at), 4::bigint,
  'and the four rows are unchanged');
select is(private.seal_ledger_days_to(date '2026-03-05'), 0, 'a "today" that is not later than the last sealed day seals nothing');
set local role service_role;
select is((select count(*) from public.verify_ledger_anchors() where ok and days = 4 and first_bad_date is null), 1::bigint,
  'an untouched ledger: the job comparison is ok over 4 days');
reset role;
select is((select count(*) from public.verify_ledger_anchors() where ok), 1::bigint, 'untouched, again under the owner');
set local timezone = 'Pacific/Kiritimati';
select is((select ok from public.verify_ledger_anchors()), true, 'the comparison does not depend on the session time zone (UTC+14)');
set local timezone = 'UTC';

-- 6. Who can do what to an anchor row.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.ledger_anchors), 4::bigint, 'the admin reads the anchors');
select is((select count(*) from public.check_ledger_anchors() where ok and days = 4), 1::bigint, 'the admin runs the comparison');
select throws_ok($$ update public.ledger_anchors set published_at = now() $$, '42501', null, 'the admin cannot update an anchor');
select throws_ok($$ delete from public.ledger_anchors $$, '42501', null, 'the admin cannot delete an anchor');
select throws_ok($$ insert into public.ledger_anchors (anchor_date, event_count, head_hash, line)
  values ('2026-03-06', 0, repeat('0', 64), '{}') $$, '42501', null, 'the admin cannot insert an anchor');
select throws_ok($$ select public.seal_ledger_days() $$, '42501', null, 'the admin cannot seal');
select throws_ok($$ select * from public.verify_ledger_anchors() $$, '42501', null, 'the admin cannot run the job comparison');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.ledger_anchors), 0::bigint, 'a signed-in non-admin sees no anchor');
select throws_ok($$ select * from public.check_ledger_anchors() $$, '42501', null, 'a non-admin cannot run the comparison');
reset role;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select count(*) from public.ledger_anchors $$, '42501', null, 'anon cannot read anchors');
select throws_ok($$ select public.seal_ledger_days() $$, '42501', null, 'anon cannot seal');
select throws_ok($$ select * from public.check_ledger_anchors() $$, '42501', null, 'anon cannot run the comparison');
reset role;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

set local role service_role;
select is((select count(*) from public.ledger_anchors), 4::bigint, 'service_role reads the anchors');
select throws_ok($$ update public.ledger_anchors set line = '{}' $$, '42501', null, 'service_role cannot change a line');
select throws_ok($$ update public.ledger_anchors set head_hash = repeat('a', 64) $$, '42501', null, 'service_role cannot change a head');
select throws_ok($$ update public.ledger_anchors set event_count = 9 $$, '42501', null, 'service_role cannot change a count');
select throws_ok($$ delete from public.ledger_anchors $$, '42501', null, 'service_role cannot delete an anchor');
select throws_ok($$ insert into public.ledger_anchors (anchor_date, event_count, head_hash, line)
  values ('2026-03-06', 0, repeat('0', 64), '{}') $$, '42501', null, 'service_role cannot insert an anchor');
select lives_ok($$ update public.ledger_anchors set published_at = now(), anchor_version = 'v-one' where anchor_date = '2026-03-02' $$,
  'service_role records that a day was published, once');
select throws_ok($$ update public.ledger_anchors set published_at = now(), anchor_version = 'v-two' where anchor_date = '2026-03-02' $$,
  'P0001', null, 'and not twice');
select throws_ok($$ update public.ledger_anchors set anchor_version = 'v-two' where anchor_date = '2026-03-02' $$,
  'P0001', null, 'a published day''s version cannot be changed on its own');
select throws_ok($$ update public.ledger_anchors set published_at = null where anchor_date = '2026-03-02' $$,
  'P0001', null, 'a day cannot be un-published');
select throws_ok($$ update public.ledger_anchors set anchor_version = 'v-x' where anchor_date = '2026-03-03' $$,
  'P0001', null, 'a version without a publication time is refused');
select throws_ok($$ update public.ledger_anchors set published_at = now() - interval '1 day' where anchor_date = '2026-03-03' $$,
  'P0001', null, 'a publication time before the day was sealed is refused');
select throws_ok($$ update public.ledger_anchors set published_at = now() + interval '1 day' where anchor_date = '2026-03-03' $$,
  'P0001', null, 'a publication time in the future is refused');
reset role;
select is((select count(*) from public.ledger_anchors where published_at is not null), 1::bigint, 'exactly one day is marked published');
select is((select anchor_version from public.ledger_anchors where anchor_date = '2026-03-02'), 'v-one', 'with the version it was given');

-- The table owner cannot do it either without switching the guard off (the triggers are the integrity layer).
select throws_ok($$ update public.ledger_anchors set line = '{}' where anchor_date = '2026-03-03' $$, 'P0001', null,
  'even the owner cannot change a sealed line');
select throws_ok($$ update public.ledger_anchors set head_hash = repeat('a', 64) where anchor_date = '2026-03-03' $$, 'P0001', null,
  'even the owner cannot change a sealed head');
select throws_ok($$ update public.ledger_anchors set anchor_date = '2026-04-01' where anchor_date = '2026-03-03' $$, 'P0001', null,
  'even the owner cannot move a sealed day');
select throws_ok($$ delete from public.ledger_anchors where anchor_date = '2026-03-03' $$, 'P0001', null, 'even the owner cannot delete an anchor');
select throws_ok($$ truncate public.ledger_anchors $$, 'P0001', null, 'even the owner cannot truncate the anchors');
select throws_ok($$ insert into public.ledger_anchors (anchor_date, event_count, first_seq, last_seq, head_hash, line)
  select anchor_date, event_count, first_seq, last_seq, head_hash, line from public.ledger_anchors where anchor_date = '2026-03-03' $$,
  '23505', null, 'a day cannot be sealed twice');
select throws_ok($$ insert into public.ledger_anchors (anchor_date, event_count, head_hash, line)
  values ('2026-03-09', -1, repeat('0', 64), '{"v":1}') $$, '23514', null, 'a negative count is refused');
select throws_ok($$ insert into public.ledger_anchors (anchor_date, event_count, first_seq, last_seq, head_hash, line)
  values ('2026-03-09', 0, 1, 1, repeat('0', 64), '{"v":1,"date":"2026-03-09","count":0,"head":"' || repeat('0', 64) || '"}') $$,
  '23514', null, 'an empty day with a seq range is refused');
select throws_ok($$ insert into public.ledger_anchors (anchor_date, event_count, head_hash, line)
  values ('2026-03-09', 0, repeat('0', 64), '{"v":1,"date":"2026-03-10","count":0,"head":"' || repeat('0', 64) || '"}') $$,
  '23514', null, 'a line that names another date than its row is refused');

-- 7. Tamper scenarios, as a database owner would do them: triggers off, rewrite, re-seal the whole chain.
create temp table sv_ev as select * from public.idea_events;
create temp table sv_an as select * from public.ledger_anchors;
-- `enable trigger user` would put the anchor guards back in origin mode and silently downgrade them; they must be ALWAYS.
create function pg_temp.anchor_guards_on() returns void language plpgsql as $$
begin
  alter table public.ledger_anchors enable always trigger ledger_anchors_guard;
  alter table public.ledger_anchors enable always trigger ledger_anchors_no_truncate;
end $$;
create function pg_temp.guard_modes() returns text language sql as $$
  select string_agg(t.tgname || '=' || t.tgenabled::text, ',' order by t.tgname) from pg_trigger t
   where t.tgrelid = 'public.ledger_anchors'::regclass and not t.tgisinternal $$;
select is(pg_temp.guard_modes(), 'ledger_anchors_guard=A,ledger_anchors_no_truncate=A',
  'the two anchor guards are enabled ALWAYS (they fire in every replication role)');
create function pg_temp.restore() returns void language plpgsql as $$
begin
  alter table public.idea_events disable trigger user;
  alter table public.ledger_anchors disable trigger user;
  delete from public.idea_events;
  insert into public.idea_events select * from pg_temp.sv_ev;
  delete from public.ledger_anchors;
  insert into public.ledger_anchors select * from pg_temp.sv_an;
  alter table public.idea_events enable trigger user;
  perform pg_temp.anchor_guards_on();
end $$;
create function pg_temp.bad() returns text language sql as $$
  select coalesce(first_bad_date::text, '-') || ' ' || coalesce(reason, '-') || ' ' || ok::text from public.verify_ledger_anchors() $$;
select is(pg_temp.bad(), '- - true', 'baseline: untouched ledger reports nothing');

-- 7a. Rewrite an event in a sealed day (Mar 3) and re-hash everything after it.
alter table public.idea_events disable trigger user;
update public.idea_events set body_md = 'Note gamma, quietly rewritten' where seq = 3;
alter table public.idea_events enable trigger user;
select pg_temp.reseal();
select is((select ok from public.verify_ledger_chain()), true,
  '7a: the chain check is blind to the rewrite (this is why the anchors exist)');
select is(pg_temp.bad(), '2026-03-03 head false', '7a: the comparison names Mar 3, the first day that differs');
select pg_temp.restore();

-- 7b. Rewrite the FIRST event of the FIRST sealed day: still the first day that is named.
alter table public.idea_events disable trigger user;
update public.idea_events set body_md = 'Open words alpha, but different' where seq = 1;
alter table public.idea_events enable trigger user;
select pg_temp.reseal();
select is((select ok from public.verify_ledger_chain()), true, '7b: the chain check passes');
select is(pg_temp.bad(), '2026-03-02 head false', '7b: Mar 2 is named');
select pg_temp.restore();

-- 7c. Remove the last event of the last sealed day (Mar 5) and close up the sequence.
alter table public.idea_events disable trigger user;
delete from public.idea_events where seq = 5;
alter table public.idea_events enable trigger user;
select pg_temp.reseal();
select is((select ok from public.verify_ledger_chain()), true, '7c: the chain check passes with the last event of a sealed day gone');
select is(pg_temp.bad(), '2026-03-05 count false', '7c: the comparison names Mar 5 (one event fewer than sealed)');
select pg_temp.restore();

-- 7d. Remove the only event of a sealed day (Mar 3).
alter table public.idea_events disable trigger user;
delete from public.idea_events where seq = 3;
alter table public.idea_events enable trigger user;
select pg_temp.reseal();
select is(pg_temp.bad(), '2026-03-03 count false', '7d: the day whose only event vanished is named');
select pg_temp.restore();

-- 7e. Slip an event into a day that was sealed empty (Mar 4).
alter table public.idea_events disable trigger user;
insert into public.idea_events select gen_random_uuid(), 1000, idea_id, kind, (timestamp '2026-03-04 12:00' at time zone 'Asia/Kolkata'),
  stance, 'Slipped in later', nonce, canonical, prev_hash, hash from public.idea_events where seq = 4;
alter table public.idea_events enable trigger user;
select pg_temp.reseal();
select is((select ok from public.verify_ledger_chain()), true, '7e: the chain check passes with a backdated event');
select is(pg_temp.bad(), '2026-03-04 count false', '7e: the empty day now has an event and is named');
select pg_temp.restore();

-- 7f. Slip an event in before the first sealed day.
alter table public.idea_events disable trigger user;
insert into public.idea_events select gen_random_uuid(), 1000, idea_id, kind, (timestamp '2026-02-27 09:00' at time zone 'Asia/Kolkata'),
  stance, 'Slipped in earlier', nonce, canonical, prev_hash, hash from public.idea_events where seq = 4;
alter table public.idea_events enable trigger user;
select pg_temp.reseal();
select is(pg_temp.bad(), '2026-02-27 early_event false', '7f: an event dated before the first sealed day is named');
select pg_temp.restore();

-- 7g. Delete a middle anchor row (the owner, triggers off): the missing day is named.
alter table public.ledger_anchors disable trigger user;
delete from public.ledger_anchors where anchor_date = '2026-03-04';
select pg_temp.anchor_guards_on();
select is(pg_temp.bad(), '2026-03-04 gap false', '7g: a missing anchor day is named');
select pg_temp.restore();

-- 7h. Rewrite an anchor row (head and line together, so the row agrees with itself).
alter table public.ledger_anchors disable trigger user;
update public.ledger_anchors set head_hash = repeat('f', 64), line = replace(line, head_hash, repeat('f', 64)) where anchor_date = '2026-03-05';
select pg_temp.anchor_guards_on();
select is(pg_temp.bad(), '2026-03-05 head false', '7h: an edited anchor row is named');
select pg_temp.restore();
select is(pg_temp.bad(), '- - true', 'after the restore: nothing is reported again');

-- 7l. The reasons seq and line (round 2). Each is an edit of the anchor row alone, made with the guard off, as an owner would.
alter table public.ledger_anchors disable trigger user;
update public.ledger_anchors set first_seq = 3 where anchor_date = '2026-03-05';
select pg_temp.anchor_guards_on();
select is(pg_temp.bad(), '2026-03-05 seq false', '7l: a changed first_seq is named, with the reason seq');
select pg_temp.restore();
alter table public.ledger_anchors disable trigger user;
update public.ledger_anchors set last_seq = 9 where anchor_date = '2026-03-05';
select pg_temp.anchor_guards_on();
select is(pg_temp.bad(), '2026-03-05 seq false', '7l: a changed last_seq is named, with the reason seq');
select pg_temp.restore();
-- Only the middle hashes of the published text are edited: the table constraint checks date, count and head, not the hashes,
-- and the head still agrees, so only the rebuilt line can notice.
alter table public.ledger_anchors disable trigger user;
update public.ledger_anchors set line = replace(line, (select hash from public.idea_events where seq = 4), repeat('e', 64))
 where anchor_date = '2026-03-05';
select pg_temp.anchor_guards_on();
select is((select line like '%' || repeat('e', 64) || '%' and head_hash = (select hash from public.idea_events where seq = 5)
             from public.ledger_anchors where anchor_date = '2026-03-05'), true, '7l: the edited row still agrees with itself (date, count and head are untouched)');
select is(pg_temp.bad(), '2026-03-05 line false', '7l: an edit of the published hashes alone is named, with the reason line');
select pg_temp.restore();

-- 7m. Events reordered inside a sealed day: the two Mar 5 notes (seq 4 and 5) swap their times. Count and the seq range
-- are unchanged; the day's last hash is another event's.
select pg_temp.at('Note delta',   '2026-03-05 18:00');
select pg_temp.at('Note epsilon', '2026-03-05 12:00');
select pg_temp.reseal();
select is((select ok from public.verify_ledger_chain()), true, '7m: the chain check passes with two events swapped inside a day');
select is(pg_temp.bad(), '2026-03-05 head false', '7m: the reordered day is named');
select pg_temp.restore();

-- 7n. An event moved across IST midnight: the day it left (or the day it joined) no longer has the sealed count.
select pg_temp.at('Note beta', '2026-03-03 00:00:30');
select pg_temp.reseal();
select is((select ok from public.verify_ledger_chain()), true, '7n: the chain check passes with an event moved past IST midnight');
select is(pg_temp.bad(), '2026-03-02 count false', '7n: an event moved from Mar 2 23:59 to Mar 3 00:00:30 names Mar 2 (one event fewer)');
select pg_temp.restore();
select pg_temp.at('Note gamma', '2026-03-02 23:59:30');
select pg_temp.reseal();
select is((select ok from public.verify_ledger_chain()), true, '7n: the chain check passes with an event moved back before IST midnight');
select is(pg_temp.bad(), '2026-03-02 count false', '7n: an event moved from Mar 3 00:01 to Mar 2 23:59:30 names Mar 2 (one event more)');
select pg_temp.restore();

-- 7o. The guards fire in every replication role (m-1): `session_replication_role = replica` is what a restore sets, and it
-- must not switch the anchor guards off.
select pg_temp.restore();
set local session_replication_role = replica;
select throws_ok($$ delete from public.ledger_anchors where anchor_date = '2026-03-03' $$, 'P0001', null, '7o: in replica mode a delete is still refused');
select throws_ok($$ update public.ledger_anchors set line = '{}' where anchor_date = '2026-03-03' $$, 'P0001', null, '7o: in replica mode an update of a line is still refused');
select throws_ok($$ truncate public.ledger_anchors $$, 'P0001', null, '7o: in replica mode a truncate is still refused');
reset session_replication_role;
select is(pg_temp.guard_modes(), 'ledger_anchors_guard=A,ledger_anchors_no_truncate=A', '7o: the guards are still ALWAYS after all the helpers');
-- ... and the one deliberate way through: the owner names the trigger (the restore runbook), then puts it back.
alter table public.ledger_anchors disable trigger ledger_anchors_guard;
select lives_ok($$ delete from public.ledger_anchors where anchor_date = '2026-03-03' $$, '7o: by name, the owner can disable the guard (this is what the runbook allows)');
select pg_temp.restore();
select is(pg_temp.guard_modes(), 'ledger_anchors_guard=A,ledger_anchors_no_truncate=A', '7o: and after the runbook''s verification step they read A again');

-- 7p. KNOWN LIMIT (round 2, review m-3): the newest anchor rows deleted, the events rewritten and re-hashed. Nothing inside this
-- database can tell: the comparison has no anchor left to compare for those days, the next seal writes well-formed rows from the
-- ALTERED events, and the comparison then agrees. A published copy lets a reader who kept an earlier copy detect it (Task 9). Pinned so
-- nobody claims the comparison proves more than "matches the days sealed in this same database".
alter table public.ledger_anchors disable trigger user;
delete from public.ledger_anchors where anchor_date = '2026-03-05';
select pg_temp.anchor_guards_on();
alter table public.idea_events disable trigger user;
update public.idea_events set body_md = 'Note epsilon, rewritten after the fact' where seq = 5;
alter table public.idea_events enable trigger user;
select pg_temp.reseal();
select is((select count(*) from public.verify_ledger_anchors() where ok and days = 3), 1::bigint,
  'KNOWN LIMIT: with the newest anchor row deleted and its day rewritten, the comparison is ok over the three days that remain');
select is(private.seal_ledger_days_to(date '2026-03-06'), 1, 'KNOWN LIMIT: and the next seal re-creates the missing day from the rewritten events');
select is((select head_hash from public.ledger_anchors where anchor_date = '2026-03-05'), (select hash from public.idea_events where seq = 5),
  'KNOWN LIMIT: the new row carries the hash of the rewritten event');
select isnt((select head_hash from public.ledger_anchors where anchor_date = '2026-03-05'), (select head_hash from pg_temp.sv_an where anchor_date = '2026-03-05'),
  'KNOWN LIMIT: which is not the hash that was sealed (a reader who kept an earlier copy would see it)');
select is(pg_temp.bad(), '- - true', 'KNOWN LIMIT: and the whole comparison agrees again');
select pg_temp.restore();
select is(pg_temp.bad(), '- - true', 'restored: the original rows and events are back');

-- 7i. Sealing refuses to go on over a mismatch, and writes nothing.
alter table public.idea_events disable trigger user;
update public.idea_events set body_md = 'Note gamma, quietly rewritten' where seq = 3;
alter table public.idea_events enable trigger user;
select pg_temp.reseal();
select throws_ok($$ select private.seal_ledger_days_to(date '2026-03-08') $$, 'P0001', 'ledger:anchor_mismatch',
  '7i: sealing over a rewritten sealed day raises ledger:anchor_mismatch');
select is((select count(*) from public.ledger_anchors), 4::bigint, '7i: and wrote no row');
set local role service_role;
select throws_ok($$ select public.seal_ledger_days() $$, 'P0001', 'ledger:anchor_mismatch',
  '7i: the service_role door raises the same way');
reset role;
select is((select count(*) from public.ledger_anchors), 4::bigint, '7i: and still wrote no row');
select pg_temp.restore();

-- 7j. A broken chain (a sealed text changed without re-hashing) stops sealing too.
alter table public.idea_events disable trigger user;
update public.idea_events set canonical = replace(canonical, 'zeta', 'ZETA') where seq = 6;
alter table public.idea_events enable trigger user;
select throws_ok($$ select private.seal_ledger_days_to(date '2026-03-08') $$, 'P0001', 'ledger:chain_broken',
  '7j: a broken chain raises ledger:chain_broken');
select is((select count(*) from public.ledger_anchors), 4::bigint, '7j: and seals nothing');
select pg_temp.restore();

-- 7k. Every event deleted after days were sealed. The comparison names the first sealed day on its own; sealing raises
-- (the chain check speaks first here, because the idea is left without its events) instead of quietly returning 0.
alter table public.idea_events disable trigger user;
delete from public.idea_events;
alter table public.idea_events enable trigger user;
select is(pg_temp.bad(), '2026-03-02 count false', '7k: sealed days with no events left are named from the first');
select throws_ok($$ select private.seal_ledger_days_to(date '2026-03-08') $$, 'P0001', 'ledger:chain_broken',
  '7k: and sealing raises instead of returning 0');
select pg_temp.restore();

-- 8. Later days are sealed on top of the old ones. The last event moves to Mar 9; Mar 6 to Mar 8 are sealed empty, and the
-- three of them repeat the head of Mar 5; Mar 9 holds the event; Mar 10 (the test's "today") is left open.
select pg_temp.at('Note zeta, written today', '2026-03-09 09:30');
select pg_temp.reseal();
select is(private.seal_ledger_days_to(date '2026-03-10'), 4, '8: Mar 6 to Mar 9 are sealed (four rows)');
select is((select string_agg(anchor_date::text || ':' || event_count, ' ' order by anchor_date) from public.ledger_anchors where anchor_date > '2026-03-05'),
  '2026-03-06:0 2026-03-07:0 2026-03-08:0 2026-03-09:1', '8: three empty days then the day with the event (weekends and holidays are days too)');
select is((select count(distinct head_hash) from public.ledger_anchors where anchor_date between '2026-03-05' and '2026-03-08'), 1::bigint,
  '8: the empty days repeat the head of Mar 5');
select is((select head_hash from public.ledger_anchors where anchor_date = '2026-03-09'), (select hash from public.idea_events where seq = 6),
  '8: Mar 9 ends on the newest event');
select is((select count(*) from public.ledger_anchors where anchor_date < '2026-03-06' and line is not null), 4::bigint,
  '8: the four older rows are still there');
select is(pg_temp.bad(), '- - true', '8: the old days still match, with the new days on top');
select is(private.seal_ledger_days_to(date '2026-03-10'), 0, '8: sealing again seals nothing');

-- 9. The service_role door uses the real IST date: it seals up to yesterday and never the day in progress.
select public.add_idea_event((select v from ctx where k = 'i1'), 'note', 'Another note, truly today');
create temp table today_ist as select (clock_timestamp() at time zone 'Asia/Kolkata')::date as d;
grant select on today_ist to service_role;
-- Round 2 (m-2): the date the seam is given is clamped to the real IST date; "tomorrow" or a year ahead never seals the day in
-- progress. Run in a block that is rolled back, so the door below still has its days to seal.
create function pg_temp.future_probe(p_ahead integer) returns text language plpgsql as $$
declare v_n integer; v_max date; v_today_rows bigint;
begin
  begin
    v_n := private.seal_ledger_days_to((clock_timestamp() at time zone 'Asia/Kolkata')::date + p_ahead);
    select max(anchor_date) into v_max from public.ledger_anchors;
    select count(*) into v_today_rows from public.ledger_anchors where anchor_date >= (clock_timestamp() at time zone 'Asia/Kolkata')::date;
    raise exception 'probe|%|%|%', v_n, v_max, v_today_rows;
  exception when others then return sqlerrm;
  end;
end $$;
select is(pg_temp.future_probe(1), 'probe|' || (select d - date '2026-03-10' from today_ist) || '|' || (select d - 1 from today_ist) || '|0',
  '9: a "today" one day in the future is clamped: the same days are sealed as with the real date, and nothing for today');
select is(pg_temp.future_probe(400), pg_temp.future_probe(1), '9: and a "today" more than a year ahead is clamped the same way');
set local role service_role;
select is(public.seal_ledger_days(), (select d - date '2026-03-10' from today_ist), '9: the door seals every day from Mar 10 up to yesterday');
reset role;
select is((select max(anchor_date) from public.ledger_anchors), (select d - 1 from today_ist), '9: the newest anchor is yesterday (IST)');
select is((select count(*) from public.ledger_anchors where anchor_date >= (select d from today_ist)), 0::bigint, '9: nothing for today');
select is((select count(*) from public.ledger_anchors where line like '%' || (select hash from public.idea_events order by seq desc limit 1) || '%'),
  0::bigint, '9: the note written today is in no line');
select is((select count(*) from public.ledger_anchors), (select d - date '2026-03-02' from today_ist)::bigint,
  '9: one row for every IST day from the first event to yesterday, no gap');
set local role service_role;
select is(public.seal_ledger_days(), 0, '9: a duplicate cron run seals nothing');
select is((select ok from public.verify_ledger_anchors()), true, '9: the whole range matches');
reset role;

select * from finish();
rollback;
