-- Function exposure: EXECUTE is closed by default and opened only for a short allowlist.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- publish_revision / unpublish_item / add_ and remove_lint_allowance: service_role only (ADR-003). The server
-- action verifies the admin, then calls them through the service client with the admin as p_actor.
select ok(not has_function_privilege('anon', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute'),
  'anon cannot execute publish_revision');
select ok(not has_function_privilege('authenticated', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute'),
  'authenticated (an admin access token on its own) cannot execute publish_revision');
select ok(has_function_privilege('service_role', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute'),
  'service_role (the compliance gate RPC file) can execute publish_revision');
select ok(not has_function_privilege('anon', 'public.unpublish_item(uuid, uuid)', 'execute'),
  'anon cannot execute unpublish_item');
select ok(not has_function_privilege('authenticated', 'public.unpublish_item(uuid, uuid)', 'execute'),
  'authenticated cannot execute unpublish_item');
select ok(has_function_privilege('service_role', 'public.unpublish_item(uuid, uuid)', 'execute'),
  'service_role can execute unpublish_item');
select ok(has_function_privilege('service_role', 'public.add_lint_allowance(uuid, uuid, text, text)', 'execute')
      and has_function_privilege('service_role', 'public.remove_lint_allowance(uuid, uuid, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.add_lint_allowance(uuid, uuid, text, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.remove_lint_allowance(uuid, uuid, text)', 'execute')
      and not has_function_privilege('anon', 'public.add_lint_allowance(uuid, uuid, text, text)', 'execute')
      and not has_function_privilege('anon', 'public.remove_lint_allowance(uuid, uuid, text)', 'execute'),
  'the lint-allowance writers are executable by service_role only');
select ok(has_function_privilege('anon', 'public.heartbeat_ages()', 'execute')
      and not has_function_privilege('authenticated', 'public.heartbeat_ages()', 'execute')
      and not has_function_privilege('service_role', 'public.heartbeat_ages()', 'execute'),
  'heartbeat_ages is granted to anon (the public health route) and to no other API role');

-- The allowlist: anything else in public is closed.
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
     and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
         not in ('heartbeat_ages()', 'capture_days(p_days integer)', 'queue_age()', 'public_fact_checks()',
                 'letters_open()', 'letters_request(p_email text, p_notice_version text, p_adult boolean)',
                 'letters_confirm(p_token text)', 'letters_leave(p_email text)')
$$, 'anon can execute no function in public except heartbeat_ages, capture_days, queue_age, public_fact_checks and (0024) letters_open, letters_request, letters_confirm, letters_leave');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
     and p.proname not in ('queue_age', 'storage_usage', 'open_idea', 'add_idea_event', 'check_ledger_chain', 'enter_closes', 'rescore_ideas', 'check_ledger_anchors', 'ledger_gate_facts',
                          'start_valuation_version', 'confirm_valuation_version', 'save_valuation_scenario',
                          'case_study_record', 'case_study_switches',
                          'letters_open', 'letters_request', 'letters_confirm', 'letters_leave')
$$, 'authenticated can execute no function in public except queue_age and storage_usage (numbers only) and the ledger functions (0010: open_idea, add_idea_event, check_ledger_chain; 0011: enter_closes, rescore_ideas; 0013: check_ledger_anchors; 0014: ledger_gate_facts; each checks the admin) and the three valuation functions (0017: start_valuation_version, confirm_valuation_version, save_valuation_scenario; each checks the admin) and the two case-study doors (0018: case_study_record, case_study_switches; each checks the admin) and the four public letters doors (0024)');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('service_role', p.oid, 'execute')
     and p.proname not in ('publish_revision', 'unpublish_item', 'add_lint_allowance', 'remove_lint_allowance', 'claim_job_step',
                           'reserve_usage', 'prune_provider_usage', 'reserve_units', 'verify_ledger_chain',
                           'store_fetched_closes', 'store_uploaded_closes', 'mark_market_day_shut', 'score_ideas', 'tracked_symbols',
                           'seal_ledger_days', 'verify_ledger_anchors', 'alert_step', 'alert_sent',
                           'register_clock_target', 'redeem_pump_ticket', 'record_video_fetch', 'purge_stale_video_data',
                           'letters_issue_confirmations', 'letters_confirmation_failed', 'letters_bin', 'letters_erase',
                           'letters_purge', 'letters_mark_left', 'confirmed_subscribers', 'set_letters_signup',
                           'approve_letter_send', 'claim_letter_send', 'finish_letter_send', 'letters_send_live', 'letters_confirmation_live')
$$, 'service_role can execute no function in public except the four gate functions, claim_job_step, the usage ledger trio, verify_ledger_chain (0010), the five market functions (0011: store_fetched_closes, store_uploaded_closes, mark_market_day_shut, score_ideas, tracked_symbols) and the two anchor functions (0013: seal_ledger_days, verify_ledger_anchors) and the two alert functions (0015: alert_step, alert_sent) and the two pump-clock functions (0016: register_clock_target, redeem_pump_ticket) and record_video_fetch and purge_stale_video_data (0022) and the eight reader functions (0024) and the three send doors and the two live-approval checks (0025)');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
$$, 'no function in public carries a PUBLIC execute grant');

