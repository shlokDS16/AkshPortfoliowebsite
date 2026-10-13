-- 20261013000011_market.sql and 20261013000012_scores.sql: closing prices with a source ladder, the trading calendar, corporate
-- actions, the restatement log and the one scoring function (Plan 3a Task 2 and its fix round 1; spec s5.4, s6, s18; ADR-005
-- s3.4, s3.5). Every expected figure below is worked by hand in a comment next to it. Calendar: March 2026, Mon 2 .. Fri 6,
-- Mon 9 .. Fri 13, Mon 16 (Sat 7 and Sun 8 have no market day). The fixtures move event times with the triggers off and then
-- RE-SEAL the whole chain (pg_temp.reseal), so the ledger check passes and the scorer's own check can be left on.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(338);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');
-- The owner plays the admin session for fixtures (the writers read the caller from the claims, not the role).
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Fixture helpers (the owner only).
create temp table ids (sym text primary key, id uuid);
-- Every fixture company has a real-shaped ISIN (twelve capitals or digits), because a typed ISIN of any other shape is dropped.
create function pg_temp.isin(p_sym text) returns text language sql as $$ select 'INE' || upper(substr(md5(p_sym), 1, 9)) $$;
create function pg_temp.mk(p_sym text, p_exp text, p_at text default null) returns uuid language plpgsql as $$
declare v_c uuid := gen_random_uuid(); v_i uuid;
begin
  insert into public.companies (id, slug, name, nse_symbol, isin) values (v_c, lower(p_sym), p_sym || ' Ltd', p_sym, pg_temp.isin(p_sym));
  v_i := public.open_idea(v_c, p_exp, 365, true, 'Because ' || p_sym);
  if p_at is not null then
    perform pg_temp.move(v_i, 'open', (p_at::timestamp at time zone 'Asia/Kolkata'));
  end if;
  insert into pg_temp.ids values (p_sym, v_i);
  return v_i;
end $$;
create function pg_temp.move(p_idea uuid, p_kind text, p_at timestamptz) returns void language plpgsql as $$
begin
  alter table public.idea_events disable trigger idea_events_append_only;
  update public.idea_events set recorded_at = p_at where idea_id = p_idea and kind = p_kind;
  alter table public.idea_events enable trigger idea_events_append_only;
end $$;
create function pg_temp.close_at(p_sym text, p_at text) returns void language plpgsql as $$
declare v_i uuid := (select id from pg_temp.ids where sym = p_sym);
begin
  perform public.add_idea_event(v_i, 'close', 'Closed ' || p_sym, '{"reason":"played_out"}');
  perform pg_temp.move(v_i, 'close', (p_at::timestamp at time zone 'Asia/Kolkata'));
end $$;
-- Re-seal the whole chain after times were moved: order by time, renumber, rebuild every sealed text exactly as the seal
-- trigger does, re-hash, and bring ideas.opened_at / closed_at in line. The ledger check then passes on the fixtures.
create function pg_temp.reseal() returns void language plpgsql as $$
declare
  r record; v_prev text := repeat('0', 64); v_seq bigint := 0; v_canon text; v_hash text;
begin
  alter table public.idea_events disable trigger idea_events_append_only;
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
  alter table public.idea_events enable trigger idea_events_append_only;
end $$;
create function pg_temp.r(p_sym text, p_close numeric, p_isin text default null, p_series text default 'EQ') returns jsonb
language sql as $$ select jsonb_build_object('symbol', p_sym, 'series', p_series, 'isin', p_isin, 'close', p_close) $$;
create function pg_temp.nv() returns integer language sql as $$ select count(*)::integer from public.ideas where status <> 'void' $$;
-- One line per score: entry date|close|index|mark date|close|index|factor|idea return|index return|excess|days|final|flags
create function pg_temp.sc(p_sym text) returns text language sql as $$
  select concat_ws('|', coalesce(s.entry_date::text, '-'), coalesce(trim_scale(s.entry_close)::text, '-'),
         coalesce(trim_scale(s.entry_index)::text, '-'), coalesce(s.mark_date::text, '-'), coalesce(trim_scale(s.mark_close)::text, '-'),
         coalesce(trim_scale(s.mark_index)::text, '-'), coalesce(trim_scale(s.factor)::text, '-'),
         coalesce(trim_scale(s.idea_return)::text, '-'), coalesce(trim_scale(s.index_return)::text, '-'),
         coalesce(trim_scale(s.excess)::text, '-'), coalesce(s.holding_days::text, '-'),
         case when s.is_final then 't' else 'f' end, s.flags::text)
    from public.idea_scores s join public.ideas i on i.id = s.idea_id join public.companies c on c.id = i.company_id
   where c.nse_symbol = p_sym $$;
-- entry skipped days / exit skipped days
create function pg_temp.sk(p_sym text) returns text language sql as $$
  select coalesce(s.entry_skipped_days::text, '-') || '/' || coalesce(s.exit_skipped_days::text, '-')
    from public.idea_scores s join public.ideas i on i.id = s.idea_id join public.companies c on c.id = i.company_id
   where c.nse_symbol = p_sym $$;
create function pg_temp.chg(p_sym text) returns bigint language sql as $$
  select count(*) from public.idea_score_changes x join public.ideas i on i.id = x.idea_id join public.companies c on c.id = i.company_id
   where c.nse_symbol = p_sym $$;
create function pg_temp.px(p_sym text, p_day date) returns text language sql as $$
  select trim_scale(p.close)::text || '/' || p.source from public.prices_daily p join public.companies c on c.id = p.company_id
   where c.nse_symbol = p_sym and p.trade_date = p_day $$;
create function pg_temp.ix(p_day date) returns text language sql as $$
  select trim_scale(p.close)::text || '/' || p.source from public.prices_daily p where p.benchmark = 'NIFTY50' and p.trade_date = p_day $$;
create function pg_temp.md(p_day date) returns text language sql as $$
  select m.status || '/' || m.source from public.market_days m where m.trade_date = p_day $$;
create function pg_temp.is_tracked(p_sym text) returns boolean language sql as $$ select exists (select 1 from public.tracked_symbols() s where s = p_sym) $$;

-- 1. Structure and constraints.
select has_table('public', 'prices_daily', 'prices_daily exists');
select has_table('public', 'market_days', 'market_days exists');
select has_table('public', 'corporate_actions', 'corporate_actions exists');
select has_table('public', 'idea_scores', 'idea_scores exists');
select has_table('public', 'idea_score_changes', 'idea_score_changes exists');
select ok((select bool_and(c.relrowsecurity) from pg_class c
            where c.oid in ('public.prices_daily'::regclass, 'public.market_days'::regclass, 'public.corporate_actions'::regclass,
                            'public.idea_scores'::regclass, 'public.idea_score_changes'::regclass)),
  'RLS is enabled on all five tables');
select is(to_char(date '2026-03-02', 'Dy') || to_char(date '2026-03-06', 'Dy') || to_char(date '2026-03-07', 'Dy') || to_char(date '2026-03-09', 'Dy'),
  'MonFriSatMon', 'the calendar this file relies on is right: 2 Mar is a Monday, 7 Mar a Saturday');
select is((select count(*) from pg_attribute a where a.attrelid = 'public.idea_events'::regclass and a.attnum > 0 and not a.attisdropped
             and a.attname ~* '(price|close|return|score|excess|factor)'), 0::bigint,
  'idea_events has no column that could hold a price, a return or a score');
-- C-1: the source of a price is never a caller's word.
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and 'p_source' = any (coalesce(p.proargnames, '{}'::text[]))
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
$$, 'no function an API user can call takes a price source as a parameter');
select is((select p.pronargs from pg_proc p where p.oid = 'public.enter_closes(date, jsonb, numeric)'::regprocedure), 3::smallint,
  'enter_closes takes a date, rows and an index close, nothing else');

-- 2. Privileges. anon holds nothing; no API role writes prices, calendar, scores or the restatement log; the admin may add
-- corporate actions and can never change or delete one.
select is_empty($$
  select c.relname from pg_class c
   where c.oid in ('public.prices_daily'::regclass, 'public.market_days'::regclass, 'public.corporate_actions'::regclass,
                   'public.idea_scores'::regclass, 'public.idea_score_changes'::regclass)
     and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
          or has_any_column_privilege('anon', c.oid, 'select,insert,update,references'))
$$, 'anon holds no privilege on any of the five tables');
select is_empty($$
  select p.polname from pg_policy p
   where p.polrelid in ('public.prices_daily'::regclass, 'public.market_days'::regclass, 'public.corporate_actions'::regclass,
                        'public.idea_scores'::regclass, 'public.idea_score_changes'::regclass)
     and (p.polroles = '{0}'::oid[] or p.polroles @> array['anon'::regrole::oid])
$$, 'no policy on the five tables reaches anon or PUBLIC');
select ok(not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
                       and pg_get_viewdef(c.oid) ~* '(prices_daily|market_days|corporate_actions|idea_scores|idea_score_changes)'),
  'no view in public reads the five tables');
select is_empty($$
  select c.relname from pg_class c
   where c.oid in ('public.prices_daily'::regclass, 'public.market_days'::regclass, 'public.idea_scores'::regclass, 'public.idea_score_changes'::regclass)
     and (has_table_privilege('authenticated', c.oid, 'insert,update,delete,truncate,references')
          or has_any_column_privilege('authenticated', c.oid, 'insert,update,references')
          or has_table_privilege('service_role', c.oid, 'insert,update,delete,truncate,references')
          or has_any_column_privilege('service_role', c.oid, 'insert,update,references'))
$$, 'no API role can write prices_daily, market_days, idea_scores or idea_score_changes');
select ok(has_table_privilege('authenticated', 'public.prices_daily', 'select')
      and has_table_privilege('authenticated', 'public.market_days', 'select')
      and has_table_privilege('authenticated', 'public.corporate_actions', 'select')
      and has_table_privilege('authenticated', 'public.idea_scores', 'select')
      and has_table_privilege('authenticated', 'public.idea_score_changes', 'select')
      and has_column_privilege('authenticated', 'public.corporate_actions', 'factor', 'insert')
      and has_column_privilege('authenticated', 'public.corporate_actions', 'supersedes', 'insert')
      and not has_table_privilege('authenticated', 'public.corporate_actions', 'delete')
      and not has_table_privilege('authenticated', 'public.corporate_actions', 'update')
      and not has_any_column_privilege('authenticated', 'public.corporate_actions', 'update')
      and not has_table_privilege('authenticated', 'public.corporate_actions', 'truncate'),
  'authenticated reads all five, inserts corporate_actions, and can neither update nor delete one');
select ok(has_table_privilege('service_role', 'public.market_days', 'select')
      and not has_any_column_privilege('service_role', 'public.prices_daily', 'select,insert,update')
      and not has_any_column_privilege('service_role', 'public.idea_scores', 'select,insert,update')
      and not has_any_column_privilege('service_role', 'public.idea_score_changes', 'select,insert,update')
      and not has_any_column_privilege('service_role', 'public.corporate_actions', 'select,insert,update'),
  'service_role reads market_days only and holds nothing on the other four');
select ok(not has_function_privilege('anon', 'public.store_fetched_closes(date, jsonb, numeric)', 'execute')
      and not has_function_privilege('anon', 'public.store_uploaded_closes(date, jsonb, numeric)', 'execute')
      and not has_function_privilege('anon', 'public.mark_market_day_shut(date)', 'execute')
      and not has_function_privilege('anon', 'public.enter_closes(date, jsonb, numeric)', 'execute')
      and not has_function_privilege('anon', 'public.score_ideas()', 'execute')
      and not has_function_privilege('anon', 'public.rescore_ideas()', 'execute')
      and not has_function_privilege('anon', 'public.tracked_symbols()', 'execute'),
  'anon cannot execute any function of this migration');
select ok(has_function_privilege('service_role', 'public.store_fetched_closes(date, jsonb, numeric)', 'execute')
      and has_function_privilege('service_role', 'public.store_uploaded_closes(date, jsonb, numeric)', 'execute')
      and has_function_privilege('service_role', 'public.mark_market_day_shut(date)', 'execute')
      and has_function_privilege('service_role', 'public.score_ideas()', 'execute')
      and has_function_privilege('service_role', 'public.tracked_symbols()', 'execute')
      and not has_function_privilege('service_role', 'public.enter_closes(date, jsonb, numeric)', 'execute')
      and not has_function_privilege('service_role', 'public.rescore_ideas()', 'execute')
      and has_function_privilege('authenticated', 'public.enter_closes(date, jsonb, numeric)', 'execute')
      and has_function_privilege('authenticated', 'public.rescore_ideas()', 'execute')
      and not has_function_privilege('authenticated', 'public.store_fetched_closes(date, jsonb, numeric)', 'execute')
      and not has_function_privilege('authenticated', 'public.store_uploaded_closes(date, jsonb, numeric)', 'execute')
      and not has_function_privilege('authenticated', 'public.mark_market_day_shut(date)', 'execute')
      and not has_function_privilege('authenticated', 'public.score_ideas()', 'execute')
      and not has_function_privilege('authenticated', 'public.tracked_symbols()', 'execute'),
  'the job''s functions are service_role only; the admin''s two are authenticated only');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in ('put_close', 'close_rank', 'tracked_companies', 'first_close_after', 'action_factor', 'has_jump',
                       'score_ideas_now', 'put_company_rows', 'put_index_close', 'mark_day_open', 'market_closed', 'live_actions',
                       'put_hand_closes', 'guard_corporate_action', 'idea_facts', 'skipped_days', 'has_identity_break')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute'))
