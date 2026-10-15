-- =============================================================================
-- 20261015000018_case_record.sql - Plan 3b Task 1: the ledger record of a case study, the two owner switches and the rule 10
-- checks (spec s33.2, s33.3; docs/compliance/publishing-rules-v1.1-addendum.md). 0019 restates publish_revision() to call
-- private.case_gate_failures; nothing here is reachable by a visitor: anon gets no grant, policy, view or function, and no
-- existing grant, view or policy changes.
-- Never edit this file after it reaches the hosted project; add a later migration instead.
--
-- 1. private.case_switch(key): the two owner switches live in private.settings (ledger_reveal, ledger_chart). A switch is on
--    only when its value is exactly 'on'; a missing row or any other value is off. Nothing else reads these keys, and
--    private.apply_admin_email() acts only on key = 'admin_email', so the new rows are inert for the admin role.
-- 2. private.case_study_record(idea): the version 1 record, built from the SEALED events (company, direction, words, times and
--    choices come from the sealed text, never from the editable projection), the idea's final score, the sealed-day table and,
--    only when ledger_chart is on and every condition of rule 10.6 holds, fetched closes. It raises case:not_closed,
--    case:void, case:no_review or case:exit_pending instead of returning part of a record.
-- 3. public.case_study_record(idea), public.case_study_switches(): the admin's doors (drafting; "why can this not be published").
-- 4. private.case_gate_failures(...): the rule 10 failures publish_revision records. The gate rebuilds the record and requires
--    jsonb equality with the revision's, so no word and no number can be added, dropped or edited on the way to the page.
--    Deviation from s33.2, conservative: figures_to also covers the exit date (it is printed on the page) so the 30-day lag
--    covers every date the page shows, chart or no chart.
-- =============================================================================

-- 1. The switches.
create function private.case_switch(p_key text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.value = 'on' from private.settings s where s.key = p_key), false);
$$;

