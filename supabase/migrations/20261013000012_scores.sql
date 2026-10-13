-- =============================================================================
-- 20261013000012_scores.sql - Plan 3a Task 2 (part 2 of 2): the one function that scores ideas against the Nifty 50.
-- Spec: docs/specs/2026-10-13-phase-3-track-record-design.md s6. ADR: ADR-005 s3.5.
-- Never edit this file after it reaches the hosted project; add a later migration instead.
--
-- private.score_ideas_now() is the only code that writes idea_scores. It recomputes every non-void idea from
-- idea_events, prices_daily, market_days and corporate_actions, so a score is a pure function of stored facts and
-- re-running it is harmless. No price or return is ever written into idea_events.
-- =============================================================================

-- 1. Scoring (spec s6). Entry and exit: the first open trading day whose 15:00 IST comes after the event and on which
-- both the company and the Nifty 50 have a close. Nobody supplies a date.
create function private.first_close_after(p_company_id uuid, p_at timestamptz)
returns date language sql stable security definer set search_path = ''
as $$
  select min(d.trade_date)
    from public.market_days d
   where d.status = 'open'
     and d.trade_date >= (p_at at time zone 'Asia/Kolkata')::date
     and (d.trade_date + time '15:00') at time zone 'Asia/Kolkata' > p_at
     and exists (select 1 from public.prices_daily p where p.company_id = p_company_id and p.trade_date = d.trade_date)
     and exists (select 1 from public.prices_daily p where p.benchmark = 'NIFTY50' and p.trade_date = d.trade_date);
$$;

-- Product of the factors with p_after < ex_date <= p_upto, exact in numeric.
create function private.action_factor(p_company_id uuid, p_after date, p_upto date)
returns numeric language plpgsql stable security definer set search_path = ''
as $$
declare
  a record;
  v numeric := 1;
begin
  for a in select ca.factor from public.corporate_actions ca
            where ca.company_id = p_company_id and ca.ex_date > p_after and ca.ex_date <= p_upto loop
    v := v * a.factor;
  end loop;
  return v;
end;
$$;

-- True when two consecutive stored closes inside the window fall by more than 30% with no action between them
-- (an ex-date on a holiday counts for the first trading day after it).
create function private.has_jump(p_company_id uuid, p_from date, p_to date)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from (select p.trade_date as d, p.close as c,
                   lag(p.trade_date) over w as pd, lag(p.close) over w as pc
              from public.prices_daily p
             where p.company_id = p_company_id and p.trade_date between p_from and p_to
            window w as (order by p.trade_date)) q
     where q.pc is not null and q.c < q.pc * 0.7
       and not exists (select 1 from public.corporate_actions ca
                        where ca.company_id = p_company_id and ca.ex_date > q.pd and ca.ex_date <= q.d));
$$;

