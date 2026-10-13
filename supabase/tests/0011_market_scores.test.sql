-- 20261013000011_market.sql and 20261013000012_scores.sql: closing prices with a source ladder, the trading calendar, corporate actions and the
-- one scoring function (Plan 3a Task 2; spec s5.4 and s6; ADR-005 s3.4, s3.5). Every expected figure below is worked by
-- hand in a comment next to it. Calendar: March 2026, Mon 2 .. Fri 6, Mon 9 .. Fri 13 (Sat 7 and Sun 8 have no market day).
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(181);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');
-- The owner plays the admin session for fixtures (the writers read the caller from the claims, not the role).
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, service_role;

-- Fixture helpers (the owner only).
create function pg_temp.mk(p_sym text, p_exp text, p_at text) returns uuid language plpgsql as $$
declare v_c uuid := gen_random_uuid(); v_i uuid;
begin
  insert into public.companies (id, slug, name, nse_symbol, isin) values (v_c, lower(p_sym), p_sym || ' Ltd', p_sym, 'INE000' || p_sym);
  v_i := public.open_idea(v_c, p_exp, 365, true, 'Because ' || p_sym);
  perform pg_temp.move(v_i, 'open', (p_at::timestamp at time zone 'Asia/Kolkata'));
  insert into pg_temp.ids values (p_sym, v_i);
  return v_i;
end $$;
create temp table ids (sym text primary key, id uuid);
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
create function pg_temp.r(p_sym text, p_close numeric, p_isin text default null, p_series text default 'EQ') returns jsonb
language sql as $$ select jsonb_build_object('symbol', p_sym, 'series', p_series, 'isin', p_isin, 'close', p_close) $$;
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
create function pg_temp.px(p_sym text, p_day date) returns text language sql as $$
  select trim_scale(p.close)::text || '/' || p.source from public.prices_daily p join public.companies c on c.id = p.company_id
   where c.nse_symbol = p_sym and p.trade_date = p_day $$;
create function pg_temp.ix(p_day date) returns text language sql as $$
  select trim_scale(p.close)::text || '/' || p.source from public.prices_daily p where p.benchmark = 'NIFTY50' and p.trade_date = p_day $$;

-- 1. Structure and constraints.
select has_table('public', 'prices_daily', 'prices_daily exists');
select has_table('public', 'market_days', 'market_days exists');
select has_table('public', 'corporate_actions', 'corporate_actions exists');
select has_table('public', 'idea_scores', 'idea_scores exists');
select ok((select bool_and(c.relrowsecurity) from pg_class c
            where c.oid in ('public.prices_daily'::regclass, 'public.market_days'::regclass,
                            'public.corporate_actions'::regclass, 'public.idea_scores'::regclass)),
  'RLS is enabled on all four tables');
select is(to_char(date '2026-03-02', 'Dy') || to_char(date '2026-03-06', 'Dy') || to_char(date '2026-03-07', 'Dy') || to_char(date '2026-03-09', 'Dy'),
  'MonFriSatMon', 'the calendar this file relies on is right: 2 Mar is a Monday, 7 Mar a Saturday');
select is((select count(*) from pg_attribute a where a.attrelid = 'public.idea_events'::regclass and a.attnum > 0 and not a.attisdropped
             and a.attname ~* '(price|close|return|score|excess|factor)'), 0::bigint,
  'idea_events has no column that could hold a price, a return or a score');

-- 2. Privileges. anon holds nothing; no API role writes prices, calendar or scores; the admin may add and remove corporate actions.
select is_empty($$
  select c.relname from pg_class c
   where c.oid in ('public.prices_daily'::regclass, 'public.market_days'::regclass, 'public.corporate_actions'::regclass, 'public.idea_scores'::regclass)
     and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
          or has_any_column_privilege('anon', c.oid, 'select,insert,update,references'))
$$, 'anon holds no privilege on any of the four tables');
select is_empty($$
  select p.polname from pg_policy p
   where p.polrelid in ('public.prices_daily'::regclass, 'public.market_days'::regclass, 'public.corporate_actions'::regclass, 'public.idea_scores'::regclass)
     and (p.polroles = '{0}'::oid[] or p.polroles @> array['anon'::regrole::oid])
$$, 'no policy on the four tables reaches anon or PUBLIC');
select ok(not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
                       and pg_get_viewdef(c.oid) ~* '(prices_daily|market_days|corporate_actions|idea_scores)'),
  'no view in public reads the four tables');
select is_empty($$
  select c.relname from pg_class c
   where c.oid in ('public.prices_daily'::regclass, 'public.market_days'::regclass, 'public.idea_scores'::regclass)
     and (has_table_privilege('authenticated', c.oid, 'insert,update,delete,truncate,references')
          or has_any_column_privilege('authenticated', c.oid, 'insert,update,references')
          or has_table_privilege('service_role', c.oid, 'insert,update,delete,truncate,references')
          or has_any_column_privilege('service_role', c.oid, 'insert,update,references'))
$$, 'no API role can write prices_daily, market_days or idea_scores');
select ok(has_table_privilege('authenticated', 'public.prices_daily', 'select')
      and has_table_privilege('authenticated', 'public.market_days', 'select')
      and has_table_privilege('authenticated', 'public.corporate_actions', 'select')
      and has_table_privilege('authenticated', 'public.idea_scores', 'select')
      and has_table_privilege('authenticated', 'public.corporate_actions', 'delete')
      and has_column_privilege('authenticated', 'public.corporate_actions', 'factor', 'insert')
      and not has_table_privilege('authenticated', 'public.corporate_actions', 'update')
      and not has_any_column_privilege('authenticated', 'public.corporate_actions', 'update')
      and not has_table_privilege('authenticated', 'public.corporate_actions', 'truncate'),
  'authenticated reads all four, inserts and deletes corporate_actions, updates nothing');
