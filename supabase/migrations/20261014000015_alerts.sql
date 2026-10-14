-- =============================================================================
-- 20261014000015_alerts.sql - 2.9 alert email: one open incident at a time, one "open" and one "closed" email per incident.
-- Spec: docs/specs/2026-10-14-alert-email-design.md s2, s4. ADR-001 row "Owner alerting".
-- Never edit this file after it reaches the hosted project; add a later migration instead.
--
-- The job (src/modules/ops/alert-email.ts) reads the private health report and passes the red keys to alert_step(); every
-- decision (open, add keys, hold, close, which email is due) is made here under one advisory lock, so two overlapping cron
-- runs cannot open two incidents or pick two different emails. alert_sent() records that the provider accepted a message.
--
-- Nothing here is public: the table is private with RLS on and no policy, and only service_role may run the two functions
-- (anon's executable set in public stays exactly queue_age, heartbeat_ages, capture_days, public_fact_checks).
-- =============================================================================

-- 1. The table. keys are the health checks that were red (job names, plus 'queue'), capped by alert_step().
create table private.alert_incidents (
  id             bigint generated always as identity primary key,
  keys           text[] not null check (cardinality(keys) > 0),
  opened_at      timestamptz not null default now(),
  last_red_at    timestamptz not null default now(),
  closed_at      timestamptz,                                  -- null = open
  open_sent_at   timestamptz,                                  -- the provider accepted the "open" email
  closed_sent_at timestamptz,                                  -- the provider accepted the "closed" email
  constraint alert_incidents_order check (closed_at is null or closed_at >= opened_at)
);
-- At most one open incident, whatever the code does.
create unique index alert_incidents_one_open on private.alert_incidents ((true)) where closed_at is null;
alter table private.alert_incidents enable row level security;
revoke all on private.alert_incidents from public, anon, authenticated, service_role;

-- 2. alert_step: apply the rules for this run's red set with now(), then name the one email that is due.
--   red set non-empty, no open incident -> open one
--   red set non-empty, open incident    -> add the keys, last_red_at = now(); no new email
--   red set empty, open incident, clear for 30 minutes -> close it (the hold stops a flapping check from sending pairs)
-- Returns at most one row, the oldest incident with an email due:
--   'open'   an open incident whose "open" email is not recorded as sent (so a failed send is offered again)
--   'closed' a closed incident whose "open" email WAS sent and whose "closed" email is not (never a close without an open)
--   'still_open' when no email is due but an incident is open, so the job can say so; it is not an email.
create function public.alert_step(p_red text[])
returns table (incident_id bigint, kind text, keys text[], opened_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_now  timestamptz := now();
  v_red  text[];
  v_open private.alert_incidents%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('public.alert_step', 0));

  -- The caller's keys: trimmed to 80 characters, no empties, no repeats, sorted, at most 50.
  select coalesce(array_agg(s.k order by s.k), '{}'::text[]) into v_red
    from (select distinct left(u.k, 80) as k from unnest(coalesce(p_red, '{}'::text[])) as u(k)
           where u.k is not null and u.k <> '' order by 1 limit 50) s;

  select * into v_open from private.alert_incidents i where i.closed_at is null for update;
  if found then
    if cardinality(v_red) > 0 then
      update private.alert_incidents i
         set keys = (select coalesce(array_agg(s.k order by s.k), '{}'::text[])
                       from (select distinct u.k from unnest(i.keys || v_red) as u(k) order by 1 limit 50) s),
             last_red_at = v_now
       where i.id = v_open.id;
    elsif v_now - v_open.last_red_at >= interval '30 minutes' then
      update private.alert_incidents i set closed_at = v_now where i.id = v_open.id;
    end if;
  elsif cardinality(v_red) > 0 then
    insert into private.alert_incidents (keys, opened_at, last_red_at) values (v_red, v_now, v_now);
  end if;

  return query
    with due as (
      select i.id, case when i.closed_at is null then 'open' else 'closed' end as kind, i.keys, i.opened_at
        from private.alert_incidents i
       where (i.closed_at is null and i.open_sent_at is null)
          or (i.closed_at is not null and i.open_sent_at is not null and i.closed_sent_at is null)
       order by i.id
       limit 1)
    select d.id, d.kind, d.keys, d.opened_at from due d
    union all
    select i.id, 'still_open', i.keys, i.opened_at from private.alert_incidents i
     where i.closed_at is null and not exists (select 1 from due);
end;
$$;

-- 3. alert_sent: the provider accepted the message. Stamps once; a stamp that does not apply is a no-op.
create function public.alert_sent(p_id bigint, p_kind text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_kind = 'open' then
    update private.alert_incidents i set open_sent_at = now() where i.id = p_id and i.open_sent_at is null;
  elsif p_kind = 'closed' then
    update private.alert_incidents i set closed_sent_at = now()
     where i.id = p_id and i.closed_at is not null and i.open_sent_at is not null and i.closed_sent_at is null;
  else
    raise exception 'alert_sent: kind must be open or closed' using errcode = '22023';
  end if;
end;
$$;

-- 4. Grants: service_role only.
revoke execute on function public.alert_step(text[])        from public, anon, authenticated, service_role;
revoke execute on function public.alert_sent(bigint, text)  from public, anon, authenticated, service_role;
grant execute on function public.alert_step(text[])         to service_role;
grant execute on function public.alert_sent(bigint, text)   to service_role;
