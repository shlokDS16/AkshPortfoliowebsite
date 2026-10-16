-- 20261018000025_letters_gate.sql: rule 13 in the gate (13.1-13.4, rule 4 per entry), and the approve, claim and finish doors of a
-- send (Phase 5c Task 10; spec s8.4, s8.6; v1.2 addendum rule 13). Nothing is sent: a send is a row whose status moves. Entries are
-- public items E1, E2 (learning notes), T1 (a file on LTA), T2 (a file on LTB); letter n is d7000000-...-0000000000nn.
-- Sections: 1 a clean letter, 2 rule 13.1, 3 rule 13.2, 4 rule 13.3, 5 approve, 6 claim and finish, 7 frozen, 8 structure.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(100);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.companies (id, slug, name, nse_symbol, isin, visibility) values
  (md5('LTA')::uuid, 'lta', 'LTA Ltd', 'LTA', 'INELTA000001', 'public'),
  (md5('LTB')::uuid, 'ltb', 'LTB Ltd', 'LTB', 'INELTB000001', 'public');
insert into public.subscribers (email, status, notice_version, adult, confirmed_at) values
  ('one@readers.example', 'confirmed', 'letters-2026-10-v1', true, now()),
  ('two@readers.example', 'confirmed', 'letters-2026-10-v1', true, now());

create function pg_temp.lt(n int) returns uuid language sql as $$ select ('d7000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.rv(p_item uuid, r int) returns uuid language sql as $$
  select id from public.item_revisions where item_id = p_item and rev_no = r $$;
create function pg_temp.pub(p_item uuid, r int, p_pass boolean default true) returns text language sql as $$
  select (public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001', p_item, pg_temp.rv(p_item, r), 'sebi-unreg-2026-07-v1.2',
    jsonb_build_object('passed', p_pass, 'revisionId', pg_temp.rv(p_item, r)::text, 'policyVersion', 'sebi-unreg-2026-07-v1.2'))).verdict $$;
create function pg_temp.f(p_item uuid, r int, p_key text) returns text language sql as $$
  select coalesce(string_agg(f ->> p_key, ',' order by f ->> 'code', f ->> 'message'), '')
    from (select g.reasons from public.gate_decisions g where g.revision_id = pg_temp.rv(p_item, r)
           order by g.decided_at desc, g.created_at desc limit 1) g, jsonb_array_elements(g.reasons -> 'failures') f $$;
-- An entry item, published: kind, title, objective, change reason; a file names a company and has figures to 40 days ago.
create function pg_temp.mke(p_id uuid, p_kind text, p_title text, p_co uuid default null) returns text language plpgsql as $$
begin
  insert into public.items (id, kind, title, learning_objective, company_id, holds_position, data_as_of)
  values (p_id, p_kind, p_title, 'Learn ' || p_title || '.', p_co, case when p_co is not null then 'no' end,
          case when p_co is not null then (now() at time zone 'Asia/Kolkata')::date - 40 end);
  insert into public.item_revisions (item_id, body_md, change_reason) values (p_id, 'Body of ' || p_title, 'Because ' || p_title);
  return pg_temp.pub(p_id, 1);
end $$;
-- The entry a letter copies from an item's live values (what candidates.ts builds).
create function pg_temp.en(p_id uuid) returns jsonb language sql as $$
  select jsonb_build_object('kind', i.kind, 'path', '/x/' || i.slug, 'revNo', r.rev_no, 'detail', 'Revision R' || r.rev_no,
           'revisionId', r.id, 'title', i.title, 'learningObjective', i.learning_objective, 'changeReason', r.change_reason)
         || case when i.company_id is null then '{}'::jsonb
                 else jsonb_build_object('holdsPosition', i.holds_position, 'companyName', (select c.name from public.companies c where c.id = i.company_id)) end
    from public.items i join public.item_revisions r on r.id = i.current_revision_id where i.id = p_id $$;
create function pg_temp.mkl(n int, p_entries jsonb, p_title text default null, p_body text default 'A short note.',
                            p_schema text default 'letter/1') returns void language plpgsql as $$
begin
  insert into public.items (id, kind, title, learning_objective) values (pg_temp.lt(n), 'letter', coalesce(p_title, 'Letter ' || n), 'What changed.');
  insert into public.item_revisions (item_id, body_md, structured)
  values (pg_temp.lt(n), p_body, jsonb_build_object('schema', p_schema, 'entries', p_entries));
