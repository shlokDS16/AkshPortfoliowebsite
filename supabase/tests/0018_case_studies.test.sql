-- 20261015000018_case_record.sql + 20261015000019_case_gate.sql: publishing rule 10 (ledger case studies) behind two owner
-- switches, policy v1.1 (Plan 3b Task 1; spec s33.2, s33.3; docs/compliance/publishing-rules-v1.1-addendum.md).
-- Sections: 1 switches, 2 structure and privileges, 3 the builder, 4 the chart, 5 the doors, 6 the gate, 7 listed_on.
-- Dates are relative to the India "today" (events are moved back by whole days with the triggers off, then the whole chain is
-- re-sealed so the ledger check passes), so the file runs on any day. Fixtures are written by the owner; every role check
-- below uses a real role.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(141);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Fixture helpers (copied from 0014; the owner only). A company id is md5(symbol)::uuid.
create temp table ids (sym text primary key, idea uuid);
create function pg_temp.isin(p_sym text) returns text language sql as $$ select 'INE' || upper(substr(md5(p_sym), 1, 9)) $$;
create function pg_temp.co(p_sym text) returns uuid language sql as $$ select md5(p_sym)::uuid $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
create function pg_temp.mk(p_sym text, p_held boolean default true, p_exp text default 'outperform') returns void language plpgsql as $$
declare v_i uuid;
begin
  insert into public.companies (id, slug, name, nse_symbol, isin, visibility)
    values (pg_temp.co(p_sym), lower(p_sym), p_sym || ' Ltd', p_sym, pg_temp.isin(p_sym), 'public');
  v_i := public.open_idea(pg_temp.co(p_sym), p_exp, 365, p_held, 'Because ' || p_sym);
  insert into pg_temp.ids values (p_sym, v_i);
end $$;
create function pg_temp.idea(p_sym text) returns uuid language sql as $$ select idea from pg_temp.ids where sym = p_sym $$;
create function pg_temp.ev(p_sym text, p_kind text, p_stance jsonb default '{}') returns void language plpgsql as $$
begin
  perform public.add_idea_event(pg_temp.idea(p_sym), p_kind, p_kind || ' words ' || p_sym, p_stance);
end $$;
create function pg_temp.back(p_sym text, p_kind text, p_days integer) returns void language plpgsql as $$
begin
  alter table public.idea_events disable trigger user;
  update public.idea_events set recorded_at = recorded_at - make_interval(days => p_days)
   where idea_id = pg_temp.idea(p_sym) and kind = p_kind;
  alter table public.idea_events enable trigger user;
end $$;
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
  update public.ideas i set closed_at = (select e.recorded_at from public.idea_events e where e.idea_id = i.id and e.kind = 'close')
   where i.status = 'closed';
  alter table public.ideas enable trigger ideas_guard_update;
  alter table public.idea_events enable trigger user;
end $$;
-- A closed, reviewed idea (open, close, one review) moved back by whole days and re-sealed, with a final score row.
-- p_rev null: no review. p_score: 'final' | 'pending' (is_final false) | 'none' (no row).
create function pg_temp.closed(p_sym text, p_open integer, p_close integer, p_rev integer, p_score text default 'final')
returns void language plpgsql as $$
declare
  d0 date := date_trunc('week', (pg_temp.today() - p_open)::timestamp)::date + 7;
  d1 date := date_trunc('week', (pg_temp.today() - p_close)::timestamp)::date + 7;
begin
  perform pg_temp.mk(p_sym);
  perform pg_temp.ev(p_sym, 'close', '{"reason":"played_out"}');
  if p_rev is not null then
    perform public.add_idea_event(pg_temp.idea(p_sym), 'review', 'Lesson ' || p_sym, '{"process":"sound","tags":["timing"]}');
    perform pg_temp.back(p_sym, 'review', p_rev);
  end if;
  perform pg_temp.back(p_sym, 'open', p_open);
  perform pg_temp.back(p_sym, 'close', p_close);
  perform pg_temp.reseal();
  if p_score <> 'none' then
    insert into public.idea_scores (idea_id, entry_date, entry_close, entry_index, mark_date, mark_close, mark_index, factor,
                                    holding_days, is_final, entry_source, mark_source)
    values (pg_temp.idea(p_sym), d0, 100, 1000, d1, 110, 1050, 1, d1 - d0, p_score = 'final', 'nse_fetch', 'nse_fetch');
  end if;
end $$;
create function pg_temp.sw(p_key text, p_val text) returns void language sql as $$
  insert into private.settings (key, value) values (p_key, p_val) on conflict (key) do update set value = excluded.value $$;
create function pg_temp.rec(p_sym text) returns jsonb language sql as $$ select private.case_study_record(pg_temp.idea(p_sym)) $$;

