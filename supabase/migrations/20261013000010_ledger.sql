-- =============================================================================
-- 20261013000010_ledger.sql - Plan 3a Task 1: the private track-record ledger's integrity core. Ideas, the sealed
-- hash-chained idea_events, the only two writers, and chain verification.
-- Spec: docs/specs/2026-10-13-phase-3-track-record-design.md s5.1-s5.3. ADR: ADR-005 s3.1, s3.2, s3.5, s4.
-- Never edit this file after it reaches the hosted project; add a later migration instead.
-- (Fix rounds 1 and 2, 2026-10-13: amended in place; it had not left the local stack.)
--
-- Nothing here is public: anon gets no grant, policy, view or function. service_role holds nothing on the two
-- tables; it reaches the chain only through verify_ledger_chain(). No API role can INSERT, UPDATE or DELETE an
-- event: the only door is open_idea() / add_idea_event(), and the seal trigger computes everything that matters
-- (sequence, time, nonce, canonical text, hashes) so a caller cannot supply any of it.
--
-- WHAT THE CHAIN CHECK PROVES, AND WHAT IT DOES NOT. It proves the stored events are consistent with themselves:
-- every link, every hash, every row against the text that was sealed, and the ideas table against the events. It
-- does NOT prove the events are unaltered. Anyone who can write the table with the triggers off (the table owner,
-- a leaked database password, the SQL editor) can rewrite ANY event and recompute the hash of that row and of every
-- later row, or drop the last k events; the check then says ok. Only a comparison against something that lives
-- outside the table (the hashes already sealed in ledger_anchors and published to the gist, Task 3 and Task 8) can
-- catch that. Describe this check as "consistent with itself", never as "unaltered".
-- =============================================================================

-- 0. Words: Aksh's own text. At most 10,000 characters as typed (padding included), and at least one character that
-- is not whitespace (any ASCII whitespace, no-break space, zero-width space or byte-order mark).
create function private.words_ok(p_text text)
returns boolean language sql immutable set search_path = ''
as $$
  select p_text is not null and char_length(p_text) <= 10000 and p_text ~ E'[^\\s\\u00a0\\u200b\\ufeff]';
$$;

-- 1. ideas: identity plus current state. The state columns are a projection of the events; the chain check
-- replays the events and reports an idea whose projection disagrees.
create table public.ideas (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete restrict,
  item_id      uuid references public.items (id) on delete set null,
  expects      text not null check (expects in ('outperform', 'underperform')),
  horizon_days integer not null check (horizon_days between 30 and 3650),
  held         boolean not null,
  status       text not null default 'open' check (status in ('open', 'closed', 'void')),
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  close_reason text check (close_reason in ('played_out', 'thesis_broken', 'horizon_reached', 'better_use', 'other')),
  process_call text check (process_call in ('sound', 'flawed')),
  created_at   timestamptz not null default now(),
  constraint ideas_closed_has_time   check ((status = 'closed') = (closed_at is not null)),
  constraint ideas_closed_has_reason check ((status = 'closed') = (close_reason is not null))
);
create index ideas_company_id_idx on public.ideas (company_id);
create index ideas_item_id_idx    on public.ideas (item_id);
create index ideas_status_idx     on public.ideas (status);

-- 2. idea_events: append-only, one global chain ordered by a gapless seq. Every sealed column has no default and no
-- caller: the BEFORE INSERT trigger overwrites it.
create table public.idea_events (
  id          uuid primary key default gen_random_uuid(),
  seq         bigint not null unique,
  idea_id     uuid not null references public.ideas (id) on delete restrict,
  kind        text not null check (kind in ('open', 'note', 'revise', 'upsize', 'downsize', 'close', 'review', 'void')),
  recorded_at timestamptz not null,
  stance      jsonb not null default '{}'::jsonb check (jsonb_typeof(stance) = 'object'),
  body_md     text not null check (private.words_ok(body_md)),
  nonce       uuid not null,
  canonical   text not null,
  prev_hash   text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash        text not null check (hash ~ '^[0-9a-f]{64}$')
);
create index idea_events_idea_id_idx on public.idea_events (idea_id, seq);

