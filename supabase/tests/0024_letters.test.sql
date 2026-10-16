-- 20261018000024_letters.sql: the letter kind, readers with double opt-in and a consent log keyed by HMAC, the sign-up switch,
-- and who can touch what (Phase 5c Task 10; spec s8.2, s8.5; v1.2 addendum rule 13.5). The gate, approvals and sends are in
-- 0025_letters_gate.test.sql. Nothing here sends anything: a "confirmation" is a row and a token, never an email.
-- Sections: 0 structure, 1 kinds, 2 switch, 3 requests, 4 caps, 5 confirmations, 6 withdrawal and retention, 7 roles.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(93);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');
insert into public.companies (id, slug, name, visibility) values ('c6000000-0000-4000-8000-000000000001', 'let-co', 'Let Co', 'public');
insert into public.themes (id, slug, name, visibility) values ('c6100000-0000-4000-8000-000000000001', 'let-th', 'Let Theme', 'public');

create function pg_temp.n_rows() returns bigint language sql as $$ select count(*) from public.subscribers $$;
create function pg_temp.n_ev(p_event text) returns bigint language sql as $$
  select count(*) from public.subscriber_events where event = p_event $$;
create function pg_temp.st(p_email text) returns text language sql as $$
  select coalesce((select status from public.subscribers where email = p_email), 'none') $$;
create function pg_temp.hm(p_email text) returns bytea language sql as $$
  select extensions.hmac(convert_to(p_email, 'UTF8'), decode((select value from private.settings where key = 'letters_pepper'), 'hex'), 'sha256') $$;
create function pg_temp.req(p_email text) returns void language sql as $$
  select public.letters_request(p_email, 'letters-2026-10-v1', true) $$;
create function pg_temp.fill(p_n int, p_status text, p_tag text) returns void language sql as $$
  insert into public.subscribers (email, status, notice_version, adult)
  select p_tag || g || '@fill.example', p_status, 'letters-2026-10-v1', true from generate_series(1, p_n) g $$;
grant execute on function pg_temp.req(text) to public;

-- 0. Structure: a pepper, the switch absent, RLS on.
select ok((select value ~ '^[0-9a-f]{64}$' from private.settings where key = 'letters_pepper'), 'the pepper is 32 random bytes in hex');
select ok(not exists (select 1 from private.settings where key = 'letters_signup'), 'sign-up is off after the migration (key absent)');
select is(public.letters_open(), false, 'letters_open says no while the switch is absent');
select ok((select bool_and(c.relrowsecurity) from pg_class c
            where c.oid in ('public.subscribers'::regclass, 'public.subscriber_events'::regclass, 'public.letter_sends'::regclass,
                            'public.letters_signup_events'::regclass)), 'RLS is on for the four letter tables');
select is((select string_agg(a.attname, ',' order by a.attnum) from pg_attribute a
            where a.attrelid = 'public.subscribers'::regclass and a.attnum > 0 and not a.attisdropped),
  'id,email,status,requested_at,notice_version,adult,confirm_token_hash,confirm_sent_at,confirm_expires_at,confirmed_at,sends_used',
  'subscribers keeps no IP, name or user agent');

-- 1. Kinds: a letter names no company, concept or figures-to date, and stays a letter.
select lives_ok($$ insert into public.items (id, kind, title, learning_objective)
  values ('d6000000-0000-4000-8000-000000000001', 'letter', 'Letter one', 'Learn what changed.') $$, 'a letter item is accepted');
select throws_ok($$ insert into public.items (kind, title, company_id) values ('letter', 'x', 'c6000000-0000-4000-8000-000000000001') $$,
  '23514', null, 'a letter naming a company is refused');
select throws_ok($$ insert into public.items (kind, title, theme_id) values ('letter', 'x', 'c6100000-0000-4000-8000-000000000001') $$,
  '23514', null, 'a letter with a concept is refused');
select throws_ok($$ insert into public.items (kind, title, data_as_of) values ('letter', 'x', '2026-09-01') $$,
  '23514', null, 'a letter with a figures-to date is refused');
