-- =============================================================================
-- 20261013000012_scores.sql - Plan 3a Task 2 (part 2 of 2): the one function that scores ideas against the Nifty 50.
-- Spec: docs/specs/2026-10-13-phase-3-track-record-design.md s6, s18. ADR: ADR-005 s3.5.
-- Never edit this file after it reaches the hosted project; add a later migration instead.
-- (Fix rounds 1 and 2, 2026-10-13: amended in place; it had not left the local stack.)
--
-- private.score_ideas_now() is the only code that writes idea_scores and idea_score_changes. It recomputes every
-- non-void idea from the SEALED events (direction, void, company, open and close time), prices_daily, market_days and
-- corporate_actions, so a score is a pure function of stored facts and re-running it is harmless. It refuses to run
-- while the ledger check fails (it runs FIRST, so no sealed text is parsed before it has been verified) or the projection
-- (ideas) disagrees with the events. No price or return is ever written into idea_events.
--
-- Every corporate action is typed by hand (there is no automatic source). An action of any kind clears isin_changed for
-- its step, a 'none' ("I looked, the move is real") also clears jump, and a factor multiplies the return; so a score that
-- depends on one never says nothing: any live action of ANY kind dated inside the scored span (opening day to mark date)
-- sets the flag 'attested' on the score, which is treated everywhere exactly like 'hand_price' (a figure resting on a
-- hand entry, counted and named, never for a public number). Round 3 (re-review I-1): this was 'none' only.
-- =============================================================================

-- 1. Facts from the sealed events. agrees = the ideas row (company, direction, status) says what the events say.
create function private.idea_facts()
returns table (idea_id uuid, created_at timestamptz, company_id uuid, expects text, sealed_symbol text, sealed_isin text,
               opened timestamptz, closed timestamptz, is_void boolean, agrees boolean)
language sql stable security definer set search_path = ''
as $$
  select d.id, d.created_at,
         (o.canonical::jsonb ->> 'company_id')::uuid, (o.stance ->> 'expects'),
         (o.canonical::jsonb ->> 'symbol'), (o.canonical::jsonb ->> 'isin'),
         o.recorded_at, c.recorded_at, v.is_void,
         (((o.canonical::jsonb ->> 'company_id') = d.company_id::text)
          and ((o.stance ->> 'expects') = d.expects)
          and d.status = case when v.is_void then 'void' when c.recorded_at is not null then 'closed' else 'open' end) is true
    from public.ideas d
    left join lateral (select e.* from public.idea_events e where e.idea_id = d.id and e.kind = 'open'
                        order by e.seq limit 1) o on true
    left join lateral (select e.recorded_at from public.idea_events e where e.idea_id = d.id and e.kind = 'close'
                        order by e.seq limit 1) c on true
    cross join lateral (select exists (select 1 from public.idea_events e where e.idea_id = d.id and e.kind = 'void') as is_void) v;
$$;

-- 2. Scoring rules (spec s6). Entry and exit: the first open trading day whose 15:00 IST comes after the event and on
-- which both the company and the Nifty 50 have a close. Nobody supplies a date.
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

-- Open trading days passed over before p_first (the share had no close on them): machine facts for the idea page.
create function private.skipped_days(p_at timestamptz, p_first date)
returns integer language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.market_days d
   where d.status = 'open' and d.trade_date < p_first
     and d.trade_date >= (p_at at time zone 'Asia/Kolkata')::date
     and (d.trade_date + time '15:00') at time zone 'Asia/Kolkata' > p_at;
$$;

-- Product of the live factors with p_after < ex_date <= p_upto, exact in numeric.
create function private.action_factor(p_company_id uuid, p_after date, p_upto date)
returns numeric language plpgsql stable security definer set search_path = ''
as $$
declare
  a record;
  v numeric := 1;
begin
  for a in select ca.factor from private.live_actions(p_company_id) ca
            where ca.ex_date > p_after and ca.ex_date <= p_upto loop
    v := v * a.factor;
  end loop;
  return v;
end;
$$;