-- Definer functions are pinned to an empty search_path.
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not ('search_path=""' = any (coalesce(p.proconfig, '{}'::text[])))
$$, 'every SECURITY DEFINER function in public pins an empty search_path');
select is_definer('public', 'publish_revision', array['uuid', 'uuid', 'uuid', 'text', 'jsonb'],
  'publish_revision is SECURITY DEFINER');
select is_definer('public', 'unpublish_item', array['uuid', 'uuid'], 'unpublish_item is SECURITY DEFINER');
select is_definer('public', 'heartbeat_ages', array[]::name[], 'heartbeat_ages is SECURITY DEFINER');
select is_definer('public', 'record_video_fetch',
  array['uuid', 'boolean', 'text', 'boolean', 'text', 'text', 'integer', 'text', 'timestamp with time zone', 'text'],
  'record_video_fetch is SECURITY DEFINER (0022)');
select ok(has_function_privilege('service_role', 'public.record_video_fetch(uuid, boolean, text, boolean, text, text, integer, text, timestamptz, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.record_video_fetch(uuid, boolean, text, boolean, text, text, integer, text, timestamptz, text)', 'execute')
      and has_function_privilege('service_role', 'public.purge_stale_video_data()', 'execute')
      and not has_function_privilege('authenticated', 'public.purge_stale_video_data()', 'execute')
      and not has_function_privilege('anon', 'public.purge_stale_video_data()', 'execute')
      and not has_function_privilege('service_role', 'private.distribution_gate_failures(uuid, text, uuid, date, uuid, jsonb, jsonb)', 'execute')
      and not has_function_privilege('service_role', 'private.seal_video_transcript()', 'execute')
      and not has_function_privilege('service_role', 'private.guard_video_source()', 'execute')
      and not has_function_privilege('service_role', 'private.guard_video_source_delete()', 'execute'),
  'record_video_fetch and purge_stale_video_data: service_role only; the gate helper and the three video trigger functions: no API role (0022, 0023)');

-- Letters (0024, 0025). anon and authenticated: exactly the four public doors; service_role: the reader functions and the send
-- doors; no API role: the helpers and trigger functions. All definer with an empty search_path (pinned above for public).
select ok((select bool_and(has_function_privilege('anon', f, 'execute') and has_function_privilege('authenticated', f, 'execute')
                           and not has_function_privilege('service_role', f, 'execute'))
             from unnest(array['public.letters_open()', 'public.letters_request(text, text, boolean)', 'public.letters_confirm(text)',
                               'public.letters_leave(text)']::regprocedure[]) f),
  'the four public letters doors: anon and authenticated, not service_role');
select ok((select bool_and(has_function_privilege('service_role', f, 'execute') and not has_function_privilege('anon', f, 'execute')
                           and not has_function_privilege('authenticated', f, 'execute'))
             from unnest(array['public.letters_issue_confirmations(uuid, uuid[])', 'public.letters_confirmation_failed(uuid)',
                               'public.letters_bin(uuid, uuid[])', 'public.letters_erase(uuid, uuid)', 'public.letters_purge()',
                               'public.letters_mark_left(text[])', 'public.confirmed_subscribers()',
                               'public.set_letters_signup(uuid, boolean)']::regprocedure[]) f),
  'the eight reader functions: service_role only');
