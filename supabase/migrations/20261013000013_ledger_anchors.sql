-- =============================================================================
-- 20261013000013_ledger_anchors.sql - Plan 3a Task 3: one sealed fingerprint line per IST day, and the comparison of
-- every sealed day with the events as they stand now.
-- Spec: docs/specs/2026-10-13-phase-3-track-record-design.md s5.5, s9, s17 (the s12 correction). ADR-005 s3.3.
-- Never edit this file after it reaches the hosted project; add a later migration instead.
--
-- WHY THE COMPARISON. The chain check (0010) proves the events are consistent with themselves. An owner who rewrites
-- an old event and re-hashes every event after it, or who drops the last events of a day, still passes it. The anchor
-- rows are the memory of what each closed day looked like when it was sealed: private.ledger_anchor_check() rebuilds
-- every sealed day from the events now and reports the FIRST day that differs. seal_ledger_days() runs it before it
-- seals anything and refuses to go on over a mismatch. The anchors themselves are only as good as the place that holds
-- a second copy: the public gist (Task 8/9) is what makes a rewritten anchor row detectable too.
--
-- WHAT A LINE HOLDS (it is what leaves the database, once the owner switches the gist on): v, date, count, first_seq,
-- last_seq, hashes (the day's event hashes in seq order) and head. A hash commits to the sealed text and to everything
-- before it, but reveals none of it. No idea text, no company, no symbol, no price, no direction.
--
-- Nothing here is public: anon gets no grant, policy, view or function.
-- =============================================================================

-- 1. The table. Written only by private.seal_ledger_days_to(); never changes except that publication is recorded once.
create table public.ledger_anchors (
  anchor_date   date primary key,                                   -- the IST calendar day
  event_count   integer not null check (event_count >= 0),
  first_seq     bigint,
  last_seq      bigint,
  head_hash     text not null check (head_hash ~ '^[0-9a-f]{64}$'), -- the day's last event hash; an empty day repeats the previous head
  line          text not null,                                      -- the exact JSON line that is published
  published_at  timestamptz,
  anchor_version text check (char_length(anchor_version) <= 200),
  created_at    timestamptz not null default now(),
  constraint ledger_anchors_range check ((event_count = 0) = (first_seq is null) and (event_count = 0) = (last_seq is null)
                                         and (last_seq is null or last_seq >= first_seq)),
  constraint ledger_anchors_line_agrees check (
    (line::jsonb ->> 'date') = to_char(anchor_date, 'YYYY-MM-DD')
    and (line::jsonb ->> 'count')::integer = event_count
    and (line::jsonb ->> 'head') = head_hash)
);

-- 2. Append-only: delete and truncate are refused for every role; an update may only record publication, once.
create function private.guard_ledger_anchor()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.published_at is not null then
      raise exception 'ledger_anchors: a published day cannot change' using errcode = 'P0001';
    end if;
    if new.published_at is null then
      raise exception 'ledger_anchors: only the publication of a day can be recorded' using errcode = 'P0001';
    end if;
    if new.anchor_date is distinct from old.anchor_date or new.event_count is distinct from old.event_count
       or new.first_seq is distinct from old.first_seq or new.last_seq is distinct from old.last_seq
       or new.head_hash is distinct from old.head_hash or new.line is distinct from old.line
       or new.created_at is distinct from old.created_at then
      raise exception 'ledger_anchors: a sealed day cannot change' using errcode = 'P0001';
    end if;
    if new.published_at < old.created_at or new.published_at > clock_timestamp() + interval '5 minutes' then
      raise exception 'ledger_anchors: the publication time is not plausible' using errcode = 'P0001';
    end if;
    return new;
  end if;
  raise exception 'ledger_anchors is append-only: % is not allowed', tg_op using errcode = 'P0001';
end;
$$;
create trigger ledger_anchors_guard
  before update or delete on public.ledger_anchors
  for each row execute function private.guard_ledger_anchor();
create trigger ledger_anchors_no_truncate
  before truncate on public.ledger_anchors
  for each statement execute function private.guard_ledger_anchor();

-- 3. The line, built by hand so the text is compact and the same on every server (json_build_object spaces its output).
-- Hashes are hex, so quoting them directly is safe.
create function private.anchor_line(p_date date, p_count integer, p_first bigint, p_last bigint, p_hashes text[], p_head text)
returns text language sql immutable set search_path = ''
as $$
  select format('{"v":1,"date":"%s","count":%s,"first_seq":%s,"last_seq":%s,"hashes":[%s],"head":"%s"}',
    to_char(p_date, 'YYYY-MM-DD'), p_count, coalesce(p_first::text, 'null'), coalesce(p_last::text, 'null'),
    case when coalesce(cardinality(p_hashes), 0) = 0 then '' else '"' || array_to_string(p_hashes, '","') || '"' end,
    p_head);
$$;

-- 4. The comparison. Rebuilds every sealed day from the events and returns the first day that differs, with the reason:
-- early_event (an event dated before the first sealed day), gap (a day missing between sealed days), count, seq, head,
-- line (the stored text is not what the events give). One pass over the events, grouped by IST day.
create function private.ledger_anchor_check()
returns table (ok boolean, days bigint, first_bad_date date, reason text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  r           record;
  v_first     date;
  v_early     date;
  v_total     bigint;
  v_prev_date date;
  v_prev_head text := repeat('0', 64);
  v_n         bigint := 0;
  v_count     integer;
  v_head      text;
  v_reason    text;
begin
  select min(a.anchor_date), count(*) into v_first, v_total from public.ledger_anchors a;
  if v_first is null then
    return query select true, 0::bigint, null::date, null::text;
    return;
  end if;
  select min((e.recorded_at at time zone 'Asia/Kolkata')::date) into v_early
    from public.idea_events e where (e.recorded_at at time zone 'Asia/Kolkata')::date < v_first;
  if v_early is not null then
    return query select false, v_total, v_early, 'early_event'::text;
    return;
  end if;
  for r in
    select a.*, g.n, g.f, g.l, g.hashes
      from public.ledger_anchors a
      left join (select (e.recorded_at at time zone 'Asia/Kolkata')::date as d, count(*)::integer as n,
                        min(e.seq) as f, max(e.seq) as l, array_agg(e.hash order by e.seq) as hashes
                   from public.idea_events e group by 1) g on g.d = a.anchor_date
     order by a.anchor_date
  loop
    if v_prev_date is not null and r.anchor_date <> v_prev_date + 1 then
      return query select false, v_total, v_prev_date + 1, 'gap'::text;
      return;
    end if;
    v_n := v_n + 1;
    v_count := coalesce(r.n, 0);
    v_head := coalesce(r.hashes[cardinality(r.hashes)], v_prev_head);
    v_reason := case
      when r.event_count is distinct from v_count then 'count'
      when r.first_seq is distinct from r.f or r.last_seq is distinct from r.l then 'seq'
      when r.head_hash is distinct from v_head then 'head'
      when r.line is distinct from private.anchor_line(r.anchor_date, v_count, r.f, r.l, r.hashes, v_head) then 'line'
    end;
    if v_reason is not null then
      return query select false, v_total, r.anchor_date, v_reason;
      return;
    end if;
    v_prev_date := r.anchor_date;
    v_prev_head := v_head;
  end loop;
  return query select true, v_n, null::date, null::text;
end;
$$;

-- Two thin wrappers, one per role (spec s5.3): the job's has no caller check and is service_role only; the admin's checks
-- private.is_admin() and is authenticated only. Neither reads the role out of the request.
create function public.verify_ledger_anchors()
returns table (ok boolean, days bigint, first_bad_date date, reason text)
language sql stable security definer set search_path = ''
as $$
  select c.ok, c.days, c.first_bad_date, c.reason from private.ledger_anchor_check() c;
$$;

create function public.check_ledger_anchors()
returns table (ok boolean, days bigint, first_bad_date date, reason text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'ledger: not allowed' using errcode = '42501';
  end if;
  return query select c.ok, c.days, c.first_bad_date, c.reason from private.ledger_anchor_check() c;
end;
$$;

-- 5. Sealing. p_today is the IST date that counts as "today": days before it are closed, it and later are not. The
-- public door passes the real one; the tests pass a fixed one. The advisory lock is the seal trigger's own, so an event
-- being written at midnight is either committed before the seal reads or dated after the day it seals; the IST date is
-- taken after the lock for the same reason.
create function private.seal_ledger_days_to(p_today date)
returns integer language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_chain  record;
  v_bad    record;
  v_last   record;
  v_start  date;
  v_head   text;
  v_n      integer := 0;
  r        record;
begin
  perform pg_advisory_xact_lock(hashtext('idea_events:chain'));

  select c.ok, c.first_bad_seq, c.bad_idea into v_chain from private.ledger_chain_check() c;
  if v_chain.ok is not true then
    raise exception 'ledger:chain_broken' using errcode = 'P0001',
      detail = format('first_bad_seq=%s bad_idea=%s', v_chain.first_bad_seq, v_chain.bad_idea);
  end if;
  select c.first_bad_date, c.reason into v_bad from private.ledger_anchor_check() c where c.ok is not true;
  if found then
    raise exception 'ledger:anchor_mismatch' using errcode = 'P0001',
      detail = format('first_bad_date=%s reason=%s', v_bad.first_bad_date, v_bad.reason);
  end if;

  select a.anchor_date, a.head_hash into v_last from public.ledger_anchors a order by a.anchor_date desc limit 1;
  if found then
    v_start := v_last.anchor_date + 1;
    v_head := v_last.head_hash;
  else
    select (min(e.recorded_at) at time zone 'Asia/Kolkata')::date into v_start from public.idea_events e;
    if v_start is null then
      return 0;
    end if;
    v_head := repeat('0', 64);
  end if;
  if v_start >= p_today then
    return 0;
  end if;

  for r in
    select v_start + s.i as d, coalesce(g.n, 0) as n, g.f, g.l, g.hashes
      from generate_series(0, p_today - 1 - v_start) s(i)
      left join (select (e.recorded_at at time zone 'Asia/Kolkata')::date as d, count(*)::integer as n,
                        min(e.seq) as f, max(e.seq) as l, array_agg(e.hash order by e.seq) as hashes
                   from public.idea_events e
                  where e.recorded_at >= (v_start::timestamp at time zone 'Asia/Kolkata')
                  group by 1) g on g.d = v_start + s.i
     order by 1
  loop
    v_head := coalesce(r.hashes[cardinality(r.hashes)], v_head);
    insert into public.ledger_anchors (anchor_date, event_count, first_seq, last_seq, head_hash, line)
    values (r.d, r.n, r.f, r.l, v_head, private.anchor_line(r.d, r.n, r.f, r.l, r.hashes, v_head));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create function public.seal_ledger_days()
returns integer language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('idea_events:chain'));
  return private.seal_ledger_days_to((clock_timestamp() at time zone 'Asia/Kolkata')::date);
end;
$$;

-- 6. Row level security: the admin reads; there is no write policy because there is no write grant.
alter table public.ledger_anchors enable row level security;
create policy ledger_anchors_admin_read on public.ledger_anchors for select to authenticated
  using ((select private.is_admin()));

-- 7. Grants. Start from nothing, then grant by name. service_role (the job) reads and records publication; nobody
-- inserts except the sealing function.
revoke all on public.ledger_anchors from public, anon, authenticated, service_role;
grant select on public.ledger_anchors to authenticated, service_role;
grant update (published_at, anchor_version) on public.ledger_anchors to service_role;

revoke execute on function private.guard_ledger_anchor()                                          from public, anon, authenticated, service_role;
revoke execute on function private.anchor_line(date, integer, bigint, bigint, text[], text)       from public, anon, authenticated, service_role;
revoke execute on function private.ledger_anchor_check()                                          from public, anon, authenticated, service_role;
revoke execute on function private.seal_ledger_days_to(date)                                      from public, anon, authenticated, service_role;
revoke execute on function public.verify_ledger_anchors()                                         from public, anon, authenticated, service_role;
revoke execute on function public.check_ledger_anchors()                                          from public, anon, authenticated, service_role;
revoke execute on function public.seal_ledger_days()                                              from public, anon, authenticated, service_role;
grant execute on function public.verify_ledger_anchors() to service_role;
grant execute on function public.check_ledger_anchors()  to authenticated;
grant execute on function public.seal_ledger_days()      to service_role;
