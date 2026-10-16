-- =============================================================================
-- 20261018000024_letters.sql - Phase 5c Task 10: letters as items, readers with double opt-in, a consent log, approved sends
-- (spec s8.2, s8.5; plan Part 5c; v1.2 addendum rule 13). Nothing here sends anything and nothing here makes anything public:
-- a letter reaches the archive only through publish_revision() (rule 13 in 0025), and an email leaves only after a
-- letter_sends row approved by the admin (approve_letter_send, 0025). Sign-up is OFF after this migration (key absent).
--   1. items.kind gains 'letter'; a letter names no company, concept or figures-to date, and stays a letter.
--   2. subscribers (the address and its consent state; no IP, name or user agent), subscriber_events (append-only, keyed by an
--      HMAC of the address with a random pepper, so withdrawal deletes the address and keeps only the proof of consent),
--      letter_sends (the audit row of every approved send, forward-only status), letters_signup_events (who opened or closed
--      sign-ups, when).
--   3. A letter with a send to subscribers that is sending or sent takes no new revision (D87).
--   4. anon and authenticated: letters_open, letters_request, letters_confirm, letters_leave (never raise for a refused input,
--      same answer whether an address exists or not; 22023 only for an over-long argument). service_role only (called after
--      requireAdmin or from the ops steps): the reader functions below. No API role reads or writes the tables directly,
--      except the admin session's SELECT through RLS.
-- Never edit this file after it reaches the hosted project; add a later migration instead.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1. The letter kind.
alter table public.items drop constraint items_kind_check,
  add constraint items_kind_check
  check (kind in ('note', 'thesis', 'learning', 'case_study', 'process', 'reading_note', 'video', 'letter'));

create function private.guard_letter_item()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (old.kind = 'letter') is distinct from (new.kind = 'letter') then
    raise exception 'items: a letter stays a letter, and no other item becomes one' using errcode = '23514';
  end if;
  if new.kind = 'letter' and num_nonnulls(new.company_id, new.theme_id, new.data_as_of) > 0 then
    raise exception 'items: a letter names no company, concept or figures-to date' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger items_guard_letter before insert or update on public.items
  for each row execute function private.guard_letter_item();

-- 2. The pepper for the consent log (absent only before this line runs; never replaced). The switch is NOT inserted.
insert into private.settings (key, value) values ('letters_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (key) do nothing;

create table public.subscribers (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique check (email = lower(email) and length(email) between 6 and 254
                                                 and email ~ '^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$'),
  status             text not null default 'waiting' check (status in ('waiting', 'sent', 'confirmed')),
  requested_at       timestamptz not null default now(),
  notice_version     text not null,
  adult              boolean not null check (adult),
  confirm_token_hash bytea,
  confirm_sent_at    timestamptz,
  confirm_expires_at timestamptz,
  confirmed_at       timestamptz,
  sends_used         integer not null default 0 check (sends_used >= 0)
);
create unique index subscribers_token_idx on public.subscribers (confirm_token_hash) where confirm_token_hash is not null;
create index subscribers_status_idx on public.subscribers (status, requested_at);

create table public.subscriber_events (
  id             uuid primary key default gen_random_uuid(),
  event          text not null check (event in ('requested', 'sent', 'confirmed', 'left', 'left_form', 'erased', 'expired', 'binned')),
  email_hmac     bytea not null check (length(email_hmac) = 32),
  notice_version text not null,
  at             timestamptz not null default now()
);
create index subscriber_events_event_at_idx on public.subscriber_events (event, at);
create trigger subscriber_events_append_only before update or delete on public.subscriber_events
  for each row execute function private.reject_mutation();
create trigger subscriber_events_no_truncate before truncate on public.subscriber_events
  for each statement execute function private.reject_mutation();

create table public.letters_signup_events (
  id        uuid primary key default gen_random_uuid(),
  signup_on boolean not null,
  actor     uuid not null,
  at        timestamptz not null default now()
);
create trigger letters_signup_events_append_only before update or delete on public.letters_signup_events
  for each row execute function private.reject_mutation();
create trigger letters_signup_events_no_truncate before truncate on public.letters_signup_events
  for each statement execute function private.reject_mutation();

create table public.letter_sends (
  id                     uuid primary key default gen_random_uuid(),
  item_id                uuid not null references public.items (id) on delete restrict,
  revision_id            uuid not null references public.item_revisions (id) on delete restrict,
  -- No foreign key: gate_decisions is append-only (never deleted), and a key would make its TRUNCATE guard answer with a key
  -- error instead of its own. Written only by approve_letter_send, from the decision it read; the insert trigger below
  -- (private.check_letter_send_decision) refuses an id that is not a pass of this letter's revision.
  gate_decision_id       uuid not null,
  kind                   text not null check (kind in ('self_test', 'subscribers')),
  approved_by            uuid not null,
  approved_at            timestamptz not null default now(),
  recipients_at_approval integer not null check (recipients_at_approval >= 0),
  status                 text not null default 'approved'
                           check (status in ('approved', 'sending', 'sent', 'failed', 'expired', 'cancelled')),
  broadcast_id           text check (length(broadcast_id) <= 100),
  claimed_at             timestamptz,
  sent_at                timestamptz,
  recipients_sent        integer check (recipients_sent >= 0),
  problem                text check (length(problem) <= 160)
);
-- One live send to subscribers per letter, and at most one in flight across all letters.
create unique index letter_sends_one_live_idx on public.letter_sends (item_id)
  where kind = 'subscribers' and status not in ('failed', 'expired', 'cancelled');
create unique index letter_sends_one_in_flight_idx on public.letter_sends ((true))
  where kind = 'subscribers' and status in ('approved', 'sending');
create index letter_sends_status_idx on public.letter_sends (status, approved_at);

-- Forward-only status (approved -> sending | expired | cancelled; sending -> sent | failed); what was approved never changes.
create function private.guard_letter_send()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'letter_sends is an audit trail: delete is not allowed' using errcode = 'P0001';
  end if;
  if (new.id, new.item_id, new.revision_id, new.gate_decision_id, new.kind, new.approved_by, new.approved_at,
      new.recipients_at_approval)
     is distinct from (old.id, old.item_id, old.revision_id, old.gate_decision_id, old.kind, old.approved_by, old.approved_at,
                       old.recipients_at_approval) then
    raise exception 'letter_sends: what was approved cannot change' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'approved' and new.status in ('sending', 'expired', 'cancelled'))
    or (old.status = 'sending' and new.status in ('sent', 'failed'))) then
    raise exception 'letter_sends: status cannot go from % to %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger letter_sends_guard before update or delete on public.letter_sends
  for each row execute function private.guard_letter_send();
