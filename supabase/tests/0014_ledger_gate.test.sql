-- 20261013000014_ledger_gate.sql: rule 4 (named-security recency) and the position check, read from the SEALED ledger events
-- by publish_revision() (Plan 3a Task 5; spec s5.6, s11, s17; publishing rules 4, 5 and 7). Two kinds of test:
--   * fixed dates: private.ledger_gate_failures(company, holds_position, today) is called with a "today" this file chooses, on
--     events dated in January to March 2026 (the owner moves event times with the triggers off and RE-SEALS the chain, so the
--     ledger check passes). Calendar: 2026-03-02 is a Monday; 2026-03-02 + 29 days = 2026-03-31, + 30 = 2026-04-01.
--   * the real door: publish_revision() with events sealed "now" or moved back 20 or 40 days (a day's drift at midnight cannot
--     move a result across the 30-day line).
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(178);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');
-- The owner plays the admin session for fixtures (the writers read the caller from the claims, not the role).
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Fixture helpers (the owner only). A company id is md5(symbol)::uuid, so any role can name it.
create temp table ids (sym text primary key, idea uuid);
create function pg_temp.isin(p_sym text) returns text language sql as $$ select 'INE' || upper(substr(md5(p_sym), 1, 9)) $$;
create function pg_temp.co(p_sym text) returns uuid language sql as $$ select md5(p_sym)::uuid $$;
create function pg_temp.mk(p_sym text, p_held boolean default true, p_exp text default 'outperform') returns void language plpgsql as $$
declare v_i uuid;
begin
  insert into public.companies (id, slug, name, nse_symbol, isin, visibility)
    values (pg_temp.co(p_sym), lower(p_sym), p_sym || ' Ltd', p_sym, pg_temp.isin(p_sym), 'public');
  v_i := public.open_idea(pg_temp.co(p_sym), p_exp, 365, p_held, 'Because ' || p_sym);
  insert into pg_temp.ids values (p_sym, v_i);
end $$;
create function pg_temp.ev(p_sym text, p_kind text, p_stance jsonb default '{}') returns void language plpgsql as $$
begin
  perform public.add_idea_event((select idea from pg_temp.ids where sym = p_sym), p_kind, p_kind || ' words ' || p_sym, p_stance);
end $$;
create function pg_temp.at(p_sym text, p_kind text, p_ist text) returns void language plpgsql as $$
begin
  alter table public.idea_events disable trigger user;
  update public.idea_events set recorded_at = (p_ist::timestamp at time zone 'Asia/Kolkata')
   where idea_id = (select idea from pg_temp.ids where sym = p_sym) and kind = p_kind;
  alter table public.idea_events enable trigger user;
end $$;
-- Move one event of an idea back by whole days from its sealed time (the real-clock scenarios).
create function pg_temp.back(p_sym text, p_kind text, p_days integer) returns void language plpgsql as $$
begin
  alter table public.idea_events disable trigger user;
  update public.idea_events set recorded_at = recorded_at - make_interval(days => p_days)
   where idea_id = (select idea from pg_temp.ids where sym = p_sym) and kind = p_kind;
  alter table public.idea_events enable trigger user;
end $$;
-- Re-seal the whole chain exactly as the seal trigger would have (order by time, renumber, rebuild every sealed text, re-hash)
-- and bring the projection in line, so the ledger check passes on the fixtures.
create function pg_temp.reseal() returns void language plpgsql as $$
declare
  r record; v_prev text := repeat('0', 64); v_seq bigint := 0; v_canon text; v_hash text;
begin
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
end $$;
-- What the gate's ledger half says for a company on a chosen "today": the codes, comma separated, or 'none'.
create function pg_temp.codes(p_sym text, p_holds text, p_today date) returns text language sql as $$
  select coalesce(string_agg(f ->> 'code', ',' order by f ->> 'rule', f ->> 'code'), 'none')
    from jsonb_array_elements(private.ledger_gate_failures(pg_temp.co(p_sym), p_holds, p_today)) f $$;
create function pg_temp.f1(p_sym text, p_holds text, p_today date) returns jsonb language sql as $$
  select private.ledger_gate_failures(pg_temp.co(p_sym), p_holds, p_today) -> 0 $$;
create function pg_temp.clear(p_sym text, p_today date) returns text language sql as $$
  select coalesce(private.ledger_gate_failures(pg_temp.co(p_sym), null, p_today) -> 0 ->> 'clear_from', 'clear') $$;

-- 1. Structure and privileges.
select has_function('private', 'ledger_gate_facts', array['uuid'], 'private.ledger_gate_facts(uuid) exists');
select has_function('private', 'ledger_gate_failures', array['uuid', 'text', 'date'], 'private.ledger_gate_failures(uuid, text, date) exists');
select has_function('public', 'ledger_gate_facts', array['uuid'], 'public.ledger_gate_facts(uuid) exists');
select has_function('private', 'ledger_gate_item_failures', array['uuid', 'uuid', 'text', 'date'], 'private.ledger_gate_item_failures(uuid, uuid, text, date) exists');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname in ('ledger_gate_facts', 'ledger_gate_failures', 'ledger_gate_item_failures')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute'))
$$, 'the private gate helpers are executable by no API role');
select ok(has_function_privilege('authenticated', 'public.ledger_gate_facts(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.ledger_gate_facts(uuid)', 'execute')
      and not has_function_privilege('service_role', 'public.ledger_gate_facts(uuid)', 'execute')
      and not has_function_privilege('public', 'public.ledger_gate_facts(uuid)', 'execute'),
  'the admin door ledger_gate_facts is granted to authenticated only (anon and service_role cannot call it)');