select throws_ok($$ update public.items set company_id = 'c6000000-0000-4000-8000-000000000001'
                    where id = 'd6000000-0000-4000-8000-000000000001' $$, '23514', null, 'nor can one be added later');
select throws_ok($$ update public.items set kind = 'note' where id = 'd6000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a letter cannot become another kind');
insert into public.items (id, kind, title) values ('d6000000-0000-4000-8000-000000000002', 'note', 'A note');
select throws_ok($$ update public.items set kind = 'letter' where id = 'd6000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'and another kind cannot become a letter');
select lives_ok($$ insert into public.items (kind, title) values ('video', 'v'), ('reading_note', 'r'), ('thesis', 't') $$,
  'every earlier kind is still accepted');

-- 2. The switch: off stores nothing; only the admin turns it on, and the change is logged.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok($$ select pg_temp.req('off@example.com') $$, 'anon asking while sign-up is off gets no error');
reset role;
select is(pg_temp.n_rows() + pg_temp.n_ev('requested'), 0::bigint, 'and nothing is stored');
select throws_ok($$ select public.set_letters_signup('bbbbbbbb-0000-4000-8000-000000000002', true) $$, '42501', null,
  'a non-admin actor cannot open sign-ups');
select is(public.set_letters_signup('aaaaaaaa-0000-4000-8000-000000000001', true), true, 'the admin opens sign-ups');
select is((select value from private.settings where key = 'letters_signup'), 'on', 'the switch reads on');
select is(public.letters_open(), true, 'letters_open says yes');
select is((select count(*) from public.letters_signup_events where signup_on and actor = 'aaaaaaaa-0000-4000-8000-000000000001'),
  1::bigint, 'the change is recorded with its actor');

-- 3. Requests: normalised, stored once, logged by HMAC; every refusal is silent.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok($$ select pg_temp.req('  Reader.One@Example.COM ') $$, 'anon asks to subscribe');
reset role;
select is(pg_temp.st('reader.one@example.com'), 'waiting', 'the address is stored lower case and trimmed, waiting');
select is((select notice_version || ' ' || adult from public.subscribers where email = 'reader.one@example.com'),
  'letters-2026-10-v1 true', 'with the notice version and the 18+ answer');
select is((select email_hmac from public.subscriber_events where event = 'requested'), pg_temp.hm('reader.one@example.com'),
  'the requested event holds the HMAC of the address');
select is((select count(*) from public.subscriber_events e where e::text like '%@%'), 0::bigint, 'and no event holds an address');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok($$ select pg_temp.req('not-an-email'); select pg_temp.req('a@b'); select pg_temp.req('x y@ex.com');
                   select pg_temp.req('a<b>@ex.com'); select pg_temp.req('a@b.c'); select pg_temp.req(null);
                   select public.letters_request('adult.no@example.com', 'letters-2026-10-v1', false);
                   select public.letters_request('adult.null@example.com', 'letters-2026-10-v1', null);
                   select public.letters_request('old.notice@example.com', 'letters-2026-09-v0', true);
                   select pg_temp.req('READER.ONE@example.com') $$,
  'malformed, under-age, unknown-notice and repeated requests answer the same, without an error');
reset role;
select is(pg_temp.n_rows() || ' ' || pg_temp.n_ev('requested'), '1 1', 'and none of them stored anything');
select throws_ok($$ select public.letters_request(repeat('a', 321) || '@x.co', 'letters-2026-10-v1', true) $$, '22023', null,
  'an over-long address is refused as a bad argument');
select throws_ok($$ select public.letters_request('ok@example.com', repeat('v', 65), true) $$, '22023', null,
  'so is an over-long notice version');
select throws_ok($$ select public.letters_leave(repeat('a', 321)) $$, '22023', null, 'and an over-long address to leave');
select throws_ok($$ select public.letters_confirm(repeat('t', 129)) $$, '22023', null, 'and an over-long token');

-- 4. Caps: 300 waiting, 950 confirmed (sign-up closes), 100 stored requests per IST day.
select pg_temp.fill(299, 'waiting', 'w');
select pg_temp.req('cap.waiting@example.com');
select is(pg_temp.st('cap.waiting@example.com'), 'none', 'with 300 waiting, a request stores nothing');
delete from public.subscribers where email like '%@fill.example';
select pg_temp.fill(950, 'confirmed', 'c');
select is(public.letters_open(), false, 'with 950 confirmed readers sign-up closes itself');
select pg_temp.req('cap.full@example.com');
select is(pg_temp.st('cap.full@example.com'), 'none', 'and a request stores nothing');
delete from public.subscribers where email like '%@fill.example';
select is(public.letters_open(), true, 'below 950 it is open again');
select pg_temp.req('r' || g || '@day.example') from generate_series(1, 99) g;
select is(pg_temp.n_ev('requested'), 100::bigint, 'one hundred requests are stored today');
select pg_temp.req('r100@day.example');
select is(pg_temp.st('r100@day.example') || ' ' || pg_temp.n_ev('requested'), 'none 100', 'the 101st of the IST day stores nothing');
alter table public.subscriber_events disable trigger subscriber_events_append_only;
update public.subscriber_events set at = now() - interval '1 day' where event = 'requested';
alter table public.subscriber_events enable trigger subscriber_events_append_only;
select pg_temp.req('r100@day.example');
select is(pg_temp.st('r100@day.example'), 'waiting', 'the next IST day it is stored (the count is per day)');

-- 5. Confirmations: admin only, 50 per IST day across calls, a 32-byte token stored only as its sha256, single use, 7 days.
select throws_ok($$ select * from public.letters_issue_confirmations('bbbbbbbb-0000-4000-8000-000000000002', array[]::uuid[]) $$,
  '42501', null, 'a non-admin actor cannot issue confirmations');
create temp table issued on commit drop as
  select * from public.letters_issue_confirmations('aaaaaaaa-0000-4000-8000-000000000001',
    (select array_agg(id order by email) from public.subscribers));
select is((select count(*) from issued), 50::bigint, 'one call issues at most 50');
select is((select count(*) from public.subscribers where status = 'sent'), 50::bigint, 'and marks those 50 sent');
select is(pg_temp.n_ev('sent'), 50::bigint, 'each with a sent event');
select is((select count(*) from public.letters_issue_confirmations('aaaaaaaa-0000-4000-8000-000000000001',
            (select array_agg(id) from public.subscribers where status = 'waiting'))), 0::bigint,
  'a second call the same IST day issues none (the 50 counts across calls)');
select ok((select bool_and(i.token ~ '^[A-Za-z0-9_-]{43}$') from issued i), 'each token is 32 random bytes, URL-safe');
select ok((select bool_and(s.confirm_token_hash = sha256(convert_to(i.token, 'UTF8'))) from issued i join public.subscribers s on s.id = i.id),
  'only the sha256 of each token is stored');
select is((select count(*) from issued i join public.subscribers s on s::text like '%' || i.token || '%'), 0::bigint,
  'no row holds a token in clear');
select ok((select bool_and(s.confirm_expires_at = s.confirm_sent_at + interval '7 days' and s.confirm_sent_at = i.sent_at
                           and s.email = i.email and s.sends_used = 1)
             from issued i join public.subscribers s on s.id = i.id), 'expiry is 7 days; sent_at and the address are returned');
create temp table one on commit drop as select * from issued order by email limit 3;
grant select on one to anon;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.letters_confirm('not-a-token'), false, 'a wrong token confirms nothing');
select is(public.letters_confirm(null), false, 'nor does none');
select is(public.letters_confirm((select token from one order by email limit 1)), true, 'anon confirms with the token');
select is(public.letters_confirm((select token from one order by email limit 1)), false, 'a token works once');
reset role;
select is((select status || ' ' || (confirm_token_hash is null) || ' ' || (confirmed_at is not null) from public.subscribers
            where id = (select id from one order by email limit 1)), 'confirmed true true', 'confirmed, the hash cleared');