-- 1. The switches.
select has_function('private', 'case_switch', array['text'], 'private.case_switch(text) exists');
select is(private.case_switch('ledger_reveal'), false, 'no row: off');
select pg_temp.sw('ledger_reveal', 'ON');
select is(private.case_switch('ledger_reveal'), false, '"ON" is off (the value is exactly on)');
select pg_temp.sw('ledger_reveal', 'yes');
select is(private.case_switch('ledger_reveal'), false, '"yes" is off');
select pg_temp.sw('ledger_reveal', ' on');
select is(private.case_switch('ledger_reveal'), false, '" on" is off');
select pg_temp.sw('ledger_reveal', 'on');
select is(private.case_switch('ledger_reveal'), true, '"on" is on');
select is(private.case_switch('ledger_chart'), false, 'the chart switch is separate and still off');
select pg_temp.sw('ledger_chart', 'on');
select is(private.case_switch('ledger_chart'), true, 'the chart switch can be on');
select pg_temp.sw('ledger_reveal', 'off'); select pg_temp.sw('ledger_chart', 'off');
select is(private.case_switch('ledger_reveal'), false, 'off is off');
select is((select p.role from public.profiles p where p.id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'admin',
  'inserting the switch keys leaves the admin role unchanged');
select is((select p.role from public.profiles p where p.id = 'bbbbbbbb-0000-4000-8000-000000000002'), 'client',
  'and the client role unchanged');
select ok(not has_table_privilege('anon', 'private.settings', 'select') and not has_table_privilege('authenticated', 'private.settings', 'select')
      and not has_table_privilege('service_role', 'private.settings', 'select')
      and not has_table_privilege('anon', 'private.settings', 'insert') and not has_table_privilege('authenticated', 'private.settings', 'update')
      and not has_table_privilege('service_role', 'private.settings', 'update'),
  'no API role can read or write private.settings');

-- 2. Structure and privileges.
select has_function('private', 'case_study_record', array['uuid'], 'private.case_study_record(uuid) exists');
select has_function('private', 'case_gate_failures', array['uuid', 'text', 'uuid', 'date', 'jsonb'], 'private.case_gate_failures exists');
select has_function('public', 'case_study_record', array['uuid'], 'public.case_study_record(uuid) exists');
select has_function('public', 'case_study_switches', array[]::name[], 'public.case_study_switches() exists');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname in ('case_switch', 'case_study_record', 'case_gate_failures')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))
$$, 'the private helpers are executable by no API role');
select ok(has_function_privilege('authenticated', 'public.case_study_record(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.case_study_record(uuid)', 'execute')
      and not has_function_privilege('service_role', 'public.case_study_record(uuid)', 'execute')
      and not has_function_privilege('public', 'public.case_study_record(uuid)', 'execute'),
  'case_study_record is granted to authenticated only');
select ok(has_function_privilege('authenticated', 'public.case_study_switches()', 'execute')
      and not has_function_privilege('anon', 'public.case_study_switches()', 'execute')
      and not has_function_privilege('service_role', 'public.case_study_switches()', 'execute')
      and not has_function_privilege('public', 'public.case_study_switches()', 'execute'),
  'case_study_switches is granted to authenticated only');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.proname in ('case_switch', 'case_study_record', 'case_gate_failures', 'case_study_switches')
     and (not p.prosecdef or not ('search_path=""' = any (coalesce(p.proconfig, '{}'::text[]))))
$$, 'the new functions are SECURITY DEFINER with an empty search_path');
select ok(has_function_privilege('service_role', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('public', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute'),
  'publish_revision is executable by service_role only');
select ok((select p.prosrc like '%sebi-unreg-2026-07-v1.3%' and p.prosrc like '%private.case_gate_failures%'
              and p.prosrc like '%A newer revision exists; publish the latest.%' and p.prosrc like '%private.ledger_gate_item_failures%'
              and p.prosrc like '%file_no_seq%'
         from pg_proc p where p.oid = 'public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure),
  'publish_revision pins policy v1.3, calls rule 10 and still carries the older checks');
select ok((select p.prosrc !~* 'public\.ideas\M' and p.prosrc ~* 'public\.idea_events' from pg_proc p
            where p.oid = 'private.case_study_record(uuid)'::regprocedure),
  'the builder reads the sealed events and never the ideas projection');

-- 3. The builder. CS1: open, revise, note, upsize, close, two reviews; moved back and re-sealed.
select pg_temp.mk('CS1', true);
select pg_temp.ev('CS1', 'revise', '{"horizon_days":400}');
select pg_temp.ev('CS1', 'note');
select pg_temp.ev('CS1', 'upsize');
select pg_temp.ev('CS1', 'close', '{"reason":"played_out"}');
select public.add_idea_event(pg_temp.idea('CS1'), 'review', 'First look back', '{"process":"flawed","tags":["luck"]}');
select public.add_idea_event(pg_temp.idea('CS1'), 'review', 'Second look back', '{"process":"sound","tags":["timing","valuation"]}');
select pg_temp.back('CS1', 'open', 150); select pg_temp.back('CS1', 'revise', 148); select pg_temp.back('CS1', 'note', 146);
select pg_temp.back('CS1', 'upsize', 140); select pg_temp.back('CS1', 'close', 50); select pg_temp.back('CS1', 'review', 42);
select pg_temp.reseal();
create temp table fx (k text primary key, d date);
insert into fx values ('d0', date_trunc('week', (pg_temp.today() - 148)::timestamp)::date + 7),
                      ('d1', date_trunc('week', (pg_temp.today() - 50)::timestamp)::date + 7);
-- daily fetched closes for the share and the index (the index moves twice as fast in relative terms, so the two series differ)
insert into public.prices_daily (company_id, trade_date, close, source)
  select pg_temp.co('CS1'), g::date, 100 + (g::date - (select d from fx where k = 'd0')) * 0.1, 'nse_fetch'
    from generate_series((select d from fx where k = 'd0'), (select d from fx where k = 'd1'), interval '1 day') g
   where extract(isodow from g) < 6;
insert into public.prices_daily (benchmark, trade_date, close, source)
  select 'NIFTY50', g::date, 1000 + (g::date - (select d from fx where k = 'd0')) * 2, 'nse_fetch'
    from generate_series((select d from fx where k = 'd0'), (select d from fx where k = 'd1'), interval '1 day') g
   where extract(isodow from g) < 6;
insert into public.idea_scores (idea_id, entry_date, entry_close, entry_index, mark_date, mark_close, mark_index, factor,
                                holding_days, is_final, entry_source, mark_source)
  select pg_temp.idea('CS1'), a.d, 100, 1000, b.d, 100 + (b.d - a.d) * 0.1, 1000 + (b.d - a.d) * 2, 1, b.d - a.d, true, 'nse_fetch', 'nse_fetch'
    from fx a, fx b where a.k = 'd0' and b.k = 'd1';

select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.rec('CS1')) k),
  array['benchmark', 'chart', 'close_reason', 'company', 'company_id', 'entry_date', 'events', 'exit_date', 'expects',
        'figures_to', 'holding_days', 'horizon_days', 'idea', 'process', 'symbol', 'tags', 'v']::text[],
  'the record holds exactly the version 1 keys');