select ok((select bool_and(has_function_privilege('service_role', f, 'execute') and not has_function_privilege('anon', f, 'execute')
                           and not has_function_privilege('authenticated', f, 'execute'))
             from unnest(array['public.approve_letter_send(uuid, uuid, uuid, text)', 'public.claim_letter_send()',
                               'public.finish_letter_send(uuid, text, text, integer, text)']::regprocedure[]) f),
  'the three send doors: service_role only');
select ok((select bool_and(not has_function_privilege('anon', f, 'execute') and not has_function_privilege('authenticated', f, 'execute')
                           and not has_function_privilege('service_role', f, 'execute'))
             from unnest(array['private.guard_letter_item()', 'private.guard_letter_send()', 'private.freeze_sent_letter()',
                               'private.letters_notice_version()', 'private.letters_hmac(text)', 'private.ist_day_start()',
                               'private.letters_log(text, text, text)', 'private.letters_delete(uuid[], text)',
                               'private.gate_policy()', 'private.letter_gate_failures(uuid, uuid, jsonb)',
                               'private.expire_letter_sends()', 'private.letter_send_check(uuid, uuid)']::regprocedure[]) f),
  'the twelve letters helpers and trigger functions: no API role');
select ok((select bool_and(p.prosecdef) from pg_proc p
            where p.oid = any (array['public.letters_open()', 'public.letters_request(text, text, boolean)', 'public.letters_confirm(text)',
                                     'public.letters_leave(text)', 'public.approve_letter_send(uuid, uuid, uuid, text)',
                                     'public.claim_letter_send()', 'public.finish_letter_send(uuid, text, text, integer, text)']::regprocedure[])),
  'the public letters doors and the send doors are SECURITY DEFINER');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and (p.proname like 'letters%' or p.proname like '%letter_send' or p.proname in ('confirmed_subscribers', 'set_letters_signup'))),
  17, 'exactly seventeen public letters functions exist (4 doors, 8 reader functions, 3 send doors, 2 live-approval checks)');

-- Behaviour, through real roles.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07-v1.2', '{}'::jsonb) $$,
  '42501', null, 'anon calling publish_revision is denied');
select throws_ok($$ select public.unpublish_item('aaaaaaaa-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon calling unpublish_item is denied');
select throws_ok($$ select private.slugify('x') $$, '42501', null, 'anon cannot call the private slug helper');
select throws_ok($$ select private.knowledge_gate_failures('note', null, null) $$, '42501', null,
  'anon cannot call the knowledge gate helper (0021)');
select throws_ok($$ select private.carry_concept_ids() $$, '42501', null, 'anon cannot call the concept carry trigger function (0020)');
select throws_ok($$ select private.distribution_gate_failures(null, 'video', null, null, null, null, null) $$, '42501', null,
  'anon cannot call the distribution gate helper (0023)');
select throws_ok($$ select public.record_video_fetch(null, true, null, null, null, null, null, null, null, null) $$, '42501', null,
  'anon cannot call record_video_fetch (0022)');
select throws_ok($$ select public.approve_letter_send(null, null, null, 'subscribers') $$, '42501', null,
  'anon cannot call approve_letter_send (0025)');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.publish_revision('bbbbbbbb-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07-v1.2', '{}'::jsonb) $$,
  '42501', null, 'authenticated calling publish_revision is denied');
select throws_ok($$ select private.slugify('x') $$, '42501', null, 'authenticated cannot call the private slug helper');
select throws_ok($$ select private.knowledge_gate_failures('note', null, null) $$, '42501', null,
  'authenticated cannot call the knowledge gate helper (0021)');
select throws_ok($$ select private.distribution_gate_failures(null, 'video', null, null, null, null, null) $$, '42501', null,
  'authenticated cannot call the distribution gate helper (0023)');
reset role;

select * from finish();
rollback;