select ok(has_table_privilege('service_role', 'public.market_days', 'select')
      and not has_any_column_privilege('service_role', 'public.prices_daily', 'select,insert,update')
      and not has_any_column_privilege('service_role', 'public.idea_scores', 'select,insert,update')
      and not has_any_column_privilege('service_role', 'public.corporate_actions', 'select,insert,update'),
  'service_role reads market_days only and holds nothing on the other three');
select ok(not has_function_privilege('anon', 'public.store_fetched_closes(date, jsonb, numeric)', 'execute')
      and not has_function_privilege('anon', 'public.mark_market_day_shut(date)', 'execute')
      and not has_function_privilege('anon', 'public.enter_closes(date, jsonb, numeric, text)', 'execute')
      and not has_function_privilege('anon', 'public.score_ideas()', 'execute')
      and not has_function_privilege('anon', 'public.rescore_ideas()', 'execute')
      and not has_function_privilege('anon', 'public.tracked_symbols()', 'execute'),
  'anon cannot execute any function of this migration');
select ok(has_function_privilege('service_role', 'public.store_fetched_closes(date, jsonb, numeric)', 'execute')
      and has_function_privilege('service_role', 'public.mark_market_day_shut(date)', 'execute')
      and has_function_privilege('service_role', 'public.score_ideas()', 'execute')
      and has_function_privilege('service_role', 'public.tracked_symbols()', 'execute')
      and not has_function_privilege('service_role', 'public.enter_closes(date, jsonb, numeric, text)', 'execute')
      and not has_function_privilege('service_role', 'public.rescore_ideas()', 'execute')
      and has_function_privilege('authenticated', 'public.enter_closes(date, jsonb, numeric, text)', 'execute')
      and has_function_privilege('authenticated', 'public.rescore_ideas()', 'execute')
      and not has_function_privilege('authenticated', 'public.store_fetched_closes(date, jsonb, numeric)', 'execute')
      and not has_function_privilege('authenticated', 'public.mark_market_day_shut(date)', 'execute')
      and not has_function_privilege('authenticated', 'public.score_ideas()', 'execute')
      and not has_function_privilege('authenticated', 'public.tracked_symbols()', 'execute'),
  'the job''s functions are service_role only; the admin''s two are authenticated only');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in ('put_close', 'close_rank', 'tracked_companies', 'first_close_after', 'action_factor', 'has_jump',
                       'score_ideas_now', 'put_company_rows', 'put_index_close', 'mark_day_open')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute'))
$$, 'the private helpers are executable by no API role');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.proname in ('store_fetched_closes', 'mark_market_day_shut', 'enter_closes', 'score_ideas', 'rescore_ideas', 'tracked_symbols',
                       'put_close', 'tracked_companies', 'first_close_after', 'action_factor', 'has_jump', 'score_ideas_now',
                       'put_company_rows', 'put_index_close', 'mark_day_open')
     and (not p.prosecdef or not ('search_path=""' = any (coalesce(p.proconfig, '{}'::text[]))))
$$, 'every function of this migration is SECURITY DEFINER with an empty search_path');
-- The only writers: exactly one function body writes each table.
select is((select count(*) from pg_proc p where p.prosrc ~* 'insert\s+into\s+public\.prices_daily|update\s+public\.prices_daily|delete\s+from\s+public\.prices_daily'),
  1::bigint, 'exactly one function writes prices_daily (private.put_close)');
select is((select count(*) from pg_proc p where p.prosrc ~* 'insert\s+into\s+public\.idea_scores|update\s+public\.idea_scores|delete\s+from\s+public\.idea_scores'),
  1::bigint, 'exactly one function writes idea_scores (private.score_ideas_now)');
select is((select string_agg(p.proname, ',' order by p.proname) from pg_proc p
            where p.prosrc ~* 'insert\s+into\s+public\.market_days|update\s+public\.market_days|delete\s+from\s+public\.market_days'),
  'mark_day_open,mark_market_day_shut', 'market_days is written by private.mark_day_open and mark_market_day_shut only');

-- Check constraints (the owner, so only the constraints answer).
insert into public.companies (id, slug, name, nse_symbol) values ('cccccccc-0000-4000-8000-000000000001', 'probe', 'Probe', 'PROBE');
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
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-06', 1, 'split') $$, '23514', null, 'a corporate action factor of 1 changes nothing and is refused');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-06', 0, 'split') $$, '23514', null, 'a corporate action factor of 0 is refused');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-06', 2, 'merger') $$, '23514', null, 'a corporate action is a split, a bonus or other');
select lives_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-06', 2, 'bonus') $$, 'a valid corporate action is accepted');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values
    ('cccccccc-0000-4000-8000-000000000001', '2026-01-06', 3, 'bonus') $$, '23505', null, 'one action per company, date and kind');