select is(pg_temp.rec('CS1') ->> 'v', '1', 'version 1');
select is((pg_temp.rec('CS1') ->> 'idea')::uuid, pg_temp.idea('CS1'), 'the idea id');
select is((pg_temp.rec('CS1') ->> 'company_id')::uuid, pg_temp.co('CS1'), 'the sealed company id');
select is(pg_temp.rec('CS1') ->> 'symbol' || '|' || (pg_temp.rec('CS1') ->> 'company'), 'CS1|CS1 Ltd', 'symbol and company as sealed');
select is(pg_temp.rec('CS1') ->> 'expects' || '|' || (pg_temp.rec('CS1') ->> 'benchmark'), 'outperform|NIFTY 50', 'direction and benchmark from the open entry');
select is((pg_temp.rec('CS1') ->> 'horizon_days')::integer, 365, 'horizon is the open entry''s, not the revision''s');
select is(pg_temp.rec('CS1') ->> 'close_reason', 'played_out', 'close reason from the close entry');
select is(pg_temp.rec('CS1') ->> 'process', 'sound', 'process from the later review');
select is(pg_temp.rec('CS1') -> 'tags', '["timing","valuation"]'::jsonb, 'tags from the later review');
select is((pg_temp.rec('CS1') ->> 'entry_date')::date, (select d from fx where k = 'd0'), 'entry date from the score');
select is((pg_temp.rec('CS1') ->> 'exit_date')::date, (select d from fx where k = 'd1'), 'exit date from the score');
select is((pg_temp.rec('CS1') ->> 'holding_days')::integer, (select b.d - a.d from fx a, fx b where a.k = 'd0' and b.k = 'd1'), 'holding days from the score');
select is((select string_agg(e ->> 'kind', ',' order by (e ->> 'seq')::bigint) from jsonb_array_elements(pg_temp.rec('CS1') -> 'events') e),
  'open,revise,close,review,review', 'events: open, revise, close, review, review in seq order (never note or upsize)');
select is_empty($$
  select 1 from jsonb_array_elements(private.case_study_record(
         (select idea from pg_temp.ids where sym = 'CS1')) -> 'events') e
    left join public.idea_events s on s.seq = (e ->> 'seq')::bigint
   where s.id is null or s.idea_id <> (select idea from pg_temp.ids where sym = 'CS1')
      or e ->> 'kind' <> s.kind or e ->> 'canonical' <> s.canonical or e ->> 'hash' <> s.hash or e ->> 'prev_hash' <> s.prev_hash
      or e ->> 'words' <> s.body_md or (e -> 'stance') <> s.stance
      or e ->> 'at' <> (s.canonical::jsonb ->> 'at') or e ->> 'words' <> (s.canonical::jsonb ->> 'words')
$$, 'every event equals the stored row: canonical, hash, prev_hash, words, stance, sealed time');
select is((pg_temp.rec('CS1') -> 'events' -> 0 ->> 'words'), 'Because CS1', 'the open entry''s words');
select is((select count(*) from jsonb_array_elements(pg_temp.rec('CS1') -> 'events') e where e -> 'listed_on' <> 'null'::jsonb), 0::bigint,
  'listed_on is null for every entry while no sealed day is published');
select is((pg_temp.rec('CS1') -> 'chart'), 'null'::jsonb, 'chart is null with ledger_chart off');
select is((pg_temp.rec('CS1') ->> 'figures_to')::date,
  (select max((s.recorded_at at time zone 'Asia/Kolkata')::date) from public.idea_events s where s.idea_id = pg_temp.idea('CS1')
     and s.kind in ('open', 'revise', 'close', 'review')),
  'figures_to is the India date of the latest revealed entry (the exit date is earlier)');
-- the exit date later than every entry counts (conservative: it is printed on the page)
update public.idea_scores set mark_date = pg_temp.today() - 40 where idea_id = pg_temp.idea('CS1');
select is((pg_temp.rec('CS1') ->> 'figures_to')::date, pg_temp.today() - 40, 'figures_to is the exit date when it is the later');
update public.idea_scores set mark_date = (select d from fx where k = 'd1') where idea_id = pg_temp.idea('CS1');

-- Refusals: an open idea, a withdrawn idea, a closed idea with no review, an exit not fixed.
select pg_temp.mk('OPN');
select throws_ok($$ select private.case_study_record((select idea from pg_temp.ids where sym = 'OPN')) $$, 'P0001', 'case:not_closed', 'an open idea is refused');
select throws_ok($$ select private.case_study_record(gen_random_uuid()) $$, 'P0001', 'case:not_closed', 'an unknown idea is refused as not closed');
select pg_temp.mk('VOI');
select pg_temp.ev('VOI', 'void');
select throws_ok($$ select private.case_study_record((select idea from pg_temp.ids where sym = 'VOI')) $$, 'P0001', 'case:void', 'a withdrawn idea is refused');
select pg_temp.closed('NRV', 130, 70, null);
select throws_ok($$ select private.case_study_record((select idea from pg_temp.ids where sym = 'NRV')) $$, 'P0001', 'case:no_review', 'a closed idea with no review is refused');
select pg_temp.closed('NPE', 130, 70, 60, 'pending');
select throws_ok($$ select private.case_study_record((select idea from pg_temp.ids where sym = 'NPE')) $$, 'P0001', 'case:exit_pending', 'a score that is not final is refused');
select pg_temp.closed('NSC', 130, 70, 60, 'none');
select throws_ok($$ select private.case_study_record((select idea from pg_temp.ids where sym = 'NSC')) $$, 'P0001', 'case:exit_pending', 'no score row is refused as exit pending');

-- 4. The chart (ledger_chart on).
select pg_temp.sw('ledger_chart', 'on');
select is((select count(*) from jsonb_array_elements(pg_temp.rec('CS1') -> 'chart' -> 'points')),
  (select (b.d - a.d) / 7 + 2 from fx a, fx b where a.k = 'd0' and b.k = 'd1')::bigint, 'one point per week plus the entry and the exit');