end $$;
create function pg_temp.approve(n int, p_kind text default 'subscribers', p_actor uuid default 'aaaaaaaa-0000-4000-8000-000000000001')
returns public.letter_sends language sql as $$
  select public.approve_letter_send(p_actor, pg_temp.lt(n), (select current_revision_id from public.items where id = pg_temp.lt(n)), p_kind) $$;
create function pg_temp.sendst(n int) returns text language sql as $$
  select coalesce(string_agg(status, ',' order by approved_at, id), '') from public.letter_sends where item_id = pg_temp.lt(n) and kind = 'subscribers' $$;
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
create temp table claimed (id uuid, item_id uuid, status text) on commit drop;
create function pg_temp.claim() returns text language sql as $$
  insert into claimed select c.id, c.item_id, c.status from public.claim_letter_send() c;
  select coalesce((select status from claimed order by ctid desc limit 1), 'none') $$;
create function pg_temp.back(p_send_col text, n int, p_by interval) returns void language plpgsql as $$
begin
  alter table public.letter_sends disable trigger letter_sends_guard;
  execute format('update public.letter_sends set %I = %I - $1 where item_id = $2', p_send_col, p_send_col) using p_by, pg_temp.lt(n);
  alter table public.letter_sends enable trigger letter_sends_guard;
end $$;

select is(pg_temp.mke('e1000000-0000-4000-8000-000000000001', 'learning', 'Entry one'), 'pass', 'fixture: E1 public');
select is(pg_temp.mke('e1000000-0000-4000-8000-000000000002', 'learning', 'Entry two'), 'pass', 'fixture: E2 public');
select is(pg_temp.mke('e1000000-0000-4000-8000-000000000003', 'thesis', 'File on LTA', md5('LTA')::uuid), 'pass', 'fixture: T1 public');
select is(pg_temp.mke('e1000000-0000-4000-8000-000000000004', 'thesis', 'File on LTB', md5('LTB')::uuid), 'pass', 'fixture: T2 public');
select is(pg_temp.mke('e1000000-0000-4000-8000-000000000005', 'learning', 'Entry five'), 'pass', 'fixture: E5 public');
select is(pg_temp.mke('e1000000-0000-4000-8000-000000000006', 'learning', 'Entry six'), 'pass', 'fixture: E6 public');

