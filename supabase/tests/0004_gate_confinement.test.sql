-- 20261007000004_hardening.sql, I1 (ADR-003): publish_revision, unpublish_item and lint-allowance writes are
-- reachable only by service_role (the server action, after requireAdmin()), with the verified admin as p_actor.
-- An admin's own session token can no longer publish, unpublish or allow a sentence.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(41);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'stranger@pgtap.test');

insert into public.items (id, kind, title, learning_objective) values
  ('d1000000-0000-4000-8000-000000000001', 'learning', 'Confined item', 'Learn.'),
  ('d2000000-0000-4000-8000-000000000002', 'learning', 'Allowance item', 'Learn.');
insert into public.item_revisions (id, item_id, body_md) values
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'v1'),
  ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'v1');
insert into public.lint_allowances (item_id, sentence_hash, reason) values
  ('d1000000-0000-4000-8000-000000000001', repeat('f', 64), 'fixture');

-- A lint result in the shape lintText() produces (rules.ts LintResult).
create function public.test_lint(p_rev uuid, p_policy text, p_passed boolean, p_findings jsonb default '[]')
returns jsonb language sql immutable
as $$ select jsonb_build_object('passed', p_passed, 'revisionId', p_rev::text, 'policyVersion', p_policy,
                                'findings', p_findings, 'allowedBy', '[]'::jsonb) $$;
grant execute on function public.test_lint(uuid, text, boolean, jsonb) to authenticated, service_role;

-- Signatures: the session-callable ones are gone; the new ones are definer with an empty search_path.
select hasnt_function('public', 'publish_revision', array['uuid', 'uuid', 'text', 'jsonb'],
  'the old publish_revision(item, revision, policy, lint) signature is dropped');
select hasnt_function('public', 'unpublish_item', array['uuid'], 'the old unpublish_item(item) signature is dropped');
select is_definer('public', 'publish_revision', array['uuid', 'uuid', 'uuid', 'text', 'jsonb'],
  'publish_revision(actor, item, revision, policy, lint) is SECURITY DEFINER');
select is_definer('public', 'unpublish_item', array['uuid', 'uuid'], 'unpublish_item(actor, item) is SECURITY DEFINER');
select is_definer('public', 'add_lint_allowance', array['uuid', 'uuid', 'text', 'text'], 'add_lint_allowance is SECURITY DEFINER');
select is_definer('public', 'remove_lint_allowance', array['uuid', 'uuid', 'text'], 'remove_lint_allowance is SECURITY DEFINER');

-- Privileges: service_role only, for all four.
select ok(has_function_privilege('service_role', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute'),
  'publish_revision is executable by service_role only');
select ok(has_function_privilege('service_role', 'public.unpublish_item(uuid, uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.unpublish_item(uuid, uuid)', 'execute')
      and not has_function_privilege('anon', 'public.unpublish_item(uuid, uuid)', 'execute'),
  'unpublish_item is executable by service_role only');
select ok(has_function_privilege('service_role', 'public.add_lint_allowance(uuid, uuid, text, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.add_lint_allowance(uuid, uuid, text, text)', 'execute')
      and not has_function_privilege('anon', 'public.add_lint_allowance(uuid, uuid, text, text)', 'execute'),
  'add_lint_allowance is executable by service_role only');
select ok(has_function_privilege('service_role', 'public.remove_lint_allowance(uuid, uuid, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.remove_lint_allowance(uuid, uuid, text)', 'execute')
      and not has_function_privilege('anon', 'public.remove_lint_allowance(uuid, uuid, text)', 'execute'),
  'remove_lint_allowance is executable by service_role only');
select ok(not has_table_privilege('authenticated', 'public.lint_allowances', 'insert')
      and not has_table_privilege('authenticated', 'public.lint_allowances', 'update')
      and not has_table_privilege('authenticated', 'public.lint_allowances', 'delete')
      and has_table_privilege('authenticated', 'public.lint_allowances', 'select'),
  'authenticated keeps SELECT on lint_allowances and nothing else');
select is_empty($$ select 1 from pg_proc p where p.oid = 'private.is_admin_user(uuid)'::regprocedure
                    and (has_function_privilege('anon', p.oid, 'execute')
                      or has_function_privilege('authenticated', p.oid, 'execute')
                      or has_function_privilege('service_role', p.oid, 'execute')) $$,
  'private.is_admin_user is not executable by any API role');

-- Behaviour: the admin's own session (what a stolen access token gives) is refused everywhere.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07',
    public.test_lint('e1000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07', true)) $$,
  '42501', null, 'an authenticated admin session cannot execute publish_revision, even naming itself');