select is(pg_temp.rec('CS1') -> 'chart' -> 'points' -> 0,
  (select jsonb_build_object('d', to_char(d, 'YYYY-MM-DD'), 'share', 100.00, 'index', 100.00) from fx where k = 'd0'),
  'the first point is the entry date at 100.00 and 100.00');
select is(pg_temp.rec('CS1') -> 'chart' -> 'points' -> -1,
  (select jsonb_build_object('d', to_char(b.d, 'YYYY-MM-DD'), 'share', round((100 + (b.d - a.d) * 0.1), 2),
                             'index', round((1000 + (b.d - a.d) * 2) / 10.0, 2)) from fx a, fx b where a.k = 'd0' and b.k = 'd1'),
  'the last point is the exit date, rebased and rounded to two decimals');
select is(pg_temp.rec('CS1') -> 'chart' -> 'points' -> 1,
  (select jsonb_build_object('d', to_char(d + 4, 'YYYY-MM-DD'), 'share', 100.40, 'index', 100.80) from fx where k = 'd0'),
  'the first weekly point is the last fetched day of the entry week (the Friday), rebased');
select is(pg_temp.rec('CS1') -> 'chart' -> 'points' -> 2,
  (select jsonb_build_object('d', to_char(d + 11, 'YYYY-MM-DD'), 'share', 101.10, 'index', 102.20) from fx where k = 'd0'),
  'and the next week''s Friday');
select is_empty($$
  select 1 from (select (p.value ->> 'd')::date as d, p.ordinality as n
                   from jsonb_array_elements(private.case_study_record((select idea from pg_temp.ids where sym = 'CS1')) -> 'chart' -> 'points')
                        with ordinality p(value, ordinality)) x
   where x.n > 1 and x.n < (select jsonb_array_length(private.case_study_record((select idea from pg_temp.ids where sym = 'CS1')) -> 'chart' -> 'points'))
   group by date_trunc('week', x.d::timestamp) having count(*) > 1
$$, 'no ISO week has two weekly points');
select ok((select bool_and(d > lag_d) from (select (p.value ->> 'd')::date as d, lag((p.value ->> 'd')::date) over (order by p.ordinality) as lag_d
                       from jsonb_array_elements(pg_temp.rec('CS1') -> 'chart' -> 'points') with ordinality p(value, ordinality)) x
                      where lag_d is not null), 'the points are in strictly increasing date order');
select is((pg_temp.rec('CS1') ->> 'figures_to')::date,
  (select max((s.recorded_at at time zone 'Asia/Kolkata')::date) from public.idea_events s where s.idea_id = pg_temp.idea('CS1')
     and s.kind in ('open', 'revise', 'close', 'review')),
  'figures_to with the chart on is still the later of the last entry and the last point');
-- a week whose only closes are not fetched from NSE contributes no point
update public.prices_daily set source = 'manual'
 where company_id = pg_temp.co('CS1') and trade_date between (select d + 7 from fx where k = 'd0') and (select d + 11 from fx where k = 'd0');
select is((select count(*) from jsonb_array_elements(pg_temp.rec('CS1') -> 'chart' -> 'points')),
  (select (b.d - a.d) / 7 + 1 from fx a, fx b where a.k = 'd0' and b.k = 'd1')::bigint, 'a week with only a manual close for the share has no point');
update public.prices_daily set source = 'nse_fetch' where company_id = pg_temp.co('CS1');
update public.prices_daily set source = 'nse_upload'
 where benchmark = 'NIFTY50' and trade_date between (select d + 14 from fx where k = 'd0') and (select d + 18 from fx where k = 'd0');
select is((select count(*) from jsonb_array_elements(pg_temp.rec('CS1') -> 'chart' -> 'points')),
  (select (b.d - a.d) / 7 + 1 from fx a, fx b where a.k = 'd0' and b.k = 'd1')::bigint, 'a week with only an uploaded close for the index has no point');
update public.prices_daily set source = 'nse_fetch' where benchmark = 'NIFTY50';
select is((select count(*) from jsonb_array_elements(pg_temp.rec('CS1') -> 'chart' -> 'points')),
  (select (b.d - a.d) / 7 + 2 from fx a, fx b where a.k = 'd0' and b.k = 'd1')::bigint, 'with the closes put back the point is back');
