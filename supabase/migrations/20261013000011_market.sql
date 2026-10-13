-- =============================================================================
-- 20261013000011_market.sql - Plan 3a Task 2 (part 1 of 2): closing prices with a source ladder, the trading calendar,
-- corporate actions, the score table and its restatement log. Part 2 (20261013000012_scores.sql) holds the scorer.
-- Spec: docs/specs/2026-10-13-phase-3-track-record-design.md s5.4, s18. ADR: ADR-005 s3.4, s3.5.
-- Never edit this file after it reaches the hosted project; add a later migration instead.
--
-- Nothing here is public: anon gets no grant, policy, view or function. No API role writes prices_daily, market_days,
-- idea_scores or idea_score_changes. The source of a price is never a caller's word: the admin's browser session can only
-- write 'manual'; 'nse_fetch' and 'nse_upload' come from two service_role doors. Corporate actions are append-only: a
-- correction is a new row that supersedes the old one.
-- =============================================================================

-- 1. Tables.
create table public.market_days (
  trade_date date primary key,
  status     text not null check (status in ('open', 'shut')),
  source     text not null check (source in ('nse_fetch', 'nse_upload', 'manual')),
  decided_at timestamptz not null default now()
);

create table public.prices_daily (
  id         bigint generated always as identity primary key,
  company_id uuid references public.companies (id) on delete restrict,
  benchmark  text check (benchmark in ('NIFTY50')),
  trade_date date not null,
  close      numeric(14, 4) not null check (close > 0),
  source     text not null check (source in ('nse_fetch', 'nse_upload', 'manual')),
  symbol     text,
  series     text,
  isin       text,
  created_at timestamptz not null default now(),
  constraint prices_daily_one_subject check ((company_id is null) <> (benchmark is null))
);
create unique index prices_daily_company_day   on public.prices_daily (company_id, trade_date) where company_id is not null;
create unique index prices_daily_benchmark_day on public.prices_daily (benchmark, trade_date) where benchmark is not null;