create trigger letter_sends_no_truncate before truncate on public.letter_sends
  for each statement execute function private.reject_mutation();

-- The audit row is the evidence of rule 13.1 (who approved what), so its decision must exist, belong to this letter's revision and be
-- a pass. A trigger rather than a foreign key (see the column). Definer: it reads gate_decisions on behalf of any writer.
create function private.check_letter_send_decision()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.gate_decisions g
                  where g.id = new.gate_decision_id and g.item_id = new.item_id and g.revision_id = new.revision_id and g.verdict = 'pass') then
    raise exception 'letter_sends: the decision must be a pass of this letter''s revision' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger letter_sends_check_decision before insert on public.letter_sends
  for each row execute function private.check_letter_send_decision();

-- 3. A letter sent (or being sent) to subscribers is frozen: no new revision (D87). Definer: it must see every send. A send that
-- failed with a broadcast id recorded may still have gone out (an email cannot be called back), so it freezes the letter too.
create function private.freeze_sent_letter()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.letter_sends s
              where s.item_id = new.item_id and s.kind = 'subscribers'
                 and (s.status in ('sending', 'sent') or (s.status = 'failed' and s.broadcast_id is not null))) then
    raise exception 'letters: a letter sent to subscribers cannot get a new revision' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger item_revisions_freeze_sent_letter before insert on public.item_revisions
  for each row execute function private.freeze_sent_letter();

-- 4. Helpers (no API role). The notice version must equal LETTERS_NOTICE_VERSION in the app (spec s8.5).
create function private.letters_notice_version()
returns text language sql immutable set search_path = ''
as $$ select 'letters-2026-10-v1' $$;

create function private.letters_hmac(p_email text)
returns bytea language sql stable security definer set search_path = ''
as $$
  select extensions.hmac(convert_to(p_email, 'UTF8'),
                         decode((select s.value from private.settings s where s.key = 'letters_pepper'), 'hex'), 'sha256')
$$;

-- The start of today on the India calendar, as an instant (for the day counters).
create function private.ist_day_start()
returns timestamptz language sql stable set search_path = ''
as $$ select ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata' $$;

create function private.letters_log(p_event text, p_email text, p_notice text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.subscriber_events (event, email_hmac, notice_version) values (p_event, private.letters_hmac(p_email), p_notice)
$$;

-- 5. anon and authenticated.
create function public.letters_open()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.settings s where s.key = 'letters_signup' and s.value = 'on')
     and (select count(*) from public.subscribers b where b.status = 'confirmed') < 950