-- D32: any flag, a typed or uploaded entry or exit, or a share factor other than 1 gives no chart at all
create function pg_temp.chart_with(p_set text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  execute 'update public.idea_scores set ' || p_set || ' where idea_id = $1' using pg_temp.idea('CS1');
  v := pg_temp.rec('CS1') -> 'chart';
  update public.idea_scores set flags = '{}', entry_source = 'nse_fetch', mark_source = 'nse_fetch', factor = 1
   where idea_id = pg_temp.idea('CS1');
  return v;
end $$;
select is(pg_temp.chart_with($$flags = array['entry_pending']$$), 'null'::jsonb, 'flag entry_pending: no chart');
select is(pg_temp.chart_with($$flags = array['exit_pending']$$), 'null'::jsonb, 'flag exit_pending: no chart');
select is(pg_temp.chart_with($$flags = array['jump']$$), 'null'::jsonb, 'flag jump: no chart');
select is(pg_temp.chart_with($$flags = array['isin_changed']$$), 'null'::jsonb, 'flag isin_changed: no chart');
select is(pg_temp.chart_with($$flags = array['hand_price']$$), 'null'::jsonb, 'flag hand_price: no chart');
select is(pg_temp.chart_with($$flags = array['attested']$$), 'null'::jsonb, 'flag attested: no chart');
select is(pg_temp.chart_with($$flags = array['stale']$$), 'null'::jsonb, 'flag stale: no chart');
select is(pg_temp.chart_with($$flags = array['implausible']$$), 'null'::jsonb, 'flag implausible: no chart');
select is(pg_temp.chart_with($$entry_source = 'nse_upload'$$), 'null'::jsonb, 'an uploaded entry close: no chart');
select is(pg_temp.chart_with($$mark_source = 'manual'$$), 'null'::jsonb, 'a typed exit close: no chart');
select is(pg_temp.chart_with($$factor = 2$$), 'null'::jsonb, 'a share factor other than 1: no chart');
select isnt(pg_temp.rec('CS1') -> 'chart', 'null'::jsonb, 'with everything put back the chart is back');
-- the 600-point cap: an idea open for more than 600 weeks gets no chart rather than a cut one
select pg_temp.closed('CSL', 4600, 100, 60);
update public.idea_scores set entry_date = date_trunc('week', (pg_temp.today() - 4500)::timestamp)::date + 7,
                              mark_date = date_trunc('week', (pg_temp.today() - 100)::timestamp)::date + 7,
                              entry_close = 100, entry_index = 1000, mark_close = 110, mark_index = 1050
 where idea_id = pg_temp.idea('CSL');
insert into public.prices_daily (company_id, trade_date, close, source)
  select pg_temp.co('CSL'), g::date, 100 + extract(week from g)::numeric / 10, 'nse_fetch'
    from generate_series(date_trunc('week', (pg_temp.today() - 4500)::timestamp)::date + 11, pg_temp.today() - 100, interval '7 days') g;
insert into public.prices_daily (benchmark, trade_date, close, source)
  select 'NIFTY50', g::date, 1000 + extract(week from g)::numeric, 'nse_fetch'
    from generate_series(date_trunc('week', (pg_temp.today() - 4500)::timestamp)::date + 11, pg_temp.today() - 100, interval '7 days') g
  on conflict do nothing;
select is(pg_temp.rec('CSL') -> 'chart', 'null'::jsonb, 'over 600 points: no chart');
select is((select count(*) from public.prices_daily where company_id = pg_temp.co('CSL')) > 600, true, '(the fixture does hold more than 600 weekly closes)');
select pg_temp.sw('ledger_chart', 'off');

-- 5. The admin doors, through real roles.
select set_config('t.cs1', pg_temp.idea('CS1')::text, true);
select set_config('t.rec', pg_temp.rec('CS1')::text, true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.case_study_record(current_setting('t.cs1')::uuid) $$, '42501', 'forbidden', 'a non-admin cannot call case_study_record');
select throws_ok($$ select * from public.case_study_switches() $$, '42501', 'forbidden', 'a non-admin cannot call case_study_switches');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.case_study_record(current_setting('t.cs1')::uuid), current_setting('t.rec')::jsonb, 'the admin''s door returns the builder''s record');
select is((select reveal::text || ',' || chart::text from public.case_study_switches()), 'false,false', 'the admin sees both switches (off)');
reset role;
select pg_temp.sw('ledger_reveal', 'on'); select pg_temp.sw('ledger_chart', 'on');
set local role authenticated;
select is((select reveal::text || ',' || chart::text from public.case_study_switches()), 'true,true', 'and on');
reset role;
select pg_temp.sw('ledger_chart', 'off');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.case_study_record(current_setting('t.cs1')::uuid) $$, '42501', null, 'anon cannot call case_study_record');
select throws_ok($$ select * from public.case_study_switches() $$, '42501', null, 'anon cannot call case_study_switches');
reset role;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 6. The gate. Items and revisions are written by the owner; publish_revision is called as in 0014.
create temp table decs (n serial primary key, item_id uuid, decision_id uuid);
create function pg_temp.csitem(p_key text, p_sym text, p_struct jsonb default null, p_das date default null,
                               p_kind text default 'case_study', p_company uuid default null) returns void language plpgsql as $$
begin
  insert into public.items (id, kind, title, company_id, learning_objective, holds_position, data_as_of)
  values (pg_temp.co('I_' || p_key), p_kind, p_key || ' case', coalesce(p_company, pg_temp.co(p_sym)), 'Learn ' || p_key || '.', 'not_disclosed',
          coalesce(p_das, (pg_temp.rec(p_sym) ->> 'figures_to')::date));
  insert into public.item_revisions (id, item_id, body_md, structured)
  values (pg_temp.co('R_' || p_key), pg_temp.co('I_' || p_key), '',
          coalesce(p_struct, jsonb_build_object('ledger', pg_temp.rec(p_sym))));
end $$;
create function pg_temp.addrev(p_ikey text, p_rkey text, p_struct jsonb) returns void language sql as $$
  insert into public.item_revisions (id, item_id, body_md, structured) values (pg_temp.co('R_' || p_rkey), pg_temp.co('I_' || p_ikey), '', p_struct) $$;
create function pg_temp.vr(p_ikey text, p_rkey text, p_policy text default 'sebi-unreg-2026-07-v1.3') returns text language plpgsql as $$
declare d public.gate_decisions;
begin
  d := public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.co('I_' || p_ikey), pg_temp.co('R_' || p_rkey), p_policy,
    jsonb_build_object('passed', true, 'revisionId', pg_temp.co('R_' || p_rkey)::text, 'policyVersion', p_policy));
  insert into pg_temp.decs (item_id, decision_id) values (pg_temp.co('I_' || p_ikey), d.id);
  return d.verdict;
end $$;
create function pg_temp.vd(p_key text) returns text language sql as $$ select pg_temp.vr(p_key, p_key) $$;
create function pg_temp.gc(p_key text) returns text language sql as $$
  select coalesce(string_agg(coalesce(f ->> 'code', f ->> 'rule'), ',' order by coalesce(f ->> 'code', f ->> 'rule')), 'none')
    from (select g.reasons from public.gate_decisions g join pg_temp.decs x on x.decision_id = g.id
           where x.item_id = pg_temp.co('I_' || p_key) order by x.n desc limit 1) d,
         jsonb_array_elements(d.reasons -> 'failures') f $$;
create function pg_temp.gm(p_key text, p_code text) returns text language sql as $$
  select f ->> 'message'
    from (select g.reasons from public.gate_decisions g join pg_temp.decs x on x.decision_id = g.id
           where x.item_id = pg_temp.co('I_' || p_key) order by x.n desc limit 1) d,
         jsonb_array_elements(d.reasons -> 'failures') f where f ->> 'code' = p_code limit 1 $$;