-- 2. The builder.
create function private.case_study_record(p_idea_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_open   public.idea_events;
  v_close  public.idea_events;
  v_review public.idea_events;
  v_oc     jsonb;
  v_score  public.idea_scores;
  v_events jsonb;
  v_chart  jsonb := 'null'::jsonb;
  v_ft     date;
  v_n      integer;
begin
  if exists (select 1 from public.idea_events e where e.idea_id = p_idea_id and e.kind = 'void') then
    raise exception 'case:void' using errcode = 'P0001';
  end if;
  select e.* into v_open from public.idea_events e where e.idea_id = p_idea_id and e.kind = 'open' order by e.seq limit 1;
  select e.* into v_close from public.idea_events e where e.idea_id = p_idea_id and e.kind = 'close' order by e.seq limit 1;
  if v_open.id is null or v_close.id is null then
    raise exception 'case:not_closed' using errcode = 'P0001';
  end if;
  select e.* into v_review from public.idea_events e where e.idea_id = p_idea_id and e.kind = 'review' order by e.seq desc limit 1;
  if v_review.id is null then
    raise exception 'case:no_review' using errcode = 'P0001';
  end if;
  select s.* into v_score from public.idea_scores s where s.idea_id = p_idea_id;
  if v_score.idea_id is null or not v_score.is_final or v_score.entry_date is null or v_score.mark_date is null then
    raise exception 'case:exit_pending' using errcode = 'P0001';
  end if;
  v_oc := v_open.canonical::jsonb;

  -- The revealed entries: open, every revise, close, every review, in seq order. Words, time and choices from the sealed text.
  select jsonb_agg(jsonb_build_object(
           'seq', x.seq, 'kind', x.kind, 'at', x.c ->> 'at', 'words', x.c ->> 'words', 'stance', x.c -> 'stance',
           'prev_hash', x.prev_hash, 'hash', x.hash, 'canonical', x.canonical,
           'listed_on', (select to_char((a.published_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD')
                           from public.ledger_anchors a
                          where a.published_at is not null
                            and a.anchor_date = ((x.c ->> 'at')::timestamptz at time zone 'Asia/Kolkata')::date
                            and (a.line::jsonb -> 'hashes') ? x.hash)) order by x.seq),
         max(((x.c ->> 'at')::timestamptz at time zone 'Asia/Kolkata')::date)
    into v_events, v_ft
    from (select e.seq, e.kind, e.prev_hash, e.hash, e.canonical, e.canonical::jsonb as c
            from public.idea_events e
           where e.idea_id = p_idea_id and e.kind in ('open', 'revise', 'close', 'review')) x;

  -- The chart (rule 10.6): second switch; a final score with no flag at all, nothing typed or uploaded under the entry or the
  -- exit, no share factor; weekly points from fetched closes only; at most 600 points, otherwise no chart rather than a cut one.
  if private.case_switch('ledger_chart') and cardinality(coalesce(v_score.flags, '{}'::text[])) = 0
     and v_score.entry_source = 'nse_fetch' and v_score.mark_source = 'nse_fetch' and coalesce(v_score.factor, 1) = 1
     and coalesce(v_score.entry_close, 0) > 0 and coalesce(v_score.entry_index, 0) > 0
     and coalesce(v_score.mark_close, 0) > 0 and coalesce(v_score.mark_index, 0) > 0 then
    select jsonb_agg(w.pt order by w.d), count(*)::integer into v_chart, v_n
      from (
        select v_score.entry_date as d,
               jsonb_build_object('d', to_char(v_score.entry_date, 'YYYY-MM-DD'), 'share', 100.00, 'index', 100.00) as pt
        union all
        select z.d, jsonb_build_object('d', to_char(z.d, 'YYYY-MM-DD'),
                 'share', round(z.sc / v_score.entry_close * 100, 2), 'index', round(z.ic / v_score.entry_index * 100, 2))
          from (select distinct on (date_trunc('week', p.trade_date::timestamp)) p.trade_date as d, p.close as sc, i.close as ic
                  from public.prices_daily p
                  join public.prices_daily i on i.benchmark = 'NIFTY50' and i.trade_date = p.trade_date and i.source = 'nse_fetch'
                 where p.company_id = (v_oc ->> 'company_id')::uuid and p.source = 'nse_fetch'
                   and p.trade_date > v_score.entry_date and p.trade_date < v_score.mark_date
                 order by date_trunc('week', p.trade_date::timestamp), p.trade_date desc) z
        union all
        select v_score.mark_date,
               jsonb_build_object('d', to_char(v_score.mark_date, 'YYYY-MM-DD'),
                 'share', round(v_score.mark_close / v_score.entry_close * 100, 2),
                 'index', round(v_score.mark_index / v_score.entry_index * 100, 2))
      ) w;
    if v_n > 600 then
      v_chart := 'null'::jsonb;
    else
      v_chart := jsonb_build_object('points', v_chart);
    end if;
  end if;

  return jsonb_build_object(
    'v', 1, 'idea', p_idea_id, 'company_id', v_oc ->> 'company_id', 'symbol', v_oc ->> 'symbol', 'company', v_oc ->> 'company',
    'expects', v_oc -> 'stance' ->> 'expects', 'benchmark', v_oc -> 'stance' ->> 'benchmark',
    'horizon_days', (v_oc -> 'stance' ->> 'horizon_days')::integer,
    'close_reason', v_close.canonical::jsonb -> 'stance' ->> 'reason',
    'process', v_review.canonical::jsonb -> 'stance' ->> 'process', 'tags', v_review.canonical::jsonb -> 'stance' -> 'tags',
    'entry_date', to_char(v_score.entry_date, 'YYYY-MM-DD'), 'exit_date', to_char(v_score.mark_date, 'YYYY-MM-DD'),
    'holding_days', v_score.holding_days, 'events', v_events, 'chart', v_chart,
    'figures_to', to_char(greatest(v_ft, v_score.mark_date), 'YYYY-MM-DD'));
end;
$$;

-- 3. The admin's doors.
create function public.case_study_record(p_idea_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.case_study_record(p_idea_id);
end;
$$;

create function public.case_study_switches()
returns table (reveal boolean, chart boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select private.case_switch('ledger_reveal'), private.case_switch('ledger_chart');
end;
$$;

-- 4. Rule 10 as the gate records it. Volatile on purpose: it takes the chain lock and must see the ledger as it is after the
-- lock. Returns '[]' for a revision with no ledger record. A ledger that fails its own checks, or a record the builder cannot
-- read, is a recorded refusal: the gate never passes because it could not look.
create function private.case_gate_failures(p_item_id uuid, p_kind text, p_company_id uuid, p_data_as_of date, p_structured jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_out   jsonb := '[]'::jsonb;
  v_led   jsonb;
  v_rec   jsonb;
  v_ok    boolean;
  v_co    uuid;
  v_ft    date;
  v_why   text;
begin
  if p_structured is null or jsonb_typeof(p_structured) <> 'object' or not (p_structured ? 'ledger') then
    return v_out;
  end if;
  perform pg_advisory_xact_lock(hashtext('idea_events:chain'));
  v_led := p_structured -> 'ledger';
  if p_kind is distinct from 'case_study' then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '10', 'code', 'case_kind',
      'message', 'Only a case study can carry a ledger record.'));
  end if;
  if not private.case_switch('ledger_reveal') then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '10', 'code', 'case_off',
      'message', 'Case studies from the ledger are switched off by the site owner.'));
  end if;
  begin
    select c.ok into v_ok from private.ledger_chain_check() c;
    if v_ok is true then
      select a.ok into v_ok from private.ledger_anchor_check() a;
    end if;
    if v_ok is not true then
      raise exception 'ledger check failed' using errcode = 'XX000';
    end if;
    v_rec := private.case_study_record((v_led ->> 'idea')::uuid);
  exception when others then
    if sqlstate = 'P0001' and sqlerrm like 'case:%' then
      v_why := case substr(sqlerrm, 6)
        when 'not_closed' then 'it is not closed'
        when 'void' then 'it was withdrawn'
        when 'no_review' then 'it has no lesson'
        when 'exit_pending' then 'its exit price is not fixed'
        else 'it cannot be built' end;
      return v_out || jsonb_build_array(jsonb_build_object('rule', '10', 'code', 'case_not_ready',
        'message', format('This idea cannot be shown as a case study yet: %s.', v_why)));
    end if;
    return v_out || jsonb_build_array(jsonb_build_object('rule', '10', 'code', 'ledger_check_failed',
      'message', 'The ledger failed its own check, so this case study cannot be published until it is looked at. Run the integrity check on the Ledger page.'));
  end;

  if v_led is distinct from v_rec then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '10', 'code', 'case_record',
      'message', 'The ledger record in this revision no longer matches the ledger. Refresh it from the ledger and publish the new revision.'));
  end if;
  v_co := (v_rec ->> 'company_id')::uuid;
  if p_company_id is null or not (p_company_id = v_co or exists (
       select 1 from public.companies s join public.company_aliases a on a.symbol = s.nse_symbol
        where s.id = v_co and a.company_id = p_company_id)) then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '10', 'code', 'case_company',
      'message', 'This case study is filed under a different company from the idea''s.'));
  end if;
  v_ft := (v_rec ->> 'figures_to')::date;
  if p_data_as_of is distinct from v_ft then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '10', 'code', 'case_figures_to',
      'message', format('The figures-to date of this case study must be %s, the date of the latest entry or chart point it shows.',
                        to_char(v_ft, 'DD Mon YYYY'))));
  end if;
  -- An idea still open on the company (or on a stub merged into it), read from the sealed events like rule 4.
  if exists (
       with cos as (
         select v_co::text as id
         union select p_company_id::text where p_company_id is not null
         union select s.id::text from public.company_aliases a join public.companies s on s.nse_symbol = a.symbol
                where a.company_id = v_co or a.company_id = p_company_id
       )
       select 1 from public.idea_events o
        where o.kind = 'open' and o.canonical::jsonb ->> 'company_id' in (select c.id from cos c)
          and not exists (select 1 from public.idea_events x where x.idea_id = o.idea_id and x.kind in ('close', 'void'))) then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '10', 'code', 'case_open_idea',
      'message', 'The ledger has an open idea on this company. A closed case can be published once no idea on the company is open.'));
  end if;
  if exists (select 1 from public.items o join public.item_revisions r on r.id = o.current_revision_id
              where o.id <> p_item_id and o.status = 'published' and r.structured -> 'ledger' ->> 'idea' = v_rec ->> 'idea') then
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule', '10', 'code', 'case_duplicate',
      'message', 'Another published case study already shows this idea.'));
  end if;
  return v_out;
end;
$$;

-- 5. Privileges. Start from nothing, grant by name. The private helpers are called only by security-definer code; the two
-- doors check the admin inside and go to authenticated only. anon, service_role and PUBLIC get nothing.
revoke execute on function private.case_switch(text)                                        from public, anon, authenticated, service_role;
revoke execute on function private.case_study_record(uuid)                                  from public, anon, authenticated, service_role;
revoke execute on function private.case_gate_failures(uuid, text, uuid, date, jsonb)        from public, anon, authenticated, service_role;
revoke execute on function public.case_study_record(uuid)                                   from public, anon, authenticated, service_role;
revoke execute on function public.case_study_switches()                                     from public, anon, authenticated, service_role;
grant execute on function public.case_study_record(uuid) to authenticated;
grant execute on function public.case_study_switches() to authenticated;