-- True when a step between two consecutive stored closes inside the window is implausible after adjusting for the
-- actions in force: a fall below 70%, a rise above 1/0.7 of the previous close, or a factor that makes the step bigger.
-- A live 'none' action in the step ("I looked, the move is real") clears it (the score then carries 'attested'). An
-- ex-date on a holiday counts for the first trading day after it (the step is (previous close, this close]). Only rows on
-- open trading days are steps: a typed close on a shut day or a weekend can neither split a big move into two small ones
-- nor stand in for a price. The "factor makes the step bigger" test is deliberately strict: a small legitimate factor
-- that moves the step the wrong way is flagged until Aksh records a 'none' beside it (spec s20).
create function private.has_jump(p_company_id uuid, p_from date, p_to date)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from (select p.trade_date as d, p.close as c,
                   lag(p.trade_date) over w as pd, lag(p.close) over w as pc
              from public.prices_daily p
              join public.market_days md on md.trade_date = p.trade_date and md.status = 'open'
             where p.company_id = p_company_id and p.trade_date between p_from and p_to
            window w as (order by p.trade_date)) q
     cross join lateral (select private.action_factor(p_company_id, q.pd, q.d) as f) a
     where q.pc is not null
       and (q.c * a.f < q.pc * 0.7
            or q.c * a.f * 0.7 > q.pc
            or (a.f <> 1 and abs(ln(q.c * a.f / q.pc)) > abs(ln(q.c / q.pc))))
       and not exists (select 1 from private.live_actions(p_company_id) ca
                        where ca.kind = 'none' and ca.ex_date > q.pd and ca.ex_date <= q.d));
$$;

-- True when the security printed on the closes is not the one sealed with the idea: the symbol or the ISIN changes
-- (from the sealed value, or between two stored closes) with no action of any kind dated in the step (the score then
-- carries 'attested'). Each of the two identifiers is followed on its own, so a typed close that carries no ISIN cannot
-- hide a change. Only rows on open trading days are read.
create function private.has_identity_break(p_company_id uuid, p_from date, p_to date,
                                           p_symbol text, p_isin text, p_opened date)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from (select u.k, u.d, u.v, lag(u.d) over w as pd, lag(u.v) over w as pv
              from (select 'sym' as k, p_opened - 1 as d, p_symbol as v where p_symbol is not null
                    union all
                    select 'isin', p_opened - 1, p_isin where p_isin is not null
                    union all
                    select 'sym', p.trade_date, p.symbol from public.prices_daily p
                      join public.market_days md on md.trade_date = p.trade_date and md.status = 'open'
                     where p.company_id = p_company_id and p.trade_date between p_from and p_to and p.symbol is not null
                    union all
                    select 'isin', p.trade_date, p.isin from public.prices_daily p
                      join public.market_days md on md.trade_date = p.trade_date and md.status = 'open'
                     where p.company_id = p_company_id and p.trade_date between p_from and p_to and p.isin is not null) u
            window w as (partition by u.k order by u.d)) q
     where q.pv is not null and q.v <> q.pv
       and not exists (select 1 from private.live_actions(p_company_id) ca where ca.ex_date > q.pd and ca.ex_date <= q.d));
$$;