$$, 'the private helpers are executable by no API role');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.proname in ('store_fetched_closes', 'store_uploaded_closes', 'mark_market_day_shut', 'enter_closes', 'score_ideas',
                       'rescore_ideas', 'tracked_symbols', 'put_close', 'tracked_companies', 'first_close_after', 'action_factor',
                       'has_jump', 'score_ideas_now', 'put_company_rows', 'put_index_close', 'mark_day_open', 'live_actions',
                       'put_hand_closes', 'guard_corporate_action', 'idea_facts', 'skipped_days', 'has_identity_break')
     and (not p.prosecdef or not ('search_path=""' = any (coalesce(p.proconfig, '{}'::text[]))))
$$, 'every function of this migration is SECURITY DEFINER with an empty search_path');
-- The only writers: exactly one function body writes each table.
select is((select count(*) from pg_proc p where p.prosrc ~* 'insert\s+into\s+public\.prices_daily|update\s+public\.prices_daily|delete\s+from\s+public\.prices_daily'),
  1::bigint, 'exactly one function writes prices_daily (private.put_close)');
select is((select count(*) from pg_proc p where p.prosrc ~* 'insert\s+into\s+public\.idea_scores|update\s+public\.idea_scores|delete\s+from\s+public\.idea_scores'),
  1::bigint, 'exactly one function writes idea_scores (private.score_ideas_now)');
select is((select count(*) from pg_proc p where p.prosrc ~* 'insert\s+into\s+public\.idea_score_changes|update\s+public\.idea_score_changes|delete\s+from\s+public\.idea_score_changes'),
  1::bigint, 'exactly one function writes idea_score_changes (private.score_ideas_now)');
select is((select string_agg(p.proname, ',' order by p.proname) from pg_proc p
            where p.prosrc ~* 'insert\s+into\s+public\.market_days|update\s+public\.market_days|delete\s+from\s+public\.market_days'),
  'mark_day_open,mark_market_day_shut', 'market_days is written by private.mark_day_open and mark_market_day_shut only');

-- Check constraints (the owner, so only the constraints and triggers answer).
insert into public.companies (id, slug, name, nse_symbol) values ('cccccccc-0000-4000-8000-000000000001', 'probe', 'Probe', 'PROBE'),
  ('cccccccc-0000-4000-8000-000000000002', 'probe2', 'Probe Two', 'PROBE2');
select throws_ok($$ insert into public.prices_daily (company_id, benchmark, trade_date, close, source) values
    ('cccccccc-0000-4000-8000-000000000001', 'NIFTY50', '2026-01-05', 10, 'manual') $$, '23514', null, 'a price row is a company or the benchmark, not both');
select throws_ok($$ insert into public.prices_daily (trade_date, close, source) values ('2026-01-05', 10, 'manual') $$, '23514', null,
  'a price row names a company or the benchmark');
select throws_ok($$ insert into public.prices_daily (company_id, trade_date, close, source) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-05', 0, 'manual') $$, '23514', null, 'a close must be above zero');
select throws_ok($$ insert into public.prices_daily (company_id, trade_date, close, source) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-05', 10, 'guess') $$, '23514', null, 'a price source is nse_fetch, nse_upload or manual');
select throws_ok($$ insert into public.prices_daily (benchmark, trade_date, close, source) values ('SENSEX', '2026-01-05', 10, 'manual') $$,
  '23514', null, 'the only benchmark is NIFTY50');
select lives_ok($$ insert into public.prices_daily (company_id, trade_date, close, source) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-05', 10, 'manual') $$, 'a valid company close is accepted');
select throws_ok($$ insert into public.prices_daily (company_id, trade_date, close, source) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-05', 11, 'manual') $$, '23505', null, 'one close per company per day');
select lives_ok($$ insert into public.prices_daily (benchmark, trade_date, close, source) values ('NIFTY50', '2026-01-05', 100, 'manual') $$,
  'a valid Nifty 50 close is accepted');
select throws_ok($$ insert into public.prices_daily (benchmark, trade_date, close, source) values ('NIFTY50', '2026-01-05', 101, 'manual') $$,
  '23505', null, 'one Nifty 50 close per day');
select throws_ok($$ insert into public.market_days (trade_date, status, source) values ('2026-01-06', 'maybe', 'manual') $$, '23514', null,
  'a market day is open or shut');
-- Corporate actions: bounded, honest about "no action", append-only.
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-06', 1, 'split') $$, '23514', null, 'a split with factor 1 changes nothing and is refused');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-06', 0, 'split') $$, '23514', null, 'a corporate action factor of 0 is refused');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-06', 0.0009, 'other') $$, '23514', null, 'a factor below 0.001 is refused');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-06', 1000.01, 'split') $$, '23514', null, 'a factor above 1000 is refused');
select lives_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-08', 1000, 'split'), ('cccccccc-0000-4000-8000-000000000001', '2026-01-09', 0.001, 'other') $$,
  'the bounds themselves (1000 and 0.001) are accepted');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-06', 2, 'merger') $$, '23514', null, 'a corporate action is a split, a bonus, other or none');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-06', 2, 'none') $$, '23514', null, 'a "no action" row must have factor 1');
select lives_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-07', 1, 'none') $$, 'a "no action" row with factor 1 is accepted');
select lives_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-06', 2, 'bonus') $$, 'a valid corporate action is accepted');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-06', 3, 'bonus') $$, '23505', null, 'the same action cannot be entered twice while it is in force');
select lives_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind, supersedes)
    select company_id, ex_date, 3, 'bonus', id from public.corporate_actions
     where company_id = 'cccccccc-0000-4000-8000-000000000001' and ex_date = '2026-01-06' and kind = 'bonus' $$,
  'a correction is a new row that supersedes the old one');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind, supersedes)
    select company_id, ex_date, 4, 'bonus', id from public.corporate_actions
     where company_id = 'cccccccc-0000-4000-8000-000000000001' and ex_date = '2026-01-06' and kind = 'bonus' and factor = 2 $$,
  '23505', null, 'an action that is already superseded cannot be superseded again');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind, supersedes)
    select 'cccccccc-0000-4000-8000-000000000002'::uuid, ex_date, 4, 'bonus', id from public.corporate_actions
     where company_id = 'cccccccc-0000-4000-8000-000000000001' and ex_date = '2026-01-06' and factor = 3 $$,
  'P0001', 'corporate_actions: a correction must supersede an action of the same company', 'a correction cannot supersede another company''s action');
select is((select string_agg(a.ex_date::text || '/' || trim_scale(a.factor)::text || '/' || a.kind, ',' order by a.ex_date)
             from private.live_actions('cccccccc-0000-4000-8000-000000000001') a),
  '2026-01-06/3/bonus,2026-01-07/1/none,2026-01-08/1000/split,2026-01-09/0.001/other',
  'the actions in force are those no later row supersedes (the factor-2 bonus is out)');
select throws_ok($$ update public.corporate_actions set factor = 9 $$, 'P0001', 'corporate_actions is append-only: UPDATE is not allowed',
  'corporate_actions cannot be updated, not even by the owner');
select throws_ok($$ delete from public.corporate_actions $$, 'P0001', 'corporate_actions is append-only: DELETE is not allowed',
  'corporate_actions cannot be deleted from, not even by the owner');
select throws_ok($$ truncate public.corporate_actions $$, 'P0001', 'corporate_actions is append-only: TRUNCATE is not allowed',
  'corporate_actions cannot be truncated, not even by the owner');
-- Round 2, N-8: the note is bounded (500 characters) because no role can ever delete a row of this table.
select lives_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind, note) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-20', 2, 'other', repeat('n', 500)) $$, 'a note of exactly 500 characters is accepted');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind, note) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-21', 2, 'other', repeat('n', 501)) $$, '23514', null, 'a note of 501 characters is refused');
-- Round 2, N-9: the duplicate check and the insert run under one per-company lock, so a double submit cannot make two live
-- actions. (Two sessions cannot be opened from pgTAP; the lock is checked in the function body, and a two-session race was run by hand: see the fix-round-2 report.)
select ok((select p.prosrc ~ 'pg_advisory_xact_lock\(hashtext\(''corporate_actions:'' \|\| new\.company_id::text\)\)'
             from pg_proc p where p.oid = 'private.guard_corporate_action()'::regprocedure),
  'N-9: the corporate-action guard takes a per-company advisory lock before it checks for a live duplicate');
delete from public.prices_daily;