-- factor = new shares per old share: 5 for a 1:5 split, 2 for a 1:1 bonus. kind 'none' (factor 1) records "I looked at
-- this move and no action explains it". Append-only: a correction is a new row whose supersedes names the old one.
create table public.corporate_actions (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  ex_date    date not null,
  factor     numeric(12, 6) not null check (factor between 0.001 and 1000),
  kind       text not null check (kind in ('split', 'bonus', 'other', 'none')),
  note       text,
  supersedes uuid references public.corporate_actions (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint corporate_actions_none_is_one check ((kind = 'none') = (factor = 1))
);
create unique index corporate_actions_superseded_once on public.corporate_actions (supersedes) where supersedes is not null;

create table public.idea_scores (
  idea_id            uuid primary key references public.ideas (id) on delete cascade,
  entry_date         date,
  entry_close        numeric(14, 4),
  entry_index        numeric(14, 4),
  mark_date          date,
  mark_close         numeric(14, 4),
  mark_index         numeric(14, 4),
  factor             numeric(20, 6),
  idea_return        numeric(10, 6),
  index_return       numeric(10, 6),
  excess             numeric(10, 6),
  holding_days       integer,
  is_final           boolean not null default false,
  entry_source       text,
  mark_source        text,
  entry_skipped_days integer,   -- open trading days passed over before the entry close (no close for this share)
  exit_skipped_days  integer,
  flags              text[] not null default '{}',
  computed_at        timestamptz not null default now(),
  constraint idea_scores_flags_known check (flags <@ array['entry_pending', 'exit_pending', 'hand_price', 'jump',
                                                           'isin_changed', 'implausible', 'stale']::text[])
);

-- Every change to a fixed entry or to a final score, kept for good (written only by the scorer).
create table public.idea_score_changes (
  id         bigint generated always as identity primary key,
  idea_id    uuid not null references public.ideas (id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp(),
  changed    text[] not null,
  was        jsonb not null,
  became     jsonb not null
);
create index idea_score_changes_idea_idx on public.idea_score_changes (idea_id, id);

create trigger corporate_actions_append_only before update or delete on public.corporate_actions
  for each row execute function private.reject_mutation();
create trigger corporate_actions_no_truncate before truncate on public.corporate_actions
  for each statement execute function private.reject_mutation();
create trigger idea_score_changes_append_only before update or delete on public.idea_score_changes
  for each row execute function private.reject_mutation();
create trigger idea_score_changes_no_truncate before truncate on public.idea_score_changes
  for each statement execute function private.reject_mutation();

-- A correction supersedes an action of the same company; an action that is still live cannot be entered twice.
create function private.guard_corporate_action()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.supersedes is not null and not exists (
       select 1 from public.corporate_actions o where o.id = new.supersedes and o.company_id = new.company_id) then
    raise exception 'corporate_actions: a correction must supersede an action of the same company' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.corporate_actions o
              where o.company_id = new.company_id and o.ex_date = new.ex_date and o.kind = new.kind
                and o.id is distinct from new.supersedes
                and not exists (select 1 from public.corporate_actions s where s.supersedes = o.id)) then
    raise exception 'corporate_actions: that action is already entered; supersede it to correct it' using errcode = '23505';
  end if;
  return new;
end;
$$;
create trigger corporate_actions_guard before insert on public.corporate_actions
  for each row execute function private.guard_corporate_action();

-- The actions in force: those no later row supersedes.
create function private.live_actions(p_company_id uuid)
returns setof public.corporate_actions
language sql stable security definer set search_path = ''
as $$
  select ca.* from public.corporate_actions ca
   where ca.company_id = p_company_id and not exists (select 1 from public.corporate_actions s where s.supersedes = ca.id);
$$;

-- 2. The source ladder, and the only code that writes prices_daily. nse_fetch 3 > nse_upload 2 > manual 1.
-- A higher source replaces a lower one; an equal one replaces only when it is a typed (manual) correction.
create function private.close_rank(p_source text)
returns integer language sql immutable set search_path = ''
as $$
  select case p_source when 'nse_fetch' then 3 when 'nse_upload' then 2 when 'manual' then 1 else 0 end;
$$;

-- True once the 15:30 IST close of a date has passed: no hand-supplied close exists before the market has closed.
create function private.market_closed(p_trade_date date, p_now timestamptz default clock_timestamp())
returns boolean language sql stable set search_path = ''
as $$
  select p_trade_date is not null and ((p_trade_date + time '15:30') at time zone 'Asia/Kolkata') <= p_now;
$$;

create function private.put_close(
  p_company_id uuid, p_benchmark text, p_trade_date date, p_close numeric,
  p_source text, p_symbol text, p_series text, p_isin text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_company_id is not null then
    insert into public.prices_daily as p (company_id, trade_date, close, source, symbol, series, isin)
    values (p_company_id, p_trade_date, p_close, p_source, p_symbol, p_series, p_isin)
    on conflict (company_id, trade_date) where company_id is not null
    do update set close = excluded.close, source = excluded.source, symbol = excluded.symbol,
                  series = excluded.series, isin = excluded.isin
      where private.close_rank(excluded.source) > private.close_rank(p.source)
         or (excluded.source = 'manual' and p.source = 'manual');
  else
    insert into public.prices_daily as p (benchmark, trade_date, close, source, symbol, series, isin)
    values (p_benchmark, p_trade_date, p_close, p_source, p_symbol, p_series, p_isin)
    on conflict (benchmark, trade_date) where benchmark is not null
    do update set close = excluded.close, source = excluded.source, symbol = excluded.symbol,
                  series = excluded.series, isin = excluded.isin
      where private.close_rank(excluded.source) > private.close_rank(p.source)
         or (excluded.source = 'manual' and p.source = 'manual');
  end if;
end;
$$;

-- A date becomes open once its Nifty 50 close is stored, and remembers the weakest source that opened it (a date opened
-- by hand is not "decided": the daily fetch still asks for it). The calendar follows the ladder: a shut day is reopened
-- only by a source at least as strong as the one that shut it, so a typed close never reopens a shut day.
create function private.mark_day_open(p_trade_date date, p_source text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.market_days as d (trade_date, status, source) values (p_trade_date, 'open', p_source)
  on conflict (trade_date) do update set status = 'open', source = excluded.source, decided_at = clock_timestamp()
    where (d.status <> 'open' and private.close_rank(excluded.source) >= private.close_rank(d.source))
       or (d.status = 'open' and private.close_rank(excluded.source) > private.close_rank(d.source));
end;
$$;

-- 3. Companies whose official closes the desk still needs: an open idea, or a closed one until its score rests on
-- fetched closes at both ends (so an official row still lands after a typed close made an idea final).
create function private.tracked_companies()
returns table (company_id uuid, nse_symbol text)
language sql stable security definer set search_path = ''
as $$
  select distinct c.id, c.nse_symbol
    from public.ideas i join public.companies c on c.id = i.company_id
   where c.nse_symbol is not null
     and (i.status = 'open'
          or (i.status = 'closed' and not exists (
                select 1 from public.idea_scores s
                 where s.idea_id = i.id and s.is_final and s.entry_source = 'nse_fetch' and s.mark_source = 'nse_fetch')));
$$;

-- Stores company rows for one date. p_scope 'tracked' is the fetched path; 'ideas' is the hand path (any non-void idea).
-- A row is {symbol, series, isin, close}. A row with no usable close is dropped (a missing price is never a wrong one),
-- and so is a series that is not an equity series. EQ is preferred; a tie is broken by the lower close so the same
-- input always stores the same row. Returns the number of companies matched.
create function private.put_company_rows(p_trade_date date, p_rows jsonb, p_source text, p_scope text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r   record;
  v_n integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    perform private.ledger_fail('bad_rows');
  end if;
  for r in
    select distinct on (c.id) c.id as company_id, x.symbol, x.series, x.isin, x.close::numeric as close
      from jsonb_to_recordset(p_rows) as x(symbol text, series text, isin text, close text)
      join public.companies c on c.nse_symbol = x.symbol
     where case when x.close ~ '^[0-9]{1,10}(\.[0-9]+)?$' then x.close::numeric > 0 else false end
       and (x.series is null or x.series in ('EQ', 'BE', 'BZ', 'SM', 'ST'))
       and ((p_scope = 'tracked' and c.id in (select t.company_id from private.tracked_companies() t))
         or (p_scope = 'ideas' and exists (select 1 from public.ideas i where i.company_id = c.id and i.status <> 'void')))
     order by c.id, (x.series = 'EQ') desc nulls last, x.series, x.close::numeric
  loop
    perform private.put_close(r.company_id, null, p_trade_date, r.close, p_source, r.symbol, r.series, r.isin);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create function private.put_index_close(p_trade_date date, p_index_close numeric, p_source text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_index_close is null then
    return; -- the equity file arrived and the index file did not: the date stays undecided
  end if;
  if p_index_close <= 0 then
    perform private.ledger_fail('bad_close');
  end if;
  perform private.put_close(null, 'NIFTY50', p_trade_date, p_index_close, p_source, 'NIFTY 50', null, null);
  perform private.mark_day_open(p_trade_date, p_source);
end;
$$;

-- The hand paths share one body: nothing before the close of the day, and a typed close never on a weekend.
create function private.put_hand_closes(p_trade_date date, p_rows jsonb, p_index_close numeric, p_source text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  if p_trade_date is null or not private.market_closed(p_trade_date) then
    perform private.ledger_fail('future_date');
  end if;
  if p_source = 'manual' and extract(isodow from p_trade_date) > 5 then
    perform private.ledger_fail('weekend');
  end if;
  v_n := private.put_company_rows(p_trade_date, p_rows, p_source, 'ideas');
  perform private.put_index_close(p_trade_date, p_index_close, p_source);
  return v_n;
end;
$$;

-- 4. The job's doors (service_role).
create function public.store_fetched_closes(p_trade_date date, p_rows jsonb, p_index_close numeric)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  if p_trade_date is null or p_trade_date > (now() at time zone 'Asia/Kolkata')::date then
    perform private.ledger_fail('future_date');
  end if;
  v_n := private.put_company_rows(p_trade_date, p_rows, 'nse_fetch', 'tracked');
  perform private.put_index_close(p_trade_date, p_index_close, 'nse_fetch');
  return v_n;
end;
$$;

-- The official file Aksh dropped by hand, parsed by a trusted server component and stored through the service role:
-- the only way a row carries the source nse_upload. (The browser session cannot name a source.)
create function public.store_uploaded_closes(p_trade_date date, p_rows jsonb, p_index_close numeric)
returns integer
language sql security definer set search_path = ''
as $$
  select private.put_hand_closes(p_trade_date, p_rows, p_index_close, 'nse_upload');
$$;

-- A missing file is a shut day, but only when a later fetched date is open (so an NSE outage is not a holiday), only
-- inside the 7-day fetch window, and never for a date whose official closes did arrive. A date opened only by a typed
-- close does not count as having a file, and the missing official file shuts it.
create function public.mark_market_day_shut(p_trade_date date)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if p_trade_date is null or p_trade_date < v_today - 7 or p_trade_date > v_today then
    return;
  end if;
  if exists (select 1 from public.prices_daily p where p.trade_date = p_trade_date and p.source <> 'manual') then
    return;
  end if;
  if exists (select 1 from public.market_days d where d.trade_date > p_trade_date and d.status = 'open' and d.source <> 'manual') then
    insert into public.market_days as d (trade_date, status, source) values (p_trade_date, 'shut', 'nse_fetch')
    on conflict (trade_date) do update set status = 'shut', source = 'nse_fetch', decided_at = clock_timestamp()
      where d.source = 'manual';
  end if;
end;
$$;

create function public.tracked_symbols()
returns setof text
language sql stable security definer set search_path = ''
as $$
  select t.nse_symbol from private.tracked_companies() t order by 1;
$$;

-- 5. The admin's hand path: a number he typed. The source is always 'manual'; it is not a parameter.
create function public.enter_closes(p_trade_date date, p_rows jsonb, p_index_close numeric)
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'ledger: not allowed' using errcode = '42501';
  end if;
  return private.put_hand_closes(p_trade_date, p_rows, p_index_close, 'manual');
end;
$$;

-- 6. Row level security: the admin reads; corporate_actions also takes the admin's insert (never update or delete).
alter table public.market_days         enable row level security;
alter table public.prices_daily        enable row level security;
alter table public.corporate_actions   enable row level security;
alter table public.idea_scores         enable row level security;
alter table public.idea_score_changes  enable row level security;

create policy market_days_admin_read         on public.market_days         for select to authenticated using ((select private.is_admin()));
create policy prices_daily_admin_read        on public.prices_daily        for select to authenticated using ((select private.is_admin()));
create policy corporate_actions_admin_read   on public.corporate_actions   for select to authenticated using ((select private.is_admin()));
create policy idea_scores_admin_read         on public.idea_scores         for select to authenticated using ((select private.is_admin()));
create policy idea_score_changes_admin_read  on public.idea_score_changes  for select to authenticated using ((select private.is_admin()));
create policy corporate_actions_admin_insert on public.corporate_actions   for insert to authenticated
  with check ((select private.is_admin()));

-- 7. Grants. Start from nothing, then grant by name.
revoke all on public.market_days, public.prices_daily, public.corporate_actions, public.idea_scores, public.idea_score_changes
  from public, anon, authenticated, service_role;
grant select on public.market_days, public.prices_daily, public.corporate_actions, public.idea_scores,
  public.idea_score_changes to authenticated;
grant insert (company_id, ex_date, factor, kind, note, supersedes) on public.corporate_actions to authenticated;
grant select on public.market_days to service_role;

revoke execute on function private.guard_corporate_action()                                            from public, anon, authenticated, service_role;
revoke execute on function private.live_actions(uuid)                                                  from public, anon, authenticated, service_role;
revoke execute on function private.close_rank(text)                                                    from public, anon, authenticated, service_role;
revoke execute on function private.market_closed(date, timestamptz)                                    from public, anon, authenticated, service_role;
revoke execute on function private.put_close(uuid, text, date, numeric, text, text, text, text)       from public, anon, authenticated, service_role;
revoke execute on function private.mark_day_open(date, text)                                           from public, anon, authenticated, service_role;
revoke execute on function private.tracked_companies()                                                 from public, anon, authenticated, service_role;
revoke execute on function private.put_company_rows(date, jsonb, text, text)                           from public, anon, authenticated, service_role;
revoke execute on function private.put_index_close(date, numeric, text)                               from public, anon, authenticated, service_role;
revoke execute on function private.put_hand_closes(date, jsonb, numeric, text)                         from public, anon, authenticated, service_role;
revoke execute on function public.store_fetched_closes(date, jsonb, numeric)                           from public, anon, authenticated, service_role;
revoke execute on function public.store_uploaded_closes(date, jsonb, numeric)                          from public, anon, authenticated, service_role;
revoke execute on function public.mark_market_day_shut(date)                                           from public, anon, authenticated, service_role;
revoke execute on function public.tracked_symbols()                                                    from public, anon, authenticated, service_role;
revoke execute on function public.enter_closes(date, jsonb, numeric)                                   from public, anon, authenticated, service_role;
grant execute on function public.store_fetched_closes(date, jsonb, numeric)  to service_role;
grant execute on function public.store_uploaded_closes(date, jsonb, numeric) to service_role;
grant execute on function public.mark_market_day_shut(date)                  to service_role;
grant execute on function public.tracked_symbols()                           to service_role;
grant execute on function public.enter_closes(date, jsonb, numeric)          to authenticated;