$$;

create function public.letters_request(p_email text, p_notice_version text, p_adult boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_row   public.subscribers;
begin
  if length(p_email) > 320 or length(p_notice_version) > 64 then
    raise exception 'letters_request: argument too long' using errcode = '22023';
  end if;
  if v_email is null or p_adult is not true or p_notice_version is distinct from private.letters_notice_version()
     or length(v_email) not between 6 and 254 or v_email !~ '^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$' then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('letters:request'));
  if not public.letters_open()
     or (select count(*) from public.subscriber_events e where e.event = 'requested' and e.at >= private.ist_day_start()) >= 100
     or (select count(*) from public.subscribers b where b.status = 'waiting') >= 300 then
    return;
  end if;
  select * into v_row from public.subscribers b where b.email = v_email for update;
  if v_row.id is null then
    insert into public.subscribers (email, notice_version, adult) values (v_email, p_notice_version, true);
  elsif v_row.status = 'sent' and v_row.confirm_expires_at <= now() then
    -- An expired link: back to waiting, so Aksh can send a new one.
    update public.subscribers
       set status = 'waiting', requested_at = now(), notice_version = p_notice_version, confirm_token_hash = null,
           confirm_sent_at = null, confirm_expires_at = null
     where id = v_row.id;
  else
    return;
  end if;
  perform private.letters_log('requested', v_email, p_notice_version);
end;
$$;