select throws_ok($$ select public.unpublish_item('aaaaaaaa-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'an authenticated admin session cannot execute unpublish_item');
select throws_ok($$ select public.add_lint_allowance('aaaaaaaa-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001', repeat('a', 64), 'sneaky') $$,
  '42501', null, 'an authenticated admin session cannot execute add_lint_allowance');
select throws_ok($$ select public.remove_lint_allowance('aaaaaaaa-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001', repeat('f', 64)) $$,
  '42501', null, 'an authenticated admin session cannot execute remove_lint_allowance');
select throws_ok($$ insert into public.lint_allowances (item_id, sentence_hash, reason)
    values ('d1000000-0000-4000-8000-000000000001', repeat('a', 64), 'sneaky') $$,
  '42501', null, 'an authenticated admin session cannot INSERT into lint_allowances');
select throws_ok($$ delete from public.lint_allowances where true $$,
  '42501', null, 'an authenticated admin session cannot DELETE from lint_allowances');
select is((select count(*) from public.lint_allowances), 1::bigint, 'the admin session still reads allowances');
reset role;

-- service_role: the actor must be an admin, and the policy version is pinned.
set local role service_role;
select throws_ok($$ select public.publish_revision('bbbbbbbb-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07',
    public.test_lint('e1000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07', true)) $$,
  '42501', null, 'a non-admin actor cannot publish');
select throws_ok($$ select public.publish_revision(null, 'd1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07',
    public.test_lint('e1000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07', true)) $$,
  '42501', null, 'a null actor cannot publish');
select throws_ok($$ select public.unpublish_item('bbbbbbbb-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'a non-admin actor cannot unpublish');
select is((select verdict from public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'pol-1',
    public.test_lint('e1000000-0000-4000-8000-000000000001', 'pol-1', true))),
  'fail', 'a self-consistent lint under any policy version but the pinned one fails');
select is((select verdict from public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07',
    public.test_lint('e1000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07', true))),
  'pass', 'service_role with a verified admin actor and the pinned policy publishes');
reset role;
select ok((select reasons -> 'failures' @> '[{"rule":"policy"}]'::jsonb from public.gate_decisions
            where revision_id = 'e1000000-0000-4000-8000-000000000001' and verdict = 'fail'),
  'the wrong policy version is recorded as a policy failure');
select results_eq($$ select visibility, status from public.items where id = 'd1000000-0000-4000-8000-000000000001' $$,
  $$ values ('public'::text, 'published'::text) $$, 'the publish guard still honours the gate opened by the owner');
set local role service_role;
select is(public.unpublish_item('aaaaaaaa-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001'),
  'confined-item-d10000', 'service_role with an admin actor unpublishes and gets the slug back');
select throws_ok($$ select public.unpublish_item('aaaaaaaa-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-00000000000f') $$,
  'P0002', null, 'an unknown item still raises');

-- Allowances: only a rule 1 sentence flagged by the latest decision, on the latest revision.
-- d2's gate fails with rule 1 findings (hashes 1 and 4) and a rule 2 finding (hash 2).
select is((select verdict from public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07',
    public.test_lint('e2000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07', false, jsonb_build_array(
      jsonb_build_object('rule', '1', 'sentenceHash', repeat('1', 64)),
      jsonb_build_object('rule', '1', 'sentenceHash', repeat('4', 64)),
      jsonb_build_object('rule', '2', 'sentenceHash', repeat('2', 64)))))),
  'fail', 'precondition: the gate flags sentences on d2');
select throws_ok($$ select public.add_lint_allowance('bbbbbbbb-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002', repeat('1', 64), 'Quoting a regulator.') $$,
  '42501', null, 'a non-admin actor cannot add an allowance');
select is(public.add_lint_allowance('aaaaaaaa-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000002', repeat('3', 64), 'Never flagged.'),
  false, 'a sentence the gate never flagged is refused');
select is(public.add_lint_allowance('aaaaaaaa-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000002', repeat('2', 64), 'Rule 2 sentence.'),
  false, 'a rule 2 finding cannot be allowed (allowances are rule 1 only)');
select is(public.add_lint_allowance('aaaaaaaa-0000-4000-8000-000000000001',
    'ffffffff-0000-4000-8000-00000000000f', repeat('1', 64), 'Unknown item.'),
  false, 'an unknown item is refused');
select is(public.add_lint_allowance('aaaaaaaa-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000002', repeat('1', 64), 'Quoting a regulator.'),
  true, 'a rule 1 sentence flagged by the latest decision of the latest revision is allowed');
select is(public.add_lint_allowance('aaaaaaaa-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000002', repeat('1', 64), 'Second reason.'),
  true, 'repeating an allowance is harmless');
reset role;
select results_eq($$ select sentence_hash, reason from public.lint_allowances
                      where item_id = 'd2000000-0000-4000-8000-000000000002' $$,
  $$ values (repeat('1', 64), 'Quoting a regulator.'::text) $$, 'one row, with the first reason kept');
-- A newer revision makes the recorded decision stale: its flags no longer qualify.
insert into public.item_revisions (id, item_id, body_md) values
  ('e2000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'v2');
set local role service_role;
select is(public.add_lint_allowance('aaaaaaaa-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000002', repeat('4', 64), 'Stale flag.'),
  false, 'a sentence flagged on an older revision is refused');
select throws_ok($$ select public.remove_lint_allowance('bbbbbbbb-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002', repeat('1', 64)) $$,
  '42501', null, 'a non-admin actor cannot remove an allowance');
select is(public.remove_lint_allowance('aaaaaaaa-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000002', repeat('1', 64)), true, 'an admin actor removes an allowance');
select is(public.remove_lint_allowance('aaaaaaaa-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000002', repeat('1', 64)), false, 'removing it again finds nothing');
reset role;
select is((select count(*) from public.lint_allowances where item_id = 'd2000000-0000-4000-8000-000000000002'),
  0::bigint, 'the allowance is gone');

select * from finish();
rollback;
