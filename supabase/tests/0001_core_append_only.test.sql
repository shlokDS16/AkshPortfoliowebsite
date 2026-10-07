-- Append-only history: revisions, gate decisions, captures; revision numbering; current revision.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test');

-- The admin writes revisions through RLS.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$
  insert into public.items (id, kind, title) values
    ('dddddddd-0000-4000-8000-000000000001', 'note', 'First'),
    ('dddddddd-0000-4000-8000-000000000002', 'note', 'Second')
$$, 'admin can create items');
select results_eq($$
  insert into public.item_revisions (item_id, body_md)
  values ('dddddddd-0000-4000-8000-000000000001', 'first') returning rev_no
$$, array[1], 'first revision gets rev_no 1');
select results_eq($$
  insert into public.item_revisions (item_id, body_md)
  values ('dddddddd-0000-4000-8000-000000000001', 'second') returning rev_no
$$, array[2], 'the next revision gets rev_no 2');
select results_eq($$
  insert into public.item_revisions (item_id, body_md, rev_no)
  values ('dddddddd-0000-4000-8000-000000000001', 'third', 99) returning rev_no
$$, array[3], 'a caller-supplied rev_no is overwritten by the trigger');
select results_eq($$
  insert into public.item_revisions (id, item_id, body_md)
  values ('99999999-0000-4000-8000-000000000009', 'dddddddd-0000-4000-8000-000000000002', 'other item') returning rev_no
$$, array[1], 'numbering restarts at 1 for another item');
select throws_ok($$
  update public.item_revisions set body_md = 'edited'
  where item_id = 'dddddddd-0000-4000-8000-000000000001'
$$, '42501', null, 'admin cannot update a revision (no grant)');
select throws_ok($$
  delete from public.item_revisions where item_id = 'dddddddd-0000-4000-8000-000000000001'
$$, '42501', null, 'admin cannot delete a revision (no grant)');
select throws_ok($$
  insert into public.gate_decisions (item_id, revision_id, policy_version, verdict)
  select item_id, id, 'x', 'pass' from public.item_revisions limit 1
$$, '42501', null, 'admin cannot forge a gate decision (no grant)');

-- current_revision_id must point at a revision of the same item.
select throws_ok($$
  update public.items set current_revision_id = '99999999-0000-4000-8000-000000000009'
  where id = 'dddddddd-0000-4000-8000-000000000001'
$$, '23514', null, 'current_revision_id of another item is rejected');
select lives_ok($$
  update public.items
     set current_revision_id = (select id from public.item_revisions
                                 where item_id = 'dddddddd-0000-4000-8000-000000000001' and rev_no = 2)
   where id = 'dddddddd-0000-4000-8000-000000000001'
$$, 'current_revision_id of the same item is accepted');

-- Captures: stored verbatim, idempotent by client_id, never deleted.
select lives_ok($$ insert into public.captures (raw_text, client_id)
  values ('$TCS deal wins slowing', 'cafecafe-0000-4000-8000-000000000001') $$,
  'admin can log a capture');
select throws_ok($$ insert into public.captures (raw_text, client_id)
  values ('retry of the same capture', 'cafecafe-0000-4000-8000-000000000001') $$,
  '23505', null, 'a repeated client_id is rejected, so retries are idempotent');
select throws_ok($$ update public.captures set raw_text = 'rewritten' where true $$,
  'P0001', null, 'capture raw_text is immutable');
select lives_ok($$ update public.captures set parsed = '{"ok":true}'::jsonb where true $$,
  'other capture columns can still be updated');
select throws_ok($$ delete from public.captures where true $$,
  '42501', null, 'captures are never deleted (no grant)');

-- Even the table owner cannot rewrite history.
reset role;
select throws_ok($$ update public.item_revisions set body_md = 'x' where true $$,
  'P0001', null, 'append-only trigger blocks UPDATE of revisions for the owner');
select throws_ok($$ delete from public.item_revisions where true $$,
  'P0001', null, 'append-only trigger blocks DELETE of revisions for the owner');
-- CASCADE also reaches gate_decisions, so assert the item_revisions-specific message.
select throws_ok($$ truncate public.item_revisions cascade $$,
  'P0001', 'item_revisions is append-only: TRUNCATE is not allowed',
  'append-only trigger blocks TRUNCATE of revisions');
select has_trigger('public', 'item_revisions', 'item_revisions_no_truncate',
  'item_revisions has its own TRUNCATE trigger');
select throws_ok($$ delete from public.captures where true $$,
  'P0001', 'captures are never deleted: DELETE is not allowed',
  'trigger blocks deleting captures for the owner, with the captures message');
select throws_ok($$ truncate public.captures $$,
  'P0001', 'captures are never deleted: TRUNCATE is not allowed',
  'trigger blocks TRUNCATE of captures');
select has_trigger('public', 'captures', 'captures_no_truncate',
  'captures has its own TRUNCATE trigger');

insert into public.gate_decisions (id, item_id, revision_id, policy_version, verdict) values
  ('77777777-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001',
   (select id from public.item_revisions where item_id = 'dddddddd-0000-4000-8000-000000000001' and rev_no = 1),
   'test', 'pass');
select throws_ok($$ update public.gate_decisions set verdict = 'fail' where true $$,
  'P0001', null, 'append-only trigger blocks UPDATE of gate decisions');
select throws_ok($$ delete from public.gate_decisions where true $$,
  'P0001', null, 'append-only trigger blocks DELETE of gate decisions');
select throws_ok($$ truncate public.gate_decisions $$,
  'P0001', 'gate_decisions is append-only: TRUNCATE is not allowed',
  'append-only trigger blocks TRUNCATE of gate decisions');
select has_trigger('public', 'gate_decisions', 'gate_decisions_no_truncate',
  'gate_decisions has its own TRUNCATE trigger');

-- Nothing above changed the data.
select is((select count(*) from public.item_revisions), 4::bigint, 'all four revisions are still there');
select is((select body_md from public.item_revisions
            where item_id = 'dddddddd-0000-4000-8000-000000000001' and rev_no = 1),
  'first', 'revision text is unchanged');
select is((select raw_text from public.captures limit 1), '$TCS deal wins slowing',
  'capture text is unchanged');
select is((select count(*) from public.gate_decisions), 1::bigint, 'the gate decision is still there');

select * from finish();
rollback;