select is(pg_temp.n_ev('confirmed'), 1::bigint, 'with a confirmed event');
update public.subscribers set confirm_expires_at = now() - interval '1 second' where id = (select id from one order by email offset 1 limit 1);
select is(public.letters_confirm((select token from one order by email offset 1 limit 1)), false, 'an expired token confirms nothing');
select is(pg_temp.st((select email from one order by email offset 1 limit 1)), 'sent', 'and the row stays sent');
select pg_temp.req((select email from one order by email offset 1 limit 1));
select is(pg_temp.st((select email from one order by email offset 1 limit 1)), 'waiting', 'asking again after expiry puts it back to waiting');
select pg_temp.req((select email from one order by email offset 2 limit 1));
select is((select status || ' ' || (confirm_token_hash is not null) from public.subscribers where id = (select id from one order by email offset 2 limit 1)),
  'sent true', 'asking again while a link is live changes nothing');
select pg_temp.req((select email from one order by email limit 1));
select is(pg_temp.st((select email from one order by email limit 1)), 'confirmed', 'nor does asking again once confirmed');
select public.letters_confirmation_failed((select id from one order by email offset 2 limit 1));
select is((select status || ' ' || (confirm_token_hash is null) || ' ' || (confirm_expires_at is null) from public.subscribers
            where id = (select id from one order by email offset 2 limit 1)), 'waiting true true', 'a failed email puts the row back to waiting');