-- 1. A clean letter passes and is in the archive.
select pg_temp.mkl(1, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000001'), pg_temp.en('e1000000-0000-4000-8000-000000000003')));
select is(pg_temp.pub(pg_temp.lt(1), 1), 'pass', 'a letter of two live entries passes');
select is(pg_temp.f(pg_temp.lt(1), 1, 'code'), '', 'with no failure');
select is((select count(*) from public.public_items where id = pg_temp.lt(1) and kind = 'letter'), 1::bigint, 'and is public');
select pg_temp.mkl(2, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000002')));
select is(pg_temp.pub(pg_temp.lt(2), 1), 'pass', 'fixture: letter 2 public');
select pg_temp.mkl(3, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000001')), p_title => repeat('s', 120), p_body => repeat('b', 4000));
select is(pg_temp.pub(pg_temp.lt(3), 1), 'pass', 'a 120-character subject and a 4,000-character note pass');

-- 2. Rule 13.1: subject 1..120, note at most 4,000.
select pg_temp.mkl(10, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000001')), p_title => repeat('t', 121));
select is(pg_temp.pub(pg_temp.lt(10), 1) || ' ' || pg_temp.f(pg_temp.lt(10), 1, 'code'), 'fail 13.1', 'a 121-character subject fails 13.1');
select is(pg_temp.f(pg_temp.lt(10), 1, 'rule'), '13', 'under rule 13');
select pg_temp.mkl(11, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000001')), p_body => repeat('b', 4001));
select is(pg_temp.pub(pg_temp.lt(11), 1) || ' ' || pg_temp.f(pg_temp.lt(11), 1, 'code'), 'fail 13.1', 'a 4,001-character note fails 13.1');
-- A subject that is still the desk's label is a machine text in his field (finding 3, rule 13.2's hard rule): refused by the gate.
select pg_temp.mkl(12, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000001')), p_title => 'Untitled letter, 16 Oct 2026');
select is(pg_temp.pub(pg_temp.lt(12), 1) || ' ' || pg_temp.f(pg_temp.lt(12), 1, 'code') || ' ' || pg_temp.f(pg_temp.lt(12), 1, 'message'),
  'fail 13.1 Replace the label with your own subject.', 'a subject that is still the label fails 13.1');
select pg_temp.mkl(13, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000001')), p_title => 'Untitled letters from Pune');
select is(pg_temp.pub(pg_temp.lt(13), 1), 'pass', 'a real subject that merely starts with the same words passes');
select pg_temp.mkl(14, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000001')), p_title => 'Untitled letter');
select is(pg_temp.pub(pg_temp.lt(14), 1) || ' ' || pg_temp.f(pg_temp.lt(14), 1, 'code'), 'fail 13.1', 'the bare label fails too');

-- 3. Rule 13.2: letter/1, 1..20 entries, each a live, current, public, non-letter page copied exactly.
select pg_temp.mkl(20, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000001')), p_schema => 'letter/2');
select is(pg_temp.pub(pg_temp.lt(20), 1) || ' ' || pg_temp.f(pg_temp.lt(20), 1, 'code'), 'fail 13.2', 'another schema fails 13.2');
select pg_temp.mkl(21, '[]'::jsonb);
select is(pg_temp.pub(pg_temp.lt(21), 1) || ' ' || pg_temp.f(pg_temp.lt(21), 1, 'code'), 'fail 13.2', 'no entry fails 13.2');
select pg_temp.mkl(22, (select jsonb_agg(pg_temp.en('e1000000-0000-4000-8000-000000000001')) from generate_series(1, 21)));
select is(pg_temp.pub(pg_temp.lt(22), 1) || ' ' || pg_temp.f(pg_temp.lt(22), 1, 'code'), 'fail 13.2', '21 entries fail 13.2');
select pg_temp.mkl(23, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000001') || '{"revisionId":"not-a-uuid"}'));
select is(pg_temp.pub(pg_temp.lt(23), 1) || ' ' || pg_temp.f(pg_temp.lt(23), 1, 'message'),
  'fail Entry 1 changed or is no longer public. Make the letter again.', 'an entry naming no revision fails 13.2 (and does not raise)');
insert into public.items (id, kind, title, learning_objective) values ('e1000000-0000-4000-8000-000000000009', 'learning', 'Private', 'Learn.');
insert into public.item_revisions (item_id, body_md) values ('e1000000-0000-4000-8000-000000000009', 'Not public.');
select pg_temp.mkl(24, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000002'),
  jsonb_build_object('kind', 'learning', 'revisionId', pg_temp.rv('e1000000-0000-4000-8000-000000000009', 1), 'title', 'Private',
                     'learningObjective', 'Learn.', 'changeReason', null)));
select is(pg_temp.pub(pg_temp.lt(24), 1) || ' ' || pg_temp.f(pg_temp.lt(24), 1, 'message'),
  'fail Entry 2 changed or is no longer public. Make the letter again.', 'an entry of a private item fails 13.2, naming the entry');
select pg_temp.mkl(25, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000002') || '{"changeReason":"Other words"}'));
select is(pg_temp.pub(pg_temp.lt(25), 1) || ' ' || pg_temp.f(pg_temp.lt(25), 1, 'code'), 'fail 13.2', 'a change reason not copied exactly fails');
select pg_temp.mkl(26, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000003') || '{"holdsPosition":"yes"}'));
select is(pg_temp.pub(pg_temp.lt(26), 1) || ' ' || pg_temp.f(pg_temp.lt(26), 1, 'code'), 'fail 13.2', 'a position not copied exactly fails');
select pg_temp.mkl(27, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000001') || '{"companyName":"LTA Ltd"}'));
select is(pg_temp.pub(pg_temp.lt(27), 1) || ' ' || pg_temp.f(pg_temp.lt(27), 1, 'code'), 'fail 13.2', 'a company named for a page that names none fails');
select pg_temp.mkl(28, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000002'), pg_temp.en('e1000000-0000-4000-8000-000000000002')));
select is(pg_temp.pub(pg_temp.lt(28), 1) || ' ' || pg_temp.f(pg_temp.lt(28), 1, 'message'),
  'fail Entry 2 changed or is no longer public. Make the letter again.', 'the same page twice fails on the second');
select pg_temp.mkl(29, jsonb_build_array(pg_temp.en(pg_temp.lt(1))));
select is(pg_temp.pub(pg_temp.lt(29), 1) || ' ' || pg_temp.f(pg_temp.lt(29), 1, 'code'), 'fail 13.2', 'a letter is not an entry');
select pg_temp.mkl(30, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000006')));
select public.unpublish_item('aaaaaaaa-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000006');
update public.items set title = 'Entry six, renamed' where id = 'e1000000-0000-4000-8000-000000000006';
select is(pg_temp.pub('e1000000-0000-4000-8000-000000000006', 1), 'pass', 'fixture: E6 renamed and public again');
select is(pg_temp.pub(pg_temp.lt(30), 1) || ' ' || pg_temp.f(pg_temp.lt(30), 1, 'code'), 'fail 13.2', 'an entry whose page title changed fails');
select pg_temp.mkl(31, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000005')));
insert into public.item_revisions (item_id, body_md, change_reason) values ('e1000000-0000-4000-8000-000000000005', 'Body two', 'Second');
select is(pg_temp.pub('e1000000-0000-4000-8000-000000000005', 2), 'pass', 'fixture: E5 revision 2 public');
select is(pg_temp.pub(pg_temp.lt(31), 1) || ' ' || pg_temp.f(pg_temp.lt(31), 1, 'code'), 'fail 13.2', 'an entry of a revision no longer current fails');

select pg_temp.mkl(32, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000002') || '{"path":"https://elsewhere.example/x"}'));
select is(pg_temp.pub(pg_temp.lt(32), 1) || ' ' || pg_temp.f(pg_temp.lt(32), 1, 'code'), 'fail 13.2', 'a link that is not a page of this site fails');

-- 4. Rule 13.3: rule 4 for every company an entry names (a stance change on LTB 10 IST days ago).
create temp table idea (id uuid) on commit drop;
insert into idea select public.open_idea(md5('LTB')::uuid, 'outperform', 365, false, 'Because LTB');
alter table public.idea_events disable trigger user;
update public.idea_events set recorded_at = recorded_at - interval '10 days' where idea_id = (select id from idea);
alter table public.idea_events enable trigger user;
select pg_temp.reseal();
select is((select (now() at time zone 'Asia/Kolkata')::date - (recorded_at at time zone 'Asia/Kolkata')::date from public.idea_events
            where idea_id = (select id from idea)), 10, 'fixture: the open entry on LTB is 10 IST days old, sealed');
select pg_temp.mkl(40, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000001'), pg_temp.en('e1000000-0000-4000-8000-000000000004')));
select is(pg_temp.pub(pg_temp.lt(40), 1), 'fail', 'an entry naming a company with a stance change 10 days ago fails');
select is(pg_temp.f(pg_temp.lt(40), 1, 'rule') || ' ' || pg_temp.f(pg_temp.lt(40), 1, 'code'), '4 13.3', 'under rule 4, code 13.3');
select ok(pg_temp.f(pg_temp.lt(40), 1, 'message') like 'Entry 2: The ledger has an entry on this company from the last 30 days.%',
  'naming the entry');
select is(pg_temp.f(pg_temp.lt(40), 1, 'entry') || ' ' || pg_temp.f(pg_temp.lt(40), 1, 'ledgerCode'), '2 ledger_recent_entry', 'with the entry number and the ledger code');
select is((select count(*) from public.public_items where id = 'e1000000-0000-4000-8000-000000000004'), 1::bigint,
  'the file itself stays public (rule 4 never unpublishes)');

-- 5. Approve: admin, a letter, its current public revision, a pass under the current policy, one send in flight.
select throws_ok($$ select pg_temp.approve(1, 'subscribers', 'bbbbbbbb-0000-4000-8000-000000000002') $$, '42501', null, 'a non-admin actor is refused');
select throws_ok($$ select public.approve_letter_send('aaaaaaaa-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003',
  pg_temp.rv('e1000000-0000-4000-8000-000000000003', 1), 'subscribers') $$, '55000', 'This is not a letter.', 'a file is not a letter');
select throws_ok($$ select pg_temp.approve(1, 'everyone') $$, '22023', null, 'an unknown kind is refused');
insert into public.item_revisions (item_id, body_md, structured) select pg_temp.lt(2), 'Second draft', structured
  from public.item_revisions where id = pg_temp.rv(pg_temp.lt(2), 1);
select throws_ok($$ select public.approve_letter_send('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.lt(2), pg_temp.rv(pg_temp.lt(2), 2), 'subscribers') $$,
  '55000', 'Approve the letter''s current public revision.', 'a revision that is not current is refused');
select throws_ok($$ select pg_temp.approve(10) $$, '55000', null, 'a letter that never passed is refused');
select pg_temp.mkl(50, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000003')));
select is(pg_temp.pub(pg_temp.lt(50), 1) || pg_temp.pub(pg_temp.lt(50), 1, false), 'passfail', 'fixture: letter 50 passed, then a later decision failed');
select throws_ok($$ select pg_temp.approve(50) $$, '55000',
  'The letter''s last gate decision is not a pass under the current policy. Publish it again.', 'a failed latest decision is refused');
select pg_temp.mkl(51, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000003')));
select is(pg_temp.pub(pg_temp.lt(51), 1), 'pass', 'fixture: letter 51 passed');
insert into public.gate_decisions (item_id, revision_id, policy_version, verdict, decided_at)
  values (pg_temp.lt(51), pg_temp.rv(pg_temp.lt(51), 1), 'sebi-unreg-2026-07-v1.1', 'pass', now() + interval '1 second');
select throws_ok($$ select pg_temp.approve(51) $$, '55000', null, 'a latest pass under an old policy is refused');
select is((pg_temp.approve(1)).status, 'approved', 'the admin approves a send of a clean public letter');
select ok((select recipients_at_approval = 2 and approved_by = 'aaaaaaaa-0000-4000-8000-000000000001'
                  and gate_decision_id = (select g.id from public.gate_decisions g where g.revision_id = pg_temp.rv(pg_temp.lt(1), 1) and g.verdict = 'pass')
             from public.letter_sends where item_id = pg_temp.lt(1)), 'the row records the readers, the actor and the pass it relies on');
select throws_ok($$ select pg_temp.approve(1) $$, '55000', null, 'a second send of the same letter is refused');
select throws_ok($$ select pg_temp.approve(3) $$, '55000', 'Another letter is being sent. Wait until it has gone.', 'a send while another is approved is refused');
select is((select count(*) from (select pg_temp.approve(3, 'self_test') from generate_series(1, 5)) x), 5::bigint, 'five test copies a day are allowed');
select throws_ok($$ select pg_temp.approve(3, 'self_test') $$, '55000', null, 'the sixth is refused');
select is((select recipients_at_approval from public.letter_sends where item_id = pg_temp.lt(3) limit 1), 1, 'a test copy has one recipient');
update public.letter_sends set status = 'cancelled' where kind = 'self_test';

-- 6. Claim and finish: expire after 24 h, re-check at claim, sending -> sent, a stale worker's send handed out again.
select pg_temp.back('approved_at', 1, interval '25 hours');
select is(pg_temp.claim(), 'none', 'claim finds nothing to send when the only approval is 25 hours old');
select is(pg_temp.sendst(1), 'expired', 'and marks it expired');
select is((pg_temp.approve(3)).status, 'approved', 'another letter can now be approved');
select public.unpublish_item('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.lt(3));
select is(pg_temp.claim(), 'none', 'claim sends nothing for a letter unpublished after approval');
select is((select status || ': ' || problem from public.letter_sends where item_id = pg_temp.lt(3) and kind = 'subscribers'),
  'failed: The letter changed after you approved it.', 'it fails the send, in plain words');
select is((pg_temp.approve(1)).status, 'approved', 'the expired letter is approved again');
select is(pg_temp.claim(), 'sending', 'claim takes it');
select is(pg_temp.claim(), 'none', 'a second claim finds nothing (one worker per send)');
select is((select (claimed_at is not null)::text from public.letter_sends where item_id = pg_temp.lt(1) and status = 'sending'), 'true', 'claimed_at is set');
select pg_temp.back('claimed_at', 1, interval '11 minutes');
select is(pg_temp.claim(), 'sending', 'a send whose worker stopped 11 minutes ago is handed out again');
select is((public.finish_letter_send((select id from public.letter_sends where item_id = pg_temp.lt(1) and status = 'sending'),
             'sending', 'bc_123', null, null)).broadcast_id, 'bc_123', 'the broadcast id is recorded while sending');
select is((public.finish_letter_send((select id from public.letter_sends where item_id = pg_temp.lt(1) and status = 'sending'),
             'sent', null, 2, null)).status, 'sent', 'then the send is recorded sent');
select is((select broadcast_id || ' ' || recipients_sent || ' ' || (sent_at is not null) from public.letter_sends where item_id = pg_temp.lt(1) and status = 'sent'),
  'bc_123 2 true', 'with its broadcast, count and time');
select throws_ok($$ select public.finish_letter_send((select id from public.letter_sends where item_id = pg_temp.lt(1) and status = 'sent'), 'failed', null, null, 'x') $$,
  '55000', null, 'a sent send cannot be finished again');
select throws_ok($$ update public.letter_sends set status = 'approved' where item_id = pg_temp.lt(1) and status = 'sent' $$, '23514', null,
  'status never goes back');
select throws_ok($$ update public.letter_sends set approved_by = 'bbbbbbbb-0000-4000-8000-000000000002' where item_id = pg_temp.lt(1) $$, '23514', null,
  'what was approved never changes');
select throws_ok($$ delete from public.letter_sends where item_id = pg_temp.lt(1) $$, 'P0001', null, 'a send is never deleted');
select is((pg_temp.approve(2)).status, 'approved', 'fixture: letter 2 approved');
select is(pg_temp.claim(), 'sending', 'and claimed');
select is((public.finish_letter_send((select id from public.letter_sends where item_id = pg_temp.lt(2) and status = 'sending'),
             'failed', null, null, E'Resend said\nno ' || repeat('x', 300))).problem, 'Resend said no ' || repeat('x', 145),
  'a failure keeps Resend''s words, one line, at most 160 characters');

-- 6b. Cancel: an approval is withdrawn before it is claimed, and only then.
select is((pg_temp.approve(2)).status, 'approved', 'fixture: letter 2 is approved again after its failed send');
select throws_ok($$ select public.cancel_letter_send('bbbbbbbb-0000-4000-8000-000000000002', (select id from public.letter_sends where item_id = pg_temp.lt(2) and status = 'approved')) $$,
  '42501', null, 'a non-admin actor cannot cancel a send');
select is((public.cancel_letter_send('aaaaaaaa-0000-4000-8000-000000000001', (select id from public.letter_sends where item_id = pg_temp.lt(2) and status = 'approved'))).status,
  'cancelled', 'the admin cancels a send that is still waiting');
select throws_ok($$ select public.cancel_letter_send('aaaaaaaa-0000-4000-8000-000000000001', (select id from public.letter_sends where item_id = pg_temp.lt(2) and status = 'cancelled')) $$,
  '55000', 'Only a send that is still waiting can be cancelled.', 'a cancelled send cannot be cancelled again (nor a sent or a sending one)');
select throws_ok($$ select public.cancel_letter_send('aaaaaaaa-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000009') $$,
  'P0002', 'This send could not be found.', 'an unknown send is not found');
select is(pg_temp.claim(), 'none', 'a cancelled send is never claimed');

-- 7. Frozen: a letter sent to subscribers takes no new revision and no other revision can be published (13.4).
select throws_ok($$ insert into public.item_revisions (item_id, body_md) values (pg_temp.lt(1), 'A fix after sending') $$, '23514', null,
  'a sent letter takes no new revision');
select is(pg_temp.pub(pg_temp.lt(2), 2) || ' ' || pg_temp.f(pg_temp.lt(2), 2, 'code'), 'pass ', 'a letter whose send failed can still change');
select lives_ok($$ select public.unpublish_item('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.lt(1)) $$, 'a sent letter can be unpublished');

-- 7b. A broadcast that was made cannot be made again (finding 1): a send that failed with a broadcast id may have gone out.
select pg_temp.mkl(52, jsonb_build_array(pg_temp.en('e1000000-0000-4000-8000-000000000001')));
select is(pg_temp.pub(pg_temp.lt(52), 1), 'pass', 'fixture: letter 52 public');
select is((pg_temp.approve(52)).status, 'approved', 'fixture: letter 52 approved');
select is(pg_temp.claim(), 'sending', 'and claimed');
select is((public.finish_letter_send((select id from public.letter_sends where item_id = pg_temp.lt(52) and status = 'sending'), 'sending', 'bc_52', null, null)).broadcast_id,
  'bc_52', 'its broadcast id is recorded');
select is((public.finish_letter_send((select id from public.letter_sends where item_id = pg_temp.lt(52) and status = 'sending'), 'failed', null, null, 'Resend was down')).status,
  'failed', 'and the send is then recorded failed');
select throws_ok($$ select pg_temp.approve(52) $$, '55000',
  'A broadcast was already made for this letter. Check it in Resend; to send again, make a new letter.',
  'a new subscribers approval is refused once an earlier send of the letter has a broadcast id');
select throws_ok($$ insert into public.item_revisions (item_id, body_md) values (pg_temp.lt(52), 'A fix after a failed send') $$, '23514', null,
  'a letter whose failed send has a broadcast id takes no new revision');
select ok(private.letter_gate_failures(pg_temp.lt(52), pg_temp.rv(pg_temp.lt(2), 1), '{}'::jsonb) @> '[{"code":"13.4"}]'::jsonb,
  'and rule 13.4 treats that failed send as possibly sent');
select ok(not (private.letter_gate_failures(pg_temp.lt(2), pg_temp.rv(pg_temp.lt(2), 1), '{}'::jsonb) @> '[{"code":"13.4"}]'::jsonb),
  'while a send that failed with no broadcast does not freeze its letter');

-- 7c. The audit row's decision must exist, be this letter's revision and be a pass (finding 7; no foreign key, a trigger).
select throws_ok($$ insert into public.letter_sends (item_id, revision_id, gate_decision_id, kind, approved_by, recipients_at_approval)
  values (pg_temp.lt(1), pg_temp.rv(pg_temp.lt(1), 1), gen_random_uuid(), 'self_test', 'aaaaaaaa-0000-4000-8000-000000000001', 1) $$,
  '23503', null, 'a send naming a decision that does not exist is refused');
select throws_ok($$ insert into public.letter_sends (item_id, revision_id, gate_decision_id, kind, approved_by, recipients_at_approval)
  values (pg_temp.lt(1), pg_temp.rv(pg_temp.lt(1), 1),
          (select g.id from public.gate_decisions g where g.revision_id = pg_temp.rv(pg_temp.lt(50), 1) and g.verdict = 'fail'), 'self_test',
          'aaaaaaaa-0000-4000-8000-000000000001', 1) $$,
  '23503', null, 'a send naming a decision of another revision (here a failure) is refused');
select throws_ok($$ insert into public.letter_sends (item_id, revision_id, gate_decision_id, kind, approved_by, recipients_at_approval)
  values (pg_temp.lt(50), pg_temp.rv(pg_temp.lt(50), 1),
          (select g.id from public.gate_decisions g where g.revision_id = pg_temp.rv(pg_temp.lt(50), 1) and g.verdict = 'fail'), 'self_test',
          'aaaaaaaa-0000-4000-8000-000000000001', 1) $$,
  '23503', null, 'a send naming a failed decision of its own revision is refused');
select lives_ok($$ insert into public.letter_sends (item_id, revision_id, gate_decision_id, kind, approved_by, recipients_at_approval)
  values (pg_temp.lt(1), pg_temp.rv(pg_temp.lt(1), 1),
          (select g.id from public.gate_decisions g where g.revision_id = pg_temp.rv(pg_temp.lt(1), 1) and g.verdict = 'pass' limit 1), 'self_test',
          'aaaaaaaa-0000-4000-8000-000000000001', 1) $$, 'a send naming this revision''s pass is accepted');

-- 8. Structure and privileges.
select is(private.gate_policy(), 'sebi-unreg-2026-07-v1.2', 'gate_policy reads the policy publish_revision pins');
select is(private.distribution_gate_failures(pg_temp.lt(1), 'thesis', null, null, pg_temp.rv(pg_temp.lt(1), 1), '{"schema":"letter/1"}', '{}'),
  '[]'::jsonb, 'the helper returns nothing for another kind');
select ok(pg_get_functiondef('private.distribution_gate_failures(uuid, text, uuid, date, uuid, jsonb, jsonb)'::regprocedure)
            ~ 'from public\.video_sources[^;]*for share'
      and pg_get_functiondef('private.distribution_gate_failures(uuid, text, uuid, date, uuid, jsonb, jsonb)'::regprocedure) ~ 'private\.letter_gate_failures',
  'the helper keeps the video branch and calls the letter branch');
select is_empty($$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname in ('approve_letter_send', 'claim_letter_send', 'finish_letter_send', 'cancel_letter_send', 'letter_gate_failures', 'letter_send_check',
                       'gate_policy', 'expire_letter_sends')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or (n.nspname = 'private' and has_function_privilege('service_role', p.oid, 'execute')))
$$, 'the send doors are service_role only and the private helpers no API role');

select * from finish();
rollback;
