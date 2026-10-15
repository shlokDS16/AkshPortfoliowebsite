-- E2E fixture for the case study loop (Plan 3b Task 5; D43). LOCAL STACK ONLY: it rewrites the dates of the events it makes,
-- re-seals the whole chain and the sealed days, and writes closes. It is never run against the hosted project: e2e/support/cases.ts
-- refuses to run without the local stack, and the owner-level statements below do not exist in the app.
--
-- What it makes: an invented company (made-up name, symbol and ISIN; no real NSE row) and ONE closed idea on it, written through
-- the real functions as the admin (open, revise, note, close, review), then moved back in time (140 / 120 / 100 / 60 / 50 India
-- days, weekday mornings) so the 30-day lag has passed. Smooth fetched-source closes for the company and the Nifty 50 are stored for every
-- weekday of the span, the idea is scored, and the sealed days are rebuilt. The owner switches are NOT touched here: the spec turns them.
--
-- __TAG__ is replaced by cases.ts with a short run id (lower case letters and digits), so a second run on the same database makes
-- a second company instead of colliding with the first. __MODE__ is 'case' (everything above) or 'review' (a second lesson on the
-- idea the first run made, dated 35 India days back, so the spec can move the ledger's figures-to date under a public case study).
do $fixture$
declare
  c_tag    constant text := '__TAG__';
  c_mode   constant text := '__MODE__';
  c_sym    constant text := 'ZTR' || upper(c_tag);
  v_admin  uuid;
  v_co     uuid;
  v_idea   uuid;
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_first  date;
  v_last   date;
  v_prev   text;
  v_seq    bigint;
  v_canon  text;
  v_hash   text;
  r        record;
  k        integer;
  d        date;
begin
  -- Guards first, before anything writes. The placeholders are filled only by e2e/support/cases.ts; pasted into an SQL editor as it
  -- is, the file stops here instead of falling into the 'case' branch.
  if c_tag !~ '^[a-z0-9]{4,16}$' or c_mode not in ('case', 'review') then
    raise exception 'aged-case: run only through e2e/support/cases.ts (placeholders not filled)';
  end if;
  -- supabase/seed.sql (local stack and CI only) sets admin_email to the reserved .test address; the hosted project's is set by hand.
  if (select s.value from private.settings s where s.key = 'admin_email') is distinct from 'admin@desk.test' then
    raise exception 'aged-case: this is not the local stack (admin_email is not the seed''s); refusing to rewrite the ledger';
  end if;
  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;
  if v_admin is null then
    raise exception 'aged-case: no admin profile on this database (sign in once first)';
  end if;

  if c_mode = 'review' then
    select i.id into v_idea from public.ideas i join public.companies c on c.id = i.company_id where c.nse_symbol = c_sym;
    if v_idea is null then
      raise exception 'aged-case: no idea for % (run the case mode first)', c_sym;
    end if;
    select c.id into v_co from public.companies c where c.nse_symbol = c_sym;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.add_idea_event(v_idea, 'review',
      'Looking again, the second lesson is about the size I would have held. I would have held less until the second quarter was in.',
      '{"process": "flawed", "tags": ["timing", "sizing"]}'::jsonb);
    reset role;
    alter table public.idea_events disable trigger user;
    d := v_today - 35;
    d := d - case extract(isodow from d)::integer when 6 then 1 when 7 then 2 else 0 end;
    update public.idea_events e set recorded_at = (d + time '10:30') at time zone 'Asia/Kolkata'
     where e.idea_id = v_idea and e.kind = 'review'
       and e.seq = (select max(x.seq) from public.idea_events x where x.idea_id = v_idea and x.kind = 'review');
    alter table public.idea_events enable trigger user;
  else
  -- 1. The invented company, private until the spec makes it public through the desk, as Aksh would.
  insert into public.companies (slug, name, nse_symbol, isin, sector, one_liner, visibility)
  values ('tamarind-ridge-textiles-' || c_tag, 'Tamarind Ridge Textiles Ltd', c_sym, 'INE' || upper(substr(md5(c_tag), 1, 9)),
          'Textiles', 'An invented company for the case study test; it is not a real listing.', 'private')
  returning id into v_co;

  -- 2. The idea, as the admin, through the real functions (the caller is read from the claims; the role is the admin's).
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_idea := public.open_idea(v_co, 'outperform', 365, false,
    'Tamarind Ridge makes cotton fabric for export. Its looms are full and its order book is growing faster than I think the market expects, so I expect it to do better than the Nifty 50 over a year. I would be wrong if the order book stops growing for two quarters.');
  perform public.add_idea_event(v_idea, 'revise',
    'Shortening the period to six months. The next two results will test the order book, and I would rather judge it then.',
    '{"horizon_days": 182}'::jsonb);
  perform public.add_idea_event(v_idea, 'note', 'Private note: the order book grew again. Nothing changes.');
  perform public.add_idea_event(v_idea, 'close',
    'Closing the idea. The order book fell for two quarters in a row, which is what I said would make me wrong.',
    '{"reason": "thesis_broken"}'::jsonb);
  perform public.add_idea_event(v_idea, 'review',
    'The thesis broke because I misread how long the big order would last. I was slow to act on the change; the signal was there in the second quarter.',
    '{"process": "flawed", "tags": ["timing"]}'::jsonb);
  reset role;

  -- 3. Move the five events back (owner only; the append-only trigger is off for the update), weekday mornings 10:30 India time.
  alter table public.idea_events disable trigger user;
  for r in select * from (values ('open', 140), ('revise', 120), ('note', 100), ('close', 60), ('review', 50)) as t(kind, n) loop
    d := v_today - r.n;
    d := d - case extract(isodow from d)::integer when 6 then 1 when 7 then 2 else 0 end;
    update public.idea_events set recorded_at = (d + time '10:30') at time zone 'Asia/Kolkata'
     where idea_id = v_idea and kind = r.kind;
  end loop;
  alter table public.idea_events enable trigger user;
  end if;

  -- 4. Re-seal the whole chain exactly as the seal trigger would have (order by time, renumber, rebuild every sealed text, re-hash).
  v_prev := repeat('0', 64);
  v_seq := 0;
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

  -- 5. The sealed days: delete and rebuild (append-only for every role; the owner takes the guards off by name and puts them back
  -- ENABLE ALWAYS, which the assert checks).
  alter table public.ledger_anchors disable trigger ledger_anchors_guard;
  alter table public.ledger_anchors disable trigger ledger_anchors_no_truncate;
  delete from public.ledger_anchors;
  alter table public.ledger_anchors enable always trigger ledger_anchors_guard;
  alter table public.ledger_anchors enable always trigger ledger_anchors_no_truncate;
  if (select count(*) from pg_trigger
       where tgrelid = 'public.ledger_anchors'::regclass and tgname in ('ledger_anchors_guard', 'ledger_anchors_no_truncate')
         and tgenabled = 'A') <> 2 then
    raise exception 'aged-case: the sealed-day guards are not back on';
  end if;
  perform public.seal_ledger_days();

  if c_mode = 'case' then
  -- 6. Closes: every weekday from four days before the opening to the review, official-file source, smooth (no step near 30%).
  select (e.recorded_at at time zone 'Asia/Kolkata')::date - 4 into v_first from public.idea_events e where e.idea_id = v_idea and kind = 'open';
  select (e.recorded_at at time zone 'Asia/Kolkata')::date into v_last from public.idea_events e where e.idea_id = v_idea and kind = 'review';
  k := 0;
  for d in select g::date from generate_series(v_first, v_last, interval '1 day') g where extract(isodow from g) < 6 loop
    insert into public.market_days (trade_date, status, source) values (d, 'open', 'nse_fetch') on conflict do nothing;
    insert into public.prices_daily (company_id, trade_date, close, source, symbol, series, isin)
    values (v_co, d, round((100 + k * 0.12 + 3 * sin(k / 6.0))::numeric, 4), 'nse_fetch', c_sym, 'EQ',
            'INE' || upper(substr(md5(c_tag), 1, 9))) on conflict do nothing;
    insert into public.prices_daily (benchmark, trade_date, close, source)
    values ('NIFTY50', d, round((20000 + k * 9 + 60 * cos(k / 7.0))::numeric, 4), 'nse_fetch') on conflict do nothing;
    k := k + 1;
  end loop;
  end if;

  -- 7. Score (the real scorer; it refuses on a chain, projection or sealed-day mismatch), then assert what the loop relies on.
  perform public.score_ideas();
  if not exists (select 1 from public.idea_scores s
                  where s.idea_id = v_idea and s.is_final and cardinality(s.flags) = 0
                    and s.entry_source = 'nse_fetch' and s.mark_source = 'nse_fetch') then
    raise exception 'aged-case: the aged idea is not scored final with no flag';
  end if;
end;
$fixture$;