delete from public.corporate_actions; delete from public.prices_daily; delete from public.companies where nse_symbol = 'PROBE';

-- 3. Fixtures: twenty ideas, each on its own company. Times are Asia/Kolkata and set by the owner.
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
select pg_temp.mk('SIERRA', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('TANGO', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('UNIF', 'outperform', '2026-03-02 10:00:00');
select pg_temp.mk('WHISKEY', 'outperform', '2026-03-02 10:00:00');
select pg_temp.close_at('LIMA', '2026-03-05 11:00:00');
select pg_temp.close_at('MIKE', '2026-03-06 16:00:00');
select pg_temp.close_at('WHISKEY', '2026-03-13 16:00:00');
insert into public.companies (slug, name, nse_symbol) values ('untrk', 'Untracked Ltd', 'UNTRK');
select is((select count(*) from public.ideas), 20::bigint, 'twenty ideas are fixtures');

-- 4. Stage A: only Monday 2 March is stored. Untracked symbols and the BE duplicate of ALPHA are not stored.
select is(public.store_fetched_closes('2026-03-02', jsonb_build_array(
    pg_temp.r('ALPHA', 999, null, 'BE'), pg_temp.r('ALPHA', 100), pg_temp.r('GAMMA', 200), pg_temp.r('INDIA', 1000), pg_temp.r('JULIET', 500),
    pg_temp.r('KILO', 2000), pg_temp.r('LIMA', 100), pg_temp.r('MIKE', 400), pg_temp.r('NOVEM', 50, 'INE111A01011'), pg_temp.r('TANGO', 100),
    pg_temp.r('UNIF', 100), pg_temp.r('SIERRA', 10), pg_temp.r('WHISKEY', 60), pg_temp.r('NOISE', 5), pg_temp.r('UNTRK', 5)), 20000),
  12::integer, 'store_fetched_closes keeps the 12 tracked companies (EQ preferred over BE) and drops the rest');
select is((select count(*) from public.prices_daily where company_id is not null), 12::bigint, 'twelve company closes stored');
select is(pg_temp.px('ALPHA', '2026-03-02'), '100/nse_fetch', 'the EQ close wins over the BE row, source nse_fetch');
select is((select count(*) from public.prices_daily p join public.companies c on c.id = p.company_id where c.nse_symbol in ('NOISE', 'UNTRK')), 0::bigint,
  'a symbol that is not a tracked company''s is dropped');
select is(pg_temp.ix('2026-03-02'), '20000/nse_fetch', 'the Nifty 50 close is stored');
select is((select m.status || '/' || m.source from public.market_days m where m.trade_date = '2026-03-02'), 'open/nse_fetch',
  'the date is open once the Nifty 50 close is stored');
select is(private.score_ideas_now('2026-03-02'), 20::integer, 'scoring writes one row per non-void idea');
-- 1. An idea scored on its opening day: entry = mark, every figure zero.
select is(pg_temp.sc('ALPHA'), '2026-03-02|100|20000|2026-03-02|100|20000|1|0|0|0|0|f|{}',
  'opening day: entry and mark are the same close, return 0, 0 days, no flags');
select is((select s.entry_source || '/' || s.mark_source from public.idea_scores s join public.ideas i on i.id = s.idea_id
            join public.companies c on c.id = i.company_id where c.nse_symbol = 'ALPHA'), 'nse_fetch/nse_fetch', 'the sources are recorded');
-- A missing price on a required day: no score, not a wrong one.
select is(pg_temp.sc('PAPA'), '-|-|-|-|-|-|-|-|-|-|-|f|{entry_pending}', 'no company close at all: entry_pending, every figure empty');
select is(pg_temp.sc('DELTA'), '-|-|-|-|-|-|-|-|-|-|-|f|{entry_pending}', 'opened Friday after 15:00 with only the weekend to come: entry_pending');
select is(pg_temp.sc('QUEBEC'), '-|-|-|-|-|-|-|-|-|-|-|f|{entry_pending}', 'opened on 13 March, no close yet: entry_pending');
-- A withdrawn idea has no score row.
select isnt(pg_temp.sc('SIERRA'), null, 'SIERRA has a score row while it is open');
select lives_ok($$ select public.add_idea_event((select id from pg_temp.ids where sym = 'SIERRA'), 'void', 'Entered by mistake.') $$,
  'SIERRA is withdrawn within 24 hours');
select is(private.score_ideas_now('2026-03-02'), 19::integer, 'a void idea is not scored');
select is(pg_temp.sc('SIERRA'), null, 'the row of an idea that became void is removed');

-- 5. Stage B: 3 to 6 March.
select public.store_fetched_closes('2026-03-03', jsonb_build_array(pg_temp.r('ALPHA', 110), pg_temp.r('INDIA', 1100), pg_temp.r('JULIET', 520),
  pg_temp.r('KILO', 420), pg_temp.r('LIMA', 90), pg_temp.r('MIKE', 410), pg_temp.r('NOVEM', 51, 'INE111A01011'), pg_temp.r('TANGO', 70),
  pg_temp.r('UNIF', 69.99)), 20200);
select public.store_fetched_closes('2026-03-04', jsonb_build_array(pg_temp.r('ALPHA', 105), pg_temp.r('INDIA', 230), pg_temp.r('JULIET', 262),
  pg_temp.r('KILO', 430), pg_temp.r('LIMA', 95), pg_temp.r('MIKE', 420), pg_temp.r('NOVEM', 52, 'INE111A01011')), 20100);
select public.store_fetched_closes('2026-03-05', jsonb_build_array(pg_temp.r('ALPHA', 108), pg_temp.r('INDIA', 240), pg_temp.r('JULIET', 270),
  pg_temp.r('KILO', 225), pg_temp.r('LIMA', 110), pg_temp.r('MIKE', 430), pg_temp.r('NOVEM', 53, 'INE111A01011')), 20400);
select public.store_fetched_closes('2026-03-06', jsonb_build_array(pg_temp.r('ALPHA', 120), pg_temp.r('GAMMA', 180), pg_temp.r('LIMA', 50),
  pg_temp.r('MIKE', 440), pg_temp.r('NOVEM', 54, 'INE222B01022'), pg_temp.r('TANGO', 75), pg_temp.r('UNIF', 75), pg_temp.r('FOXA', 300),
  pg_temp.r('FOXB', 200), pg_temp.r('DELTA', 300)), 20500);
select is((select count(*) from public.market_days where trade_date between '2026-03-02' and '2026-03-06' and status = 'open'), 5::bigint,
  'the five trading days are open; Saturday and Sunday have no market day');
select is(private.score_ideas_now('2026-03-06'), 19::integer, 'stage B scoring');
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
select is(pg_temp.sc('NOVEM'), '2026-03-02|50|20000|2026-03-06|54|20500|1|0.08|0.025|0.055|4|f|{isin_changed}', 'a changed ISIN is flagged');
select is(pg_temp.sc('TANGO'), '2026-03-02|100|20000|2026-03-06|75|20500|1|-0.25|0.025|-0.275|4|f|{}',
  'a fall of exactly 30% (100 to 70) is not a jump');
select is(pg_temp.sc('UNIF'), '2026-03-02|100|20000|2026-03-06|75|20500|1|-0.25|0.025|-0.275|4|f|{jump}',
  'a fall of more than 30% (100 to 69.99) with no corporate action is a jump');
-- A split with no action entered: the return is wrong and the flag says so.
-- INDIA: 240 / 1000 - 1 = -0.76, Nifty +2%, excess -0.78.
select is(pg_temp.sc('INDIA'), '2026-03-02|1000|20000|2026-03-05|240|20400|1|-0.76|0.02|-0.78|3|f|{jump}', 'a 1:5 split without its factor raises jump');
-- JULIET: 270 / 500 - 1 = -0.46.
select is(pg_temp.sc('JULIET'), '2026-03-02|500|20000|2026-03-05|270|20400|1|-0.46|0.02|-0.48|3|f|{jump}', 'a 1:1 bonus without its factor raises jump');
-- Stale: ALPHA is marked Friday 6 March. Tuesday 10 March is two weekdays on, Wednesday 11 is three.
select is(private.score_ideas_now('2026-03-10'), 19::integer, 'rescored as of Tuesday 10 March');
select is(pg_temp.sc('ALPHA'), '2026-03-02|100|20000|2026-03-06|120|20500|1|0.2|0.025|0.175|4|f|{}', 'two weekdays old is not stale');
select is(private.score_ideas_now('2026-03-11'), 19::integer, 'rescored as of Wednesday 11 March');
select is(pg_temp.sc('ALPHA'), '2026-03-02|100|20000|2026-03-06|120|20500|1|0.2|0.025|0.175|4|f|{stale}', 'three weekdays old is stale');
select is(pg_temp.sc('LIMA'), '2026-03-02|100|20000|2026-03-05|110|20400|1|0.1|0.02|0.08|3|t|{}', 'a final closed idea is never stale');

-- 6. Corporate actions. INDIA split 1:5 (factor 5, ex 4 Mar); JULIET bonus 1:1 (factor 2, ex 4 Mar) entered by the admin;
-- KILO split (5, ex 3 Mar) and bonus (2, ex 5 Mar), with two decoys outside the window: ex on the entry day, ex after the mark.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind, note) select c.id, '2026-03-04', 2, 'bonus', '1:1'
                     from public.companies c where c.nse_symbol = 'JULIET' $$, 'the admin enters a bonus');