create function public.letters_confirm(p_token text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.subscribers;
begin
  if length(p_token) > 128 then
    raise exception 'letters_confirm: argument too long' using errcode = '22023';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return false;
  end if;
  update public.subscribers b
     set status = 'confirmed', confirmed_at = now(), confirm_token_hash = null
   where b.confirm_token_hash = sha256(convert_to(p_token, 'UTF8')) and b.status = 'sent' and b.confirm_expires_at > now()
  returning * into v_row;
  if v_row.id is null then
    return false;
  end if;
  perform private.letters_log('confirmed', v_row.email, v_row.notice_version);
  return true;
end;
$$;

create function public.letters_leave(p_email text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.subscribers;
begin
  if length(p_email) > 320 then
    raise exception 'letters_leave: argument too long' using errcode = '22023';
  end if;
  delete from public.subscribers b where b.email = lower(btrim(p_email)) returning * into v_row;
  if v_row.id is not null then
    -- 'left_form', not 'left': the desk counts the typed form apart from what Resend reports (review finding 2).
    perform private.letters_log('left_form', v_row.email, v_row.notice_version);
  end if;
end;
$$;

-- 6. service_role only. The actor is checked against profiles (never user_metadata).
create function public.letters_issue_confirmations(p_actor uuid, p_ids uuid[])
returns table (id uuid, email text, token text, sent_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_left integer;
  v_row  public.subscribers;
  v_tok  text;
begin
  if not private.is_admin_user(p_actor) then
    raise exception 'letters_issue_confirmations: admin only' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('letters:confirmations'));
  v_left := 50 - (select count(*) from public.subscriber_events e where e.event = 'sent' and e.at >= private.ist_day_start());
  for v_row in
    select b.* from public.subscribers b
     where b.id = any (coalesce(p_ids, '{}')) and b.status = 'waiting'
     order by b.requested_at, b.id
     limit greatest(v_left, 0)
     for update
  loop
    v_tok := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
    update public.subscribers b
       set status = 'sent', confirm_token_hash = sha256(convert_to(v_tok, 'UTF8')), confirm_sent_at = now(),
           confirm_expires_at = now() + interval '7 days', sends_used = b.sends_used + 1
     where b.id = v_row.id;
    perform private.letters_log('sent', v_row.email, v_row.notice_version);
    id := v_row.id; email := v_row.email; token := v_tok; sent_at := now();
    return next;
  end loop;
end;
$$;

create function public.letters_confirmation_failed(p_id uuid)
returns void language sql security definer set search_path = ''
as $$
  update public.subscribers
     set status = 'waiting', confirm_token_hash = null, confirm_sent_at = null, confirm_expires_at = null
   where id = p_id and status = 'sent'
$$;

-- Deletes the rows with these ids and logs p_event (by HMAC) for each; the shared body of bin, erase, purge and mark_left.
create function private.letters_delete(p_ids uuid[], p_event text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  with gone as (delete from public.subscribers b where b.id = any (coalesce(p_ids, '{}')) returning b.email, b.notice_version)
  insert into public.subscriber_events (event, email_hmac, notice_version)
  select p_event, private.letters_hmac(g.email), g.notice_version from gone g;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create function public.letters_bin(p_actor uuid, p_ids uuid[])
returns integer language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin_user(p_actor) then
    raise exception 'letters_bin: admin only' using errcode = '42501';
  end if;
  return private.letters_delete(array(select b.id from public.subscribers b
                                       where b.id = any (coalesce(p_ids, '{}')) and b.status = 'waiting'), 'binned');
end;
$$;

create function public.letters_erase(p_actor uuid, p_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin_user(p_actor) then
    raise exception 'letters_erase: admin only' using errcode = '42501';
  end if;
  return private.letters_delete(array[p_id], 'erased');
end;
$$;

create function public.letters_purge()
returns integer language sql security definer set search_path = ''
as $$
  select private.letters_delete(array(select b.id from public.subscribers b
                                       where (b.status = 'waiting' and b.requested_at < now() - interval '14 days')
                                          or (b.status = 'sent' and b.confirm_expires_at < now())), 'expired')
$$;

create function public.letters_mark_left(p_emails text[])
returns integer language sql security definer set search_path = ''
as $$
  select private.letters_delete(array(select b.id from public.subscribers b
                                       where b.email in (select lower(btrim(e)) from unnest(coalesce(p_emails, '{}')) e)), 'left')
$$;

create function public.confirmed_subscribers()
returns table (email text) language sql stable security definer set search_path = ''
as $$ select b.email from public.subscribers b where b.status = 'confirmed' order by b.confirmed_at, b.id $$;

create function public.set_letters_signup(p_actor uuid, p_on boolean)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin_user(p_actor) then
    raise exception 'set_letters_signup: admin only' using errcode = '42501';
  end if;
  if p_on is null then
    raise exception 'set_letters_signup: on must be true or false' using errcode = '22023';
  end if;
  if p_on then
    insert into private.settings (key, value) values ('letters_signup', 'on') on conflict (key) do update set value = 'on';
  else
    delete from private.settings where key = 'letters_signup';
  end if;
  insert into public.letters_signup_events (signup_on, actor) values (p_on, p_actor);
  return p_on;
end;
$$;

-- 7. RLS and grants. The admin session reads the four tables; no API role writes them; anon gets nothing on them.
alter table public.subscribers enable row level security;
alter table public.subscriber_events enable row level security;
alter table public.letter_sends enable row level security;
alter table public.letters_signup_events enable row level security;
create policy subscribers_admin_select on public.subscribers for select to authenticated using ((select private.is_admin()));
create policy subscriber_events_admin_select on public.subscriber_events for select to authenticated
  using ((select private.is_admin()));
create policy letter_sends_admin_select on public.letter_sends for select to authenticated using ((select private.is_admin()));
create policy letters_signup_events_admin_select on public.letters_signup_events for select to authenticated
  using ((select private.is_admin()));
revoke all on public.subscribers, public.subscriber_events, public.letter_sends, public.letters_signup_events
  from public, anon, authenticated, service_role;
grant select on public.subscribers, public.subscriber_events, public.letter_sends, public.letters_signup_events to authenticated;

revoke execute on function public.letters_open(), public.letters_request(text, text, boolean), public.letters_confirm(text),
  public.letters_leave(text) from public, anon, authenticated, service_role;
grant execute on function public.letters_open(), public.letters_request(text, text, boolean), public.letters_confirm(text),
  public.letters_leave(text) to anon, authenticated;
revoke execute on function public.letters_issue_confirmations(uuid, uuid[]), public.letters_confirmation_failed(uuid),
  public.letters_bin(uuid, uuid[]), public.letters_erase(uuid, uuid), public.letters_purge(), public.letters_mark_left(text[]),
  public.confirmed_subscribers(), public.set_letters_signup(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.letters_issue_confirmations(uuid, uuid[]), public.letters_confirmation_failed(uuid),
  public.letters_bin(uuid, uuid[]), public.letters_erase(uuid, uuid), public.letters_purge(), public.letters_mark_left(text[]),
  public.confirmed_subscribers(), public.set_letters_signup(uuid, boolean) to service_role;
revoke execute on function private.guard_letter_item(), private.guard_letter_send(), private.freeze_sent_letter(),
  private.check_letter_send_decision(), private.letters_notice_version(), private.letters_hmac(text), private.ist_day_start(), private.letters_log(text, text, text),
  private.letters_delete(uuid[], text) from public, anon, authenticated, service_role;