-- 3. Fixtures: 34 ideas, each on its own company. Times are Asia/Kolkata and set by the owner; the chain is then re-sealed.
-- SIERRA keeps its real opening time so that it can be withdrawn inside the 24-hour window.
select pg_temp.mk('ALPHA', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('GAMMA', 'underperform', '2026-03-02 10:00:00');
select pg_temp.mk('DELTA', 'outperform', '2026-03-06 16:00:00');
select pg_temp.mk('ECHO', 'outperform', '2026-03-07 11:00:00');
select pg_temp.mk('FOXA', 'outperform', '2026-03-06 14:59:00');
select pg_temp.mk('FOXB', 'outperform', '2026-03-06 15:00:00');
select pg_temp.mk('HOTEL', 'outperform', '2026-03-10 16:00:00');
select pg_temp.mk('INDIA', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('JULIET', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('KILO', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('LIMA', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('MIKE', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('NOVEM', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('PAPA', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('QUEBEC', 'outperform', '2026-03-13 10:00:00');
select pg_temp.mk('ROMEO', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('SIERRA', 'outperform');
select pg_temp.mk('TANGO', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('UNIF', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('WHISKEY', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('OSCAR', 'outperform', '2026-03-06 16:00:00');
select pg_temp.mk('ZULU', 'outperform', '2026-03-10 10:00:00');
select pg_temp.mk('XRAY', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('YANKEE', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('BRAVO', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('CHARLIE', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('GOLF', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('FOXT', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('WOLF', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('LONGSHOT', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('KAPPA', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('ZEBRA', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('NECTAR', 'outperform', '2026-03-06 10:00:00');
select pg_temp.mk('RHO', 'outperform', '2026-01-12 10:00:00');
select pg_temp.close_at('LIMA', '2026-03-05 11:00:00');
select pg_temp.close_at('MIKE', '2026-03-06 16:00:00');
select pg_temp.close_at('WHISKEY', '2026-03-13 16:00:00');
select pg_temp.close_at('OSCAR', '2026-03-07 11:00:00');
select pg_temp.close_at('ZULU', '2026-03-10 14:00:00');
select pg_temp.close_at('YANKEE', '2026-03-03 11:00:00');
select pg_temp.close_at('BRAVO', '2026-03-05 11:00:00');
select pg_temp.close_at('CHARLIE', '2026-03-05 11:00:00');
select pg_temp.close_at('RHO', '2026-01-13 11:00:00');
insert into public.companies (slug, name, nse_symbol) values ('untrk', 'Untracked Ltd', 'UNTRK');
select is((select count(*) from public.ideas), 34::bigint, 'thirty-four ideas are fixtures');
select is((select ok from private.ledger_chain_check()), false, 'moved event times without a re-seal break the ledger check (which is why the fixtures re-seal)');
select pg_temp.reseal();
select is((select ok::text || '/' || events::text from private.ledger_chain_check()), 'true/43',
  'after the re-seal the chain verifies: 34 open events and 9 close events');

-- 4. Stage A: only Monday 2 March is stored. Untracked symbols and the BE duplicate of ALPHA are not stored.
select is(public.store_fetched_closes('2026-03-02', jsonb_build_array(
    pg_temp.r('ALPHA', 999, null, 'BE'), pg_temp.r('ALPHA', 100), pg_temp.r('GAMMA', 200), pg_temp.r('INDIA', 1000), pg_temp.r('JULIET', 500),
    pg_temp.r('KILO', 2000), pg_temp.r('LIMA', 100), pg_temp.r('MIKE', 400), pg_temp.r('NOVEM', 50), pg_temp.r('TANGO', 100),
    pg_temp.r('UNIF', 100), pg_temp.r('SIERRA', 10), pg_temp.r('WHISKEY', 60), pg_temp.r('NOISE', 5), pg_temp.r('UNTRK', 5)), 20000),
  12::integer, 'store_fetched_closes keeps the 12 tracked companies (EQ preferred over BE) and drops the rest');
select is((select count(*) from public.prices_daily where company_id is not null), 12::bigint, 'twelve company closes stored');
select is(pg_temp.px('ALPHA', '2026-03-02'), '100/nse_fetch', 'the EQ close wins over the BE row, source nse_fetch');
select is((select count(*) from public.prices_daily p join public.companies c on c.id = p.company_id where c.nse_symbol in ('NOISE', 'UNTRK')), 0::bigint,
  'a symbol that is not a tracked company''s is dropped');
select is(pg_temp.ix('2026-03-02'), '20000/nse_fetch', 'the Nifty 50 close is stored');
select is(pg_temp.md('2026-03-02'), 'open/nse_fetch', 'the date is open once the Nifty 50 close is stored');
-- The second file of the same day adds the later fixtures (equal rank: nothing already stored is replaced).
select is(public.store_fetched_closes('2026-03-02', jsonb_build_array(pg_temp.r('CHARLIE', 100), pg_temp.r('GOLF', 100), pg_temp.r('FOXT', 100),
    pg_temp.r('WOLF', 100), pg_temp.r('LONGSHOT', 0.05), pg_temp.r('KAPPA', 100), pg_temp.r('YANKEE', 100), pg_temp.r('ALPHA', 555)), 20000),
  8::integer, 'a second file for the same day adds the other tracked companies');
select is(pg_temp.px('ALPHA', '2026-03-02'), '100/nse_fetch', 'a second file does not replace an equal-rank close');
-- ZEBRA's closes are printed under another symbol (as if its nse_symbol had been re-pointed): stored directly, as the fetch would.
select private.put_close(c.id, null, '2026-03-02', 100, 'nse_fetch', 'OTHERZ', 'EQ', null) from public.companies c where c.nse_symbol = 'ZEBRA';
-- RHO (January): the rounding case of M-2. Entry 20000 -> 22469.13 is +12.34565%; the index 1,000,000 -> 1,010,000.4 is +1.00004%.
select is(public.store_fetched_closes('2026-01-12', jsonb_build_array(pg_temp.r('RHO', 20000)), 1000000), 1::integer, 'RHO entry day stored');
select is(public.store_fetched_closes('2026-01-13', jsonb_build_array(pg_temp.r('RHO', 22469.13)), 1010000.4), 1::integer, 'RHO exit day stored');
select is(private.score_ideas_now('2026-03-02'), pg_temp.nv(), 'scoring writes one row per non-void idea');
-- 1. An idea scored on its opening day: entry = mark, every figure zero.
select is(pg_temp.sc('ALPHA'), '2026-03-02|100|20000|2026-03-02|100|20000|1|0|0|0|0|f|{}',
  'opening day: entry and mark are the same close, return 0, 0 days, no flags');
select is((select s.entry_source || '/' || s.mark_source from public.idea_scores s join public.ideas i on i.id = s.idea_id
            join public.companies c on c.id = i.company_id where c.nse_symbol = 'ALPHA'), 'nse_fetch/nse_fetch', 'the sources are recorded');
-- A missing price on a required day: no score, not a wrong one.
select is(pg_temp.sc('PAPA'), '-|-|-|-|-|-|-|-|-|-|-|f|{entry_pending}', 'no company close at all: entry_pending, every figure empty');
select is(pg_temp.sc('DELTA'), '-|-|-|-|-|-|-|-|-|-|-|f|{entry_pending}', 'opened Friday after 15:00 with only the weekend to come: entry_pending');
select is(pg_temp.sc('QUEBEC'), '-|-|-|-|-|-|-|-|-|-|-|f|{entry_pending}', 'opened on 13 March, no close yet: entry_pending');
-- RHO (final in January): 22469.13 / 20000 - 1 = 0.1234565 -> 0.123457; 1010000.4 / 1000000 - 1 = 0.0100004 -> 0.01.
-- M-2: the excess is the difference of the two SHOWN figures, 0.123457 - 0.01 = 0.113457 (subtracting the unrounded ones gives 0.113456).
select is(pg_temp.sc('RHO'), '2026-01-12|20000|1000000|2026-01-13|22469.13|1010000.4|1|0.123457|0.01|0.113457|1|t|{}',
  'the stored excess equals the shown idea return minus the shown index return (rounded first)');
-- A withdrawn idea has no score row.
select isnt(pg_temp.sc('SIERRA'), null, 'SIERRA has a score row while it is open (entry_pending)');
select lives_ok($$ select public.add_idea_event((select id from pg_temp.ids where sym = 'SIERRA'), 'void', 'Entered by mistake.') $$,
  'SIERRA is withdrawn within 24 hours');
select is(private.score_ideas_now('2026-03-02'), pg_temp.nv(), 'a void idea is not scored');
select is(pg_temp.nv(), 33, 'thirty-three ideas are not void');
select is(pg_temp.sc('SIERRA'), null, 'the row of an idea that became void is removed');

-- 5. Stage B: 3 to 6 March.
select public.store_fetched_closes('2026-03-03', jsonb_build_array(pg_temp.r('ALPHA', 110), pg_temp.r('INDIA', 1100), pg_temp.r('JULIET', 520),
  pg_temp.r('KILO', 420), pg_temp.r('LIMA', 90), pg_temp.r('MIKE', 410), pg_temp.r('NOVEM', 51, pg_temp.isin('NOVEM')), pg_temp.r('TANGO', 70),
  pg_temp.r('UNIF', 69.99)), 20200);
select public.store_fetched_closes('2026-03-04', jsonb_build_array(pg_temp.r('ALPHA', 105), pg_temp.r('INDIA', 230), pg_temp.r('JULIET', 262),
  pg_temp.r('KILO', 430), pg_temp.r('LIMA', 95), pg_temp.r('MIKE', 420), pg_temp.r('NOVEM', 52, pg_temp.isin('NOVEM')), pg_temp.r('XRAY', 50)), 20100);
select public.store_fetched_closes('2026-03-05', jsonb_build_array(pg_temp.r('ALPHA', 108), pg_temp.r('INDIA', 240), pg_temp.r('JULIET', 270),
  pg_temp.r('KILO', 225), pg_temp.r('LIMA', 110), pg_temp.r('MIKE', 430), pg_temp.r('NOVEM', 53, pg_temp.isin('NOVEM')), pg_temp.r('XRAY', 55),
  pg_temp.r('CHARLIE', 108), pg_temp.r('YANKEE', 120)), 20400);
select public.store_fetched_closes('2026-03-06', jsonb_build_array(pg_temp.r('ALPHA', 120), pg_temp.r('GAMMA', 180), pg_temp.r('LIMA', 50),
  pg_temp.r('MIKE', 440), pg_temp.r('NOVEM', 54, 'INE222B01022'), pg_temp.r('TANGO', 75), pg_temp.r('UNIF', 75), pg_temp.r('FOXA', 300),
  pg_temp.r('FOXB', 200), pg_temp.r('DELTA', 300), pg_temp.r('GOLF', 142.86), pg_temp.r('FOXT', 142.85), pg_temp.r('WOLF', 65),
  pg_temp.r('LONGSHOT', 600), pg_temp.r('KAPPA', 110), pg_temp.r('NECTAR', 1000)), 20500);
select private.put_close(c.id, null, '2026-03-06', 110, 'nse_fetch', 'OTHERZ', 'EQ', null) from public.companies c where c.nse_symbol = 'ZEBRA';
select is((select count(*) from public.market_days where trade_date between '2026-03-02' and '2026-03-06' and status = 'open'), 5::bigint,
  'the five trading days are open; Saturday and Sunday have no market day');
select is(private.score_ideas_now('2026-03-06'), pg_temp.nv(), 'stage B scoring');
-- 2. Multi-day holding: ALPHA 100 -> 120 is +20%; Nifty 20000 -> 20500 is +2.5%; excess 17.5 points; 4 days.
select is(pg_temp.sc('ALPHA'), '2026-03-02|100|20000|2026-03-06|120|20500|1|0.2|0.025|0.175|4|f|{}', 'multi-day holding, Nifty 50 over the same two dates');
-- Underperform flips the sign: idea -10%, Nifty +2.5%, excess = -(-0.1 - 0.025) = +0.125.
select is(pg_temp.sc('GAMMA'), '2026-03-02|200|20000|2026-03-06|180|20500|1|-0.1|0.025|0.125|4|f|{}', 'underperform: the sign of the excess is flipped');
-- Friday-evening (and Saturday) openings enter on Monday, a day with no close yet is pending.
select is(pg_temp.sc('FOXA'), '2026-03-06|300|20500|2026-03-06|300|20500|1|0|0|0|0|f|{}', 'an event at 14:59 IST enters on the same day');
select is(pg_temp.sc('FOXB'), '-|-|-|-|-|-|-|-|-|-|-|f|{entry_pending}', 'an event at 15:00:00 IST does not: it waits for Monday');
select is(pg_temp.sc('DELTA'), '-|-|-|-|-|-|-|-|-|-|-|f|{entry_pending}',
  'DELTA has a Friday close stored but opened after 15:00: still entry_pending, the Friday close is not used');
select is(pg_temp.sc('ECHO'), '-|-|-|-|-|-|-|-|-|-|-|f|{entry_pending}', 'opened on a Saturday: entry_pending until Monday');
-- Closed ideas. LIMA closed Thursday 11:00: exit is Thursday's close, frozen.
select is(pg_temp.sc('LIMA'), '2026-03-02|100|20000|2026-03-05|110|20400|1|0.1|0.02|0.08|3|t|{}',
  'closed 11:00 on 5 March: exit that day (110, +10%), Nifty +2%, excess 0.08, final; the later crash to 50 is outside the window');
select is(pg_temp.sc('MIKE'), '2026-03-02|400|20000|2026-03-06|440|20500|1|0.1|0.025|0.075|4|f|{exit_pending}',
  'closed Friday 16:00 with no later close: exit_pending, marked to the latest close, not final');
-- Flags.
select is(pg_temp.sc('NOVEM'), '2026-03-02|50|20000|2026-03-06|54|20500|1|0.08|0.025|0.055|4|f|{isin_changed}',
  'a changed ISIN is flagged even though the entry row carries no ISIN (compared with the sealed one)');
select is(pg_temp.sc('TANGO'), '2026-03-02|100|20000|2026-03-06|75|20500|1|-0.25|0.025|-0.275|4|f|{}',
  'a fall of exactly 30% (100 to 70) is not a jump');
select is(pg_temp.sc('UNIF'), '2026-03-02|100|20000|2026-03-06|75|20500|1|-0.25|0.025|-0.275|4|f|{jump}',
  'a fall of more than 30% (100 to 69.99) with no corporate action is a jump');
-- A split with no action entered: the return is wrong and the flag says so.
-- INDIA: 240 / 1000 - 1 = -0.76, Nifty +2%, excess -0.78.
select is(pg_temp.sc('INDIA'), '2026-03-02|1000|20000|2026-03-05|240|20400|1|-0.76|0.02|-0.78|3|f|{jump}', 'a 1:5 split without its factor raises jump');
-- JULIET: 270 / 500 - 1 = -0.46.
select is(pg_temp.sc('JULIET'), '2026-03-02|500|20000|2026-03-05|270|20400|1|-0.46|0.02|-0.48|3|f|{jump}', 'a 1:1 bonus without its factor raises jump');
-- I-4: a rise is flagged too. The boundary is 1/0.7 of the previous close: 142.86 * 0.7 = 100.002 > 100 is a jump, 142.85 * 0.7 = 99.995 is not.
-- GOLF: 142.86 / 100 - 1 = 0.4286; excess 0.4286 - 0.025 = 0.4036.  FOXT: 0.4285; excess 0.4035.
select is(pg_temp.sc('GOLF'), '2026-03-02|100|20000|2026-03-06|142.86|20500|1|0.4286|0.025|0.4036|4|f|{jump}', 'a rise just beyond 1/0.7 of the previous close is a jump');
select is(pg_temp.sc('FOXT'), '2026-03-02|100|20000|2026-03-06|142.85|20500|1|0.4285|0.025|0.4035|4|f|{}', 'a rise just inside 1/0.7 is not');
-- I-6: a return above 9,999 (600 / 0.05 - 1 = 11,999) is stored as no figure, flagged, and does not fail the run.
select is(pg_temp.sc('LONGSHOT'), '2026-03-02|0.05|20000|2026-03-06|600|20500|1|-|-|-|4|f|{jump,implausible}',
  'a return beyond belief is stored with no figures and the implausible flag');
select is(pg_temp.sc('KAPPA'), '2026-03-02|100|20000|2026-03-06|110|20500|1|0.1|0.025|0.075|4|f|{}', 'KAPPA before any action: +10%');
-- I-2: ZEBRA's closes are printed under another symbol than the one sealed with the idea.
select is(pg_temp.sc('ZEBRA'), '2026-03-02|100|20000|2026-03-06|110|20500|1|0.1|0.025|0.075|4|f|{isin_changed}',
  'closes printed under a symbol other than the sealed one are flagged, even from the first row');
-- I-7: the entry slides to the first day with both closes, and says how many open days it passed.
-- XRAY has no close on 2 and 3 March: entry 4 March (50 / 20100), mark 5 March (55 / 20400): +10%; Nifty 20400 / 20100 - 1 = 0.0149253 -> 0.014925; excess 0.085075; 1 day.
select is(pg_temp.sc('XRAY'), '2026-03-04|50|20100|2026-03-05|55|20400|1|0.1|0.014925|0.085075|1|f|{}', 'the entry slides to the first day with both closes');
select is(pg_temp.sk('XRAY'), '2/-', 'XRAY entered two open trading days late');
-- YANKEE closed on 3 March 11:00 but has no close on 3 and 4 March: the exit slides to 5 March (120 / 20400): +20%, +2%, excess 0.18, 3 days.
select is(pg_temp.sc('YANKEE'), '2026-03-02|100|20000|2026-03-05|120|20400|1|0.2|0.02|0.18|3|t|{}', 'the exit slides to the first day with both closes');
select is(pg_temp.sk('YANKEE'), '0/2', 'YANKEE exited two open trading days late');
select is(pg_temp.sk('ALPHA'), '0/-', 'an idea that entered on the first day skipped none, and has no exit');
-- CHARLIE: closed 5 March 11:00, 100 -> 108 (+8%), Nifty +2%, excess 0.06, 3 days.
select is(pg_temp.sc('CHARLIE'), '2026-03-02|100|20000|2026-03-05|108|20400|1|0.08|0.02|0.06|3|t|{}', 'CHARLIE is final on fetched closes');
-- Stale: ALPHA is marked Friday 6 March. Tuesday 10 March is two weekdays on, Wednesday 11 is three.
select is(private.score_ideas_now('2026-03-10'), pg_temp.nv(), 'rescored as of Tuesday 10 March');
select is(pg_temp.sc('ALPHA'), '2026-03-02|100|20000|2026-03-06|120|20500|1|0.2|0.025|0.175|4|f|{}', 'two weekdays old is not stale');
select is(private.score_ideas_now('2026-03-11'), pg_temp.nv(), 'rescored as of Wednesday 11 March');
select is(pg_temp.sc('ALPHA'), '2026-03-02|100|20000|2026-03-06|120|20500|1|0.2|0.025|0.175|4|f|{stale}', 'three weekdays old is stale');
select is(pg_temp.sc('LIMA'), '2026-03-02|100|20000|2026-03-05|110|20400|1|0.1|0.02|0.08|3|t|{}', 'a final closed idea is never stale');
select is(pg_temp.sc('MIKE'), '2026-03-02|400|20000|2026-03-06|440|20500|1|0.1|0.025|0.075|4|f|{exit_pending,stale}',
  'M-3: a closed idea still waiting for its exit close goes stale too');

-- 6. Corporate actions. INDIA split 1:5 (factor 5, ex 4 Mar); JULIET bonus 1:1 (factor 2, ex 4 Mar) entered by the admin;
-- KILO split (5, ex 3 Mar) and bonus (2, ex 5 Mar), with two decoys outside the window: ex on the entry day, ex after the mark.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind, note) select c.id, '2026-03-04', 2, 'bonus', '1:1'
                     from public.companies c where c.nse_symbol = 'JULIET' $$, 'the admin enters a bonus');
select is((select count(*) from public.corporate_actions a join public.companies c on c.id = a.company_id where c.nse_symbol = 'JULIET'), 1::bigint,
  'the admin reads corporate actions');
reset role;
insert into public.corporate_actions (company_id, ex_date, factor, kind)
  select c.id, v.d::date, v.f, v.k from public.companies c join (values
    ('INDIA', '2026-03-04', 5, 'split'), ('KILO', '2026-03-03', 5, 'split'), ('KILO', '2026-03-05', 2, 'bonus'),
    ('KILO', '2026-03-02', 3, 'other'), ('KILO', '2026-03-09', 7, 'split')) v(s, d, f, k) on c.nse_symbol = v.s;
select is(private.score_ideas_now('2026-03-06'), pg_temp.nv(), 'rescored after the actions');
-- INDIA: 240 * 5 / 1000 - 1 = 0.2; Nifty +2%; excess 0.18.
select is(pg_temp.sc('INDIA'), '2026-03-02|1000|20000|2026-03-05|240|20400|5|0.2|0.02|0.18|3|f|{}', 'a 1:5 split with factor 5: the return is unchanged by the split, no jump');
-- JULIET: 270 * 2 / 500 - 1 = 0.08; excess 0.06.
select is(pg_temp.sc('JULIET'), '2026-03-02|500|20000|2026-03-05|270|20400|2|0.08|0.02|0.06|3|f|{}', 'a 1:1 bonus with factor 2');
-- KILO: factor 5 * 2 = 10 (the entry-day and after-mark actions are outside); 225 * 10 / 2000 - 1 = 0.125; excess 0.105.
select is(pg_temp.sc('KILO'), '2026-03-02|2000|20000|2026-03-05|225|20400|10|0.125|0.02|0.105|3|f|{}',
  'a split then a bonus multiply (factor 10); actions on the entry day or after the mark are left out; both drops are covered, no jump');

-- 6b. I-3: "I looked, the move is real" records a none action; the loser stays in the record at its real figure.
-- WOLF: 100 -> 65 is -35%; Nifty +2.5%; excess -0.375.
select is(pg_temp.sc('WOLF'), '2026-03-02|100|20000|2026-03-06|65|20500|1|-0.35|0.025|-0.375|4|f|{jump}', 'a 35% fall with no action is flagged');
insert into public.corporate_actions (company_id, ex_date, factor, kind, note)
  select c.id, '2026-03-05', 1, 'none', 'checked: the fall is real' from public.companies c where c.nse_symbol = 'WOLF';
select private.score_ideas_now('2026-03-06');
select is(pg_temp.sc('WOLF'), '2026-03-02|100|20000|2026-03-06|65|20500|1|-0.35|0.025|-0.375|4|f|{attested}',
  'N-1: with a "no action" row the 35% fall is scored at -35%, jump is cleared, and the score says a hand attestation did it');
-- NOVEM: the ISIN changes between 5 and 6 March. An action on 5 March is outside (5 Mar, 6 Mar]; one on 6 March is inside.
insert into public.corporate_actions (company_id, ex_date, factor, kind)
  select c.id, '2026-03-05', 1, 'none' from public.companies c where c.nse_symbol = 'NOVEM';
select private.score_ideas_now('2026-03-06');
select is(pg_temp.sc('NOVEM'), '2026-03-02|50|20000|2026-03-06|54|20500|1|0.08|0.025|0.055|4|f|{attested,isin_changed}',
  'an action dated before the change does not clear isin_changed (and, being a "no action" row, it marks the score attested)');
insert into public.corporate_actions (company_id, ex_date, factor, kind)
  select c.id, '2026-03-06', 1, 'none' from public.companies c where c.nse_symbol = 'NOVEM';
select private.score_ideas_now('2026-03-06');
select is(pg_temp.sc('NOVEM'), '2026-03-02|50|20000|2026-03-06|54|20500|1|0.08|0.025|0.055|4|f|{attested}',
  'an action dated in the step where the ISIN changed clears it, and the score is marked attested');
-- ZEBRA: the closes carry another symbol from the entry row on; an action dated in (open day - 1, entry day] acknowledges it.
insert into public.corporate_actions (company_id, ex_date, factor, kind)
  select c.id, '2026-03-02', 1, 'none' from public.companies c where c.nse_symbol = 'ZEBRA';
select private.score_ideas_now('2026-03-06');
select is(pg_temp.sc('ZEBRA'), '2026-03-02|100|20000|2026-03-06|110|20500|1|0.1|0.025|0.075|4|f|{attested}',
  'N-1: a recorded re-point clears isin_changed but the score is marked attested (scenario A of the re-review: nothing is cleared silently)');
-- I-6: three large factors (1000 each: factor 10^9) cannot fail the run. KAPPA stores no figure; every other idea is still scored.
insert into public.corporate_actions (company_id, ex_date, factor, kind)
  select c.id, v.d::date, v.f, v.k from public.companies c join (values
    ('KAPPA', '2026-03-03', 1000, 'split'), ('KAPPA', '2026-03-04', 1000, 'bonus'), ('KAPPA', '2026-03-05', 1000, 'other')) v(s, d, f, k) on c.nse_symbol = v.s;
select is(private.score_ideas_now('2026-03-06'), pg_temp.nv(), 'a factor product of 10^9 does not fail the scoring run');
select is(pg_temp.sc('KAPPA'), '2026-03-02|100|20000|2026-03-06|110|20500|1000000000|-|-|-|4|f|{jump,implausible}',
  'KAPPA stores its factor, no returns, and the flags jump and implausible');
select is(pg_temp.sc('ALPHA'), '2026-03-02|100|20000|2026-03-06|120|20500|1|0.2|0.025|0.175|4|f|{}', 'the other ideas were scored in the same run');

-- 6c. I-4: a late corporate action on a final score is an unexplained factor: flagged, and the restatement is logged.
-- CHARLIE final at 0.08. A factor 1.5 "other" on 4 March: 108 * 1.5 / 100 - 1 = 0.62; excess 0.62 - 0.02 = 0.6; the factor makes the step
-- bigger (162 against 100), so it is flagged jump.
select is(pg_temp.chg('CHARLIE'), 0::bigint, 'nothing was restated yet');
set local role authenticated;
select lives_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind, note) select c.id, '2026-03-04', 1.5, 'other', 'late entry'
                     from public.companies c where c.nse_symbol = 'CHARLIE' $$, 'the admin enters a late action');
reset role;
select private.score_ideas_now('2026-03-06');
select is(pg_temp.sc('CHARLIE'), '2026-03-02|100|20000|2026-03-05|108|20400|1.5|0.62|0.02|0.6|3|t|{jump}', 'a factor with no matching fall moves the return and is flagged');
select is(pg_temp.chg('CHARLIE'), 1::bigint, 'I-5: the change to a final score is logged');
select is((select x.changed from public.idea_score_changes x join public.ideas i on i.id = x.idea_id join public.companies c on c.id = i.company_id
            where c.nse_symbol = 'CHARLIE' order by x.id limit 1), array['excess', 'factor', 'flags', 'idea_return'],
  'the log names what changed');
select is((select x.was ->> 'idea_return' || '>' || (x.became ->> 'idea_return') from public.idea_score_changes x
             join public.ideas i on i.id = x.idea_id join public.companies c on c.id = i.company_id where c.nse_symbol = 'CHARLIE' order by x.id limit 1),
  '0.080000>0.620000', 'the log keeps the old and the new value');
-- The correction is a new row that supersedes the old one (nothing is deleted); the score returns to 0.08 and the return is logged again.
set local role authenticated;
select lives_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind, note, supersedes)
                     select c.id, '2026-03-04', 1, 'none', 'withdrawn: no action', a.id from public.companies c
                       join public.corporate_actions a on a.company_id = c.id and a.kind = 'other' where c.nse_symbol = 'CHARLIE' $$,
  'the admin corrects it with a superseding row');
reset role;
select private.score_ideas_now('2026-03-06');
select is(pg_temp.sc('CHARLIE'), '2026-03-02|100|20000|2026-03-05|108|20400|1|0.08|0.02|0.06|3|t|{attested}',
  'the superseded action no longer counts (the correcting "no action" row marks the score attested)');
select is(pg_temp.chg('CHARLIE'), 2::bigint, 'the correction is logged too');
select is((select count(*) from public.corporate_actions a join public.companies c on c.id = a.company_id where c.nse_symbol = 'CHARLIE'), 2::bigint,
  'both rows of the correction are kept');

-- 6d. C-1 / I-5: a final score that rests on typed closes is not permanent. BRAVO closed 5 March 11:00; closes typed by hand.
select is(public.enter_closes('2026-03-02', jsonb_build_array(pg_temp.r('BRAVO', 100)), null), 1::integer, 'the admin types BRAVO''s entry close');
select is(public.enter_closes('2026-03-05', jsonb_build_array(pg_temp.r('BRAVO', 110)), null), 1::integer, 'and its exit close');
select is(pg_temp.px('BRAVO', '2026-03-05'), '110/manual', 'a typed close is stored as manual, whatever the caller says');
select private.score_ideas_now('2026-03-06');
-- 110 / 100 - 1 = 0.1; Nifty 20400 / 20000 - 1 = 0.02; excess 0.08; 3 days; the weaker source is manual: hand_price.
select is(pg_temp.sc('BRAVO'), '2026-03-02|100|20000|2026-03-05|110|20400|1|0.1|0.02|0.08|3|t|{hand_price}', 'typed closes make a final score, marked hand_price');
select ok(pg_temp.is_tracked('BRAVO'), 'C-1: an idea that is final on typed closes is still tracked, so the official row can land');
select is(public.enter_closes('2026-03-05', jsonb_build_array(pg_temp.r('BRAVO', 121)), null), 1::integer, 'a typed close can be corrected by typing it again');
select private.score_ideas_now('2026-03-06');
-- 121 / 100 - 1 = 0.21; excess 0.19.
select is(pg_temp.sc('BRAVO'), '2026-03-02|100|20000|2026-03-05|121|20400|1|0.21|0.02|0.19|3|t|{hand_price}', 'the final score follows the corrected close');
select is(pg_temp.chg('BRAVO'), 1::bigint, 'I-5: re-typing a close under a final score is logged');
select is((select x.changed from public.idea_score_changes x join public.ideas i on i.id = x.idea_id join public.companies c on c.id = i.company_id
            where c.nse_symbol = 'BRAVO' order by x.id limit 1), array['excess', 'idea_return', 'mark_close'], 'and says which figures moved');
-- The official files arrive for those two days: they replace the typed closes (nse_fetch outranks manual) although the idea is final.
select public.store_fetched_closes('2026-03-02', jsonb_build_array(pg_temp.r('BRAVO', 101)), 20000);
select public.store_fetched_closes('2026-03-05', jsonb_build_array(pg_temp.r('BRAVO', 112)), 20400);
select is(pg_temp.px('BRAVO', '2026-03-02') || ' ' || pg_temp.px('BRAVO', '2026-03-05'), '101/nse_fetch 112/nse_fetch',
  'the official rows are recorded for a final idea and replace the typed ones');
select private.score_ideas_now('2026-03-06');
-- 112 / 101 - 1 = 0.1089109 -> 0.108911; excess 0.108911 - 0.02 = 0.088911; no hand_price any more.
select is(pg_temp.sc('BRAVO'), '2026-03-02|101|20000|2026-03-05|112|20400|1|0.108911|0.02|0.088911|3|t|{}', 'the official closes restate the score and clear hand_price');
select is(pg_temp.chg('BRAVO'), 2::bigint, 'the restatement by the official file is logged');
select is((select x.changed from public.idea_score_changes x join public.ideas i on i.id = x.idea_id join public.companies c on c.id = i.company_id
            where c.nse_symbol = 'BRAVO' order by x.id desc limit 1),
  array['entry_close', 'entry_source', 'excess', 'flags', 'idea_return', 'mark_close', 'mark_source'], 'the second entry lists every moved field');
select ok(not pg_temp.is_tracked('BRAVO'), 'once its score rests on fetched closes at both ends a closed idea is no longer tracked');
-- I-5: a close back-filled on an earlier open day moves a fixed entry, and that is logged. XRAY entered 4 March (50 / 20100).
select is(public.enter_closes('2026-03-03', jsonb_build_array(pg_temp.r('XRAY', 48)), null), 1::integer, 'a close is back-filled for 3 March');
select private.score_ideas_now('2026-03-06');
-- Entry 3 March (48 / 20200), mark 5 March (55 / 20400): 55 / 48 - 1 = 0.1458333 -> 0.145833; Nifty 20400 / 20200 - 1 = 0.0099010 -> 0.009901;
-- excess 0.145833 - 0.009901 = 0.135932; 2 days; the entry close is typed: hand_price.
select is(pg_temp.sc('XRAY'), '2026-03-03|48|20200|2026-03-05|55|20400|1|0.145833|0.009901|0.135932|2|f|{hand_price}', 'the back-filled close moves the entry earlier');
select is(pg_temp.sk('XRAY'), '1/-', 'and the skipped days follow');
select is(pg_temp.chg('XRAY'), 1::bigint, 'moving a fixed entry date is logged');
select is((select x.was ->> 'entry_date' || '>' || (x.became ->> 'entry_date') from public.idea_score_changes x join public.ideas i on i.id = x.idea_id
             join public.companies c on c.id = i.company_id where c.nse_symbol = 'XRAY' order by x.id limit 1), '2026-03-04>2026-03-03', 'with the old and the new entry date');
-- A second run writes no change row; the log cannot be changed, not even by the owner.
create temp table chg0 as select count(*) as n from public.idea_score_changes;
select private.score_ideas_now('2026-03-06');
select is((select count(*) from public.idea_score_changes), (select n from chg0), 'a second scoring run writes no change row');
select throws_ok($$ update public.idea_score_changes set was = '{}' $$, 'P0001', 'idea_score_changes is append-only: UPDATE is not allowed', 'the restatement log cannot be updated');
select throws_ok($$ delete from public.idea_score_changes $$, 'P0001', 'idea_score_changes is append-only: DELETE is not allowed', 'the restatement log cannot be deleted from');
select throws_ok($$ truncate public.idea_score_changes $$, 'P0001', 'idea_score_changes is append-only: TRUNCATE is not allowed', 'the restatement log cannot be truncated');

-- 6e. Round 2, N-1: a hand-typed "no action" row never clears jump or isin_changed silently. Any live `none` dated in
-- [day of opening, mark date] marks the score `attested`, which is treated like hand_price. (No score below is final and no
-- entry moves, so none of this writes a restatement row.)
-- Scenario B of the re-review: a made-up factor 1.5 and a `none` on the same date. FOXT is 100 -> 142.85 (+42.85%) over
-- 2 to 6 March; with the factor the step is 142.85 * 1.5 / 100 = 2.14275 (+114.275%), excess 1.14275 - 0.025 = 1.11775.
select is(pg_temp.sc('FOXT'), '2026-03-02|100|20000|2026-03-06|142.85|20500|1|0.4285|0.025|0.4035|4|f|{}', 'FOXT before any action');
insert into public.corporate_actions (company_id, ex_date, factor, kind, note)
  select c.id, '2026-03-04', 1.5, 'other', 'made up' from public.companies c where c.nse_symbol = 'FOXT';
select private.score_ideas_now('2026-03-06');
select is(pg_temp.sc('FOXT'), '2026-03-02|100|20000|2026-03-06|142.85|20500|1.5|1.14275|0.025|1.11775|4|f|{jump}', 'the made-up factor moves the return and is flagged jump');
insert into public.corporate_actions (company_id, ex_date, factor, kind, note)
  select c.id, '2026-03-04', 1, 'none', 'checked' from public.companies c where c.nse_symbol = 'FOXT';
select private.score_ideas_now('2026-03-06');
select is(pg_temp.sc('FOXT'), '2026-03-02|100|20000|2026-03-06|142.85|20500|1.5|1.14275|0.025|1.11775|4|f|{attested}',
  'N-1: a factor plus a `none` on the same date multiplies the return, jump is cleared, and the score is marked attested (never unflagged)');
-- Boundaries of "dated in the span". TANGO opened 2 March 10:00 and is marked 6 March: a `none` on 1 March (before the opening day)
-- or on 9 March (after the mark) is outside; one on the mark date is inside.
insert into public.corporate_actions (company_id, ex_date, factor, kind)
  select c.id, v.d::date, 1, 'none' from public.companies c join (values ('2026-03-01'), ('2026-03-09')) v(d) on c.nse_symbol = 'TANGO';
select private.score_ideas_now('2026-03-06');
select is(pg_temp.sc('TANGO'), '2026-03-02|100|20000|2026-03-06|75|20500|1|-0.25|0.025|-0.275|4|f|{}',
  'a `none` dated before the opening day or after the mark date is not part of the score: no attested flag');
insert into public.corporate_actions (company_id, ex_date, factor, kind)
  select c.id, '2026-03-06', 1, 'none' from public.companies c where c.nse_symbol = 'TANGO';
select private.score_ideas_now('2026-03-06');
select is(pg_temp.sc('TANGO'), '2026-03-02|100|20000|2026-03-06|75|20500|1|-0.25|0.025|-0.275|4|f|{attested}', 'a `none` dated on the mark date is inside');
-- The opening day itself is inside (UNIF opened 2 March; its jump is in the step (2 Mar, 3 Mar], which a `none` dated 2 March does not clear).
insert into public.corporate_actions (company_id, ex_date, factor, kind)
  select c.id, '2026-03-02', 1, 'none' from public.companies c where c.nse_symbol = 'UNIF';
select private.score_ideas_now('2026-03-06');
select is(pg_temp.sc('UNIF'), '2026-03-02|100|20000|2026-03-06|75|20500|1|-0.25|0.025|-0.275|4|f|{attested,jump}',
  'a `none` dated on the opening day is inside the span (attested), and does not clear a jump in a later step');

-- N-3: the hand_price flag looks at every close inside the scored span, not only the entry and the mark. GAMMA is
-- 200 -> 180 with fetched closes on 2 and 6 March; a typed close for 4 March lies strictly between them.
select is(pg_temp.sc('GAMMA'), '2026-03-02|200|20000|2026-03-06|180|20500|1|-0.1|0.025|0.125|4|f|{}', 'GAMMA before the typed close');
select is(public.enter_closes('2026-03-04', jsonb_build_array(pg_temp.r('GAMMA', 150)), null), 1::integer, 'a close is typed for a day between the entry and the mark');
select private.score_ideas_now('2026-03-06');
select is(pg_temp.sc('GAMMA'), '2026-03-02|200|20000|2026-03-06|180|20500|1|-0.1|0.025|0.125|4|f|{hand_price}',
  'N-3: the entry and the mark are official, yet a typed close inside the span marks the score hand_price');
-- N-3: only open trading days are steps. JPCO: 100 on Mon 6 April, a typed 75 on Tue 7 April which is no market day, 55 on Wed 8 April.
-- Read as three steps the fall looks like -25% and -26.7% (no jump); read as the two open days it is -45%.
insert into public.companies (id, slug, name, nse_symbol, isin) values ('cccccccc-0000-4000-8000-0000000000a1', 'jpco', 'JPCO Ltd', 'JPCO', 'INE0JPCO0001');
insert into public.market_days (trade_date, status, source) values ('2026-04-06', 'open', 'nse_fetch'), ('2026-04-08', 'open', 'nse_fetch');
insert into public.prices_daily (company_id, trade_date, close, source, symbol, series, isin) values
  ('cccccccc-0000-4000-8000-0000000000a1', '2026-04-06', 100, 'nse_fetch', 'JPCO', 'EQ', 'INE0JPCO0001'),
  ('cccccccc-0000-4000-8000-0000000000a1', '2026-04-07', 75, 'manual', 'JPCO', 'EQ', 'INE0JPCO0001'),
  ('cccccccc-0000-4000-8000-0000000000a1', '2026-04-08', 55, 'nse_fetch', 'JPCO', 'EQ', 'INE0JPCO0001');
select is(private.has_jump('cccccccc-0000-4000-8000-0000000000a1', '2026-04-06', '2026-04-08'), true,
  'N-3: a typed close on a day that is not an open market day cannot split a 45% fall into two smaller steps');
insert into public.market_days (trade_date, status, source) values ('2026-04-07', 'open', 'nse_fetch');
select is(private.has_jump('cccccccc-0000-4000-8000-0000000000a1', '2026-04-06', '2026-04-08'), false,
  'and when 7 April is an open day the same rows are two steps under the threshold (so the open-day join is what decides)');
-- N-3: a typed close that carries another symbol or ISIN on a non-open day is not read by the identity scan either.
delete from public.market_days where trade_date = '2026-04-07';
update public.prices_daily set symbol = 'OTHER', isin = 'INE0OTHER001' where company_id = 'cccccccc-0000-4000-8000-0000000000a1' and trade_date = '2026-04-07';
select is(private.has_identity_break('cccccccc-0000-4000-8000-0000000000a1', '2026-04-06', '2026-04-08', 'JPCO', 'INE0JPCO0001', '2026-04-06'), false,
  'N-3: a row on a day that is not an open market day is not read by the identity scan');
insert into public.market_days (trade_date, status, source) values ('2026-04-07', 'open', 'nse_fetch');
select is(private.has_identity_break('cccccccc-0000-4000-8000-0000000000a1', '2026-04-06', '2026-04-08', 'JPCO', 'INE0JPCO0001', '2026-04-06'), true,
  'and on an open day it is');
delete from public.market_days where trade_date in ('2026-04-06', '2026-04-07', '2026-04-08');
delete from public.prices_daily where company_id = 'cccccccc-0000-4000-8000-0000000000a1';

-- 7. Stage C1: Mon 9 to Thu 12 March, with Wednesday 11 shut although both closes exist.
select public.store_fetched_closes('2026-03-09', jsonb_build_array(pg_temp.r('FOXA', 330), pg_temp.r('FOXB', 220), pg_temp.r('DELTA', 320),
  pg_temp.r('ECHO', 50), pg_temp.r('MIKE', 450), pg_temp.r('LIMA', 40), pg_temp.r('NECTAR', 200), pg_temp.r('OSCAR', 300)), 20800);
select public.store_fetched_closes('2026-03-10', jsonb_build_array(pg_temp.r('DELTA', 400), pg_temp.r('ECHO', 55), pg_temp.r('ZULU', 77)), 21632);
select is((select count(*) from public.prices_daily p join public.companies c on c.id = p.company_id where c.nse_symbol = 'LIMA' and p.trade_date >= '2026-03-09'),
  0::bigint, 'a closed idea that is final on fetched closes is no longer tracked: its row is dropped');
select private.put_close(c.id, null, '2026-03-11', 700, 'nse_fetch', 'HOTEL', 'EQ', null) from public.companies c where c.nse_symbol = 'HOTEL';
select private.put_close(null, 'NIFTY50', '2026-03-11', 21700, 'nse_fetch', 'NIFTY 50', null, null);
insert into public.market_days (trade_date, status, source) values ('2026-03-11', 'shut', 'nse_fetch');
-- C-1: a typed index close does not reopen a shut day (the calendar follows the ladder).
select public.enter_closes('2026-03-11', '[]'::jsonb, 22222);
select is(pg_temp.md('2026-03-11'), 'shut/nse_fetch', 'a typed index close does not reopen a shut day');
select is(pg_temp.ix('2026-03-11'), '21700/nse_fetch', 'and does not replace the official index close');
select public.store_fetched_closes('2026-03-12', jsonb_build_array(pg_temp.r('HOTEL', 720)), 21850);
select is(private.score_ideas_now('2026-03-11'), pg_temp.nv(), 'stage C1 scoring (as of Wednesday 11 March)');
-- MIKE: closed Friday 16:00, so the exit is Monday 9 March: 450 / 400 - 1 = 0.125; Nifty 20800 / 20000 - 1 = 0.04; excess 0.085; 7 days.
select is(pg_temp.sc('MIKE'), '2026-03-02|400|20000|2026-03-09|450|20800|1|0.125|0.04|0.085|7|t|{}', 'exit_pending becomes final on the next close, over exactly the same dates for the Nifty');
-- FOXA across the weekend: 330 / 300 - 1 = 0.1; Nifty 20800 / 20500 - 1 = 0.0146341...; excess 0.0853658... ; 3 calendar days.
select is(pg_temp.sc('FOXA'), '2026-03-06|300|20500|2026-03-09|330|20800|1|0.1|0.014634|0.085366|3|f|{}', 'a holding that spans a weekend counts calendar days');
select is(pg_temp.sc('FOXB'), '2026-03-09|220|20800|2026-03-09|220|20800|1|0|0|0|0|f|{}', 'the 15:00 event enters on Monday');
-- DELTA (Friday 16:00): entry Monday 320 / 20800, mark Tuesday 400 / 21632: +25%; Nifty +4%; excess 0.21; 1 day.
select is(pg_temp.sc('DELTA'), '2026-03-09|320|20800|2026-03-10|400|21632|1|0.25|0.04|0.21|1|f|{}', 'a Friday-evening event enters on Monday');
-- ECHO (Saturday): 55 / 50 - 1 = 0.1; Nifty +4%; excess 0.06.
select is(pg_temp.sc('ECHO'), '2026-03-09|50|20800|2026-03-10|55|21632|1|0.1|0.04|0.06|1|f|{}', 'a Saturday event enters on Monday');
-- HOTEL (Tuesday 16:00): Wednesday 11 is shut (closes present) so the entry is Thursday 12.
select is(pg_temp.sc('HOTEL'), '2026-03-12|720|21850|2026-03-12|720|21850|1|0|0|0|0|f|{}', 'a shut day is skipped even when closes exist for it');
select is(pg_temp.sk('HOTEL'), '0/-', 'a shut day is not an open day passed over');
select is(pg_temp.sc('LIMA'), '2026-03-02|100|20000|2026-03-05|110|20400|1|0.1|0.02|0.08|3|t|{}', 'LIMA''s score has not moved since the close');
-- I-8.1: opened and closed on the same day, and closed before the entry close exists.
-- OSCAR opened Friday 16:00, closed Saturday 11:00: entry and exit are both Monday 9 March (300 / 20800): return 0, 0 days, final.
select is(pg_temp.sc('OSCAR'), '2026-03-09|300|20800|2026-03-09|300|20800|1|0|0|0|0|t|{}', 'closed before its entry close existed: entry = exit, return 0, final');
-- ZULU opened 10:00 and closed 14:00 on Tuesday 10 March: both before 15:00, so entry = exit = 10 March (77 / 21632).
select is(pg_temp.sc('ZULU'), '2026-03-10|77|21632|2026-03-10|77|21632|1|0|0|0|0|t|{}', 'opened and closed on the same day: entry = exit, return 0, final');
-- NECTAR (Friday 10:00, 1000 / 20500) falls to 200 on Monday 9 March with a 1:5 split whose ex-date is Saturday 7 March:
-- without the action 200 / 1000 - 1 = -0.8 (jump), Nifty +1.46341% -> 0.014634, excess -0.814634.
select is(pg_temp.sc('NECTAR'), '2026-03-06|1000|20500|2026-03-09|200|20800|1|-0.8|0.014634|-0.814634|3|f|{jump}', 'a 1:5 split with no action entered is a jump');
insert into public.corporate_actions (company_id, ex_date, factor, kind, note)
  select c.id, '2026-03-07', 5, 'split', 'ex-date on a Saturday' from public.companies c where c.nse_symbol = 'NECTAR';
select private.score_ideas_now('2026-03-11');
-- With factor 5 dated Saturday 7 March the step (6 Mar, 9 Mar] contains it: 200 * 5 / 1000 - 1 = 0; excess 0 - 0.014634 = -0.014634.
select is(pg_temp.sc('NECTAR'), '2026-03-06|1000|20500|2026-03-09|200|20800|5|0|0.014634|-0.014634|3|f|{}', 'an ex-date on a non-trading day counts for the next trading day');

-- Stage C2: the equity file for 13 March arrives, the index file does not.
select is(public.store_fetched_closes('2026-03-13', jsonb_build_array(pg_temp.r('QUEBEC', 80), pg_temp.r('HOTEL', 756), pg_temp.r('WHISKEY', 66)), null),
  3::integer, 'the equity rows are stored even when the index is missing');
select is((select count(*) from public.market_days where trade_date = '2026-03-13'), 0::bigint, 'the date stays undecided without the Nifty 50 close');
select is(private.score_ideas_now('2026-03-13'), pg_temp.nv(), 'stage C2 scoring');
select is(pg_temp.sc('QUEBEC'), '-|-|-|-|-|-|-|-|-|-|-|f|{entry_pending}', 'the entry waits when the company has a close but the Nifty 50 does not');
select is(pg_temp.sc('HOTEL'), '2026-03-12|720|21850|2026-03-12|720|21850|1|0|0|0|0|f|{}', 'the mark does not move to a day without an index close');
-- Stage C3: the index file arrives.
select is(public.store_fetched_closes('2026-03-13', jsonb_build_array(pg_temp.r('QUEBEC', 80), pg_temp.r('HOTEL', 756), pg_temp.r('WHISKEY', 66)), 22000),
  3::integer, 'fetched again with the index');
select is(pg_temp.md('2026-03-13'), 'open/nse_fetch', 'the date is open once the index is stored');
select is(private.score_ideas_now('2026-03-13'), pg_temp.nv(), 'stage C3 scoring');
-- QUEBEC: entry = mark = 13 March.
select is(pg_temp.sc('QUEBEC'), '2026-03-13|80|22000|2026-03-13|80|22000|1|0|0|0|0|f|{}', 'the entry arrives with the index');
-- HOTEL: 756 / 720 - 1 = 0.05; Nifty 22000 / 21850 - 1 = 0.0068649...; excess 0.0431350...
select is(pg_temp.sc('HOTEL'), '2026-03-12|720|21850|2026-03-13|756|22000|1|0.05|0.006865|0.043135|1|f|{}', 'HOTEL, Nifty 50 over the same two dates');
-- N-4: a small, legitimate-looking factor that moves the step the wrong way is flagged (the test is deliberately strict) until a
-- `none` sits beside it; the `none` then marks the score attested. HOTEL 720 -> 756 (+5%) on 13 March with a factor 1.02 ex that day:
-- 756 * 1.02 / 720 - 1 = 0.071 (the adjusted step, +7.1%, is bigger than the raw +5%); excess 0.071 - 0.006865 = 0.064135.
insert into public.corporate_actions (company_id, ex_date, factor, kind, note)
  select c.id, '2026-03-13', 1.02, 'other', 'small' from public.companies c where c.nse_symbol = 'HOTEL';
select private.score_ideas_now('2026-03-13');
select is(pg_temp.sc('HOTEL'), '2026-03-12|720|21850|2026-03-13|756|22000|1.02|0.071|0.006865|0.064135|1|f|{jump}',
  'N-4: factor 1.02 on a +5% step makes the step bigger (+7.1%) and is flagged jump');
insert into public.corporate_actions (company_id, ex_date, factor, kind, note)
  select c.id, '2026-03-13', 1, 'none', 'checked: 1.02 is right' from public.companies c where c.nse_symbol = 'HOTEL';
select private.score_ideas_now('2026-03-13');
select is(pg_temp.sc('HOTEL'), '2026-03-12|720|21850|2026-03-13|756|22000|1.02|0.071|0.006865|0.064135|1|f|{attested}',
  'N-4: with a `none` beside it the flag is cleared and the score is marked attested');
-- WHISKEY: closed 13 March 16:00, no later close: 66 / 60 - 1 = 0.1; Nifty +10%; excess 0; 11 days.
select is(pg_temp.sc('WHISKEY'), '2026-03-02|60|20000|2026-03-13|66|22000|1|0.1|0.1|0|11|f|{exit_pending}', 'closed after the last close: exit_pending');

-- Source weakest-of-two: QUEBEC on 16 March from an uploaded file (the trusted door), the index typed by hand.
select is(public.store_uploaded_closes('2026-03-16', jsonb_build_array(pg_temp.r('QUEBEC', 82)), null), 1::integer, 'an uploaded company close without an index');
select is((select count(*) from public.market_days where trade_date = '2026-03-16'), 0::bigint, 'still undecided');
select is(public.enter_closes('2026-03-16', '[]'::jsonb, 22100), 0::integer, 'the index typed by hand opens the date');
select is(pg_temp.md('2026-03-16'), 'open/manual', 'C-1: a date opened by a typed index close remembers that it is manual, so it is not "decided"');
select is(private.score_ideas_now('2026-03-16'), pg_temp.nv(), 'stage D scoring');
-- QUEBEC: 82 / 80 - 1 = 0.025; Nifty 22100 / 22000 - 1 = 0.0045454...; excess 0.0204545...; 3 days; the mark has a typed index: hand_price.
select is(pg_temp.sc('QUEBEC'), '2026-03-13|80|22000|2026-03-16|82|22100|1|0.025|0.004545|0.020455|3|f|{hand_price}', 'QUEBEC, marked on 16 March, with a typed index');
select is((select s.entry_source || '/' || s.mark_source from public.idea_scores s join public.ideas i on i.id = s.idea_id
            join public.companies c on c.id = i.company_id where c.nse_symbol = 'QUEBEC'), 'nse_fetch/manual', 'the mark records the weaker of its two sources');
-- The official index arrives for 16 March: it replaces the typed one and the date becomes decided.
select public.store_fetched_closes('2026-03-16', jsonb_build_array(pg_temp.r('QUEBEC', 82)), 22100);
select is(pg_temp.md('2026-03-16') || ' ' || pg_temp.ix('2026-03-16'), 'open/nse_fetch 22100/nse_fetch', 'the fetched index upgrades the date and the close');
select private.score_ideas_now('2026-03-16');
select is(pg_temp.sc('QUEBEC'), '2026-03-13|80|22000|2026-03-16|82|22100|1|0.025|0.004545|0.020455|3|f|{}', 'and the score no longer carries hand_price');
-- M-3: WHISKEY, closed and waiting for its exit close, goes stale after three weekdays (16, 17, 18 March).
select private.score_ideas_now('2026-03-18');
select is(pg_temp.sc('WHISKEY'), '2026-03-02|60|20000|2026-03-13|66|22000|1|0.1|0.1|0|11|f|{exit_pending,stale}', 'a closed idea waiting for its exit goes stale');
select private.score_ideas_now('2026-03-16');

-- 8. The source ladder (ROMEO has an open idea, so its rows are kept). All of 2 February (a Monday).
select public.enter_closes('2026-02-02', jsonb_build_array(pg_temp.r('ROMEO', 10)), 100);
select is(pg_temp.px('ROMEO', '2026-02-02') || ' ' || pg_temp.ix('2026-02-02'), '10/manual 100/manual', 'a typed close is stored');
select is(pg_temp.md('2026-02-02'), 'open/manual', 'a date opened by a typed index close is manual: the daily fetch still asks for it');
select public.store_uploaded_closes('2026-02-02', jsonb_build_array(pg_temp.r('ROMEO', 20)), 200);
select is(pg_temp.px('ROMEO', '2026-02-02') || ' ' || pg_temp.ix('2026-02-02'), '20/nse_upload 200/nse_upload', 'an uploaded file replaces a typed close');
select is(pg_temp.md('2026-02-02'), 'open/nse_upload', 'and upgrades the date');
select public.store_fetched_closes('2026-02-02', jsonb_build_array(pg_temp.r('ROMEO', 30)), 300);
select is(pg_temp.px('ROMEO', '2026-02-02') || ' ' || pg_temp.ix('2026-02-02'), '30/nse_fetch 300/nse_fetch', 'the fetched file replaces an uploaded one');
select is(pg_temp.md('2026-02-02'), 'open/nse_fetch', 'a fetched date is decided');
select public.store_uploaded_closes('2026-02-02', jsonb_build_array(pg_temp.r('ROMEO', 40)), 400);
select is(pg_temp.px('ROMEO', '2026-02-02') || ' ' || pg_temp.ix('2026-02-02'), '30/nse_fetch 300/nse_fetch', 'an uploaded file never replaces a fetched one');
select public.enter_closes('2026-02-02', jsonb_build_array(pg_temp.r('ROMEO', 50)), 500);
select is(pg_temp.px('ROMEO', '2026-02-02') || ' ' || pg_temp.ix('2026-02-02'), '30/nse_fetch 300/nse_fetch', 'a typed close never replaces a fetched one');
select is(pg_temp.md('2026-02-02'), 'open/nse_fetch', 'and a typed or uploaded index never downgrades the date');
select public.store_fetched_closes('2026-02-02', jsonb_build_array(pg_temp.r('ROMEO', 60)), 600);
select is(pg_temp.px('ROMEO', '2026-02-02') || ' ' || pg_temp.ix('2026-02-02'), '30/nse_fetch 300/nse_fetch', 'a second fetch of the same file changes nothing');
select public.enter_closes('2026-02-03', jsonb_build_array(pg_temp.r('ROMEO', 10)), 100);
select public.enter_closes('2026-02-03', jsonb_build_array(pg_temp.r('ROMEO', 11)), 101);
select is(pg_temp.px('ROMEO', '2026-02-03') || ' ' || pg_temp.ix('2026-02-03'), '11/manual 101/manual', 'a typed close is corrected by typing it again');
select public.store_uploaded_closes('2026-02-03', jsonb_build_array(pg_temp.r('ROMEO', 21)), 201);
select public.store_uploaded_closes('2026-02-03', jsonb_build_array(pg_temp.r('ROMEO', 22)), 202);
select is(pg_temp.px('ROMEO', '2026-02-03') || ' ' || pg_temp.ix('2026-02-03'), '21/nse_upload 201/nse_upload', 'an uploaded close is not replaced by a second upload');
-- enter_closes rules.
select is(public.enter_closes('2026-02-04', jsonb_build_array(pg_temp.r('ROMEO', 12), pg_temp.r('SIERRA', 11), pg_temp.r('UNTRK', 5)), null), 1::integer,
  'enter_closes keeps rows only for companies with a non-void idea (SIERRA is void, UNTRK has none)');
select is((select count(*) from public.prices_daily p join public.companies c on c.id = p.company_id
            where c.nse_symbol in ('SIERRA', 'UNTRK') and p.trade_date = '2026-02-04'), 0::bigint, 'the dropped rows are not stored');
select is((select count(*) from public.market_days where trade_date = '2026-02-04'), 0::bigint, 'no index close, so the date is undecided');
select throws_ok($$ select public.enter_closes(((now() at time zone 'Asia/Kolkata')::date + 1), '[]'::jsonb, 100) $$, 'P0001', 'ledger:future_date',
  'enter_closes refuses a future date');
select throws_ok($$ select public.store_uploaded_closes(((now() at time zone 'Asia/Kolkata')::date + 1), '[]'::jsonb, 100) $$, 'P0001', 'ledger:future_date',
  'store_uploaded_closes refuses a future date');
select throws_ok($$ select public.enter_closes('2026-02-05', '[]'::jsonb, 0) $$, 'P0001', 'ledger:bad_close', 'a Nifty 50 close of zero is refused');
select throws_ok($$ select public.store_fetched_closes(((now() at time zone 'Asia/Kolkata')::date + 1), '[]'::jsonb, 100) $$, 'P0001', 'ledger:future_date',
  'store_fetched_closes refuses a future date');
select throws_ok($$ select public.store_fetched_closes('2026-02-05', '{"a":1}'::jsonb, 100) $$, 'P0001', 'ledger:bad_rows', 'rows must be an array');
select is(public.store_fetched_closes('2026-02-05', jsonb_build_array(pg_temp.r('ROMEO', -5), pg_temp.r('ROMEO', 0)), null), 0::integer,
  'a non-positive close is dropped, never stored');
select is(public.enter_closes('2026-02-06', jsonb_build_array(jsonb_build_object('symbol', 'ROMEO', 'close', 'abc')), null), 0::integer,
  'a close that is not a number is dropped');
-- C-1: nothing before the close of the day, and a typed close never on a weekend.
-- The rule is exercised end to end with a clock argument that no API role can reach (private.put_hand_closes(.., p_now)), so
-- the result does not depend on the hour the suite runs (round 2, N-7). 2026-02-12 is a Thursday, 2026-02-14 a Saturday.
select throws_ok($$ select private.put_hand_closes('2026-02-12', '[]'::jsonb, 5, 'manual', '2026-02-12 15:29:59+05:30') $$, 'P0001', 'ledger:future_date',
  'a typed close for a day is refused one second before 15:30 IST of that day');
select is(pg_temp.md('2026-02-12'), null, 'and nothing was stored');
select lives_ok($$ select private.put_hand_closes('2026-02-12', '[]'::jsonb, 5, 'manual', '2026-02-12 15:30:00+05:30') $$,
  'and accepted at 15:30:00 IST sharp');
select is(pg_temp.ix('2026-02-12'), '5/manual', 'the typed index close was stored');
select throws_ok($$ select private.put_hand_closes('2026-02-14', '[]'::jsonb, 5, 'manual', '2026-02-14 16:00:00+05:30') $$, 'P0001', 'ledger:weekend',
  'a typed close on a Saturday is refused even after the close');
select lives_ok($$ select private.put_hand_closes('2026-02-14', '[]'::jsonb, 5, 'nse_upload', '2026-02-14 16:00:00+05:30') $$,
  'while the trusted upload door accepts a special Saturday session');
select throws_ok($$ select private.put_hand_closes('2026-02-14', '[]'::jsonb, 5, 'nse_upload', '2026-02-14 15:29:59+05:30') $$, 'P0001', 'ledger:future_date',
  'and not before its close either');
select ok(not private.market_closed('2026-03-06', '2026-03-06 15:29:59+05:30') and private.market_closed('2026-03-06', '2026-03-06 15:30:00+05:30')
      and not private.market_closed('2026-03-06', '2026-03-06 09:59:59+00') and private.market_closed('2026-03-06', '2026-03-06 10:00:00+00')
      and not private.market_closed(null, '2026-03-06 15:30:00+05:30'),
  'the close of a day is known from 15:30:00 IST sharp (10:00 UTC), not before');
select throws_ok($$ select public.enter_closes('2026-02-07', '[]'::jsonb, 100) $$, 'P0001', 'ledger:weekend', 'a typed index close on a Saturday is refused');
select throws_ok($$ select public.enter_closes('2026-02-08', jsonb_build_array(jsonb_build_object('symbol', 'ROMEO', 'close', 9)), null) $$, 'P0001', 'ledger:weekend',
  'typed company closes on a Sunday are refused');
select public.store_uploaded_closes('2026-02-07', '[]'::jsonb, 100);
select is(pg_temp.md('2026-02-07'), 'open/nse_upload', 'an official file for a special Saturday session is accepted through the trusted door');
-- M-1: only equity series are stored; a tie between two rows of one symbol is broken by the lower close, whatever the file order.
select is(public.store_fetched_closes('2026-02-10', jsonb_build_array(pg_temp.r('PAPA', 5, null, 'RE')), null), 0::integer, 'a rights-entitlement series is not a share close');
select is(public.store_fetched_closes('2026-02-10', jsonb_build_array(pg_temp.r('PAPA', 8), pg_temp.r('PAPA', 7)), null), 1::integer, 'two EQ rows of one symbol store one close');
select is(public.store_fetched_closes('2026-02-11', jsonb_build_array(pg_temp.r('PAPA', 7), pg_temp.r('PAPA', 8)), null), 1::integer, 'in the other order too');
select is(pg_temp.px('PAPA', '2026-02-10') || ' ' || pg_temp.px('PAPA', '2026-02-11'), '7/nse_fetch 7/nse_fetch', 'the same input stores the same close');
-- Round 2, N-8: a typed ISIN is kept only in its real shape (twelve capitals or digits); anything else is stored as none.
select public.store_fetched_closes('2026-02-13', jsonb_build_array(pg_temp.r('ROMEO', 5, 'INE123456789')), null);
select public.store_fetched_closes('2026-02-16', jsonb_build_array(pg_temp.r('ROMEO', 5, repeat('A', 5000))), null);
select public.store_fetched_closes('2026-02-17', jsonb_build_array(pg_temp.r('ROMEO', 5, 'ine123456789')), null);
select public.store_fetched_closes('2026-02-18', jsonb_build_array(pg_temp.r('ROMEO', 5, 'INE12345678')), null);
select is((select string_agg(coalesce(p.isin, '-'), ',' order by p.trade_date) from public.prices_daily p join public.companies c on c.id = p.company_id
            where c.nse_symbol = 'ROMEO' and p.trade_date between '2026-02-13' and '2026-02-18'),
  'INE123456789,-,-,-', 'N-8: a real-shaped ISIN is kept; a 5,000-character one, a lower-case one and an eleven-character one are stored as none');

-- 9. mark_market_day_shut, on dates relative to today (the rule is about the 7-day fetch window).
select set_config('ledger_probe.today', ((now() at time zone 'Asia/Kolkata')::date)::text, true);
select public.store_fetched_closes(current_setting('ledger_probe.today')::date - 3, '[]'::jsonb, 25000);
select public.store_fetched_closes(current_setting('ledger_probe.today')::date - 6, jsonb_build_array(pg_temp.r('ROMEO', 77)), null);
select public.mark_market_day_shut(current_setting('ledger_probe.today')::date - 5);
select is((select status from public.market_days where trade_date = current_setting('ledger_probe.today')::date - 5), 'shut',
  'a missing file is a shut day when a later date is open');
select public.mark_market_day_shut(current_setting('ledger_probe.today')::date - 1);
select is((select count(*) from public.market_days where trade_date = current_setting('ledger_probe.today')::date - 1), 0::bigint,
  'a missing file with no later open date is not decided');
select public.mark_market_day_shut(current_setting('ledger_probe.today')::date - 3);
select is((select status from public.market_days where trade_date = current_setting('ledger_probe.today')::date - 3), 'open', 'an open day is never turned shut');
select public.mark_market_day_shut(current_setting('ledger_probe.today')::date - 20);
select is((select count(*) from public.market_days where trade_date = current_setting('ledger_probe.today')::date - 20), 0::bigint,
  'a date older than the 7-day fetch window is never marked');
select public.mark_market_day_shut(current_setting('ledger_probe.today')::date - 6);
select is((select count(*) from public.market_days where trade_date = current_setting('ledger_probe.today')::date - 6), 0::bigint,
  'a date for which closes arrived is never marked shut');
select public.mark_market_day_shut(current_setting('ledger_probe.today')::date + 1);
select is((select count(*) from public.market_days where trade_date = current_setting('ledger_probe.today')::date + 1), 0::bigint, 'a future date is never marked');
-- C-1: a date opened only by a typed index close has no official file; the missing official file shuts it, and a typed close cannot reopen it.
select private.put_index_close(current_setting('ledger_probe.today')::date - 4, 123, 'manual');
select is(pg_temp.md(current_setting('ledger_probe.today')::date - 4), 'open/manual', 'a typed index close opens a date as manual');
select public.mark_market_day_shut(current_setting('ledger_probe.today')::date - 4);
select is(pg_temp.md(current_setting('ledger_probe.today')::date - 4), 'shut/nse_fetch', 'the missing official file shuts a date that only a typed close opened');
select private.put_index_close(current_setting('ledger_probe.today')::date - 4, 124, 'manual');
select is(pg_temp.md(current_setting('ledger_probe.today')::date - 4), 'shut/nse_fetch', 'and a typed close cannot reopen it');
select private.put_index_close(current_setting('ledger_probe.today')::date - 4, 125, 'nse_upload');
select is(pg_temp.md(current_setting('ledger_probe.today')::date - 4), 'shut/nse_fetch', 'nor can an uploaded one (only a fetch outranks a fetch)');
select private.put_index_close(current_setting('ledger_probe.today')::date - 4, 126, 'nse_fetch');
select is(pg_temp.md(current_setting('ledger_probe.today')::date - 4), 'open/nse_fetch', 'the official fetch can reopen a day that was shut');

-- 10. tracked_symbols: open ideas, and closed ones until their score rests on fetched closes; not void.
select is((select array_agg(s order by s) from public.tracked_symbols() s),
  array['ALPHA', 'DELTA', 'ECHO', 'FOXA', 'FOXB', 'FOXT', 'GAMMA', 'GOLF', 'HOTEL', 'INDIA', 'JULIET', 'KAPPA', 'KILO', 'LONGSHOT', 'NECTAR', 'NOVEM',
         'PAPA', 'QUEBEC', 'ROMEO', 'TANGO', 'UNIF', 'WHISKEY', 'WOLF', 'XRAY', 'ZEBRA'],
  'tracked_symbols lists 25: the 24 open ideas and WHISKEY (exit pending); not the eight closed ideas that are final on fetched closes, not SIERRA (void)');

-- 11. Idempotence: a second run changes nothing but computed_at; no event was touched by scoring.
create temp table snap as
  select s.idea_id, to_jsonb(s) - 'computed_at' as j, s.computed_at from public.idea_scores s;
create temp table ev_snap as select md5(string_agg(e.canonical || e.hash || e.recorded_at::text, ',' order by e.seq)) as m from public.idea_events e;
select pg_sleep(0.02);
select is(private.score_ideas_now('2026-03-16'), pg_temp.nv(), 'a second run');
select is((select count(*) from public.idea_scores s join snap on snap.idea_id = s.idea_id
            where to_jsonb(s) - 'computed_at' = snap.j), pg_temp.nv()::bigint, 'every row is identical but for computed_at');
select is((select count(*) from public.idea_scores s join snap on snap.idea_id = s.idea_id where s.computed_at > snap.computed_at), pg_temp.nv()::bigint,
  'computed_at moved on every row');
select is((select count(*) from public.idea_score_changes), (select n from chg0), 'a second run writes no change row');
select is((select md5(string_agg(e.canonical || e.hash || e.recorded_at::text, ',' order by e.seq)) from public.idea_events e), (select m from ev_snap),
  'scoring wrote nothing into idea_events');
select is((select count(*) from public.idea_events e where e.canonical::jsonb -> 'stance' ?| array['price', 'close', 'return', 'excess', 'score', 'factor']), 0::bigint,
  'no sealed stance carries a price, a return or a score key');
select is((select count(*) from public.idea_scores s join public.ideas i on i.id = s.idea_id
            where s.excess is not null and s.excess <> case i.expects when 'outperform' then s.idea_return - s.index_return
                                                                       else -(s.idea_return - s.index_return) end), 0::bigint,
  'M-2: on every score the excess is exactly the difference of the shown returns');
-- Round 2, N-7: the per-idea exception branch of the scorer. No stored figure can overflow a column, so the fixture narrows
-- one (idea_return to numeric(3,2), at most 9.99) inside a block that is rolled back, and gives ALPHA a mark of 1500 (+1400%,
-- below the 1000x plausibility limit, so the figure is not withheld before it is stored). The assignment overflows, the handler
-- stores ALPHA with no figures and the flag implausible, and the run still scores every other idea.
create function pg_temp.overflow_probe() returns text language plpgsql as $$
declare v_msg text; v_n integer; v_row text; v_other text;
begin
  begin
    update public.prices_daily p set close = 1500 from public.companies c
     where c.id = p.company_id and c.nse_symbol = 'ALPHA' and p.trade_date = '2026-03-06';
    alter table public.idea_scores alter column idea_return type numeric(3, 2);
    v_n := private.score_ideas_now('2026-03-16');
    select s.flags::text || '/' || (s.entry_date is null) || '/' || (s.idea_return is null) into v_row
      from public.idea_scores s join public.ideas i on i.id = s.idea_id join public.companies c on c.id = i.company_id where c.nse_symbol = 'ALPHA';
    select (s.idea_return is not null)::text into v_other
      from public.idea_scores s join public.ideas i on i.id = s.idea_id join public.companies c on c.id = i.company_id where c.nse_symbol = 'GAMMA';
    raise exception 'probe|%|%|%', v_n, v_row, v_other;
  exception when others then
    v_msg := sqlerrm;
  end;
  return v_msg;
end $$;
select is(pg_temp.overflow_probe(), 'probe|' || pg_temp.nv() || '|{implausible}/true/true|true',
  'N-7: a numeric overflow inside one idea''s block stores that idea with no figures and implausible, and the run still scores every idea');
select is(pg_temp.sc('ALPHA'), '2026-03-02|100|20000|2026-03-06|120|20500|1|0.2|0.025|0.175|4|f|{stale}', 'and the probe left no trace (ALPHA is as before)');

-- Session time zone must not matter (the 15:00 cut-off is an explicit IST rule).
select set_config('ledger_probe.tz', current_setting('timezone'), true);
set local timezone = 'America/New_York';
select is(private.score_ideas_now('2026-03-16'), pg_temp.nv(), 'scoring under a New York session time zone');
select is((select count(*) from public.idea_scores s join snap on snap.idea_id = s.idea_id
            where to_jsonb(s) - 'computed_at' = snap.j), pg_temp.nv()::bigint, 'gives the same scores (FOXA at 14:59 IST still enters the same day, FOXB at 15:00 does not)');
select ok(not private.market_closed('2026-03-06', '2026-03-06 15:29:59+05:30') and private.market_closed('2026-03-06', '2026-03-06 15:30:00+05:30'),
  'market_closed does not depend on the session time zone');
select set_config('timezone', current_setting('ledger_probe.tz'), true);

-- 12. I-1: the scorer takes the facts from the sealed events and refuses to run on a ledger that does not agree with itself.
create function pg_temp.tamper(p_kind text) returns void language plpgsql as $$
declare v_a uuid := (select id from pg_temp.ids where sym = 'ALPHA');
        v_l uuid := (select id from pg_temp.ids where sym = 'LIMA');
        v_t timestamptz;
begin
  if p_kind = 'expects' then
    alter table public.ideas disable trigger ideas_guard_update;
    update public.ideas set expects = 'underperform' where id = v_a;
  elsif p_kind = 'void' then
    update public.ideas set status = 'void' where id = v_a;
  elsif p_kind = 'company' then
    alter table public.ideas disable trigger ideas_guard_update;
    update public.ideas set company_id = (select c.id from public.companies c where c.nse_symbol = 'GAMMA') where id = v_a;
  elsif p_kind = 'unclosed' then
    alter table public.ideas disable trigger ideas_guard_update;
    update public.ideas set status = 'open', closed_at = null, close_reason = null where id = v_l;
  elsif p_kind = 'time' then
    v_t := (select e.recorded_at + interval '1 minute' from public.idea_events e where e.idea_id = v_a and e.kind = 'open');
    perform pg_temp.move(v_a, 'open', v_t);
  elsif p_kind = 'held' then
    update public.ideas set held = not held where id = v_a;
  elsif p_kind = 'garbage' then
    -- N-5: an open event whose sealed text cannot be parsed, with its hash recomputed so that the hash walk itself passes
    alter table public.idea_events disable trigger idea_events_append_only;
    update public.idea_events e set canonical = 'not json at all',
           hash = encode(sha256(convert_to(e.prev_hash || E'
' || 'not json at all', 'UTF8')), 'hex')
     where e.idea_id = v_a and e.kind = 'open';
  end if;
  perform private.score_ideas_now('2026-03-16');
end $$;
create function pg_temp.why(p_kind text) returns text language plpgsql as $$
declare v_d text;
begin
  perform pg_temp.tamper(p_kind);
  return 'no error';
exception when others then
  get stacked diagnostics v_d = pg_exception_detail;
  return sqlerrm || ' / ' || coalesce(v_d, '');
end $$;
select is(pg_temp.why('none'), 'no error', 'the scorer runs on the untouched ledger');
-- N-5: the chain check runs before the projection check, and its replay covers direction, status and company too, so these
-- are reported as chain_broken (the projection check stays as the second line and is not reachable while the replay holds).
select ok(pg_temp.why('expects') like 'ledger:chain_broken / first_bad_seq=% bad_idea=' || (select id::text from pg_temp.ids where sym = 'ALPHA'),
  'a flipped direction on the ideas row stops the run and names the idea');
select throws_ok($$ select pg_temp.tamper('void') $$, 'P0001', 'ledger:chain_broken', 'an idea marked void with no void event stops the run (its loss cannot be withdrawn by the projection)');
select throws_ok($$ select pg_temp.tamper('company') $$, 'P0001', 'ledger:chain_broken', 'an idea re-pointed at another company stops the run');
select throws_ok($$ select pg_temp.tamper('unclosed') $$, 'P0001', 'ledger:chain_broken', 'an idea with a close event but status open stops the run');
select throws_ok($$ select pg_temp.tamper('garbage') $$, 'P0001', 'ledger:chain_broken',
  'N-5: a sealed text that cannot be parsed is chain_broken, not a raw cast error (the chain check runs before any sealed text is parsed)');
select ok(pg_temp.why('held') like 'ledger:chain_broken / first_bad_seq=% bad_idea=' || (select id::text from pg_temp.ids where sym = 'ALPHA'),
  'a projection field the replay check covers (held) stops the run and names the idea');
select ok(pg_temp.why('time') like 'ledger:chain_broken / first_bad_seq=%', 'an event time moved without a re-seal stops the run and names the first bad seq');
select is((select count(*) from public.idea_scores s join snap on snap.idea_id = s.idea_id
            where to_jsonb(s) - 'computed_at' = snap.j), pg_temp.nv()::bigint, 'the stored scores are left exactly as they were');
select ok((select ok from private.ledger_chain_check()), 'the chain still verifies after all of it (the tampering was undone)');

-- 13. Roles. anon: every door shut.
set local role anon;
select throws_ok($$ select * from public.prices_daily $$, '42501', null, 'anon cannot read prices_daily');
select throws_ok($$ select * from public.idea_scores $$, '42501', null, 'anon cannot read idea_scores');
select throws_ok($$ select * from public.idea_score_changes $$, '42501', null, 'anon cannot read idea_score_changes');
select throws_ok($$ select * from public.market_days $$, '42501', null, 'anon cannot read market_days');
select throws_ok($$ select * from public.corporate_actions $$, '42501', null, 'anon cannot read corporate_actions');
select throws_ok($$ select public.score_ideas() $$, '42501', null, 'anon cannot run score_ideas');
select throws_ok($$ select public.rescore_ideas() $$, '42501', null, 'anon cannot run rescore_ideas');
select throws_ok($$ select public.tracked_symbols() $$, '42501', null, 'anon cannot list tracked symbols');
select throws_ok($$ select public.store_fetched_closes('2026-02-09', '[]'::jsonb, 100) $$, '42501', null, 'anon cannot store fetched closes');
select throws_ok($$ select public.store_uploaded_closes('2026-02-09', '[]'::jsonb, 100) $$, '42501', null, 'anon cannot store uploaded closes');
select throws_ok($$ select public.enter_closes('2026-02-09', '[]'::jsonb, 100) $$, '42501', null, 'anon cannot enter closes');
select throws_ok($$ select public.mark_market_day_shut('2026-02-09') $$, '42501', null, 'anon cannot mark a shut day');
reset role;

-- The admin: reads, rescoring, entering closes and actions; but no direct write on prices, calendar, scores, the log or an action.
set local role authenticated;
select lives_ok($$ select public.rescore_ideas() $$, 'the admin may run rescore_ideas');
select is((select count(*) from public.idea_scores), 33::bigint, 'the admin reads the scores');
select ok((select count(*) from public.idea_score_changes) > 0, 'the admin reads the restatement log');
select ok((select count(*) from public.prices_daily) > 0 and (select count(*) from public.market_days) > 0, 'the admin reads prices and the calendar');
select throws_ok($$ select public.score_ideas() $$, '42501', null, 'the admin cannot run the job''s score_ideas');
select throws_ok($$ select public.tracked_symbols() $$, '42501', null, 'the admin cannot run tracked_symbols');
select throws_ok($$ select public.store_fetched_closes('2026-02-09', '[]'::jsonb, 100) $$, '42501', null, 'the admin cannot run store_fetched_closes');
select throws_ok($$ select public.store_uploaded_closes('2026-02-09', '[]'::jsonb, 100) $$, '42501', null,
  'C-1: the admin session cannot run the door that writes the nse_upload source');
select throws_ok($$ select public.mark_market_day_shut('2026-02-09') $$, '42501', null, 'the admin cannot run mark_market_day_shut');
select throws_ok($$ insert into public.prices_daily (benchmark, trade_date, close, source) values ('NIFTY50', '2026-02-09', 100, 'nse_fetch') $$, '42501', null,
  'the admin cannot insert into prices_daily (so cannot write a row labelled as an official file)');
select throws_ok($$ update public.prices_daily set close = 1 $$, '42501', null, 'the admin cannot update prices_daily');
select throws_ok($$ delete from public.prices_daily $$, '42501', null, 'the admin cannot delete from prices_daily');
select throws_ok($$ insert into public.market_days (trade_date, status, source) values ('2026-02-09', 'open', 'nse_fetch') $$, '42501', null,
  'the admin cannot insert into market_days');
select throws_ok($$ update public.market_days set status = 'shut' $$, '42501', null, 'the admin cannot update market_days');
select throws_ok($$ insert into public.idea_scores (idea_id, is_final) select id, true from public.ideas limit 1 $$, '42501', null,
  'the admin cannot insert into idea_scores');
select throws_ok($$ update public.idea_scores set excess = 9 $$, '42501', null, 'the admin cannot write a score');
select throws_ok($$ delete from public.idea_scores $$, '42501', null, 'the admin cannot delete a score');
select throws_ok($$ insert into public.idea_score_changes (idea_id, changed, was, became) select id, '{}', '{}', '{}' from public.ideas limit 1 $$, '42501', null,
  'the admin cannot write the restatement log');
select throws_ok($$ delete from public.idea_score_changes $$, '42501', null, 'the admin cannot delete from the restatement log');
select throws_ok($$ update public.corporate_actions set factor = 9 $$, '42501', null, 'the admin cannot edit a corporate action (a correction supersedes)');
select throws_ok($$ delete from public.corporate_actions $$, '42501', null, 'the admin cannot delete a corporate action');
reset role;

-- A signed-in user who is not the admin sees nothing and writes nothing.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.prices_daily), 0::bigint, 'a non-admin reads no prices');
select is((select count(*) from public.idea_scores), 0::bigint, 'a non-admin reads no scores');
select is((select count(*) from public.idea_score_changes), 0::bigint, 'a non-admin reads no restatement log');
select is((select count(*) from public.market_days) + (select count(*) from public.corporate_actions), 0::bigint, 'a non-admin reads no calendar and no actions');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values (gen_random_uuid(), '2026-02-09', 2, 'bonus') $$,
  '42501', null, 'a non-admin cannot enter a corporate action');
select throws_ok($$ delete from public.corporate_actions $$, '42501', null, 'a non-admin cannot delete a corporate action');
select throws_ok($$ select public.enter_closes('2026-02-09', '[]'::jsonb, 100) $$, '42501', null, 'a non-admin cannot enter closes');
select throws_ok($$ select public.rescore_ideas() $$, '42501', null, 'a non-admin cannot rescore');
reset role;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- service_role: the job's doors, and nothing on the tables but market_days.
set local role service_role;
select is(public.score_ideas(), 33, 'service_role runs score_ideas (every non-void idea)');
select ok((select count(*) from public.tracked_symbols()) = 25, 'service_role lists the tracked symbols');
select ok((select count(*) from public.market_days) > 0, 'service_role reads market_days');
select throws_ok($$ select * from public.prices_daily $$, '42501', null, 'service_role cannot read prices_daily');
select throws_ok($$ select * from public.idea_scores $$, '42501', null, 'service_role cannot read idea_scores');
select throws_ok($$ select * from public.idea_score_changes $$, '42501', null, 'service_role cannot read idea_score_changes');
select throws_ok($$ insert into public.prices_daily (benchmark, trade_date, close, source) values ('NIFTY50', '2026-02-09', 100, 'nse_fetch') $$, '42501', null,
  'service_role cannot insert into prices_daily');
select throws_ok($$ insert into public.market_days (trade_date, status, source) values ('2026-02-09', 'open', 'nse_fetch') $$, '42501', null,
  'service_role cannot insert into market_days');
select throws_ok($$ insert into public.idea_scores (idea_id, is_final) select id, true from public.ideas limit 1 $$, '42501', null,
  'service_role cannot insert into idea_scores');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values (gen_random_uuid(), '2026-02-09', 2, 'bonus') $$,
  '42501', null, 'service_role cannot insert a corporate action');
select throws_ok($$ select public.rescore_ideas() $$, '42501', null, 'service_role cannot run the admin''s rescore_ideas');
select throws_ok($$ select public.enter_closes('2026-02-09', '[]'::jsonb, 100) $$, '42501', null, 'service_role cannot run enter_closes');
select lives_ok($$ select public.store_fetched_closes('2026-02-09', '[]'::jsonb, 100) $$, 'service_role stores fetched closes');
select lives_ok($$ select public.store_uploaded_closes('2026-02-10', '[]'::jsonb, 100) $$, 'service_role stores uploaded closes (the trusted door)');
select lives_ok($$ select public.mark_market_day_shut('2026-02-09') $$, 'service_role marks shut days (a no-op for an old date)');
reset role;

select * from finish();
rollback;