select is((select count(*) from public.corporate_actions), 1::bigint, 'the admin reads corporate actions');
reset role;
insert into public.corporate_actions (company_id, ex_date, factor, kind)
  select c.id, v.d::date, v.f, v.k from public.companies c join (values
    ('INDIA', '2026-03-04', 5, 'split'), ('KILO', '2026-03-03', 5, 'split'), ('KILO', '2026-03-05', 2, 'bonus'),
    ('KILO', '2026-03-02', 3, 'other'), ('KILO', '2026-03-09', 7, 'split')) v(s, d, f, k) on c.nse_symbol = v.s;
select is(private.score_ideas_now('2026-03-06'), 19::integer, 'rescored after the actions');
-- INDIA: 240 * 5 / 1000 - 1 = 0.2; Nifty +2%; excess 0.18.
select is(pg_temp.sc('INDIA'), '2026-03-02|1000|20000|2026-03-05|240|20400|5|0.2|0.02|0.18|3|f|{}', 'a 1:5 split with factor 5: the return is unchanged by the split, no jump');
-- JULIET: 270 * 2 / 500 - 1 = 0.08; excess 0.06.
select is(pg_temp.sc('JULIET'), '2026-03-02|500|20000|2026-03-05|270|20400|2|0.08|0.02|0.06|3|f|{}', 'a 1:1 bonus with factor 2');
-- KILO: factor 5 * 2 = 10 (the entry-day and after-mark actions are outside); 225 * 10 / 2000 - 1 = 0.125; excess 0.105.
select is(pg_temp.sc('KILO'), '2026-03-02|2000|20000|2026-03-05|225|20400|10|0.125|0.02|0.105|3|f|{}',
  'a split then a bonus multiply (factor 10); actions on the entry day or after the mark are left out; both drops are covered, no jump');

