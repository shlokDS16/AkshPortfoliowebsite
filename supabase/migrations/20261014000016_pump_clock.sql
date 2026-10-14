-- =============================================================================
-- 20261014000016_pump_clock.sql - the 15-minute pump clock lives in the database (pg_cron + pg_net).
-- Spec: docs/specs/2026-10-14-db-pump-clock.md. Never edit this file after it reaches the hosted project; add a later migration.
--
-- Every 15 minutes pg_cron runs private.pump_tick(), which mints a one-use ticket and POSTs it to <site>/api/jobs/tick
-- (pg_net sends after commit). The route redeems the ticket through the secret-key client (public.redeem_pump_ticket) and
-- then runs the pump steps. There is no shared secret in SQL: a ticket is a random uuid that is valid for 2 minutes, once.
-- The site address is not in this file; the first production pump run registers it (public.register_clock_target).
--
-- Nothing here is public: the tables are private with RLS on and no policy, and only service_role may run the two public
-- functions (anon's executable set in public stays exactly queue_age, heartbeat_ages, capture_days, public_fact_checks).
-- =============================================================================

-- 1. Extensions, the Supabase way (https://supabase.com/docs/guides/cron/install, https://supabase.com/docs/guides/database/extensions/pg_net).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 2. The target: one row, the site's own origin.
create table private.clock_target (
  id         boolean primary key default true check (id),      -- a single-row table
  url        text not null,
  updated_at timestamptz not null default now()
);
alter table private.clock_target enable row level security;
revoke all on private.clock_target from public, anon, authenticated, service_role;

-- 3. The tickets: one per tick, redeemable once within two minutes.
create table private.pump_tickets (
  token      uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  used_at    timestamptz
);
create index pump_tickets_created_at_idx on private.pump_tickets (created_at);
alter table private.pump_tickets enable row level security;
revoke all on private.pump_tickets from public, anon, authenticated, service_role;

-- 4. register_clock_target: only an https origin (a public host name, no path, query or credentials), or for local
-- development and CI http://localhost:<port> / http://127.0.0.1:<port>. Writes only when the address changed.
-- Returns true when it wrote.
create function public.register_clock_target(p_url text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_url is null
     or not (
       -- https://<dns name with at least one dot>: lower-case labels, optional port, no path, query or userinfo
       (p_url ~ '^https://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+(:[0-9]{1,5})?$'
        and split_part(split_part(p_url, '://', 2), ':', 1) !~ '^[0-9.]+$')   -- not an IP address
       or p_url ~ '^http://(localhost|127\.0\.0\.1):[0-9]{1,5}$'
     )
     or char_length(p_url) > 255 then
    raise exception 'register_clock_target: the address must be an https origin' using errcode = '22023';
  end if;

  insert into private.clock_target as t (id, url) values (true, p_url)
  on conflict (id) do update set url = excluded.url, updated_at = now()
    where t.url is distinct from excluded.url;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- 5. pump_tick: what pg_cron runs. No target registered yet: nothing happens.
create function private.pump_tick()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url   text;
  v_token uuid;
begin
  select t.url into v_url from private.clock_target t limit 1;
  if v_url is null then
    return;
  end if;

  delete from private.pump_tickets p where p.created_at < now() - interval '1 day';
  insert into private.pump_tickets default values returning token into v_token;

  perform net.http_post(
    url := v_url || '/api/jobs/tick',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-pump-ticket', v_token::text),
    timeout_milliseconds := 10000
  );
end;
$$;

-- 6. redeem_pump_ticket: true only for an unused ticket made in the last two minutes; it is then used up.
create function public.redeem_pump_ticket(p_token uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_rows integer;
begin
  update private.pump_tickets p set used_at = now()
   where p.token = p_token and p.used_at is null and p.created_at > now() - interval '2 minutes';
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- 7. Grants: service_role only for the two public functions; nobody for pump_tick (pg_cron runs it as its owner).
revoke execute on function public.register_clock_target(text) from public, anon, authenticated, service_role;
revoke execute on function public.redeem_pump_ticket(uuid)    from public, anon, authenticated, service_role;
revoke execute on function private.pump_tick()                from public, anon, authenticated, service_role;
grant execute on function public.register_clock_target(text) to service_role;
grant execute on function public.redeem_pump_ticket(uuid)    to service_role;

-- 8. The schedule: every 15 minutes at off-peak minutes. Idempotent: an existing job of the name is removed first.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'desk-pump') then
    perform cron.unschedule('desk-pump');
  end if;
end;
$$;
select cron.schedule('desk-pump', '4,19,34,49 * * * *', 'select private.pump_tick()');