create function pg_temp.fileno(p_key text) returns integer language sql as $$ select file_no from public.items where id = pg_temp.co('I_' || p_key) $$;

-- 6a. Switch off, then on; a thesis cannot carry a ledger record; a case study without one is untouched.
select pg_temp.sw('ledger_reveal', 'off');
select pg_temp.csitem('P1', 'CS1');
select is(pg_temp.vd('P1'), 'fail', 'reveal off: a ledger case study is refused');
select is(pg_temp.gc('P1'), 'case_off', 'with the code case_off');
select is(pg_temp.gm('P1', 'case_off'), 'Case studies from the ledger are switched off by the site owner.', 'and the spec message');
select is((select count(*) from public.gate_decisions g where g.item_id = pg_temp.co('I_P1') and (g.reasons -> 'failures' -> 0 ->> 'rule') = '10'), 1::bigint,
  'recorded under rule 10');
select pg_temp.sw('ledger_reveal', 'on');
select is(pg_temp.vd('P1'), 'pass', 'reveal on, exact record, figures_to 40+ days back, lint clean: published');
select is(pg_temp.gc('P1'), 'none', 'with no failure recorded');
select is(pg_temp.fileno('P1'), null::integer, 'a ledger case study takes no file number');
select is((select count(*) from public.public_items where id = pg_temp.co('I_P1')), 1::bigint, 'and it is readable in public_items');
select pg_temp.csitem('NOL', 'CS1', '{}'::jsonb, pg_temp.today() - 40, 'case_study', null);
update public.items set company_id = null, holds_position = null where id = pg_temp.co('I_NOL');
select is(pg_temp.vd('NOL'), 'pass', 'a case study with no ledger record behaves as before');
select isnt(pg_temp.fileno('NOL'), null, 'and still takes a file number');
select is(private.case_gate_failures(pg_temp.co('I_NOL'), 'case_study', null, pg_temp.today() - 40, '{}'::jsonb), '[]'::jsonb, 'no ledger key: no rule 10 failure');
-- (review) rule 10 runs outside the rule-4 condition: a ledger case study filed under no company and linked to no idea
select pg_temp.closed('CS13', 150, 60, 40);
select pg_temp.csitem('NC', 'CS13');
update public.items set company_id = null, holds_position = null where id = pg_temp.co('I_NC');
select is(pg_temp.vd('NC') || ':' || pg_temp.gc('NC'), 'fail:case_company', 'a ledger case study filed under no company still meets rule 10: case_company');
select is((select g.reasons -> 'ledger' ->> 'checked' from public.gate_decisions g where g.item_id = pg_temp.co('I_NC')), 'false',
  '(the rule 4 half did not run for it, so rule 10 alone refused it)');
select pg_temp.csitem('LN', 'CS13', '{"ledger":null}'::jsonb, pg_temp.today() - 40);
select ok(pg_temp.vd('LN') = 'fail' and pg_temp.gc('LN') like '%case_not_ready%', 'a null ledger record is a recorded refusal');
select pg_temp.csitem('LS', 'CS13', '{"ledger":"CS13"}'::jsonb, pg_temp.today() - 40);
select ok(pg_temp.vd('LS') = 'fail' and pg_temp.gc('LS') like '%case_not_ready%', 'a ledger record that is not an object is a recorded refusal');
select pg_temp.csitem('ARR', 'CS13', '["ledger"]'::jsonb, pg_temp.today() - 40);
select is(pg_temp.vd('ARR'), 'pass', 'structured that is not an object carries no ledger record');
select isnt(pg_temp.fileno('ARR'), null, 'so it takes a file number like any case study (the gate and the file number agree)');
select is_empty($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg_temp%'
     and (p.prosrc like '%ledger_reveal%' or p.prosrc like '%ledger_chart%')
     and p.proname not in ('case_study_record', 'case_study_switches', 'case_gate_failures')
  union all
  select v.viewname::text from pg_views v where v.definition like '%ledger_reveal%' or v.definition like '%ledger_chart%'
$$, 'only the rule 10 functions name the two switch keys; no view does');
select pg_temp.closed('CS12', 150, 60, 40);
select pg_temp.csitem('TH', 'CS12', null, null, 'thesis');
select is(pg_temp.vd('TH') || ':' || pg_temp.gc('TH'), 'fail:case_kind', 'a ledger record on a thesis: case_kind');
select is(pg_temp.gm('TH', 'case_kind'), 'Only a case study can carry a ledger record.', 'and the spec message');