-- 7. Stage C1: Mon 9 to Thu 12 March, with Wednesday 11 shut although both closes exist.
select public.store_fetched_closes('2026-03-09', jsonb_build_array(pg_temp.r('FOXA', 330), pg_temp.r('FOXB', 220), pg_temp.r('DELTA', 320),
  pg_temp.r('ECHO', 50), pg_temp.r('MIKE', 450), pg_temp.r('LIMA', 40)), 20800);
select public.store_fetched_closes('2026-03-10', jsonb_build_array(pg_temp.r('DELTA', 400), pg_temp.r('ECHO', 55)), 21632);
select is((select count(*) from public.prices_daily p join public.companies c on c.id = p.company_id where c.nse_symbol = 'LIMA' and p.trade_date >= '2026-03-09'),
  0::bigint, 'a final closed idea''s company is no longer tracked: its row is dropped');
select private.put_close(c.id, null, '2026-03-11', 700, 'nse_fetch', 'HOTEL', 'EQ', null) from public.companies c where c.nse_symbol = 'HOTEL';
select private.put_close(null, 'NIFTY50', '2026-03-11', 21700, 'nse_fetch', 'NIFTY 50', null, null);
insert into public.market_days (trade_date, status, source) values ('2026-03-11', 'shut', 'manual');
select public.store_fetched_closes('2026-03-12', jsonb_build_array(pg_temp.r('HOTEL', 720)), 21850);
select is(private.score_ideas_now('2026-03-11'), 19::integer, 'stage C1 scoring (as of Wednesday 11 March)');
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
select is(pg_temp.sc('LIMA'), '2026-03-02|100|20000|2026-03-05|110|20400|1|0.1|0.02|0.08|3|t|{}', 'LIMA''s score has not moved since the close');

-- Stage C2: the equity file for 13 March arrives, the index file does not.
select is(public.store_fetched_closes('2026-03-13', jsonb_build_array(pg_temp.r('QUEBEC', 80), pg_temp.r('HOTEL', 756), pg_temp.r('WHISKEY', 66)), null),
  3::integer, 'the equity rows are stored even when the index is missing');
select is((select count(*) from public.market_days where trade_date = '2026-03-13'), 0::bigint, 'the date stays undecided without the Nifty 50 close');
select is(private.score_ideas_now('2026-03-13'), 19::integer, 'stage C2 scoring');
select is(pg_temp.sc('QUEBEC'), '-|-|-|-|-|-|-|-|-|-|-|f|{entry_pending}', 'the entry waits when the company has a close but the Nifty 50 does not');
select is(pg_temp.sc('HOTEL'), '2026-03-12|720|21850|2026-03-12|720|21850|1|0|0|0|0|f|{}', 'the mark does not move to a day without an index close');
-- Stage C3: the index file arrives.
select is(public.store_fetched_closes('2026-03-13', jsonb_build_array(pg_temp.r('QUEBEC', 80), pg_temp.r('HOTEL', 756), pg_temp.r('WHISKEY', 66)), 22000),
  3::integer, 'fetched again with the index');
select is((select status from public.market_days where trade_date = '2026-03-13'), 'open', 'the date is open once the index is stored');
select is(private.score_ideas_now('2026-03-13'), 19::integer, 'stage C3 scoring');
-- QUEBEC: entry = mark = 13 March.
select is(pg_temp.sc('QUEBEC'), '2026-03-13|80|22000|2026-03-13|80|22000|1|0|0|0|0|f|{}', 'the entry arrives with the index');
-- HOTEL: 756 / 720 - 1 = 0.05; Nifty 22000 / 21850 - 1 = 0.0068649...; excess 0.0431350...
select is(pg_temp.sc('HOTEL'), '2026-03-12|720|21850|2026-03-13|756|22000|1|0.05|0.006865|0.043135|1|f|{}', 'HOTEL, Nifty 50 over the same two dates');
-- WHISKEY: closed 13 March 16:00, no later close: 66 / 60 - 1 = 0.1; Nifty +10%; excess 0; 11 days.
select is(pg_temp.sc('WHISKEY'), '2026-03-02|60|20000|2026-03-13|66|22000|1|0.1|0.1|0|11|f|{exit_pending}', 'closed after the last close: exit_pending');