select is(public.letters_confirm((select token from one order by email offset 2 limit 1)), false, 'and its token is dead');

-- 6. Withdrawal and retention: leave, erase, bin, purge, mark_left; only HMAC events remain. w(k) is the k-th waiting address.
create temp table w on commit drop as
  select row_number() over (order by email) as k, email from public.subscribers where status = 'waiting';
create function pg_temp.w(k int) returns text language sql security definer set search_path = '' as $$
  select email from pg_temp.w where w.k = $1 $$;
grant execute on function pg_temp.w(int) to public;
update public.subscribers set status = 'confirmed', confirmed_at = now() where email in (pg_temp.w(1), pg_temp.w(2), pg_temp.w(3));
select is((select string_agg(email, ',' order by email) from public.confirmed_subscribers()),
  (select string_agg(e, ',' order by e) from (values (pg_temp.w(1)), (pg_temp.w(2)), (pg_temp.w(3)),
                                                     ((select email from one order by email limit 1))) x(e)),
  'confirmed_subscribers lists the confirmed only');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok($$ select public.letters_leave(' ' || upper(pg_temp.w(1)) || ' ') $$, 'anon leaves');
select lives_ok($$ select public.letters_leave('never.here@example.com') $$, 'leaving an unknown address answers the same');
reset role;
select is(pg_temp.st(pg_temp.w(1)) || ' ' || pg_temp.n_ev('left'), 'none 1', 'the row is deleted at once; one left event');
select is((select count(*) from public.subscriber_events where event = 'left' and email_hmac = pg_temp.hm(pg_temp.w(1))), 1::bigint,
  'the left event is keyed by the HMAC');
select throws_ok($$ select public.letters_erase('bbbbbbbb-0000-4000-8000-000000000002', (select id from public.subscribers where email = pg_temp.w(2))) $$,
  '42501', null, 'a non-admin actor cannot erase');
select is(public.letters_erase('aaaaaaaa-0000-4000-8000-000000000001', (select id from public.subscribers where email = pg_temp.w(2))), 1,
  'the admin erases an address');
select is(pg_temp.st(pg_temp.w(2)) || ' ' || pg_temp.n_ev('erased'), 'none 1', 'gone, with an erased event');
select is(public.letters_mark_left(array[upper(pg_temp.w(3)), 'nobody@example.com']), 1, 'mark_left erases what Resend reports unsubscribed');
select is(pg_temp.st(pg_temp.w(3)) || ' ' || pg_temp.n_ev('left'), 'none 2', 'with a left event');
select throws_ok($$ select public.letters_bin('bbbbbbbb-0000-4000-8000-000000000002', array[]::uuid[]) $$, '42501', null,
  'a non-admin actor cannot bin');