-- 6b. The record must be exactly the ledger's.
select pg_temp.addrev('P1', 'P1w', jsonb_build_object('ledger', jsonb_set(pg_temp.rec('CS1'), '{events,0,words}', to_jsonb('Because CS2'::text))));
select is(pg_temp.vr('P1', 'P1w') || ':' || pg_temp.gc('P1'), 'fail:case_record', 'one changed character in a word: case_record');
select pg_temp.addrev('P1', 'P1d', jsonb_build_object('ledger', pg_temp.rec('CS1') #- '{events,2}'));
select is(pg_temp.vr('P1', 'P1d') || ':' || pg_temp.gc('P1'), 'fail:case_record', 'a dropped entry: case_record');
select pg_temp.addrev('P1', 'P1n', jsonb_build_object('ledger', jsonb_set(pg_temp.rec('CS1'), '{holding_days}', '1')));
select is(pg_temp.vr('P1', 'P1n') || ':' || pg_temp.gc('P1'), 'fail:case_record', 'a number typed into the record: case_record');
select pg_temp.addrev('P1', 'P1x', jsonb_build_object('ledger', pg_temp.rec('CS1') || '{"extra":1}'));
select is(pg_temp.vr('P1', 'P1x') || ':' || pg_temp.gc('P1'), 'fail:case_record', 'an extra key: case_record');
select is(pg_temp.gm('P1', 'case_record'), 'The ledger record in this revision no longer matches the ledger. Refresh it from the ledger and publish the new revision.', 'the spec message');
select pg_temp.sw('ledger_chart', 'on');
select pg_temp.addrev('P1', 'P1c', jsonb_build_object('ledger', pg_temp.rec('CS1')));
select is(pg_temp.vr('P1', 'P1c') || ':' || pg_temp.gc('P1'), 'pass:none', 'chart switch on: a record with the chart is published');
select pg_temp.sw('ledger_chart', 'off');
select is(pg_temp.vr('P1', 'P1c') || ':' || pg_temp.gc('P1'), 'fail:case_record', 'chart switch turned off: the same revision no longer passes');
select pg_temp.addrev('P1', 'P1e', jsonb_build_object('ledger', pg_temp.rec('CS1')));
select is(pg_temp.vr('P1', 'P1e'), 'pass', 'and a fresh record without the chart passes');
select is((select current_revision_id from public.items where id = pg_temp.co('I_P1')), pg_temp.co('R_P1e'), 'which becomes current');

-- 6c. Figures-to, the 30-day lag, the company, open ideas, duplicates.
select pg_temp.closed('CS5', 150, 60, 40);
select pg_temp.csitem('F1', 'CS5', null, pg_temp.today() - 41);
select is(pg_temp.vd('F1') || ':' || pg_temp.gc('F1'), 'fail:case_figures_to', 'data_as_of a day before figures_to: case_figures_to');
select ok(pg_temp.gm('F1', 'case_figures_to') ~ '^The figures-to date of this case study must be \d\d \w{3} \d{4}, the date of the latest entry or chart point it shows\.$',
  'with the spec message');
select pg_temp.csitem('F2', 'CS5', null, pg_temp.today() - 39);
select is(pg_temp.vd('F2') || ':' || pg_temp.gc('F2'), 'fail:case_figures_to', 'a day after figures_to: case_figures_to');
select pg_temp.closed('CS4', 150, 60, 30);
select pg_temp.csitem('L30', 'CS4');
select is(pg_temp.vd('L30') || ':' || pg_temp.gc('L30'), 'pass:none', 'figures_to exactly 30 India days back passes');
select pg_temp.closed('CS3', 150, 60, 29);
select pg_temp.csitem('L29', 'CS3');
select is(pg_temp.vd('L29') || ':' || pg_temp.gc('L29'), 'fail:3', 'figures_to 29 days back fails rule 3');
select pg_temp.closed('CS7', 150, 29, 28);
select pg_temp.csitem('R4', 'CS7');
select ok(pg_temp.vd('R4') = 'fail' and pg_temp.gc('R4') like '%ledger_recent_entry%', 'rule 4 still refuses a close entry 29 days old');
insert into public.companies (id, slug, name, nse_symbol, isin, visibility)
  values (pg_temp.co('OTH'), 'oth', 'OTH Ltd', 'OTH', pg_temp.isin('OTH'), 'public');
select pg_temp.closed('CS6', 150, 60, 40);
select pg_temp.csitem('CO1', 'CS6', null, null, 'case_study', pg_temp.co('OTH'));
select is(pg_temp.vd('CO1') || ':' || pg_temp.gc('CO1'), 'fail:case_company', 'filed under a different company: case_company');
select is(pg_temp.gm('CO1', 'case_company'), 'This case study is filed under a different company from the idea''s.', 'with the spec message');
-- a merged stub: the closed idea is on the stub, the item is filed under the target it was merged into
select pg_temp.closed('STB', 150, 60, 40);
insert into public.companies (id, slug, name, nse_symbol, isin, visibility)
  values (pg_temp.co('TGT'), 'tgt', 'TGT Ltd', 'TGT', pg_temp.isin('TGT'), 'public');
insert into public.company_aliases (symbol, company_id) values ('STB', pg_temp.co('TGT'));
update public.companies set needs_review = false, archived_at = now() where id = pg_temp.co('STB');
select pg_temp.csitem('AL', 'STB', null, null, 'case_study', pg_temp.co('TGT'));
select is(pg_temp.vd('AL') || ':' || pg_temp.gc('AL'), 'pass:none', 'filed under the company the sealed one was merged into: allowed');
-- an open idea on the company
select pg_temp.closed('CS8', 150, 60, 40);
select pg_temp.csitem('OI', 'CS8');
insert into pg_temp.ids select 'CS8b', public.open_idea(pg_temp.co('CS8'), 'outperform', 365, false, 'Another view');
select is(pg_temp.vd('OI') || ':' || pg_temp.gc('OI'), 'fail:case_open_idea,ledger_recent_entry', 'an open idea on the company: case_open_idea (and rule 4 on the new entry)');
select ok(pg_temp.gm('OI', 'case_open_idea') like 'The ledger has an open idea on this company.%', 'with the spec message');
select pg_temp.closed('TGT2', 150, 60, 40);
select pg_temp.mk('STB2');
insert into public.company_aliases (symbol, company_id) values ('STB2', pg_temp.co('TGT2'));
update public.companies set needs_review = false, archived_at = now() where id = pg_temp.co('STB2');
select pg_temp.csitem('OI2', 'TGT2');
select ok(pg_temp.vd('OI2') = 'fail' and pg_temp.gc('OI2') like '%case_open_idea%', 'an open idea on a stub merged into the company counts too');
-- another published case study for the same idea
select pg_temp.csitem('DUP', 'CS1');
select is(pg_temp.vd('DUP') || ':' || pg_temp.gc('DUP'), 'fail:case_duplicate', 'a second item for a published idea: case_duplicate');
select is(pg_temp.gm('DUP', 'case_duplicate'), 'Another published case study already shows this idea.', 'with the spec message');

-- 6d. Builder errors and a tampered ledger are refusals, recorded; the gate never passes because it could not look.
select pg_temp.csitem('NR1', 'OPN', jsonb_build_object('ledger', jsonb_build_object('idea', pg_temp.idea('OPN'))), pg_temp.today() - 40);
select ok(pg_temp.vd('NR1') = 'fail' and pg_temp.gc('NR1') like '%case_not_ready%', 'an open idea: case_not_ready');
select ok(pg_temp.gm('NR1', 'case_not_ready') = 'This idea cannot be shown as a case study yet: it is not closed.', 'saying why');
select pg_temp.csitem('NR2', 'NRV', jsonb_build_object('ledger', jsonb_build_object('idea', pg_temp.idea('NRV'))), pg_temp.today() - 40);
select ok(pg_temp.vd('NR2') = 'fail' and pg_temp.gm('NR2', 'case_not_ready') = 'This idea cannot be shown as a case study yet: it has no lesson.', 'no lesson: case_not_ready, saying so');
select pg_temp.csitem('NR3', 'NPE', jsonb_build_object('ledger', jsonb_build_object('idea', pg_temp.idea('NPE'))), pg_temp.today() - 40);
select ok(pg_temp.vd('NR3') = 'fail' and pg_temp.gm('NR3', 'case_not_ready') = 'This idea cannot be shown as a case study yet: its exit price is not fixed.', 'exit not fixed: case_not_ready, saying so');
select pg_temp.csitem('NR4', 'VOI', jsonb_build_object('ledger', jsonb_build_object('idea', pg_temp.idea('VOI'))), pg_temp.today() - 40);
select ok(pg_temp.vd('NR4') = 'fail' and pg_temp.gm('NR4', 'case_not_ready') = 'This idea cannot be shown as a case study yet: it was withdrawn.', 'withdrawn: case_not_ready, saying so');
select pg_temp.csitem('BAD', 'CS1', '{"ledger":{"idea":"not-a-uuid"}}'::jsonb, pg_temp.today() - 40);
select ok(pg_temp.vd('BAD') = 'fail' and pg_temp.gc('BAD') like '%ledger_check_failed%', 'a record the builder cannot read: ledger_check_failed, not an aborted publish');
select pg_temp.closed('CS11', 150, 60, 40);
select pg_temp.csitem('TAM', 'CS11');
alter table public.idea_events disable trigger user;
update public.idea_events set body_md = 'rewritten' where idea_id = pg_temp.idea('CS11') and kind = 'open';
alter table public.idea_events enable trigger user;
select ok(pg_temp.vd('TAM') = 'fail' and pg_temp.gc('TAM') like '%ledger_check_failed%', 'a tampered chain: ledger_check_failed');
select is((select count(*) from public.gate_decisions where item_id = pg_temp.co('I_TAM')), 1::bigint, 'and the refusal is a recorded decision');
alter table public.idea_events disable trigger user;
update public.idea_events set body_md = 'Because CS11' where idea_id = pg_temp.idea('CS11') and kind = 'open';
alter table public.idea_events enable trigger user;
select is(pg_temp.vd('TAM'), 'pass', 'with the text put back the same item passes');

-- 6e. The old policy version is refused; the other gate failures are untouched.
select pg_temp.closed('CS9', 150, 60, 40);
select pg_temp.csitem('OLD', 'CS9');
select is(pg_temp.vr('OLD', 'OLD', 'sebi-unreg-2026-07'), 'fail', 'the v1 policy string is refused');
select is((select g.reasons -> 'failures' -> 0 ->> 'message' from public.gate_decisions g join pg_temp.decs x on x.decision_id = g.id
            where x.item_id = pg_temp.co('I_OLD') order by x.n desc limit 1),
  'This database accepts only policy version sebi-unreg-2026-07-v1.3.', 'saying which version it accepts');

-- 7. listed_on: the sealed day of the close entry is published; the first review's hash is missing from the stored line of its day.
select pg_temp.sw('ledger_reveal', 'off');
select is(private.seal_ledger_days_to(pg_temp.today()) > 0, true, 'the days up to yesterday are sealed');
update public.ledger_anchors set published_at = clock_timestamp()
 where anchor_date = (select (e.recorded_at at time zone 'Asia/Kolkata')::date from public.idea_events e where e.idea_id = pg_temp.idea('CS1') and e.kind = 'close');
select is((select e ->> 'listed_on' from jsonb_array_elements(pg_temp.rec('CS1') -> 'events') e where e ->> 'kind' = 'close'),
  to_char(pg_temp.today(), 'YYYY-MM-DD'), 'listed_on is the India date the sealed day was published');
select is((select count(*) from jsonb_array_elements(pg_temp.rec('CS1') -> 'events') e where e ->> 'listed_on' is not null), 1::bigint,
  'and only for the entries of that day');
select is((select e ->> 'listed_on' from jsonb_array_elements(pg_temp.rec('CS1') -> 'events') e where e ->> 'kind' = 'open'), null::text,
  'the open entry''s day is not published: listed_on stays null');
update public.ledger_anchors set published_at = clock_timestamp()
 where anchor_date = (select (e.recorded_at at time zone 'Asia/Kolkata')::date from public.idea_events e where e.idea_id = pg_temp.idea('CS1') and e.kind = 'review' limit 1);
select is((select count(*) from jsonb_array_elements(pg_temp.rec('CS1') -> 'events') e where e ->> 'listed_on' is not null), 3::bigint,
  'the review day, once published, lists both reviews');
alter table public.ledger_anchors disable trigger ledger_anchors_guard;
update public.ledger_anchors set line = replace(line, (select e.hash from public.idea_events e where e.idea_id = pg_temp.idea('CS1') and e.kind = 'review' order by e.seq limit 1), repeat('0', 64))
 where anchor_date = (select (e.recorded_at at time zone 'Asia/Kolkata')::date from public.idea_events e where e.idea_id = pg_temp.idea('CS1') and e.kind = 'review' limit 1);
alter table public.ledger_anchors enable always trigger ledger_anchors_guard;
select is((select count(*) from jsonb_array_elements(pg_temp.rec('CS1') -> 'events') e where e ->> 'listed_on' is not null), 2::bigint,
  'a published day whose line does not list an entry''s hash gives that entry no listed_on');

select * from finish();
rollback;