-- Source weakest-of-two: QUEBEC on 16 March from an uploaded file, the index typed by hand.
select is(public.enter_closes('2026-03-16', jsonb_build_array(pg_temp.r('QUEBEC', 82)), null, 'nse_upload'), 1::integer, 'an uploaded company close without an index');
select is((select count(*) from public.market_days where trade_date = '2026-03-16'), 0::bigint, 'still undecided');
select is(public.enter_closes('2026-03-16', '[]'::jsonb, 22100, 'manual'), 0::integer, 'the index typed by hand opens the date');
select is(private.score_ideas_now('2026-03-16'), 19::integer, 'stage D scoring');
-- QUEBEC: 82 / 80 - 1 = 0.025; Nifty 22100 / 22000 - 1 = 0.0045454...; excess 0.0204545...; 3 days.
select is(pg_temp.sc('QUEBEC'), '2026-03-13|80|22000|2026-03-16|82|22100|1|0.025|0.004545|0.020455|3|f|{}', 'QUEBEC, marked on 16 March');
select is((select s.entry_source || '/' || s.mark_source from public.idea_scores s join public.ideas i on i.id = s.idea_id
            join public.companies c on c.id = i.company_id where c.nse_symbol = 'QUEBEC'), 'nse_fetch/manual', 'the mark records the weaker of its two sources');

-- 8. The source ladder (ROMEO has an open idea, so its rows are kept). All of 2 February.
select public.enter_closes('2026-02-02', jsonb_build_array(pg_temp.r('ROMEO', 10)), 100, 'manual');
select is(pg_temp.px('ROMEO', '2026-02-02') || ' ' || pg_temp.ix('2026-02-02'), '10/manual 100/manual', 'a typed close is stored');
select public.enter_closes('2026-02-02', jsonb_build_array(pg_temp.r('ROMEO', 20)), 200, 'nse_upload');
select is(pg_temp.px('ROMEO', '2026-02-02') || ' ' || pg_temp.ix('2026-02-02'), '20/nse_upload 200/nse_upload', 'an uploaded file replaces a typed close');
select public.store_fetched_closes('2026-02-02', jsonb_build_array(pg_temp.r('ROMEO', 30)), 300);
select is(pg_temp.px('ROMEO', '2026-02-02') || ' ' || pg_temp.ix('2026-02-02'), '30/nse_fetch 300/nse_fetch', 'the fetched file replaces an uploaded one');
select public.enter_closes('2026-02-02', jsonb_build_array(pg_temp.r('ROMEO', 40)), 400, 'nse_upload');
select is(pg_temp.px('ROMEO', '2026-02-02') || ' ' || pg_temp.ix('2026-02-02'), '30/nse_fetch 300/nse_fetch', 'an uploaded file never replaces a fetched one');
select public.enter_closes('2026-02-02', jsonb_build_array(pg_temp.r('ROMEO', 50)), 500, 'manual');
select is(pg_temp.px('ROMEO', '2026-02-02') || ' ' || pg_temp.ix('2026-02-02'), '30/nse_fetch 300/nse_fetch', 'a typed close never replaces a fetched one');
select public.store_fetched_closes('2026-02-02', jsonb_build_array(pg_temp.r('ROMEO', 60)), 600);
select is(pg_temp.px('ROMEO', '2026-02-02') || ' ' || pg_temp.ix('2026-02-02'), '30/nse_fetch 300/nse_fetch', 'a second fetch of the same file changes nothing');
select public.enter_closes('2026-02-03', jsonb_build_array(pg_temp.r('ROMEO', 10)), 100, 'manual');
select public.enter_closes('2026-02-03', jsonb_build_array(pg_temp.r('ROMEO', 11)), 101, 'manual');
select is(pg_temp.px('ROMEO', '2026-02-03') || ' ' || pg_temp.ix('2026-02-03'), '11/manual 101/manual', 'a typed close is corrected by typing it again');
select public.enter_closes('2026-02-03', jsonb_build_array(pg_temp.r('ROMEO', 21)), 201, 'nse_upload');
select public.enter_closes('2026-02-03', jsonb_build_array(pg_temp.r('ROMEO', 22)), 202, 'nse_upload');
select is(pg_temp.px('ROMEO', '2026-02-03') || ' ' || pg_temp.ix('2026-02-03'), '21/nse_upload 201/nse_upload', 'an uploaded close is not replaced by a second upload');
-- enter_closes rules.
select is(public.enter_closes('2026-02-04', jsonb_build_array(pg_temp.r('ROMEO', 12), pg_temp.r('SIERRA', 11), pg_temp.r('UNTRK', 5)), null, 'manual'), 1::integer,
  'enter_closes keeps rows only for companies with a non-void idea (SIERRA is void, UNTRK has none)');
select is((select count(*) from public.prices_daily p join public.companies c on c.id = p.company_id
            where c.nse_symbol in ('SIERRA', 'UNTRK') and p.trade_date = '2026-02-04'), 0::bigint, 'the dropped rows are not stored');
