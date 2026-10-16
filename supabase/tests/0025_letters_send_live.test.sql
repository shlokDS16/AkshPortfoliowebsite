-- 20261018000025_letters_gate.sql, the two checks the letters adapter asks right before any email leaves (Phase 5c Task 11; spec
-- s9.2): letters_send_live (a claimed send of this kind, under a live lease, with exactly this broadcast id) and
-- letters_confirmation_live (an issued confirmation for this reader, at this address, issued at this time, in the last hour).
-- Nothing is sent: rows are written directly, as the postgres role, and only read back through the two functions.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into public.items (id, kind, title, learning_objective)
values ('d8000000-0000-4000-8000-000000000001', 'letter', 'A letter', 'What changed.');
insert into public.item_revisions (id, item_id, body_md, structured)
values ('e8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'A note.', '{"schema":"letter/1","entries":[]}');
-- The decision every send relies on (the insert trigger of 0024 wants a pass of this letter's revision).
insert into public.gate_decisions (id, item_id, revision_id, policy_version, verdict)
values ('c8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07-v1.2', 'pass');
-- s1 subscribers, approved; s2 subscribers, sending with no broadcast; s3 subscribers, sending with a broadcast; s4 self test,
-- sending; s5 subscribers, sending, lease run out; s6 self test, sent.
insert into public.letter_sends (id, item_id, revision_id, gate_decision_id, kind, approved_by, recipients_at_approval, status, claimed_at, broadcast_id)
values
  ('f8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001',
   'c8000000-0000-4000-8000-000000000001', 'subscribers', gen_random_uuid(), 2, 'approved', null, null),
  ('f8000000-0000-4000-8000-000000000004', 'd8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001',
   'c8000000-0000-4000-8000-000000000001', 'self_test', gen_random_uuid(), 1, 'sending', now(), null),
  ('f8000000-0000-4000-8000-000000000006', 'd8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001',
   'c8000000-0000-4000-8000-000000000001', 'self_test', gen_random_uuid(), 1, 'sending', now(), null);
update public.letter_sends set status = 'sent' where id = 'f8000000-0000-4000-8000-000000000006';
-- One subscribers send in flight at a time (0024's index), so the three subscribers cases are written one after another.

create function pg_temp.live(p_id text, p_kind text, p_bid text) returns boolean language sql as $$
  select public.letters_send_live(p_id::uuid, p_kind, p_bid) $$;

select is(pg_temp.live('f8000000-0000-4000-8000-000000000001', 'subscribers', null), false, 'an approval not yet claimed is not live');
update public.letter_sends set status = 'sending', claimed_at = now() where id = 'f8000000-0000-4000-8000-000000000001';
select is(pg_temp.live('f8000000-0000-4000-8000-000000000001', 'subscribers', null), true,
  'a claimed subscribers send with no broadcast yet is live for creating the draft');
select is(pg_temp.live('f8000000-0000-4000-8000-000000000001', 'subscribers', 'b-1'), false,
  'but not for sending a broadcast it has not recorded');
select is(pg_temp.live('f8000000-0000-4000-8000-000000000001', 'self_test', null), false, 'nor as the other kind');
update public.letter_sends set broadcast_id = 'b-1' where id = 'f8000000-0000-4000-8000-000000000001';
select is(pg_temp.live('f8000000-0000-4000-8000-000000000001', 'subscribers', 'b-1'), true, 'with its broadcast recorded: live for that broadcast');
select is(pg_temp.live('f8000000-0000-4000-8000-000000000001', 'subscribers', 'b-2'), false, 'and for no other broadcast');
select is(pg_temp.live('f8000000-0000-4000-8000-000000000001', 'subscribers', null), false, 'and no longer for creating a second draft');
update public.letter_sends set claimed_at = now() - interval '11 minutes' where id = 'f8000000-0000-4000-8000-000000000001';
select is(pg_temp.live('f8000000-0000-4000-8000-000000000001', 'subscribers', 'b-1'), false,
  'a lease older than 10 minutes is not live (the claim hands it out again)');
update public.letter_sends set claimed_at = now() where id = 'f8000000-0000-4000-8000-000000000001';
update public.letter_sends set status = 'sent' where id = 'f8000000-0000-4000-8000-000000000001';
select is(pg_temp.live('f8000000-0000-4000-8000-000000000001', 'subscribers', 'b-1'), false, 'a sent send is not live');
select is(pg_temp.live('f8000000-0000-4000-8000-000000000004', 'self_test', null), true, 'a claimed self test is live');
select is(pg_temp.live('f8000000-0000-4000-8000-000000000004', 'self_test', 'b-1'), false, 'a self test never has a broadcast');
select is(pg_temp.live('f8000000-0000-4000-8000-000000000006', 'self_test', null), false, 'a self test already sent is not live');
select is(pg_temp.live('f8000000-0000-4000-8000-0000000000ff', 'self_test', null), false, 'an unknown id is not live');
select is(public.letters_send_live(null, null, null), false, 'nulls are not live');

-- Confirmations. r1 issued now; r2 issued two hours ago; r3 waiting; r4 confirmed.
insert into public.subscribers (id, email, status, notice_version, adult, confirm_token_hash, confirm_sent_at, confirm_expires_at, confirmed_at)
values
  ('c8000000-0000-4000-8000-000000000001', 'one@readers.example', 'sent', 'letters-2026-10-v1', true, sha256('t1'::bytea),
   '2026-10-16 10:00:00.123456+00', now() + interval '7 days', null),
  ('c8000000-0000-4000-8000-000000000002', 'two@readers.example', 'sent', 'letters-2026-10-v1', true, sha256('t2'::bytea),
   now() - interval '2 hours', now() + interval '7 days', null),
  ('c8000000-0000-4000-8000-000000000003', 'three@readers.example', 'waiting', 'letters-2026-10-v1', true, null, null, null, null),
  ('c8000000-0000-4000-8000-000000000004', 'four@readers.example', 'confirmed', 'letters-2026-10-v1', true, null, null, null, now());
-- r1's issue time is pinned so the comparison can be tested to the microsecond; move it to "just now" with the same fraction.
update public.subscribers set confirm_sent_at = date_trunc('second', now()) + interval '123456 microseconds' - interval '1 second'
 where id = 'c8000000-0000-4000-8000-000000000001';
create function pg_temp.sent_at(p_id text) returns timestamptz language sql as $$
  select confirm_sent_at from public.subscribers where id = p_id::uuid $$;
create function pg_temp.conf(p_id text, p_email text, p_at timestamptz) returns boolean language sql as $$
  select public.letters_confirmation_live(p_id::uuid, p_email, p_at) $$;

select is(pg_temp.conf('c8000000-0000-4000-8000-000000000001', 'one@readers.example', pg_temp.sent_at('c8000000-0000-4000-8000-000000000001')),
  true, 'an issued confirmation is live for its reader, address and issue time');
select is(pg_temp.conf('c8000000-0000-4000-8000-000000000001', ' One@Readers.Example ', pg_temp.sent_at('c8000000-0000-4000-8000-000000000001')),
  true, 'the address is compared trimmed and in lower case');
select is(pg_temp.conf('c8000000-0000-4000-8000-000000000001', 'one@readers.example',
    date_trunc('milliseconds', pg_temp.sent_at('c8000000-0000-4000-8000-000000000001'))),
  true, 'an issue time cut to milliseconds (as a JavaScript date holds it) still matches');
select is(pg_temp.conf('c8000000-0000-4000-8000-000000000001', 'one@readers.example',
    pg_temp.sent_at('c8000000-0000-4000-8000-000000000001') + interval '5 milliseconds'), false, 'another issue time does not');
select is(pg_temp.conf('c8000000-0000-4000-8000-000000000001', 'two@readers.example', pg_temp.sent_at('c8000000-0000-4000-8000-000000000001')),
  false, 'another address does not');
select is(pg_temp.conf('c8000000-0000-4000-8000-000000000002', 'two@readers.example', pg_temp.sent_at('c8000000-0000-4000-8000-000000000002')),
  false, 'a confirmation issued more than an hour ago is not live (issue it again)');
select is(pg_temp.conf('c8000000-0000-4000-8000-000000000003', 'three@readers.example', now()), false, 'a waiting reader has nothing issued');
select is(pg_temp.conf('c8000000-0000-4000-8000-000000000004', 'four@readers.example', now()), false, 'a confirmed reader gets no confirmation');
select is(public.letters_confirmation_live(null, null, null), false, 'nulls are not live');

select ok((select bool_and(has_function_privilege('service_role', f, 'execute') and not has_function_privilege('anon', f, 'execute')
                           and not has_function_privilege('authenticated', f, 'execute'))
             from unnest(array['public.letters_send_live(uuid, text, text)',
                               'public.letters_confirmation_live(uuid, text, timestamptz)']::regprocedure[]) f),
  'both checks: service_role only');

select * from finish();
rollback;