select is(public.letters_bin('aaaaaaaa-0000-4000-8000-000000000001',
            array[(select id from public.subscribers where email = pg_temp.w(4)), (select id from one order by email limit 1)]), 1,
  'bin deletes waiting requests only (a confirmed address in the list stays)');
select is(pg_temp.st(pg_temp.w(4)) || ' ' || pg_temp.n_ev('binned') || ' ' || pg_temp.st((select email from one order by email limit 1)),
  'none 1 confirmed', 'with a binned event');
update public.subscribers set requested_at = now() - interval '15 days' where email = pg_temp.w(5);
update public.subscribers set requested_at = now() - interval '13 days' where email = pg_temp.w(6);
update public.subscribers set confirm_expires_at = now() - interval '1 minute'
 where id = (select id from issued where id not in (select id from one) order by email limit 1);
select is(public.letters_purge(), 2, 'purge deletes a 15-day-old request and a sent row past its expiry');
select is(pg_temp.st(pg_temp.w(5)) || ' ' || pg_temp.st(pg_temp.w(6)) || ' ' || pg_temp.n_ev('expired'), 'none waiting 2',
  'a 13-day-old request stays; two expired events');
select is((select count(*) from public.subscriber_events e where e::text like '%@%'), 0::bigint, 'no event anywhere holds an address');

-- 7. Roles: anon touches no letter table; a non-admin session reads nothing; no API role writes any of them.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select 1 from public.subscribers $$, '42501', null, 'anon cannot read subscribers');
select throws_ok($$ select 1 from public.subscriber_events $$, '42501', null, 'nor subscriber_events');
select throws_ok($$ select 1 from public.letter_sends $$, '42501', null, 'nor letter_sends');
select throws_ok($$ select 1 from public.letters_signup_events $$, '42501', null, 'nor the switch log');
select throws_ok($$ select * from public.confirmed_subscribers() $$, '42501', null, 'nor call confirmed_subscribers');
select throws_ok($$ select * from public.letters_issue_confirmations(null, null) $$, '42501', null, 'nor issue confirmations');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.subscribers) + (select count(*) from public.subscriber_events)
          + (select count(*) from public.letter_sends) + (select count(*) from public.letters_signup_events), 0::bigint,
  'a non-admin session reads no row of the four tables');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select ok((select count(*) from public.subscribers) > 0 and (select count(*) from public.subscriber_events) > 0,
  'the admin session reads readers and events');
select throws_ok($$ insert into public.subscribers (email, status, notice_version, adult) values ('x@example.com', 'confirmed', 'v', true) $$,
  '42501', null, 'the admin session cannot insert a reader directly');
select throws_ok($$ update public.subscribers set status = 'confirmed' $$, '42501', null, 'nor update one');
select throws_ok($$ delete from public.subscribers $$, '42501', null, 'nor delete one');
select throws_ok($$ insert into public.subscriber_events (event, email_hmac, notice_version) values ('confirmed', '\x00', 'v') $$,
  '42501', null, 'nor write the consent log');
select throws_ok($$ update public.letter_sends set status = 'sent' $$, '42501', null, 'nor write a send');
reset role;
set local role service_role;
select throws_ok($$ select 1 from public.subscribers $$, '42501', null, 'service_role reads no table directly (functions only)');
select throws_ok($$ insert into public.letter_sends (item_id) values (null) $$, '42501', null, 'nor writes a send directly');
reset role;
select set_config('request.jwt.claims', '', true);
select is(public.set_letters_signup('aaaaaaaa-0000-4000-8000-000000000001', false), false, 'the admin closes sign-ups');
select ok(not exists (select 1 from private.settings where key = 'letters_signup') and not public.letters_open(),
  'the key is removed (absent = off)');

select * from finish();
rollback;