select is((select count(*) from public.market_days where trade_date = '2026-02-04'), 0::bigint, 'no index close, so the date is undecided');
select throws_ok($$ select public.enter_closes(((now() at time zone 'Asia/Kolkata')::date + 1), '[]'::jsonb, 100, 'manual') $$, 'P0001', 'ledger:future_date',
  'enter_closes refuses a future date');
select throws_ok($$ select public.enter_closes('2026-02-05', '[]'::jsonb, 100, 'nse_fetch') $$, 'P0001', 'ledger:bad_source', 'enter_closes refuses the source nse_fetch');
select throws_ok($$ select public.enter_closes('2026-02-05', '[]'::jsonb, 100, 'guess') $$, 'P0001', 'ledger:bad_source', 'enter_closes refuses an unknown source');
select throws_ok($$ select public.enter_closes('2026-02-05', '[]'::jsonb, 0, 'manual') $$, 'P0001', 'ledger:bad_close', 'a Nifty 50 close of zero is refused');
select throws_ok($$ select public.store_fetched_closes(((now() at time zone 'Asia/Kolkata')::date + 1), '[]'::jsonb, 100) $$, 'P0001', 'ledger:future_date',
  'store_fetched_closes refuses a future date');
select throws_ok($$ select public.store_fetched_closes('2026-02-05', '{"a":1}'::jsonb, 100) $$, 'P0001', 'ledger:bad_rows', 'rows must be an array');
select is(public.store_fetched_closes('2026-02-05', jsonb_build_array(pg_temp.r('ROMEO', -5), pg_temp.r('ROMEO', 0)), null), 0::integer,
  'a non-positive close is dropped, never stored');
select is(public.enter_closes('2026-02-06', jsonb_build_array(jsonb_build_object('symbol', 'ROMEO', 'close', 'abc')), null, 'manual'), 0::integer,
  'a close that is not a number is dropped');

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

-- 10. tracked_symbols: open ideas and closed ones without a final exit; not final, not void.
select is((select array_agg(s order by s) from public.tracked_symbols() s),
  array['ALPHA', 'DELTA', 'ECHO', 'FOXA', 'FOXB', 'GAMMA', 'HOTEL', 'INDIA', 'JULIET', 'KILO', 'NOVEM', 'PAPA', 'QUEBEC', 'ROMEO', 'TANGO', 'UNIF', 'WHISKEY'],
  'tracked_symbols lists 17: not LIMA and MIKE (final), not SIERRA (void)');

-- 11. Idempotence: a second run changes nothing but computed_at; no event was touched by scoring.
create temp table snap as
  select s.idea_id, to_jsonb(s) - 'computed_at' as j, s.computed_at from public.idea_scores s;
create temp table ev_snap as select md5(string_agg(e.canonical || e.hash || e.recorded_at::text, ',' order by e.seq)) as m from public.idea_events e;
select pg_sleep(0.02);
select is(private.score_ideas_now('2026-03-16'), 19::integer, 'a second run');
select is((select count(*) from public.idea_scores s join snap on snap.idea_id = s.idea_id
            where to_jsonb(s) - 'computed_at' = snap.j), 19::bigint, 'every row is identical but for computed_at');
select is((select count(*) from public.idea_scores s join snap on snap.idea_id = s.idea_id where s.computed_at > snap.computed_at), 19::bigint,
  'computed_at moved on every row');
select is((select md5(string_agg(e.canonical || e.hash || e.recorded_at::text, ',' order by e.seq)) from public.idea_events e), (select m from ev_snap),
  'scoring wrote nothing into idea_events');
select is((select count(*) from public.idea_events e where e.canonical ~* '(price|return|excess|score)'), 0::bigint,
  'no sealed text carries a price, a return or a score');

-- 12. Roles. anon: every door shut.
set local role anon;
select throws_ok($$ select * from public.prices_daily $$, '42501', null, 'anon cannot read prices_daily');
select throws_ok($$ select * from public.idea_scores $$, '42501', null, 'anon cannot read idea_scores');
select throws_ok($$ select * from public.market_days $$, '42501', null, 'anon cannot read market_days');
select throws_ok($$ select * from public.corporate_actions $$, '42501', null, 'anon cannot read corporate_actions');
select throws_ok($$ select public.score_ideas() $$, '42501', null, 'anon cannot run score_ideas');
select throws_ok($$ select public.rescore_ideas() $$, '42501', null, 'anon cannot run rescore_ideas');
select throws_ok($$ select public.tracked_symbols() $$, '42501', null, 'anon cannot list tracked symbols');
select throws_ok($$ select public.store_fetched_closes('2026-02-09', '[]'::jsonb, 100) $$, '42501', null, 'anon cannot store fetched closes');
select throws_ok($$ select public.enter_closes('2026-02-09', '[]'::jsonb, 100, 'manual') $$, '42501', null, 'anon cannot enter closes');
select throws_ok($$ select public.mark_market_day_shut('2026-02-09') $$, '42501', null, 'anon cannot mark a shut day');
reset role;