-- Append-only (core migration's trigger function): update, delete and truncate are refused for every role.
create trigger idea_events_append_only
  before update or delete on public.idea_events
  for each row execute function private.reject_mutation();
create trigger idea_events_no_truncate
  before truncate on public.idea_events
  for each statement execute function private.reject_mutation();

-- 3. Helpers for the writers and the seal.
create function private.ledger_fail(p_code text)
returns void language plpgsql set search_path = ''
as $$
begin
  raise exception 'ledger:%', p_code using errcode = 'P0001';
end;
$$;

-- Strict stance keys per kind (spec s5.2). Aksh's structured choices only; an unknown key is refused. Called by the
-- seal trigger for every event, so "no machine number in an event" is a property of the table, not of one writer.
create function private.validate_idea_stance(p_kind text, p_stance jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_allowed text[];
  v_tags    jsonb;
  v_n       integer;
  v_valid   boolean;
begin
  if p_stance is null or jsonb_typeof(p_stance) <> 'object' then
    perform private.ledger_fail('bad_stance');
  end if;
  v_allowed := case p_kind
    when 'open'     then array['expects', 'horizon_days', 'held', 'benchmark']
    when 'revise'   then array['horizon_days']
    when 'downsize' then array['held']
    when 'close'    then array['reason']
    when 'review'   then array['process', 'tags']
    else array[]::text[] end;
  if exists (select 1 from jsonb_object_keys(p_stance) k where k <> all (v_allowed)) then
    perform private.ledger_fail('bad_stance');
  end if;

  if p_kind = 'open' then
    if (select count(*) from jsonb_object_keys(p_stance)) <> 4
       or jsonb_typeof(p_stance -> 'expects') is distinct from 'string'
       or (p_stance ->> 'expects') <> all (array['outperform', 'underperform'])
       or jsonb_typeof(p_stance -> 'held') is distinct from 'boolean'
       or p_stance -> 'benchmark' is distinct from '"NIFTY 50"'::jsonb then
      perform private.ledger_fail('bad_stance');
    end if;
    if jsonb_typeof(p_stance -> 'horizon_days') is distinct from 'number'
       or (p_stance ->> 'horizon_days') !~ '^[0-9]{1,5}$'
       or (p_stance ->> 'horizon_days')::integer not between 30 and 3650 then
      perform private.ledger_fail('bad_horizon');
    end if;
  elsif p_kind = 'revise' and p_stance ? 'horizon_days' then
    if jsonb_typeof(p_stance -> 'horizon_days') <> 'number' or (p_stance ->> 'horizon_days') !~ '^[0-9]{1,5}$' then
      perform private.ledger_fail('bad_stance');
    end if;
    if (p_stance ->> 'horizon_days')::integer not between 30 and 3650 then
      perform private.ledger_fail('bad_horizon');
    end if;
  elsif p_kind = 'downsize' then
    if jsonb_typeof(p_stance -> 'held') is distinct from 'boolean' then
      perform private.ledger_fail('bad_stance');
    end if;
  elsif p_kind = 'close' then
    if jsonb_typeof(p_stance -> 'reason') is distinct from 'string'
       or (p_stance ->> 'reason') <> all (array['played_out', 'thesis_broken', 'horizon_reached', 'better_use', 'other']) then
      perform private.ledger_fail('bad_stance');
    end if;
  elsif p_kind = 'review' then
    if jsonb_typeof(p_stance -> 'process') is distinct from 'string'
       or (p_stance ->> 'process') <> all (array['sound', 'flawed']) then
      perform private.ledger_fail('bad_stance');
    end if;
    v_tags := p_stance -> 'tags';
    if jsonb_typeof(v_tags) is distinct from 'array' then
      perform private.ledger_fail('bad_stance');
    end if;
    select count(*), coalesce(bool_and(jsonb_typeof(t.v) = 'string'
             and (t.v #>> '{}') = any (array['thesis', 'valuation', 'timing', 'sizing', 'process', 'behaviour', 'luck', 'none'])), false)
      into v_n, v_valid
      from jsonb_array_elements(v_tags) as t(v);
    if v_n not between 1 and 8 or not v_valid
       or v_n <> (select count(distinct t.v) from jsonb_array_elements(v_tags) as t(v)) then
      perform private.ledger_fail('bad_stance');
    end if;
  end if;
end;
$$;

-- The last instant an idea can be withdrawn: the EARLIER of 24 hours after opening and the next 15:00 IST after
-- opening (the cut-off of the entry close, spec s6), so a withdrawal can never come after the entry price is known.
-- 15:00:00 sharp already belongs to the next day's close (the window must start AFTER the event). It does not look
-- at the trading calendar: the next 15:00 IST is never later than the real entry close, so it errs on the safe side.
create function private.idea_void_deadline(p_opened timestamptz)
returns timestamptz language sql immutable set search_path = ''
as $$
  select least(
    p_opened + interval '24 hours',
    (date_trunc('day', p_opened at time zone 'Asia/Kolkata')
       + case when (p_opened at time zone 'Asia/Kolkata')::time < time '15:00' then interval '15 hours'
              else interval '39 hours' end) at time zone 'Asia/Kolkata');
$$;

-- 4. The seal (ADR-005 s3.1, s3.2). Sequence, time and hash are taken under one advisory lock so they agree. The
-- time never steps back against the previous seq, even if the wall clock does. The company id is sealed with the
-- symbol, ISIN and name, so an idea re-pointed at another company shows in the replay (sealed text, version 1).
-- A void is sealed only inside its window, measured from the sealed open event (round 2, N-2).
create function private.seal_idea_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_co      record;
  v_open_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('idea_events:chain'));
  perform private.validate_idea_stance(new.kind, new.stance);
  new.seq := coalesce((select max(e.seq) from public.idea_events e), 0) + 1;
  new.prev_hash := coalesce((select e.hash from public.idea_events e where e.seq = new.seq - 1), repeat('0', 64));
  new.recorded_at := greatest(clock_timestamp(),
                              coalesce((select e.recorded_at from public.idea_events e where e.seq = new.seq - 1),
                                       '-infinity'::timestamptz));
  -- The void deadline is enforced HERE, from the sealed times: the time of this event (taken under the chain lock) against
  -- the sealed time of the idea's open event. Nothing about ideas.opened_at is read, so moving that column opens no window.
  if new.kind = 'void' then
    select e.recorded_at into v_open_at from public.idea_events e
     where e.idea_id = new.idea_id and e.kind = 'open' order by e.seq limit 1;
    if v_open_at is null or new.recorded_at > private.idea_void_deadline(v_open_at) then
      perform private.ledger_fail('void_too_late');
    end if;
  end if;
  new.nonce := gen_random_uuid();
  select c.id, c.nse_symbol, c.isin, c.name into v_co
    from public.ideas i join public.companies c on c.id = i.company_id where i.id = new.idea_id;
  new.canonical := json_build_object(
    'v', 1, 'seq', new.seq, 'id', new.id, 'idea', new.idea_id, 'kind', new.kind,
    'at', to_char(new.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'company_id', v_co.id, 'symbol', v_co.nse_symbol, 'isin', v_co.isin, 'company', v_co.name,
    'stance', new.stance, 'words', new.body_md, 'nonce', new.nonce)::text;
  new.hash := encode(sha256(convert_to(new.prev_hash || E'\n' || new.canonical, 'UTF8')), 'hex');
  return new;
end;
$$;

create trigger idea_events_seal
  before insert on public.idea_events
  for each row execute function private.seal_idea_event();

-- 5. Guard on the projection: even the table owner cannot change who or what an idea is about, or walk a finished
-- idea back to open (no path re-opens a closed idea; a new idea is opened instead).
create function private.guard_idea_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.company_id is distinct from old.company_id
     or new.expects is distinct from old.expects or new.created_at is distinct from old.created_at then
    raise exception 'ideas: id, company_id, expects and created_at never change' using errcode = 'P0001';
  end if;
  if old.status <> 'open' and new.status is distinct from old.status then
    raise exception 'ideas: a % idea cannot become %', old.status, new.status using errcode = 'P0001';
  end if;
  if old.status = 'closed' and (new.closed_at is distinct from old.closed_at
                                or new.close_reason is distinct from old.close_reason) then
    raise exception 'ideas: the close of a closed idea never changes' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger ideas_guard_update
  before update on public.ideas
  for each row execute function private.guard_idea_update();

-- 6. open_idea(): the idea and its sealed open event in one transaction. One direction at a time per company: an
-- open idea on the other side blocks a new one (otherwise a pair could be opened and the loser withdrawn).
create function public.open_idea(
  p_company_id   uuid,
  p_expects      text,
  p_horizon_days integer,
  p_held         boolean,
  p_body_md      text,
  p_item_id      uuid default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_symbol text;
  v_idea   uuid;
  v_at     timestamptz;
begin
  if not private.is_admin() then
    raise exception 'ledger: not allowed' using errcode = '42501';
  end if;
  select c.nse_symbol into v_symbol from public.companies c where c.id = p_company_id for update;
  if not found then
    raise exception 'ledger: company not found' using errcode = 'P0002';
  end if;
  if v_symbol is null or btrim(v_symbol) = '' then
    perform private.ledger_fail('no_symbol');
  end if;
  if p_expects is null or p_expects not in ('outperform', 'underperform') or p_held is null then
    perform private.ledger_fail('bad_stance');
  end if;
  if p_horizon_days is null or p_horizon_days not between 30 and 3650 then
    perform private.ledger_fail('bad_horizon');
  end if;
  if not private.words_ok(p_body_md) then
    perform private.ledger_fail('words_required');
  end if;
  if exists (select 1 from public.ideas i
              where i.company_id = p_company_id and i.status = 'open' and i.expects <> p_expects) then
    perform private.ledger_fail('opposite_open');
  end if;

  insert into public.ideas (company_id, item_id, expects, horizon_days, held)
  values (p_company_id, p_item_id, p_expects, p_horizon_days, p_held)
  returning id into v_idea;

  insert into public.idea_events (idea_id, kind, stance, body_md)
  values (v_idea, 'open',
          jsonb_build_object('expects', p_expects, 'horizon_days', p_horizon_days, 'held', p_held, 'benchmark', 'NIFTY 50'),
          p_body_md)
  returning recorded_at into v_at;

  update public.ideas set opened_at = v_at where id = v_idea;
  return v_idea;
end;
$$;

-- 7. add_idea_event(): state rules, stance shape, insert, then the projection.
create function public.add_idea_event(
  p_idea_id uuid,
  p_kind    text,
  p_body_md text,
  p_stance  jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_idea  public.ideas%rowtype;
  v_event uuid;
  v_at    timestamptz;
begin
  if not private.is_admin() then
    raise exception 'ledger: not allowed' using errcode = '42501';
  end if;
  select * into v_idea from public.ideas i where i.id = p_idea_id for update;
  if not found then
    raise exception 'ledger: idea not found' using errcode = 'P0002';
  end if;

  if p_kind is null or p_kind not in ('note', 'revise', 'upsize', 'downsize', 'close', 'review', 'void') then
    perform private.ledger_fail('bad_kind');
  end if;
  if v_idea.status = 'void' then
    perform private.ledger_fail('is_void');
  end if;
  if p_kind = 'review' then
    if v_idea.status <> 'closed' then perform private.ledger_fail('not_closed'); end if;
  elsif p_kind <> 'note' and v_idea.status <> 'open' then
    perform private.ledger_fail('not_open');
  end if;
  -- (A void's deadline is checked by the seal trigger, from the sealed open time; see private.seal_idea_event.)
  if not private.words_ok(p_body_md) then
    perform private.ledger_fail('words_required');
  end if;
  perform private.validate_idea_stance(p_kind, p_stance);

  insert into public.idea_events (idea_id, kind, stance, body_md)
  values (p_idea_id, p_kind, p_stance, p_body_md)
  returning id, recorded_at into v_event, v_at;

  if p_kind = 'revise' and p_stance ? 'horizon_days' then
    update public.ideas set horizon_days = (p_stance ->> 'horizon_days')::integer where id = p_idea_id;
  elsif p_kind = 'upsize' then
    update public.ideas set held = true where id = p_idea_id;
  elsif p_kind = 'downsize' then
    update public.ideas set held = (p_stance ->> 'held')::boolean where id = p_idea_id;
  elsif p_kind = 'close' then
    update public.ideas
       set status = 'closed', closed_at = v_at, close_reason = p_stance ->> 'reason', held = false
     where id = p_idea_id;
  elsif p_kind = 'review' then
    update public.ideas set process_call = p_stance ->> 'process' where id = p_idea_id;
  elsif p_kind = 'void' then
    update public.ideas set status = 'void' where id = p_idea_id;
  end if;
  return v_event;
end;
$$;

-- 8. Chain verification. One private implementation, two thin wrappers: the job's has no caller check and goes to
-- service_role only; the admin's checks private.is_admin() and goes to authenticated only (spec s5.3).
-- Part one walks the chain in seq order and returns the first seq that is out of line: a gap or wrong seq, a time
-- that steps back, a prev_hash that is not the previous hash, a hash that is not sha256(prev_hash || newline ||
-- canonical), or a row whose columns no longer agree with the sealed text. Every comparison is fail-closed (a NULL
-- or a missing key is a failure), and the sealed text must hold exactly the version 1 keys.
-- Part two replays each idea's events and returns the first idea whose row (status, times, direction, horizon,
-- held, close reason, process call, company) differs from what its sealed events say, or whose void was sealed after
-- the deadline counted from its sealed open time.
-- See the header: neither part detects a rewrite that re-hashes the suffix, nor a removed tail.
create function private.ledger_chain_check()
returns table (ok boolean, events bigint, first_bad_seq bigint, bad_idea uuid)
language plpgsql stable security definer set search_path = ''
as $$
declare
  r          record;
  v_prev     text := repeat('0', 64);
  v_prev_seq bigint := 0;
  v_prev_at  timestamptz := '-infinity';
  v_n        bigint := 0;
  v_bad      boolean;
  v_c        jsonb;
  v_idea     uuid;
  v_idea_seq bigint;
begin
  for r in select e.* from public.idea_events e order by e.seq loop
    v_n := v_n + 1;
    v_bad := (r.seq = v_prev_seq + 1
              and r.prev_hash = v_prev
              and r.hash = encode(sha256(convert_to(r.prev_hash || E'\n' || r.canonical, 'UTF8')), 'hex')
              and r.recorded_at >= v_prev_at) is not true;
    if not v_bad then
      begin
        v_c := r.canonical::jsonb;
        v_bad := (jsonb_typeof(v_c) = 'object'
                  and (select array_agg(k order by k collate "C") from jsonb_object_keys(v_c) k)
                      = array['at', 'company', 'company_id', 'id', 'idea', 'isin', 'kind', 'nonce', 'seq', 'stance',
                              'symbol', 'v', 'words']
                  and v_c ->> 'v' = '1' and v_c ->> 'seq' = r.seq::text and v_c ->> 'id' = r.id::text
                  and v_c ->> 'idea' = r.idea_id::text and v_c ->> 'kind' = r.kind
                  and v_c -> 'stance' = r.stance and v_c ->> 'words' = r.body_md
                  and v_c ->> 'nonce' = r.nonce::text
                  and v_c ->> 'at' = to_char(r.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                  and v_c ->> 'company_id' is not null) is not true;
      exception when others then
        v_bad := true;
      end;
    end if;
    if v_bad then
      return query select false, (select count(*) from public.idea_events), r.seq, null::uuid;
      return;
    end if;
    v_prev := r.hash;
    v_prev_seq := r.seq;
    v_prev_at := r.recorded_at;
  end loop;

  select i.id, s.first_seq into v_idea, v_idea_seq
    from public.ideas i
    left join lateral (
      select min(e.seq) as first_seq,
             count(*) filter (where e.kind = 'open')  as opens,
             min(e.seq) filter (where e.kind = 'open') as open_seq,
             count(*) filter (where e.kind = 'close') as closes,
             count(*) filter (where e.kind = 'void')  as voids,
             count(*) filter (where (e.canonical::jsonb ->> 'company_id') is distinct from i.company_id::text) as other_company,
             max(e.recorded_at) filter (where e.kind = 'open')  as opened,
             max(e.recorded_at) filter (where e.kind = 'close') as closed,
             max(e.recorded_at) filter (where e.kind = 'void')  as voided,
             max(e.stance ->> 'expects') filter (where e.kind = 'open') as expects,
             max(e.stance ->> 'reason')  filter (where e.kind = 'close') as reason,
             (array_agg((case e.kind when 'upsize' then true when 'close' then false
                                     else (e.stance ->> 'held')::boolean end) order by e.seq desc)
                filter (where e.kind in ('open', 'upsize', 'downsize', 'close')))[1] as held,
             (array_agg((e.stance ->> 'horizon_days')::integer order by e.seq desc)
                filter (where e.kind = 'open' or (e.kind = 'revise' and e.stance ? 'horizon_days')))[1] as horizon,
             (array_agg(e.stance ->> 'process' order by e.seq desc) filter (where e.kind = 'review'))[1] as process
        from public.idea_events e where e.idea_id = i.id) s on true
   where (s.opens = 1 and s.open_seq = s.first_seq
          and s.closes + s.voids <= 1
          and (s.voids = 0 or s.voided <= private.idea_void_deadline(s.opened))
          and s.other_company = 0
          and i.opened_at = s.opened and i.expects = s.expects
          and i.horizon_days = s.horizon and i.held = s.held
          and i.status = case when s.voids = 1 then 'void' when s.closes = 1 then 'closed' else 'open' end
          and i.closed_at is not distinct from s.closed and i.close_reason is not distinct from s.reason
          and i.process_call is not distinct from s.process) is not true
   order by s.first_seq nulls first, i.created_at
   limit 1;
  if v_idea is not null then
    return query select false, v_n, v_idea_seq, v_idea;
    return;
  end if;
  return query select true, v_n, null::bigint, null::uuid;
end;
$$;

create function public.verify_ledger_chain()
returns table (ok boolean, events bigint, first_bad_seq bigint, bad_idea uuid)
language sql stable security definer set search_path = ''
as $$
  select c.ok, c.events, c.first_bad_seq, c.bad_idea from private.ledger_chain_check() c;
$$;

create function public.check_ledger_chain()
returns table (ok boolean, events bigint, first_bad_seq bigint, bad_idea uuid)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'ledger: not allowed' using errcode = '42501';
  end if;
  return query select c.ok, c.events, c.first_bad_seq, c.bad_idea from private.ledger_chain_check() c;
end;
$$;

-- 9. Row level security: the admin reads; there is no write policy because there is no write grant.
alter table public.ideas       enable row level security;
alter table public.idea_events enable row level security;

create policy ideas_admin_read on public.ideas for select to authenticated
  using ((select private.is_admin()));
create policy ideas_admin_link on public.ideas for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy idea_events_admin_read on public.idea_events for select to authenticated
  using ((select private.is_admin()));

-- 10. Grants. Start from nothing (the default privileges already close new objects), then grant by name.
revoke all on public.ideas, public.idea_events from public, anon, authenticated, service_role;
grant select on public.ideas, public.idea_events to authenticated;
grant update (item_id) on public.ideas to authenticated;

revoke execute on function private.words_ok(text)                   from public, anon, authenticated, service_role;
revoke execute on function private.idea_void_deadline(timestamptz)  from public, anon, authenticated, service_role;
revoke execute on function private.seal_idea_event()                from public, anon, authenticated, service_role;
revoke execute on function private.guard_idea_update()              from public, anon, authenticated, service_role;
revoke execute on function private.ledger_fail(text)                from public, anon, authenticated, service_role;
revoke execute on function private.validate_idea_stance(text, jsonb) from public, anon, authenticated, service_role;
revoke execute on function private.ledger_chain_check()             from public, anon, authenticated, service_role;
revoke execute on function public.open_idea(uuid, text, integer, boolean, text, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.add_idea_event(uuid, text, text, jsonb)             from public, anon, authenticated, service_role;
revoke execute on function public.check_ledger_chain()              from public, anon, authenticated, service_role;
revoke execute on function public.verify_ledger_chain()             from public, anon, authenticated, service_role;
grant execute on function public.open_idea(uuid, text, integer, boolean, text, uuid) to authenticated;
grant execute on function public.add_idea_event(uuid, text, text, jsonb)             to authenticated;
grant execute on function public.check_ledger_chain()  to authenticated;
grant execute on function public.verify_ledger_chain() to service_role;