-- 3. The scorer.
create function private.score_ideas_now(p_today date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  i          record;
  v_bad      record;
  v_old      public.idea_scores;
  v_new      public.idea_scores;
  v_row      public.idea_scores;
  v_was      jsonb;
  v_now      jsonb;
  v_entry    date;
  v_exit     date;
  v_mark     date;
  v_final    boolean;
  v_pending  boolean;
  v_ec numeric; v_xc numeric; v_mc numeric; v_mi numeric;
  v_es text; v_xs text; v_ms text; v_ns text;
  v_factor   numeric;
  v_ret      numeric;
  v_iret     numeric;
  v_plaus    boolean;
  v_n        integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('idea_scores:compute'));

  -- Refuse to score on facts that do not agree. The chain check goes first: it verifies every sealed text (and replays the
  -- ideas against the events) before idea_facts() parses any of them, so a malformed text is chain_broken, not a cast
  -- error. The projection check is the second line. Nothing is written; the scores already stored stay as they are.
  select c.first_bad_seq, c.bad_idea into v_bad from private.ledger_chain_check() c where c.ok is not true;
  if found then
    raise exception 'ledger:chain_broken' using errcode = 'P0001',
      detail = format('first_bad_seq=%s bad_idea=%s', v_bad.first_bad_seq, v_bad.bad_idea);
  end if;
  select f.idea_id into v_bad from private.idea_facts() f where f.agrees is not true limit 1;
  if found then
    raise exception 'ledger:projection_mismatch' using errcode = 'P0001', detail = 'idea ' || v_bad.idea_id;
  end if;

  -- A withdrawn idea has no score (a withdrawal is only possible before its entry close, so none is fixed). If a row
  -- with a fixed entry exists anyway, its removal is kept in the restatement log.
  for i in select f.idea_id from private.idea_facts() f where f.is_void loop
    select * into v_old from public.idea_scores s where s.idea_id = i.idea_id;
    if found then
      if v_old.entry_date is not null then
        insert into public.idea_score_changes (idea_id, changed, was, became)
        values (i.idea_id, array['void'], to_jsonb(v_old) - 'computed_at', jsonb_build_object('void', true));
      end if;
      delete from public.idea_scores s where s.idea_id = i.idea_id;
    end if;
  end loop;

  for i in select f.* from private.idea_facts() f where not f.is_void order by f.created_at, f.idea_id loop
    v_row := null;
    v_row.idea_id := i.idea_id;
    v_row.is_final := false;
    v_row.flags := '{}';
    v_row.computed_at := clock_timestamp();
    begin   -- one block per idea: a bad number costs that idea its figure, never the run
      v_entry := private.first_close_after(i.company_id, i.opened);
      if v_entry is null then
        v_row.flags := array['entry_pending'];
      else
        v_final := false;
        v_pending := false;
        v_exit := null;
        if i.closed is not null then
          v_exit := private.first_close_after(i.company_id, i.closed);
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

        select p.close, p.source into v_ec, v_es from public.prices_daily p where p.company_id = i.company_id and p.trade_date = v_entry;
        select p.close, p.source into v_xc, v_xs from public.prices_daily p where p.benchmark = 'NIFTY50' and p.trade_date = v_entry;
        select p.close, p.source into v_mc, v_ms from public.prices_daily p where p.company_id = i.company_id and p.trade_date = v_mark;
        select p.close, p.source into v_mi, v_ns from public.prices_daily p where p.benchmark = 'NIFTY50' and p.trade_date = v_mark;
        -- each side records the weaker of its two sources
        v_es := case when private.close_rank(v_es) <= private.close_rank(v_xs) then v_es else v_xs end;
        v_ms := case when private.close_rank(v_ms) <= private.close_rank(v_ns) then v_ms else v_ns end;

        v_factor := private.action_factor(i.company_id, v_entry, v_mark);
        v_ret    := v_mc * v_factor / v_ec - 1;
        v_iret   := v_mi / v_xc - 1;
        v_plaus  := v_ret < 1000 and v_iret < 1000 and v_factor >= 0.000001 and v_factor < 1e12;

        v_row.entry_date := v_entry;  v_row.entry_close := v_ec;  v_row.entry_index := v_xc;
        v_row.mark_date := v_mark;    v_row.mark_close := v_mc;   v_row.mark_index := v_mi;
        v_row.factor := case when v_factor >= 0.000001 and v_factor < 1e12 then v_factor end;
        if v_plaus then
          v_ret  := round(v_ret, 6);       -- round first, so the stored excess is exactly the shown difference
          v_iret := round(v_iret, 6);
          v_row.idea_return := v_ret;
          v_row.index_return := v_iret;
          v_row.excess := case when i.expects = 'outperform' then v_ret - v_iret else -(v_ret - v_iret) end;
        end if;
        v_row.holding_days := v_mark - v_entry;
        v_row.is_final := v_final;
        v_row.entry_source := v_es;
        v_row.mark_source := v_ms;
        v_row.entry_skipped_days := private.skipped_days(i.opened, v_entry);
        v_row.exit_skipped_days := case when v_exit is not null then private.skipped_days(i.closed, v_exit) end;
        v_row.flags := array_remove(array[
          case when v_pending then 'exit_pending' end,
          -- hand_price: the entry or the mark is not an official close, or ANY close on an open day inside the scored span is not
          case when private.close_rank(v_es) < 3 or private.close_rank(v_ms) < 3
                      or exists (select 1 from public.prices_daily p
                                   join public.market_days md on md.trade_date = p.trade_date and md.status = 'open'
                                  where p.company_id = i.company_id and p.trade_date between v_entry and v_mark
                                    and p.source <> 'nse_fetch') then 'hand_price' end,
          -- attested: a hand-entered action of ANY kind lies in [day of opening, mark date]; it may have multiplied the return
          -- or cleared jump or isin_changed. The range is the union of every range an action can clear or multiply over.
          case when exists (select 1 from private.live_actions(i.company_id) ca
                             where ca.ex_date >= (i.opened at time zone 'Asia/Kolkata')::date
                               and ca.ex_date <= v_mark) then 'attested' end,
          case when private.has_jump(i.company_id, v_entry, v_mark) then 'jump' end,
          case when private.has_identity_break(i.company_id, v_entry, v_mark, i.sealed_symbol, i.sealed_isin,
                                                (i.opened at time zone 'Asia/Kolkata')::date) then 'isin_changed' end,
          case when not v_plaus then 'implausible' end,
          case when not v_final and (select count(*) from generate_series((v_mark + 1)::timestamp, p_today::timestamp, interval '1 day') g
                                      where extract(isodow from g) < 6) >= 3 then 'stale' end]::text[], null);
      end if;
    exception when numeric_value_out_of_range or division_by_zero then
      v_row := null;
      v_row.idea_id := i.idea_id;
      v_row.is_final := false;
      v_row.flags := array['implausible'];
      v_row.computed_at := clock_timestamp();
    end;

    select * into v_old from public.idea_scores s where s.idea_id = i.idea_id;
    insert into public.idea_scores as s (
      idea_id, entry_date, entry_close, entry_index, mark_date, mark_close, mark_index, factor,
      idea_return, index_return, excess, holding_days, is_final, entry_source, mark_source,
      entry_skipped_days, exit_skipped_days, flags, computed_at)
    values (v_row.idea_id, v_row.entry_date, v_row.entry_close, v_row.entry_index, v_row.mark_date, v_row.mark_close,
            v_row.mark_index, v_row.factor, v_row.idea_return, v_row.index_return, v_row.excess, v_row.holding_days,
            v_row.is_final, v_row.entry_source, v_row.mark_source, v_row.entry_skipped_days, v_row.exit_skipped_days,
            v_row.flags, v_row.computed_at)
    on conflict (idea_id) do update set
      entry_date = excluded.entry_date, entry_close = excluded.entry_close, entry_index = excluded.entry_index,
      mark_date = excluded.mark_date, mark_close = excluded.mark_close, mark_index = excluded.mark_index,
      factor = excluded.factor, idea_return = excluded.idea_return, index_return = excluded.index_return,
      excess = excluded.excess, holding_days = excluded.holding_days, is_final = excluded.is_final,
      entry_source = excluded.entry_source, mark_source = excluded.mark_source,
      entry_skipped_days = excluded.entry_skipped_days, exit_skipped_days = excluded.exit_skipped_days,
      flags = excluded.flags, computed_at = excluded.computed_at
    returning s.* into v_new;

    -- Open point (b): a fixed entry (date or prices) or a final score that moves is restated in the open, never silently.
    if v_old.idea_id is not null and v_old.entry_date is not null then
      v_was := to_jsonb(v_old) - 'computed_at';
      v_now := to_jsonb(v_new) - 'computed_at';
      if (v_was -> 'entry_date', v_was -> 'entry_close', v_was -> 'entry_index')
           is distinct from (v_now -> 'entry_date', v_now -> 'entry_close', v_now -> 'entry_index')
         or (v_old.is_final and v_was is distinct from v_now) then
        insert into public.idea_score_changes (idea_id, changed, was, became)
        values (i.idea_id, (select array_agg(k order by k) from jsonb_object_keys(v_was) k where v_was -> k is distinct from v_now -> k),
                v_was, v_now);
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
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

-- 4. Grants. The private helpers are executable by no API role; the two wrappers by one role each.
revoke execute on function private.idea_facts()                                                        from public, anon, authenticated, service_role;
revoke execute on function private.first_close_after(uuid, timestamptz)                                from public, anon, authenticated, service_role;
revoke execute on function private.skipped_days(timestamptz, date)                                     from public, anon, authenticated, service_role;
revoke execute on function private.action_factor(uuid, date, date)                                     from public, anon, authenticated, service_role;
revoke execute on function private.has_jump(uuid, date, date)                                          from public, anon, authenticated, service_role;
revoke execute on function private.has_identity_break(uuid, date, date, text, text, date)              from public, anon, authenticated, service_role;
revoke execute on function private.score_ideas_now(date)                                               from public, anon, authenticated, service_role;
revoke execute on function public.score_ideas()                                                        from public, anon, authenticated, service_role;
revoke execute on function public.rescore_ideas()                                                      from public, anon, authenticated, service_role;
grant execute on function public.score_ideas()                              to service_role;
grant execute on function public.rescore_ideas()                            to authenticated;