-- The admin: reads, rescoring, entering closes and actions; but no direct write on prices, calendar or scores.
set local role authenticated;
select lives_ok($$ select public.rescore_ideas() $$, 'the admin may run rescore_ideas');
select is((select count(*) from public.idea_scores), 19::bigint, 'the admin reads the scores');
select ok((select count(*) from public.prices_daily) > 0 and (select count(*) from public.market_days) > 0, 'the admin reads prices and the calendar');
select throws_ok($$ select public.score_ideas() $$, '42501', null, 'the admin cannot run the job''s score_ideas');
select throws_ok($$ select public.tracked_symbols() $$, '42501', null, 'the admin cannot run tracked_symbols');
select throws_ok($$ select public.store_fetched_closes('2026-02-09', '[]'::jsonb, 100) $$, '42501', null, 'the admin cannot run store_fetched_closes');
select throws_ok($$ select public.mark_market_day_shut('2026-02-09') $$, '42501', null, 'the admin cannot run mark_market_day_shut');
select throws_ok($$ insert into public.prices_daily (benchmark, trade_date, close, source) values ('NIFTY50', '2026-02-09', 100, 'manual') $$, '42501', null,
  'the admin cannot insert into prices_daily');
select throws_ok($$ update public.prices_daily set close = 1 $$, '42501', null, 'the admin cannot update prices_daily');
select throws_ok($$ delete from public.prices_daily $$, '42501', null, 'the admin cannot delete from prices_daily');
select throws_ok($$ insert into public.market_days (trade_date, status, source) values ('2026-02-09', 'open', 'manual') $$, '42501', null,
  'the admin cannot insert into market_days');
select throws_ok($$ update public.market_days set status = 'shut' $$, '42501', null, 'the admin cannot update market_days');
select throws_ok($$ insert into public.idea_scores (idea_id, is_final) select id, true from public.ideas limit 1 $$, '42501', null,
  'the admin cannot insert into idea_scores');
select throws_ok($$ update public.idea_scores set excess = 9 $$, '42501', null, 'the admin cannot write a score');
select throws_ok($$ delete from public.idea_scores $$, '42501', null, 'the admin cannot delete a score');
select throws_ok($$ update public.corporate_actions set factor = 9 $$, '42501', null, 'the admin cannot edit a corporate action (delete and re-enter)');
select lives_ok($$ delete from public.corporate_actions where kind = 'other' $$, 'the admin can delete a corporate action');
reset role;

-- A signed-in user who is not the admin sees nothing and writes nothing.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.prices_daily), 0::bigint, 'a non-admin reads no prices');
select is((select count(*) from public.idea_scores), 0::bigint, 'a non-admin reads no scores');
select is((select count(*) from public.market_days) + (select count(*) from public.corporate_actions), 0::bigint, 'a non-admin reads no calendar and no actions');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values (gen_random_uuid(), '2026-02-09', 2, 'bonus') $$,
  '42501', null, 'a non-admin cannot enter a corporate action');
select throws_ok($$ select public.enter_closes('2026-02-09', '[]'::jsonb, 100, 'manual') $$, '42501', null, 'a non-admin cannot enter closes');
select throws_ok($$ select public.rescore_ideas() $$, '42501', null, 'a non-admin cannot rescore');
reset role;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- service_role: the job's doors, and nothing on the tables but market_days.
set local role service_role;
select is(public.score_ideas(), 19::integer, 'service_role runs score_ideas (19 non-void ideas)');
select ok((select count(*) from public.tracked_symbols()) = 17, 'service_role lists the tracked symbols');
select ok((select count(*) from public.market_days) > 0, 'service_role reads market_days');
select throws_ok($$ select * from public.prices_daily $$, '42501', null, 'service_role cannot read prices_daily');
select throws_ok($$ select * from public.idea_scores $$, '42501', null, 'service_role cannot read idea_scores');
select throws_ok($$ insert into public.prices_daily (benchmark, trade_date, close, source) values ('NIFTY50', '2026-02-09', 100, 'nse_fetch') $$, '42501', null,
  'service_role cannot insert into prices_daily');
select throws_ok($$ insert into public.market_days (trade_date, status, source) values ('2026-02-09', 'open', 'nse_fetch') $$, '42501', null,
  'service_role cannot insert into market_days');
select throws_ok($$ insert into public.idea_scores (idea_id, is_final) select id, true from public.ideas limit 1 $$, '42501', null,
  'service_role cannot insert into idea_scores');
select throws_ok($$ insert into public.corporate_actions (company_id, ex_date, factor, kind) values (gen_random_uuid(), '2026-02-09', 2, 'bonus') $$,
  '42501', null, 'service_role cannot insert a corporate action');
select throws_ok($$ select public.rescore_ideas() $$, '42501', null, 'service_role cannot run the admin''s rescore_ideas');
select throws_ok($$ select public.enter_closes('2026-02-09', '[]'::jsonb, 100, 'manual') $$, '42501', null, 'service_role cannot run enter_closes');
select lives_ok($$ select public.store_fetched_closes('2026-02-09', '[]'::jsonb, 100) $$, 'service_role stores fetched closes');
select lives_ok($$ select public.mark_market_day_shut('2026-02-09') $$, 'service_role marks shut days (a no-op for an old date)');
reset role;

select * from finish();
rollback;