create function private.score_ideas_now(p_today date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  i          record;
  v_open     timestamptz;
  v_close    timestamptz;
  v_entry    date;
  v_exit     date;
  v_mark     date;
  v_final    boolean;
  v_pending  boolean;
  v_ec numeric; v_ei numeric; v_mc numeric; v_mi numeric;
  v_xc numeric;                         -- the index close at entry
  v_es text; v_xs text; v_ms text; v_ns text;
  v_isin_entry text; v_isin_last text;
  v_factor   numeric;
  v_ret      numeric;
  v_iret     numeric;
  v_excess   numeric;
  v_stale    boolean;
  v_flags    text[];
  v_n        integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('idea_scores:compute'));

  for i in select d.id, d.company_id, d.expects, d.status from public.ideas d where d.status <> 'void' order by d.created_at, d.id loop
    select e.recorded_at into v_open from public.idea_events e where e.idea_id = i.id and e.kind = 'open';
    v_entry := private.first_close_after(i.company_id, v_open);

    if v_entry is null then
      insert into public.idea_scores as s (idea_id, flags, computed_at)
      values (i.id, array['entry_pending'], clock_timestamp())
      on conflict (idea_id) do update set
        entry_date = null, entry_close = null, entry_index = null, mark_date = null, mark_close = null, mark_index = null,
        factor = null, idea_return = null, index_return = null, excess = null, holding_days = null, is_final = false,
        entry_source = null, mark_source = null, flags = excluded.flags, computed_at = excluded.computed_at;
      v_n := v_n + 1;
      continue;
    end if;

    v_final := false;
    v_pending := false;
    v_exit := null;
    if i.status = 'closed' then
      select e.recorded_at into v_close from public.idea_events e where e.idea_id = i.id and e.kind = 'close';
      v_exit := private.first_close_after(i.company_id, v_close);
      v_final := v_exit is not null;
      v_pending := v_exit is null;
    end if;

    if v_exit is not null then
      v_mark := v_exit;
    else
      select max(d.trade_date) into v_mark
        from public.market_days d
       where d.status = 'open' and d.trade_date >= v_entry
         and exists (select 1 from public.prices_daily p where p.company_id = i.company_id and p.trade_date = d.trade_date)
         and exists (select 1 from public.prices_daily p where p.benchmark = 'NIFTY50' and p.trade_date = d.trade_date);
    end if;

    select p.close, p.source, p.isin into v_ec, v_es, v_isin_entry
      from public.prices_daily p where p.company_id = i.company_id and p.trade_date = v_entry;
    select p.close, p.source into v_xc, v_xs
      from public.prices_daily p where p.benchmark = 'NIFTY50' and p.trade_date = v_entry;
    select p.close, p.source into v_mc, v_ms
      from public.prices_daily p where p.company_id = i.company_id and p.trade_date = v_mark;
    select p.close, p.source into v_mi, v_ns
      from public.prices_daily p where p.benchmark = 'NIFTY50' and p.trade_date = v_mark;
    v_ei := v_xc;
    -- each side records the weaker of its two sources
    v_es := case when private.close_rank(v_es) <= private.close_rank(v_xs) then v_es else v_xs end;
    v_ms := case when private.close_rank(v_ms) <= private.close_rank(v_ns) then v_ms else v_ns end;

    v_factor := private.action_factor(i.company_id, v_entry, v_mark);
    v_ret    := v_mc * v_factor / v_ec - 1;
    v_iret   := v_mi / v_ei - 1;
    v_excess := case i.expects when 'outperform' then v_ret - v_iret else -(v_ret - v_iret) end;

    select p.isin into v_isin_last from public.prices_daily p
     where p.company_id = i.company_id and p.trade_date between v_entry and v_mark and p.isin is not null
     order by p.trade_date desc limit 1;
    v_stale := i.status = 'open' and (
      select count(*) from generate_series((v_mark + 1)::timestamp, p_today::timestamp, interval '1 day') g
       where extract(isodow from g) < 6) >= 3;

    v_flags := array_remove(array[
      case when v_pending then 'exit_pending' end,
      case when private.has_jump(i.company_id, v_entry, v_mark) then 'jump' end,
      case when v_isin_entry is not null and v_isin_last is not null and v_isin_entry <> v_isin_last then 'isin_changed' end,
      case when v_stale then 'stale' end]::text[], null);

    insert into public.idea_scores as s (
      idea_id, entry_date, entry_close, entry_index, mark_date, mark_close, mark_index, factor,
      idea_return, index_return, excess, holding_days, is_final, entry_source, mark_source, flags, computed_at)
    values (i.id, v_entry, v_ec, v_ei, v_mark, v_mc, v_mi, v_factor,
            v_ret, v_iret, v_excess, v_mark - v_entry, v_final, v_es, v_ms, v_flags, clock_timestamp())
    on conflict (idea_id) do update set
      entry_date = excluded.entry_date, entry_close = excluded.entry_close, entry_index = excluded.entry_index,
      mark_date = excluded.mark_date, mark_close = excluded.mark_close, mark_index = excluded.mark_index,
      factor = excluded.factor, idea_return = excluded.idea_return, index_return = excluded.index_return,
      excess = excluded.excess, holding_days = excluded.holding_days, is_final = excluded.is_final,
      entry_source = excluded.entry_source, mark_source = excluded.mark_source, flags = excluded.flags,
      computed_at = excluded.computed_at;
    v_n := v_n + 1;
  end loop;

  delete from public.idea_scores s using public.ideas d where s.idea_id = d.id and d.status = 'void';
  return v_n;
end;
$$;

-- Two thin wrappers, one per role (spec s5.3): the job's has no caller check, the admin's checks it.
create function public.score_ideas()
returns integer
language sql security definer set search_path = ''
as $$
  select private.score_ideas_now((now() at time zone 'Asia/Kolkata')::date);
$$;

create function public.rescore_ideas()
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'ledger: not allowed' using errcode = '42501';
  end if;
  return private.score_ideas_now((now() at time zone 'Asia/Kolkata')::date);
end;
$$;

-- 2. Grants. The private helpers are executable by no API role; the two wrappers by one role each.
revoke execute on function private.first_close_after(uuid, timestamptz)                                from public, anon, authenticated, service_role;
revoke execute on function private.action_factor(uuid, date, date)                                     from public, anon, authenticated, service_role;
revoke execute on function private.has_jump(uuid, date, date)                                          from public, anon, authenticated, service_role;
revoke execute on function private.score_ideas_now(date)                                               from public, anon, authenticated, service_role;
revoke execute on function public.score_ideas()                                                        from public, anon, authenticated, service_role;
revoke execute on function public.rescore_ideas()                                                      from public, anon, authenticated, service_role;
grant execute on function public.score_ideas()                              to service_role;
grant execute on function public.rescore_ideas()                            to authenticated;