select ok(has_function_privilege('service_role', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('public', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute'),
  'publish_revision keeps the confinement: service_role only');
select is_definer('public', 'publish_revision', array['uuid', 'uuid', 'uuid', 'text', 'jsonb'], 'publish_revision is still SECURITY DEFINER');
select ok((select 'search_path=""' = any (p.proconfig) from pg_proc p
            where p.oid = 'public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure),
  'publish_revision pins an empty search_path');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.proname in ('ledger_gate_facts', 'ledger_gate_failures', 'ledger_gate_item_failures')
     and (not p.prosecdef or not ('search_path=""' = any (coalesce(p.proconfig, '{}'::text[]))))
$$, 'the four new functions are SECURITY DEFINER with an empty search_path');
select ok((select p.prosrc like '%A newer revision exists; publish the latest.%'
              and p.prosrc like '%A file needs a figures-to date (data_as_of).%'
              and p.prosrc like '%file_no_seq%'
              and p.prosrc like '%sebi-unreg-2026-07-v1.3%'
              and p.prosrc like '%The linked company is not public.%'
              and p.prosrc like '%is already used by another item%'
              and p.prosrc like '%holds_position is required when a company is named.%'
              and p.prosrc like '%A case study needs data_as_of at least 30 days old.%'
              and p.prosrc like '%private.is_admin_user(p_actor)%'
         from pg_proc p where p.oid = 'public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure),
  'publish_revision still carries the older checks (latest only, figures-to, file numbers, policy pin, company, slug, disclosure, actor)');
-- The gate reads the sealed events and never the editable projection (two reviews already found the projection movable).
select ok((select p.prosrc !~* 'public\.ideas' and p.prosrc ~* 'public\.idea_events' from pg_proc p
            where p.oid = 'private.ledger_gate_facts(uuid)'::regprocedure),
  'the gate facts read idea_events and never mention the ideas table');
select ok((select p.prosrc !~* 'public\.ideas' from pg_proc p where p.oid = 'private.ledger_gate_failures(uuid, text, date)'::regprocedure),
  'the gate decision never mentions the ideas table');
select ok((select p.prosrc ~ 'ledger_chain_check' and p.prosrc ~ 'ledger_anchor_check' from pg_proc p
            where p.oid = 'private.ledger_gate_facts(uuid)'::regprocedure),
  'the facts are read only after the chain check and the sealed-day comparison pass');
-- Round 3 (review M-2, M-3): the ledger half takes the chain lock BEFORE it reads anything, never raises, and is what publish_revision calls.
select ok((select position('pg_advisory_xact_lock(hashtext(''idea_events:chain''))' in p.prosrc) > 0
              and position('pg_advisory_xact_lock' in p.prosrc) < position('ledger_gate_failures' in p.prosrc)
              and p.prosrc ~ 'exception when others then'
              and p.prosrc ~ 'ledger_check_failed'
         from pg_proc p where p.oid = 'private.ledger_gate_item_failures(uuid, uuid, text, date)'::regprocedure),
  'the ledger half takes the chain advisory lock (the one the event seal takes) before it reads, and turns any error into a recorded refusal');
select ok((select position('ledger_gate_item_failures' in p.prosrc) > 0 and p.prosrc ~ '''checked'', v_ledger'
              and position('ledger_gate_item_failures' in p.prosrc) > position('select * into v_item' in p.prosrc)
              and position('ledger_gate_item_failures' in p.prosrc) < position('insert into public.gate_decisions' in p.prosrc)
         from pg_proc p where p.oid = 'public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure),
  'publish_revision calls the ledger half after it holds the item row and before it records the decision, and records that the ledger was consulted');
select ok((select p.prosrc ~ 'company_aliases' and p.prosrc !~* 'public\.ideas'
         from pg_proc p where p.oid = 'private.ledger_gate_facts(uuid)'::regprocedure),
  'the facts follow company_aliases (merged companies) and still never mention the ideas table');
select ok((select p.prosrc ~ 'Asia/Kolkata' from pg_proc p where p.oid = 'private.ledger_gate_facts(uuid)'::regprocedure)
      and (select p.prosrc ~ 'Asia/Kolkata' from pg_proc p where p.oid = 'public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure),
  'dates are counted on the India calendar, as the existing 30-day lag is');

-- 2. Fixtures for the fixed-date tests. Times are IST. today is chosen per assertion.
select pg_temp.mk('O');                                       -- opened Mar 2 14:00
select pg_temp.at('O', 'open', '2026-03-02 14:00');
select pg_temp.mk('K');                                       -- opened Jan 5, closed Mar 2 14:00
select pg_temp.ev('K', 'close', '{"reason":"played_out"}');
select pg_temp.at('K', 'open', '2026-01-05 10:00'); select pg_temp.at('K', 'close', '2026-03-02 14:00');
select pg_temp.mk('U', false);                                -- opened Jan 5 (not held), bought more Mar 2 14:00
select pg_temp.ev('U', 'upsize');
select pg_temp.at('U', 'open', '2026-01-05 10:00'); select pg_temp.at('U', 'upsize', '2026-03-02 14:00');
select pg_temp.mk('D');                                       -- opened Jan 5, sold some Mar 2 14:00 (still held)
select pg_temp.ev('D', 'downsize', '{"held":true}');
select pg_temp.at('D', 'open', '2026-01-05 10:00'); select pg_temp.at('D', 'downsize', '2026-03-02 14:00');
select pg_temp.mk('N');                                       -- opened Jan 5, closed Jan 20, then a note and a lesson on Mar 2
select pg_temp.ev('N', 'close', '{"reason":"other"}');
select pg_temp.ev('N', 'note'); select pg_temp.ev('N', 'review', '{"process":"sound","tags":["none"]}');
select pg_temp.at('N', 'open', '2026-01-05 10:00'); select pg_temp.at('N', 'close', '2026-01-20 10:00');
select pg_temp.at('N', 'note', '2026-03-02 12:00'); select pg_temp.at('N', 'review', '2026-03-02 13:00');
select pg_temp.mk('R');                                       -- opened Jan 5, a revision and a note on Mar 2
select pg_temp.ev('R', 'revise', '{"horizon_days":400}'); select pg_temp.ev('R', 'note');
select pg_temp.at('R', 'open', '2026-01-05 10:00'); select pg_temp.at('R', 'revise', '2026-03-02 12:00');
select pg_temp.at('R', 'note', '2026-03-02 13:00');
select pg_temp.mk('V');                                       -- opened Mar 2 10:00, withdrawn 11:00 the same morning
select pg_temp.ev('V', 'void');
select pg_temp.at('V', 'open', '2026-03-02 10:00'); select pg_temp.at('V', 'void', '2026-03-02 11:00');
select pg_temp.mk('B');                                       -- opened Mar 3 00:01 IST (still Mar 2 in UTC)
select pg_temp.at('B', 'open', '2026-03-03 00:01');
select pg_temp.mk('B2');                                      -- opened Mar 2 23:59:59 IST
select pg_temp.at('B2', 'open', '2026-03-02 23:59:59');
select pg_temp.mk('P1', true);  select pg_temp.at('P1', 'open', '2026-01-05 10:00');   -- held
select pg_temp.mk('P2', false); select pg_temp.at('P2', 'open', '2026-01-05 10:00');   -- watching, not held
select pg_temp.mk('P3', true);  select pg_temp.ev('P3', 'downsize', '{"held":false}');  -- sold all
select pg_temp.at('P3', 'open', '2026-01-05 10:00'); select pg_temp.at('P3', 'downsize', '2026-02-01 10:00');
select pg_temp.mk('P4', false); select pg_temp.ev('P4', 'upsize');                      -- bought after watching
select pg_temp.at('P4', 'open', '2026-01-05 10:00'); select pg_temp.at('P4', 'upsize', '2026-02-01 10:00');
select pg_temp.mk('P5', true);  select pg_temp.ev('P5', 'close', '{"reason":"played_out"}');
select pg_temp.at('P5', 'open', '2026-01-05 10:00'); select pg_temp.at('P5', 'close', '2026-02-01 10:00');
select pg_temp.mk('P6', true);  select pg_temp.ev('P6', 'void');
select pg_temp.at('P6', 'open', '2026-01-05 10:00'); select pg_temp.at('P6', 'void', '2026-01-05 11:00');
insert into public.companies (id, slug, name, nse_symbol, isin, visibility)      -- a company with no idea
  values (pg_temp.co('Z'), 'z', 'Z Ltd', 'Z', pg_temp.isin('Z'), 'public');
-- Round 3 (review M-8): two ideas on one company, to pin the aggregation over ideas (the latest stance date across them, "held"
-- if ANY live open idea is held), and an idea that was opened, enlarged and withdrawn.
create function pg_temp.mk_on(p_key text, p_sym text, p_held boolean) returns void language plpgsql as $$
begin
  insert into pg_temp.ids values (p_key, public.open_idea(pg_temp.co(p_sym), 'outperform', 365, p_held, 'Because ' || p_key));
end $$;
select pg_temp.mk('MX', true);                                    -- idea 1: opened Jan 5 held, closed Jan 20
select pg_temp.ev('MX', 'close', '{"reason":"played_out"}');
select pg_temp.at('MX', 'open', '2026-01-05 10:00'); select pg_temp.at('MX', 'close', '2026-01-20 10:00');
select pg_temp.mk_on('MX2', 'MX', false);                         -- idea 2: opened Mar 2 14:00, only watched
select pg_temp.at('MX2', 'open', '2026-03-02 14:00');
select pg_temp.mk('MY', true);                                    -- idea 1: opened Jan 5 held, still open
select pg_temp.at('MY', 'open', '2026-01-05 10:00');
select pg_temp.mk_on('MY2', 'MY', false);                         -- idea 2: opened Jan 6, only watched, still open
select pg_temp.at('MY2', 'open', '2026-01-06 10:00');
select pg_temp.mk('MW', true);                                    -- idea 1: opened Jan 5, closed Jan 20 (holds nothing)
select pg_temp.ev('MW', 'close', '{"reason":"other"}');
select pg_temp.at('MW', 'open', '2026-01-05 10:00'); select pg_temp.at('MW', 'close', '2026-01-20 10:00');
select pg_temp.mk_on('MW2', 'MW', true);                          -- idea 2: opened Jan 6 held, still open
select pg_temp.at('MW2', 'open', '2026-01-06 10:00');
select pg_temp.mk('W3', false);                                   -- opened Mar 2 10:00, bought more 10:30, withdrawn 11:00
select pg_temp.ev('W3', 'upsize'); select pg_temp.ev('W3', 'void');
select pg_temp.at('W3', 'open', '2026-03-02 10:00'); select pg_temp.at('W3', 'upsize', '2026-03-02 10:30');
select pg_temp.at('W3', 'void', '2026-03-02 11:00');
select pg_temp.mk('RN', true);                                    -- opened Mar 2 14:00; the company is renamed afterwards
select pg_temp.at('RN', 'open', '2026-03-02 14:00');
select pg_temp.reseal();
update public.companies set name = 'Renamed Ltd' where id = pg_temp.co('RN');   -- after the seal: the sealed text keeps the old name
select is((select ok from public.verify_ledger_chain()), true, 'fixtures: the re-sealed chain verifies');
select is((select ok from private.ledger_anchor_check()), true, 'fixtures: no sealed days yet, so the sealed-day comparison passes');
select is((select count(*) from public.ideas), 23::bigint, 'fixtures: twenty-three ideas');

-- 3. Rule 4 at the 30-day line, for each stance-changing kind: 29 days refused, 30 allowed, 31 allowed (event date: 2026-03-02).
select is(pg_temp.codes('O', null, date '2026-03-31'), 'ledger_recent_entry', 'open: 29 days later the gate refuses');
select is(pg_temp.codes('O', null, date '2026-04-01'), 'none', 'open: 30 days later it passes');
select is(pg_temp.codes('O', null, date '2026-04-02'), 'none', 'open: 31 days later it passes');
select is(pg_temp.codes('K', null, date '2026-03-31'), 'ledger_recent_entry', 'close: 29 days later the gate refuses');
select is(pg_temp.codes('K', null, date '2026-04-01'), 'none', 'close: 30 days later it passes');
select is(pg_temp.codes('K', null, date '2026-04-02'), 'none', 'close: 31 days later it passes');
select is(pg_temp.codes('U', null, date '2026-03-31'), 'ledger_recent_entry', 'bought more: 29 days later the gate refuses');
select is(pg_temp.codes('U', null, date '2026-04-01'), 'none', 'bought more: 30 days later it passes');
select is(pg_temp.codes('U', null, date '2026-04-02'), 'none', 'bought more: 31 days later it passes');
select is(pg_temp.codes('D', null, date '2026-03-31'), 'ledger_recent_entry', 'sold some: 29 days later the gate refuses');
select is(pg_temp.codes('D', null, date '2026-04-01'), 'none', 'sold some: 30 days later it passes');
select is(pg_temp.codes('D', null, date '2026-04-02'), 'none', 'sold some: 31 days later it passes');
select is(pg_temp.codes('O', null, date '2026-03-02'), 'ledger_recent_entry', 'the day of the entry itself is refused');
select is(pg_temp.codes('O', null, date '2026-03-01'), 'ledger_recent_entry', 'a "today" before the entry is refused too (the lag is never negative)');
select is(pg_temp.clear('O', date '2026-03-31'), '2026-04-01', 'the clear date is the entry date plus 30 days');
select is(pg_temp.f1('O', null, date '2026-03-31') ->> 'message',
  'The ledger has an entry on this company from the last 30 days. This can be published from 01 Apr 2026.',
  'the refusal sentence names the day it can be published from');
select is(pg_temp.f1('O', null, date '2026-03-31') ->> 'rule', '4', 'the refusal is recorded as rule 4');
select is(pg_temp.f1('K', null, date '2026-03-31') ->> 'clear_from', '2026-04-01', 'the failure carries the clear date for a screen');
-- A close on a company opened long ago counts by its own date; the open of long ago does not keep it blocked.
select is(pg_temp.codes('N', null, date '2026-02-18'), 'ledger_recent_entry', 'close 29 days earlier (Jan 20): refused');
select is(pg_temp.codes('N', null, date '2026-02-19'), 'none', 'close 30 days earlier: allowed');
-- Other kinds do not count.
select is(pg_temp.codes('N', null, date '2026-03-03'), 'none', 'a note and a lesson (review) on the day before do not count, the old close is past 30 days');
select is(pg_temp.codes('R', null, date '2026-03-03'), 'none', 'a revision and a note do not count');
-- Another company is unaffected.
select is(pg_temp.codes('Z', null, date '2026-03-31'), 'none', 'a company with no idea is unaffected while another is blocked');
select is(pg_temp.codes('P1', null, date '2026-03-31'), 'none', 'a company whose idea was opened long ago is unaffected');
-- IST calendar.
select is(pg_temp.codes('B', null, date '2026-04-01'), 'ledger_recent_entry',
  'an entry at 00:01 IST on Mar 3 is a Mar 3 entry (it is still Mar 2 in UTC): day 29 refused');
select is(pg_temp.codes('B', null, date '2026-04-02'), 'none', 'the same entry passes on day 30 (Apr 2)');
select is(pg_temp.codes('B2', null, date '2026-04-01'), 'none', 'an entry at 23:59:59 IST on Mar 2 is a Mar 2 entry: day 30 (Apr 1) passes');
select is(pg_temp.codes('B2', null, date '2026-03-31'), 'ledger_recent_entry', 'and day 29 is refused');
-- Withdrawn idea: the spec (s5.6) says "a non-void idea". It counts for nothing.
select is(pg_temp.codes('V', null, date '2026-03-03'), 'none', 'a withdrawn idea does not hold the company back');
select is(pg_temp.codes('P6', 'no', date '2026-04-10'), 'none', 'a withdrawn idea shows no position');
-- Round 3 (review M-8): several ideas on one company. The latest stance date across them counts; "held" is true if ANY live open idea is held.
select is(pg_temp.codes('MX', null, date '2026-03-31'), 'ledger_recent_entry', 'two ideas, one old and closed, one opened Mar 2: day 29 refused (the later date counts)');
select is(pg_temp.codes('MX', null, date '2026-04-01'), 'none', 'and day 30 passes');
select is((select last_stance::text from private.ledger_gate_facts(pg_temp.co('MX'))), '2026-03-02', 'facts: the latest stance date across both ideas');
select is((select last_stance::text from private.ledger_gate_facts(pg_temp.co('MY'))), '2026-01-06', 'facts: the latest of two open opens (Jan 5, Jan 6)');
select is(pg_temp.codes('MX', 'no', date '2026-04-10'), 'none', 'one idea closed, the other only watched: "no" allowed');
select is(pg_temp.codes('MY', 'no', date '2026-04-10'), 'ledger_position', 'one idea held, the other watched: "no" refused (any held idea counts)');
select is(pg_temp.codes('MW', 'no', date '2026-04-10'), 'ledger_position', 'one idea closed, the other open and held: "no" refused');
-- open, upsize, then withdrawn: counts for nothing, for either rule.
select is(pg_temp.codes('W3', 'no', date '2026-03-03'), 'none', 'an idea opened, enlarged and withdrawn counts for nothing (rule 4 and the position check)');
select is((select last_stance from private.ledger_gate_facts(pg_temp.co('W3'))), null, 'facts: no stance date for it, though it carries an open and an upsize');
-- A company renamed after the idea was sealed is still blocked (matching is by the sealed company id), and the chain still verifies.
select is(pg_temp.codes('RN', null, date '2026-03-31'), 'ledger_recent_entry', 'a company renamed after the idea was sealed is still blocked');
select is((select e.canonical::jsonb ->> 'company' || ' / ' || c.name from public.idea_events e join public.companies c on c.id = pg_temp.co('RN')
            where e.idea_id = (select idea from pg_temp.ids where sym = 'RN') and e.kind = 'open'),
  'RN Ltd / Renamed Ltd', 'the sealed text keeps the old name while the live row has the new one');

-- 4. The position check: what the gate compares is the sealed trail of one idea (open held, bought more = held, sold some = the
-- held flag it carries, closed = not held, withdrawn = nothing) for an idea with no sealed close and no sealed withdrawal.
select is(pg_temp.codes('P1', 'no', date '2026-04-10'), 'ledger_position', 'open and held: a "no position" disclosure is refused');
select is(pg_temp.codes('P1', 'yes', date '2026-04-10'), 'none', '"yes" is never contradicted');
select is(pg_temp.codes('P1', 'not_disclosed', date '2026-04-10'), 'none', '"not disclosed" is never contradicted');
select is(pg_temp.codes('P1', null, date '2026-04-10'), 'none', 'no disclosure is not checked here (another rule requires one)');
select is(pg_temp.codes('P2', 'no', date '2026-04-10'), 'none', 'an open idea that is only watched (held = false) allows "no"');
select is(pg_temp.codes('P3', 'no', date '2026-04-10'), 'none', 'sold everything (a sold-some entry with held = false): "no" allowed');
select is(pg_temp.codes('P4', 'no', date '2026-04-10'), 'ledger_position', 'bought after watching: "no" refused');
select is(pg_temp.codes('P5', 'no', date '2026-04-10'), 'none', 'a closed idea holds nothing: "no" allowed');
select is(pg_temp.codes('Z', 'no', date '2026-04-10'), 'none', 'no idea at all: "no" allowed (the ledger may be incomplete, and "no" is then the owner''s word)');
select is(pg_temp.codes('O', 'no', date '2026-03-31'), 'ledger_recent_entry,ledger_position', 'both can fail at once, each with its own code');
select is(pg_temp.f1('P1', 'no', date '2026-04-10') ->> 'rule', '5', 'the position refusal is recorded as rule 5');
select is(pg_temp.f1('P1', 'no', date '2026-04-10') ->> 'message',
  'The ledger shows a position in this company; the disclosure cannot say no.', 'the position sentence');
select is((select holds_position from private.ledger_gate_facts(pg_temp.co('P4'))), true, 'facts: bought after watching holds');
select is((select holds_position from private.ledger_gate_facts(pg_temp.co('P3'))), false, 'facts: sold all does not hold');
select is((select last_stance::text from private.ledger_gate_facts(pg_temp.co('O'))), '2026-03-02', 'facts: the last stance date');
select is((select last_stance::text from private.ledger_gate_facts(pg_temp.co('N'))), '2026-01-20', 'facts: notes and lessons are not stance entries');
select is((select last_stance from private.ledger_gate_facts(pg_temp.co('V'))), null, 'facts: a withdrawn idea has no stance entry');
select is((select ledger_ok from private.ledger_gate_facts(pg_temp.co('O'))), true, 'facts: the ledger check passed');

-- 5. The admin door sees the same facts (clear_from is relative to the real India date; the fixtures are old, so it is null).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select ledger_ok::text || '/' || coalesce(clear_from::text, 'null') || '/' || holds_position::text
             from public.ledger_gate_facts(md5('P1')::uuid)), 'true/null/true', 'admin door: a held old idea is clear of rule 4 and holds a position');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select * from public.ledger_gate_facts(md5('P1')::uuid) $$, '42501', null, 'a signed-in non-admin cannot ask the ledger');
reset role;
set local role anon;
select throws_ok($$ select * from public.ledger_gate_facts(md5('P1')::uuid) $$, '42501', null, 'anon cannot call the admin door');
select throws_ok($$ select private.ledger_gate_failures(md5('P1')::uuid, 'no', date '2026-04-10') $$, '42501', null,
  'anon cannot call the private decision');
reset role;
set local role service_role;
select throws_ok($$ select * from public.ledger_gate_facts(md5('P1')::uuid) $$, '42501', null, 'service_role cannot call the admin door');
reset role;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 6. The real door. Items about company CA (a public company with a symbol), CB (none), and one with no company.
insert into public.companies (id, slug, name, nse_symbol, isin, visibility) values
  ('cccccccc-0000-4000-8000-0000000000a1', 'alpha', 'Alpha Ltd', 'ALPHA', 'INE000A01011', 'public'),
  ('cccccccc-0000-4000-8000-0000000000b2', 'beta',  'Beta Ltd',  'BETA',  'INE000B01012', 'public'),
  ('cccccccc-0000-4000-8000-0000000000c3', 'gamma', 'Gamma Ltd', 'GAMMA', 'INE000C01013', 'public'),
  ('cccccccc-0000-4000-8000-0000000000d4', 'delta', 'Delta Ltd', 'DELTA', 'INE000D01014', 'public');
insert into public.items (id, kind, title, company_id, learning_objective, holds_position, data_as_of) values
  ('a1000000-0000-4000-8000-0000000000a1', 'thesis', 'Alpha file', 'cccccccc-0000-4000-8000-0000000000a1', 'Learn A.', 'not_disclosed',
   (now() at time zone 'Asia/Kolkata')::date - 40),
  ('a1000000-0000-4000-8000-0000000000b2', 'thesis', 'Beta file',  'cccccccc-0000-4000-8000-0000000000b2', 'Learn B.', 'not_disclosed',
   (now() at time zone 'Asia/Kolkata')::date - 40),
  ('a1000000-0000-4000-8000-0000000000e5', 'learning', 'A note', null, 'Learn E.', null, null),
  ('a1000000-0000-4000-8000-0000000000c3', 'thesis', 'Gamma file', 'cccccccc-0000-4000-8000-0000000000c3', 'Learn C.', 'no',
   (now() at time zone 'Asia/Kolkata')::date - 40),
  ('a1000000-0000-4000-8000-0000000000c4', 'thesis', 'Gamma second file', 'cccccccc-0000-4000-8000-0000000000c3', 'Learn C2.', 'not_disclosed',
   (now() at time zone 'Asia/Kolkata')::date - 40),
  ('a1000000-0000-4000-8000-0000000000c5', 'thesis', 'Gamma third file', 'cccccccc-0000-4000-8000-0000000000c3', 'Learn C3.', 'yes',
   (now() at time zone 'Asia/Kolkata')::date - 40),
  ('a1000000-0000-4000-8000-0000000000d4', 'thesis', 'Delta file', 'cccccccc-0000-4000-8000-0000000000d4', 'Learn D.', 'not_disclosed',
   (now() at time zone 'Asia/Kolkata')::date - 40),
  ('a1000000-0000-4000-8000-0000000000d5', 'thesis', 'Delta no file', 'cccccccc-0000-4000-8000-0000000000d4', 'Learn D2.', 'no',
   (now() at time zone 'Asia/Kolkata')::date - 40);
insert into public.item_revisions (id, item_id, body_md) values
  ('b1000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-0000000000a1', 'Alpha first revision'),
  ('b1000000-0000-4000-8000-0000000000b2', 'a1000000-0000-4000-8000-0000000000b2', 'Beta first revision'),
  ('b1000000-0000-4000-8000-0000000000e5', 'a1000000-0000-4000-8000-0000000000e5', 'A note revision'),
  ('b1000000-0000-4000-8000-0000000000c3', 'a1000000-0000-4000-8000-0000000000c3', 'Gamma first revision'),
  ('b1000000-0000-4000-8000-0000000000c4', 'a1000000-0000-4000-8000-0000000000c4', 'Gamma second file revision'),
  ('b1000000-0000-4000-8000-0000000000c5', 'a1000000-0000-4000-8000-0000000000c5', 'Gamma third file revision'),
  ('b1000000-0000-4000-8000-0000000000d4', 'a1000000-0000-4000-8000-0000000000d4', 'Delta first revision'),
  ('b1000000-0000-4000-8000-0000000000d5', 'a1000000-0000-4000-8000-0000000000d5', 'Delta no revision');
create function pg_temp.pub(p_item uuid, p_rev uuid) returns public.gate_decisions language sql as $$
  select * from public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001', p_item, p_rev, 'sebi-unreg-2026-07-v1.3',
    jsonb_build_object('passed', true, 'revisionId', p_rev::text, 'policyVersion', 'sebi-unreg-2026-07-v1.3')) $$;
create temp table decs (n serial primary key, item_id uuid, decision_id uuid);
create function pg_temp.verdict(p_item uuid, p_rev uuid) returns text language plpgsql as $$
declare d public.gate_decisions;
begin
  d := pg_temp.pub(p_item, p_rev);
  insert into pg_temp.decs (item_id, decision_id) values (p_item, d.id);
  return d.verdict;
end $$;
-- Codes recorded by the newest decision on an item.
create function pg_temp.last_codes(p_item uuid) returns text language sql as $$
  select coalesce(string_agg(coalesce(f ->> 'code', f ->> 'rule'), ',' order by f ->> 'rule'), 'none')
    from (select g.reasons from public.gate_decisions g join pg_temp.decs x on x.decision_id = g.id where x.item_id = p_item order by x.n desc limit 1) d,
         jsonb_array_elements(d.reasons -> 'failures') f $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- 6a. No ledger entry yet: the company file publishes (published before any idea existed), and so do the unrelated ones.
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000a1', 'b1000000-0000-4000-8000-0000000000a1'), 'pass',
  'an item whose company has no idea is published');
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000e5', 'b1000000-0000-4000-8000-0000000000e5'), 'pass',
  'an item with no company is untouched by the ledger');
select set_config('t.items', md5(coalesce((select string_agg(p::text, '|' order by p.id) from public.public_items p), '')), true);
select set_config('t.facts', md5(coalesce((select string_agg(t::text, '|' order by t::text) from public.public_fact_checks() t), '')), true);
select set_config('t.capture', md5(coalesce((select string_agg(c::text, '|' order by c::text) from public.capture_days(30) c), '')), true);
select is((select count(*) from public.public_items where id = 'a1000000-0000-4000-8000-0000000000a1'), 1::bigint,
  'the published file is readable in public_items');

-- 6b. Now an idea is opened on Alpha (sealed now). A new revision of the already public file is refused; the old one stays.
insert into pg_temp.ids select 'ALPHA', public.open_idea('cccccccc-0000-4000-8000-0000000000a1', 'outperform', 365, true, 'Because alpha');
insert into public.item_revisions (id, item_id, body_md) values
  ('b1000000-0000-4000-8000-0000000001a1', 'a1000000-0000-4000-8000-0000000000a1', 'Alpha second revision');
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000a1', 'b1000000-0000-4000-8000-0000000001a1'), 'fail',
  'a new revision of an already public file is refused while the ledger has an entry from the last 30 days');
select is(pg_temp.last_codes('a1000000-0000-4000-8000-0000000000a1'), 'ledger_recent_entry', 'the recorded decision carries the rule 4 code');
-- The expected day comes from the SEALED time of the open event (its India date plus 30), not from a second reading of the
-- clock, so a run that straddles India midnight cannot disagree with itself (round 3, review M-7).
select is((select (reasons -> 'failures' -> 0 ->> 'clear_from') from public.gate_decisions
            where revision_id = 'b1000000-0000-4000-8000-0000000001a1'),
  (select ((e.recorded_at at time zone 'Asia/Kolkata')::date + 30)::text from public.idea_events e
    where e.idea_id = (select idea from pg_temp.ids where sym = 'ALPHA') and e.kind = 'open'),
  'and the date it can be published from: the India date of the sealed entry plus 30 days');
select is((select current_revision_id from public.items where id = 'a1000000-0000-4000-8000-0000000000a1'),
  'b1000000-0000-4000-8000-0000000000a1'::uuid, 'the old revision stays current');
select is((select visibility || '/' || status from public.items where id = 'a1000000-0000-4000-8000-0000000000a1'), 'public/published',
  'the item is still public and published');
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000b2', 'b1000000-0000-4000-8000-0000000000b2'), 'pass',
  'an item about another company is unaffected');
-- What anon sees did not change at all, and no path shows that an idea exists.
set local role anon;
select is((select count(*) from public.public_items where id = 'a1000000-0000-4000-8000-0000000000a1'
             and revision_id = 'b1000000-0000-4000-8000-0000000000a1'), 1::bigint,
  'anon still reads the already public file, on its old revision');
select is((select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from public.public_items p where p.id <> 'a1000000-0000-4000-8000-0000000000b2'),
  current_setting('t.items'), 'public_items is byte-for-byte what it was before the idea existed (apart from the file just published)');
select is((select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.public_fact_checks() t), current_setting('t.facts'),
  'public_fact_checks() is unchanged');
select is((select md5(coalesce(string_agg(c::text, '|' order by c::text), '')) from public.capture_days(30) c), current_setting('t.capture'),
  'capture_days() is unchanged');
select throws_ok($$ select count(*) from public.gate_decisions $$, '42501', null, 'anon cannot read the gate decision that holds the refusal');
select throws_ok($$ select count(*) from public.idea_events $$, '42501', null, 'anon cannot read the ledger');
select throws_ok($$ select count(*) from public.ideas $$, '42501', null, 'anon cannot read the ideas');
reset role;

-- 6c. The admin door shows the clear date for the fresh entry.
select set_config('t.alpha_clear', (select ((e.recorded_at at time zone 'Asia/Kolkata')::date + 30)::text from public.idea_events e
    where e.idea_id = (select idea from pg_temp.ids where sym = 'ALPHA') and e.kind = 'open'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select clear_from::text from public.ledger_gate_facts('cccccccc-0000-4000-8000-0000000000a1')), current_setting('t.alpha_clear'),
  'admin door: clear_from is the India date of the sealed entry plus 30 days');
reset role;

-- 6d. Twenty days later it is still refused; forty days later it passes (the owner moves the sealed time, re-sealing).
select pg_temp.back('ALPHA', 'open', 20); select pg_temp.reseal();
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000a1', 'b1000000-0000-4000-8000-0000000001a1'), 'fail',
  '20 days after the open the revision is still refused');
select pg_temp.back('ALPHA', 'open', 20); select pg_temp.reseal();
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000a1', 'b1000000-0000-4000-8000-0000000001a1'), 'pass',
  '40 days after the open the revision passes');
select is((select current_revision_id from public.items where id = 'a1000000-0000-4000-8000-0000000000a1'),
  'b1000000-0000-4000-8000-0000000001a1'::uuid, 'and it becomes the current revision');

-- 6e. Close and resize through the real door (Gamma: three files, three disclosures). The idea is old; the close is new.
insert into pg_temp.ids select 'GAMMA', public.open_idea('cccccccc-0000-4000-8000-0000000000c3', 'outperform', 365, true, 'Because gamma');
select pg_temp.back('GAMMA', 'open', 40); select pg_temp.reseal();
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000c3', 'b1000000-0000-4000-8000-0000000000c3'), 'fail',
  'a "no position" disclosure is refused while an open held idea exists');
select is(pg_temp.last_codes('a1000000-0000-4000-8000-0000000000c3'), 'ledger_position', 'and only the position code is recorded (rule 4 is clear)');
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000c4', 'b1000000-0000-4000-8000-0000000000c4'), 'pass',
  '"not disclosed" is never contradicted');
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000c5', 'b1000000-0000-4000-8000-0000000000c5'), 'pass',
  '"yes" is never contradicted');
select is((select visibility from public.items where id = 'a1000000-0000-4000-8000-0000000000c3'), 'private', 'the refused file stays private');
-- Sold everything 35 days ago: "no" is now true and passes.
select public.add_idea_event((select idea from pg_temp.ids where sym = 'GAMMA'), 'downsize', 'Sold all', '{"held":false}');
select pg_temp.back('GAMMA', 'downsize', 35); select pg_temp.reseal();
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000c3', 'b1000000-0000-4000-8000-0000000000c3'), 'pass',
  'after the ledger shows everything sold more than 30 days ago, "no" passes');
-- A resize today blocks a new revision; closing today blocks a different item on the same company.
insert into public.item_revisions (id, item_id, body_md) values
  ('b1000000-0000-4000-8000-0000000002c4', 'a1000000-0000-4000-8000-0000000000c4', 'Gamma second file, edited');
select public.add_idea_event((select idea from pg_temp.ids where sym = 'GAMMA'), 'upsize', 'Bought some again');
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000c4', 'b1000000-0000-4000-8000-0000000002c4'), 'fail',
  'a resize today refuses the next revision of a public file on that company');
select is(pg_temp.last_codes('a1000000-0000-4000-8000-0000000000c4'), 'ledger_recent_entry', 'with the rule 4 code');

-- 6f. Delta: the ledger records an old open (40 days) and a close today.
insert into pg_temp.ids select 'DELTA', public.open_idea('cccccccc-0000-4000-8000-0000000000d4', 'outperform', 365, true, 'Because delta');
select pg_temp.back('DELTA', 'open', 40); select pg_temp.reseal();
select public.add_idea_event((select idea from pg_temp.ids where sym = 'DELTA'), 'close', 'Closing', '{"reason":"played_out"}');
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000d4', 'b1000000-0000-4000-8000-0000000000d4'), 'fail',
  'a close today refuses an item on that company');
select pg_temp.back('DELTA', 'close', 20); select pg_temp.reseal();
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000d4', 'b1000000-0000-4000-8000-0000000000d4'), 'fail', 'a close 20 days ago still refuses');
select pg_temp.back('DELTA', 'close', 20); select pg_temp.reseal();
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000d4', 'b1000000-0000-4000-8000-0000000000d4'), 'pass', 'a close 40 days ago passes');
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000d5', 'b1000000-0000-4000-8000-0000000000d5'), 'pass',
  'closed: a "no position" disclosure is not contradicted');

-- 7. Tampering with the editable projection never moves a decision towards a pass. Delta2: a fresh idea (sealed now).
insert into public.companies (id, slug, name, nse_symbol, isin, visibility)
  values ('cccccccc-0000-4000-8000-0000000000e6', 'epsilon', 'Epsilon Ltd', 'EPS', 'INE000E01015', 'public');
insert into public.items (id, kind, title, company_id, learning_objective, holds_position, data_as_of)
  values ('a1000000-0000-4000-8000-0000000000e6', 'thesis', 'Epsilon file', 'cccccccc-0000-4000-8000-0000000000e6', 'Learn E6.', 'no',
          (now() at time zone 'Asia/Kolkata')::date - 40);
insert into public.item_revisions (id, item_id, body_md)
  values ('b1000000-0000-4000-8000-0000000000e6', 'a1000000-0000-4000-8000-0000000000e6', 'Epsilon revision');
insert into pg_temp.ids select 'EPS', public.open_idea('cccccccc-0000-4000-8000-0000000000e6', 'outperform', 365, true, 'Because epsilon');
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000e6', 'b1000000-0000-4000-8000-0000000000e6'), 'fail', 'baseline: a fresh idea refuses the file');
select is(pg_temp.last_codes('a1000000-0000-4000-8000-0000000000e6'), 'ledger_recent_entry,ledger_position', 'baseline: both codes (rule 4 and a "no" against a held position)');
create temp table orig_idea as select * from public.ideas where id = (select idea from pg_temp.ids where sym = 'EPS');
create function pg_temp.proj(p_sql text) returns void language plpgsql as $$
begin
  alter table public.ideas disable trigger ideas_guard_update;
  execute p_sql;
  alter table public.ideas enable trigger ideas_guard_update;
end $$;
create function pg_temp.restore_proj() returns void language plpgsql as $$
begin
  alter table public.ideas disable trigger ideas_guard_update;
  update public.ideas i set status = o.status, opened_at = o.opened_at, held = o.held from pg_temp.orig_idea o where i.id = o.id;
  alter table public.ideas enable trigger ideas_guard_update;
end $$;
select pg_temp.proj(format('update public.ideas set status = %L where id = %L', 'void', (select idea from pg_temp.ids where sym = 'EPS')));
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000e6', 'b1000000-0000-4000-8000-0000000000e6'), 'fail',
  'marking the idea void in the projection does not release the file');
select is(pg_temp.last_codes('a1000000-0000-4000-8000-0000000000e6'), 'ledger_check_failed',
  'and the recorded reason is the failed ledger check, not a pass-through of the doctored projection (round 3, review M-1)');
select is((select ledger_ok from private.ledger_gate_facts(md5('x')::uuid)), false, 'the ledger check names the disagreement, so the gate has no facts to trust');
select ok(exists (select 1 from jsonb_array_elements((select g.reasons -> 'failures' from public.gate_decisions g join pg_temp.decs x on x.decision_id = g.id
                    where x.item_id = 'a1000000-0000-4000-8000-0000000000e6' order by x.n desc limit 1)) f
                   where f ->> 'code' = 'ledger_check_failed' and f ->> 'rule' = '4'),
  'the recorded reason is the failed ledger check, rule 4');
select pg_temp.restore_proj();
select is((select ok from public.verify_ledger_chain()), true, 'restored: the chain verifies again');
select pg_temp.proj(format('update public.ideas set opened_at = now() - interval %L where id = %L', '90 days', (select idea from pg_temp.ids where sym = 'EPS')));
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000e6', 'b1000000-0000-4000-8000-0000000000e6'), 'fail',
  'moving opened_at back 90 days in the projection does not release the file');
select is(pg_temp.last_codes('a1000000-0000-4000-8000-0000000000e6'), 'ledger_check_failed',
  'and the recorded reason is the failed ledger check (a gate that read the projection would have recorded the position code only)');
select pg_temp.restore_proj();
select pg_temp.proj(format('update public.ideas set held = false where id = %L', (select idea from pg_temp.ids where sym = 'EPS')));
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000e6', 'b1000000-0000-4000-8000-0000000000e6'), 'fail',
  'clearing held in the projection does not turn a refused "no" into a pass');
select is(pg_temp.last_codes('a1000000-0000-4000-8000-0000000000e6'), 'ledger_check_failed',
  'and the recorded reason is the failed ledger check (a gate that read the projection would have recorded rule 4 only)');
select pg_temp.restore_proj();
-- Back to baseline: the decision is what it was before any tampering.
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000e6', 'b1000000-0000-4000-8000-0000000000e6'), 'fail', 'restored: the same refusal as the baseline');
select is(pg_temp.last_codes('a1000000-0000-4000-8000-0000000000e6'), 'ledger_recent_entry,ledger_position', 'restored: the same two codes as the baseline');
-- An owner who edits a sealed event without re-sealing: the check fails and the file is refused, even for an old, clear company.
create temp table orig_at as select e.id, e.recorded_at from public.idea_events e
 where e.idea_id = (select idea from pg_temp.ids where sym = 'EPS') and e.kind = 'open';
alter table public.idea_events disable trigger user;
update public.idea_events set recorded_at = recorded_at - interval '60 days' where id = (select id from pg_temp.orig_at);
alter table public.idea_events enable trigger user;
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000e6', 'b1000000-0000-4000-8000-0000000000e6'), 'fail',
  'a backdated event whose hash no longer matches does not release the file');
select is(pg_temp.last_codes('a1000000-0000-4000-8000-0000000000e6'), 'ledger_check_failed', 'with the ledger-check code');
alter table public.idea_events disable trigger user;
update public.idea_events e set recorded_at = o.recorded_at from pg_temp.orig_at o where e.id = o.id;
alter table public.idea_events enable trigger user;
select is((select ok from public.verify_ledger_chain()), true, 'restored: the chain verifies again');

-- 8. The older gate behaviour is untouched, and the ledger half is recorded, never raised.
select is(pg_temp.last_codes('a1000000-0000-4000-8000-0000000000e5'), 'none', 'a passing decision carries no failures');
select is((select count(*) from public.gate_decisions where revision_id = 'b1000000-0000-4000-8000-0000000001a1' and verdict = 'fail'), 2::bigint,
  'every refusal is a recorded decision (the audit row is not rolled back)');
select is((select count(*) from public.items where visibility = 'public'), 8::bigint, 'eight items are public after the walk');


-- 8b. Round 3 (review I-1): a catalog merge. An idea opened on a stub stays on the stub (ideas.company_id never changes); the
-- merge re-points items to the target, records company_aliases(stub symbol -> target) and archives the stub. The gate must still
-- see the idea when it is asked about the target.
create function pg_temp.item(p_key text, p_kind text, p_company uuid, p_holds text) returns void language plpgsql as $$
begin
  insert into public.items (id, kind, title, company_id, learning_objective, holds_position, data_as_of)
    values (pg_temp.co('I_' || p_key), p_kind, p_key || ' item', p_company, 'Learn ' || p_key || '.', p_holds,
            case when p_kind in ('thesis', 'case_study') then pg_temp.today() - 40 end);
  insert into public.item_revisions (id, item_id, body_md)
    values (pg_temp.co('R_' || p_key), pg_temp.co('I_' || p_key), p_key || ' revision');
end $$;
create function pg_temp.vd(p_key text) returns text language sql as $$
  select pg_temp.verdict(pg_temp.co('I_' || p_key), pg_temp.co('R_' || p_key)) $$;
create function pg_temp.lc(p_key text) returns text language sql as $$ select pg_temp.last_codes(pg_temp.co('I_' || p_key)) $$;
create function pg_temp.merge(p_stub text, p_target text) returns void language plpgsql as $$
begin
  insert into public.company_aliases (symbol, company_id) values (p_stub, pg_temp.co(p_target));
  update public.companies set needs_review = false, archived_at = now() where id = pg_temp.co(p_stub);
end $$;
-- Rule 4: the idea on the stub was opened just now.
select pg_temp.mk('STUBA');
insert into public.companies (id, slug, name, nse_symbol, isin, visibility)
  values (pg_temp.co('TGTA'), 'tgta', 'Target A', 'TGTA', pg_temp.isin('TGTA'), 'public');
select pg_temp.item('MA', 'thesis', pg_temp.co('TGTA'), 'not_disclosed');
select is(private.ledger_gate_failures(pg_temp.co('TGTA'), null, pg_temp.today()), '[]'::jsonb, 'before the merge the target has no ledger entry');
select pg_temp.merge('STUBA', 'TGTA');
select is(pg_temp.codes('TGTA', null, pg_temp.today()), 'ledger_recent_entry', 'after the merge the stub''s idea counts for the target (fixed-date check)');
select is(pg_temp.vd('MA'), 'fail', 'merge: an item about the target is refused the day after an idea was opened on the stub');
select is(pg_temp.lc('MA'), 'ledger_recent_entry', 'merge: with the rule 4 code');
select is((select visibility from public.items where id = pg_temp.co('I_MA')), 'private', 'merge: and the item stays private');
-- The position check: the stub's idea is old and held; an item about the target saying "no" is refused.
select pg_temp.mk('STUBB');
select pg_temp.back('STUBB', 'open', 40); select pg_temp.reseal();
insert into public.companies (id, slug, name, nse_symbol, isin, visibility)
  values (pg_temp.co('TGTB'), 'tgtb', 'Target B', 'TGTB', pg_temp.isin('TGTB'), 'public');
select pg_temp.item('MB', 'thesis', pg_temp.co('TGTB'), 'no');
select pg_temp.item('MB2', 'thesis', pg_temp.co('TGTB'), 'yes');
select is(pg_temp.codes('TGTB', 'no', pg_temp.today()), 'none', 'before the merge the target holds no position');
select pg_temp.merge('STUBB', 'TGTB');
select is(pg_temp.codes('TGTB', 'no', pg_temp.today()), 'ledger_position', 'after the merge the stub''s held idea blocks a "no" for the target');
select is(pg_temp.vd('MB'), 'fail', 'merge: a "no position" item about the target is refused');
select is(pg_temp.lc('MB'), 'ledger_position', 'merge: with the position code only (the idea is 40 days old)');
select is(pg_temp.vd('MB2'), 'pass', 'merge: "yes" is never contradicted');
-- The facts (and so the admin door the checklist reads) follow the merge too: the screen and the gate cannot disagree.
select is((select holds_position from private.ledger_gate_facts(pg_temp.co('TGTB'))), true, 'merge: facts for the target show the held position');
select is(pg_temp.codes('Z', 'no', pg_temp.today()), 'none', 'merge: an unrelated company is not affected');

-- 8c. Round 3 (review M-4): an item linked to an idea through ideas.item_id is checked against that idea's company, even when the
-- item names no company or names another; a disclosure on the item's own company is not judged by the other company's position.
insert into public.companies (id, slug, name, nse_symbol, isin, visibility)
  values (pg_temp.co('LK'), 'lk', 'LK Ltd', 'LK', pg_temp.isin('LK'), 'public'),
         (pg_temp.co('LK2'), 'lk2', 'LK2 Ltd', 'LK2', pg_temp.isin('LK2'), 'public');
select pg_temp.item('LI1', 'learning', null, null);
select pg_temp.item('LI2', 'learning', pg_temp.co('LK2'), 'no');
select pg_temp.item('LI3', 'learning', null, null);                  -- never linked
-- Task 11 step 0 (task 10 review I3): open_idea() refuses a file of another company. Final review I-1: no API role can update
-- ideas.item_id any more either, so these two wrong links are made by the database owner (this script runs as the owner here:
-- the last role reset is above). That is the only way left to build such a link, which is exactly what this section needs: the
-- gate must still read it honestly if one ever exists (a restore, a hand edit in the SQL editor).
insert into pg_temp.ids select 'LK_A', public.open_idea(pg_temp.co('LK'), 'outperform', 365, true, 'Linked to a learning note');
insert into pg_temp.ids select 'LK_B', public.open_idea(pg_temp.co('LK'), 'outperform', 365, true, 'Linked to a second note');
update public.ideas set item_id = pg_temp.co('I_LI1') where id = (select idea from pg_temp.ids where sym = 'LK_A');
update public.ideas set item_id = pg_temp.co('I_LI2') where id = (select idea from pg_temp.ids where sym = 'LK_B');
select is(pg_temp.vd('LI1'), 'fail', 'linked item: a note that names no company is refused while the idea it is linked to is fresh');
select is(pg_temp.lc('LI1'), 'ledger_recent_entry', 'linked item: with the rule 4 code');
select is(pg_temp.vd('LI2'), 'fail', 'linked item: an item on another company is also refused for the linked idea');
select is(pg_temp.lc('LI2'), 'ledger_recent_entry', 'linked item: the "no" on its own company (no position there) adds nothing');
select is(pg_temp.vd('LI3'), 'pass', 'an item with no company that is linked to no idea is outside the ledger rules (passes)');
select is((select g.reasons -> 'ledger' ->> 'checked' from public.gate_decisions g join pg_temp.decs x on x.decision_id = g.id
            where x.item_id = pg_temp.co('I_LI3') order by x.n desc limit 1), 'false', 'and its decision records that the ledger was not consulted');

-- 8d. Round 3 (review M-8): every item kind that names the company is refused, not only a file.
insert into public.companies (id, slug, name, nse_symbol, isin, visibility)
  values (pg_temp.co('KN'), 'kn', 'KN Ltd', 'KN', pg_temp.isin('KN'), 'public');
insert into pg_temp.ids select 'KN', public.open_idea(pg_temp.co('KN'), 'outperform', 365, true, 'Because kn');
select pg_temp.item('KN1', 'note', pg_temp.co('KN'), 'not_disclosed');
select pg_temp.item('KN2', 'learning', pg_temp.co('KN'), 'not_disclosed');
select pg_temp.item('KN3', 'process', pg_temp.co('KN'), 'not_disclosed');
select pg_temp.item('KN4', 'case_study', pg_temp.co('KN'), 'not_disclosed');
select is(pg_temp.vd('KN1') || pg_temp.lc('KN1'), 'failledger_recent_entry', 'a note that names the company is refused');
select is(pg_temp.vd('KN2') || pg_temp.lc('KN2'), 'failledger_recent_entry', 'a learning that names the company is refused');
select is(pg_temp.vd('KN3') || pg_temp.lc('KN3'), 'failledger_recent_entry', 'a process piece that names the company is refused');
select is(pg_temp.vd('KN4') || pg_temp.lc('KN4'), 'failledger_recent_entry', 'a case study that names the company is refused (its own lag is met)');

-- 8e. Round 3 (review M-8): unpublish, then republish inside the window, is refused.
insert into public.companies (id, slug, name, nse_symbol, isin, visibility)
  values (pg_temp.co('UPC'), 'upc', 'UPC Ltd', 'UPC', pg_temp.isin('UPC'), 'public');
select pg_temp.item('UP', 'thesis', pg_temp.co('UPC'), 'not_disclosed');
select is(pg_temp.vd('UP'), 'pass', 'unpublish case: the file publishes before any idea exists');
insert into pg_temp.ids select 'UPC', public.open_idea(pg_temp.co('UPC'), 'outperform', 365, true, 'Because upc');
select public.unpublish_item('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.co('I_UP'));
select is((select visibility from public.items where id = pg_temp.co('I_UP')), 'private', 'unpublish case: unpublished');
select is(pg_temp.vd('UP') || pg_temp.lc('UP'), 'failledger_recent_entry', 'unpublish case: republishing inside the window is refused');
select is((select visibility from public.items where id = pg_temp.co('I_UP')), 'private', 'unpublish case: and it stays private');

-- 8f. Round 3 (review M-6): a decision records that the ledger was consulted.
select is((select g.reasons -> 'ledger' ->> 'checked' from public.gate_decisions g
            where g.revision_id = 'b1000000-0000-4000-8000-0000000001a1' and g.verdict = 'pass' order by g.decided_at desc limit 1), 'true',
  'a PASS on a company item records reasons.ledger.checked = true');
select is((select g.reasons -> 'ledger' ->> 'checked' from public.gate_decisions g
            where g.revision_id = 'b1000000-0000-4000-8000-0000000000e5' order by g.decided_at desc limit 1), 'false',
  'a decision on an item that names no company records reasons.ledger.checked = false');
select is((select g.reasons -> 'ledger' ->> 'checked' from public.gate_decisions g
            where g.revision_id = pg_temp.co('R_MA') order by g.decided_at desc limit 1), 'true', 'and so does a refusal');

-- 8g. Round 3 (review M-2, M-3): the ledger half never aborts the gate. Fail closed on a NULL result and on an exception,
-- recorded as a decision. The two check functions are replaced for the duration and put back from their saved definitions.
create temp table saved_defs as
  select 'chain'::text as k, pg_get_functiondef('private.ledger_chain_check()'::regprocedure) as def
  union all select 'anchor', pg_get_functiondef('private.ledger_anchor_check()'::regprocedure);
create function pg_temp.put_back() returns void language plpgsql as $$
declare d text;
begin
  for d in select def from pg_temp.saved_defs loop execute d; end loop;
end $$;
insert into public.companies (id, slug, name, nse_symbol, isin, visibility)
  values (pg_temp.co('NUL'), 'nul', 'NUL Ltd', 'NUL', pg_temp.isin('NUL'), 'public');
select pg_temp.item('NU', 'thesis', pg_temp.co('NUL'), 'not_disclosed');
create or replace function private.ledger_chain_check() returns table (ok boolean, events bigint, first_bad_seq bigint, bad_idea uuid)
  language sql stable security definer set search_path = '' as $$ select null::boolean, 0::bigint, null::bigint, null::uuid $$;
select is(pg_temp.vd('NU') || pg_temp.lc('NU'), 'failledger_check_failed', 'a chain check that answers NULL refuses (fail closed)');
create or replace function private.ledger_chain_check() returns table (ok boolean, events bigint, first_bad_seq bigint, bad_idea uuid)
  language plpgsql stable security definer set search_path = '' as $$ begin raise exception 'boom' using errcode = 'XX000'; end $$;
select is(pg_temp.vd('NU') || pg_temp.lc('NU'), 'failledger_check_failed', 'a chain check that raises is recorded as a refusal, not an aborted publish');
select is((select count(*) from public.gate_decisions where item_id = pg_temp.co('I_NU')), 2::bigint, 'and both attempts left a decision row');
select pg_temp.put_back();
create or replace function private.ledger_anchor_check() returns table (ok boolean, days bigint, first_bad_date date, reason text)
  language sql stable security definer set search_path = '' as $$ select null::boolean, 0::bigint, null::date, null::text where false $$;
select is(pg_temp.vd('NU') || pg_temp.lc('NU'), 'failledger_check_failed', 'a sealed-day comparison that returns no row refuses (the NULL branch)');
select pg_temp.put_back();
select is(pg_temp.vd('NU'), 'pass', 'with both checks put back the same item passes');

-- 9. Last: an owner who backdates an event and re-seals the whole chain. A sealed day (the anchors) no longer matches the events.
select pg_temp.back('EPS', 'open', 60); select pg_temp.reseal();
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000e6', 'b1000000-0000-4000-8000-0000000000e6'), 'fail',
  'baseline for the re-seal case: the "no" is still refused (a held position)');
select is(pg_temp.last_codes('a1000000-0000-4000-8000-0000000000e6'), 'ledger_position', 'with the old entry only the position code remains (rule 4 is clear)');
select is(private.seal_ledger_days_to(pg_temp.today()) > 0, true, 'the days up to yesterday are sealed');
select pg_temp.back('EPS', 'open', 5); select pg_temp.reseal();
select is((select ok from public.verify_ledger_chain()), true, 'the owner re-sealed: the chain check alone is satisfied');
select is((select reason from public.verify_ledger_anchors()), 'count'::text, 'the sealed-day comparison catches the move into a sealed day');
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000e6', 'b1000000-0000-4000-8000-0000000000e6'), 'fail', 'and the gate refuses on it');
select is(pg_temp.last_codes('a1000000-0000-4000-8000-0000000000e6'), 'ledger_check_failed', 'with the ledger-check code');
select is(pg_temp.verdict('a1000000-0000-4000-8000-0000000000e5', 'b1000000-0000-4000-8000-0000000000e5'), 'pass',
  'an item with no company is still not touched while the ledger is failing');

select * from finish();
rollback;
