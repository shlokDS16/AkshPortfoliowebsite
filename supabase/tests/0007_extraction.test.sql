-- 20261007000007_extraction.sql: extractions, proposals, provenance, the provider usage ledger and its reservation
-- function (Plan 2a Task 10, ADR-004 s4.2-s4.5; controller rulings R1 provenance policy, R12 column set).
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(75);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');
insert into public.companies (id, slug, name) values ('cccccccc-0000-4000-8000-000000000001', 'kav', 'Kaveri');
insert into public.items (id, kind, title, company_id, learning_objective) values
  ('a1000000-0000-4000-8000-000000000001', 'thesis', 'Kaveri file', 'cccccccc-0000-4000-8000-000000000001', 'Learn.'),
  ('a2000000-0000-4000-8000-000000000002', 'note', 'Other item', null, null);
insert into public.item_revisions (id, item_id, body_md, structured, change_reason) values
  ('e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Aksh words', '{"facts":[]}', 'First.'),
  ('e2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'Other words', '{}', null);
insert into public.documents (id, title, company_id, sha256, bytes) values
  ('d1000000-0000-4000-8000-000000000001', 'Kaveri AR 2026', 'cccccccc-0000-4000-8000-000000000001', repeat('a', 64), 1000);
insert into public.document_pages (document_id, page_no, text) values
  ('d1000000-0000-4000-8000-000000000001', 1, 'Revenue from operations 1,234.5 crore ' || repeat('Revenue grew. ', 5));

-- Structure: four tables, RLS on each.
select has_table('public', 'extractions', 'extractions exists');
select has_table('public', 'proposals', 'proposals exists');
select has_table('public', 'fact_provenance', 'fact_provenance exists');
select has_table('public', 'provider_usage', 'provider_usage exists');
select ok((select bool_and(c.relrowsecurity) from pg_class c
            where c.oid in ('public.extractions'::regclass, 'public.proposals'::regclass,
                            'public.fact_provenance'::regclass, 'public.provider_usage'::regclass)),
  'RLS is enabled on all four tables');

-- Privileges: anon nothing; authenticated reads and decides only; service_role exactly the ADR-004 s4.2 matrix.
select is_empty($$
  select c.relname from pg_class c
   where c.oid in ('public.extractions'::regclass, 'public.proposals'::regclass,
                   'public.fact_provenance'::regclass, 'public.provider_usage'::regclass)
     and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
          or has_any_column_privilege('anon', c.oid, 'select,insert,update,references'))
$$, 'anon holds no privilege on extractions, proposals, provenance or usage');
select ok(not has_any_column_privilege('authenticated', 'public.extractions', 'insert,update')
      and not has_any_column_privilege('authenticated', 'public.proposals', 'insert')
      and not has_column_privilege('authenticated', 'public.proposals', 'machine_value', 'update')
      and not has_any_column_privilege('authenticated', 'public.provider_usage', 'insert,update')
      and not has_table_privilege('authenticated', 'public.fact_provenance', 'update,delete'),
  'authenticated cannot write extractions or usage, insert proposals, change machine_value or rewrite provenance');
select ok(not has_any_column_privilege('service_role', 'public.fact_provenance', 'select,insert,update')
      and not has_any_column_privilege('service_role', 'public.proposals', 'update')
      and not has_any_column_privilege('service_role', 'public.extractions', 'update')
      and not has_table_privilege('service_role', 'public.extractions', 'delete')
      and not has_table_privilege('service_role', 'public.provider_usage', 'delete'),
  'service_role holds nothing on provenance, no UPDATE on proposals or extractions, no DELETE on the ledger');
select is(array(select a.attname::text from pg_attribute a
                 where a.attrelid = 'public.items'::regclass and a.attnum > 0 and not a.attisdropped
                   and has_column_privilege('service_role', a.attrelid, a.attnum, 'select') order by 1),
  array['company_id', 'created_at', 'id', 'kind', 'status', 'title'],
  'service_role reads exactly items (id, company_id, kind, title, created_at, status) (R12)');
select is(array(select a.attname::text from pg_attribute a
                 where a.attrelid = 'public.item_revisions'::regclass and a.attnum > 0 and not a.attisdropped
                   and has_column_privilege('service_role', a.attrelid, a.attnum, 'select') order by 1),
  array['created_at', 'id', 'item_id', 'rev_no', 'structured'],
  'service_role reads exactly item_revisions (id, item_id, rev_no, structured, created_at)');

-- The machine reads facts, never Aksh's words.
set local role service_role;
select lives_ok($$ select id, company_id, kind, title, created_at, status from public.items $$,
  'service_role reads the granted item columns');
select lives_ok($$ select id, item_id, rev_no, structured, created_at from public.item_revisions $$,
  'service_role reads structured facts');
select throws_ok($$ select body_md from public.item_revisions $$, '42501', null, 'service_role cannot read body_md');
select throws_ok($$ select change_reason from public.item_revisions $$, '42501', null, 'nor change_reason');
select throws_ok($$ select learning_objective, visibility from public.items $$, '42501', null,
  'nor learning_objective or visibility');

-- Extractions: the machine writes once.
select lives_ok($$ insert into public.extractions (id, document_id, page_no, model, prompt_version, input_hash, output, tokens_used)
    values ('f1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 1,
            'openai/gpt-oss-120b', 'extract-v1', repeat('f', 64), '{"facts":[]}', 900) $$,
  'service_role inserts an extraction');
select throws_ok($$ update public.extractions set tokens_used = 1 $$, '42501', null,
  'service_role holds no UPDATE on extractions');
select throws_ok($$ insert into public.extractions (document_id, page_no, model, prompt_version, input_hash, output)
    values ('d1000000-0000-4000-8000-000000000001', 9, 'm', 'v1', repeat('f', 64), '{}') $$,
  '23503', null, 'an extraction needs a stored page');
reset role;
select throws_ok($$ update public.extractions set tokens_used = 1 $$, 'P0001',
  'extractions is append-only: UPDATE is not allowed', 'extractions UPDATE raises even for the owner');
select throws_ok($$ delete from public.extractions $$, 'P0001',
  'extractions is append-only: DELETE is not allowed', 'extractions DELETE raises even for the owner');

-- Proposals: the machine only proposes.
set local role service_role;
select lives_ok($$ insert into public.proposals (id, document_id, page_no, extraction_id, dedupe_key, machine_value, reason, flags) values
    ('b1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 1,
     'f1000000-0000-4000-8000-000000000001', 'revenue|FY26', '{"value":"1,234.5"}', 'core', '{}'),
    ('b2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 1,
     'f1000000-0000-4000-8000-000000000001', 'pat|FY26', '{"value":"99"}', 'label_match', '{value_not_on_page}') $$,
  'service_role inserts pending proposals');
select throws_ok($$ insert into public.proposals (document_id, page_no, extraction_id, dedupe_key, machine_value, reason, status, accepted_value)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', 'x|FY26',
            '{}', 'core', 'accepted', '{}') $$,
  'P0001', 'the machine only proposes: a new proposal is pending and undecided', 'the machine cannot insert an accepted proposal');
select throws_ok($$ insert into public.proposals (document_id, page_no, extraction_id, dedupe_key, machine_value, reason, item_id)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', 'y|FY26',
            '{}', 'core', 'a1000000-0000-4000-8000-000000000001') $$,
  'P0001', 'the machine only proposes: a new proposal is pending and undecided', 'nor file one under an item');
select throws_ok($$ insert into public.proposals (document_id, page_no, extraction_id, dedupe_key, machine_value, reason)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', 'revenue|FY26', '{}', 'core') $$,
  '23505', null, 'a duplicate dedupe_key for one document is refused');
select throws_ok($$ update public.proposals set status = 'accepted', accepted_value = machine_value $$, '42501', null,
  'service_role holds no UPDATE on proposals');
reset role;

-- Layer 3: the guard refuses the machine even if a grant is ever added, and under service_role claims.
grant update on public.proposals to service_role;
set local role service_role;
select throws_ok($$ update public.proposals set status = 'accepted', accepted_value = machine_value $$,
  '42501', 'only Aksh decides on a proposal (ADR-004 s4.2)', 'a granted service_role still cannot decide');
reset role;
revoke update on public.proposals from service_role;
select throws_ok($$ update public.proposals set machine_value = '{"value":"1"}' $$,
  'P0001', 'what the machine read is never changed', 'machine_value never changes, not even for the owner');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$ update public.proposals set status = 'rejected' $$,
  '42501', 'only Aksh decides on a proposal (ADR-004 s4.2)', 'an owner-rights update under service_role claims is refused');
select set_config('request.jwt.claims', '', true);

-- Aksh decides, files under an item, and provenance is recorded (R1: the insert must succeed).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.proposals), 2::bigint, 'the admin sees the proposals');
select lives_ok($$ update public.proposals set status = 'accepted', accepted_value = machine_value, decided_at = now()
                   where id = 'b1000000-0000-4000-8000-000000000001' $$,
  'the admin accepts a proposal with accepted_value');
select is((select status from public.proposals where id = 'b1000000-0000-4000-8000-000000000001'), 'accepted',
  'and the decision took');
select throws_ok($$ update public.proposals set machine_value = '{}' where id = 'b1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'the admin cannot change machine_value (no column privilege)');
select throws_ok($$ update public.proposals set status = 'accepted' where id = 'b2000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'an accepted proposal needs an accepted_value');
select throws_ok($$ update public.proposals set status = 'pending' where id = 'b1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'a decision is never undone to pending (with check)');
select lives_ok($$ update public.proposals set item_id = 'a1000000-0000-4000-8000-000000000001'
                   where id = 'b1000000-0000-4000-8000-000000000001' $$,
  'the admin files the accepted proposal under an item');
select lives_ok($$ insert into public.fact_provenance (revision_id, fact_id, proposal_id, edited)
                   values ('e1000000-0000-4000-8000-000000000001', 'F1', 'b1000000-0000-4000-8000-000000000001', false) $$,
  'R1: the admin records provenance when the revision belongs to the proposal''s item');
select is((select count(*) from public.fact_provenance), 1::bigint, 'and the provenance row exists');
select throws_ok($$ insert into public.fact_provenance (revision_id, fact_id, proposal_id, edited)
                    values ('e2000000-0000-4000-8000-000000000002', 'F1', 'b1000000-0000-4000-8000-000000000001', false) $$,
  '42501', null, 'provenance against another item''s revision is refused');
select throws_ok($$ insert into public.fact_provenance (revision_id, fact_id, proposal_id, edited)
                    values ('e1000000-0000-4000-8000-000000000001', 'F2', 'b2000000-0000-4000-8000-000000000002', true) $$,
  '42501', null, 'provenance for a proposal not filed under the item is refused');
select lives_ok($$ update public.proposals set status = 'rejected', item_id = 'a1000000-0000-4000-8000-000000000001', decided_at = now()
                   where id = 'b2000000-0000-4000-8000-000000000002' $$,
  'the admin rejects a proposal that carries an item_id');
select throws_ok($$ insert into public.fact_provenance (revision_id, fact_id, proposal_id, edited)
                    values ('e1000000-0000-4000-8000-000000000001', 'F3', 'b2000000-0000-4000-8000-000000000002', true) $$,
  '42501', null, 'a rejected proposal has no provenance, even under the item (ADR-004 s4.7)');

-- Filing is final.
select throws_ok($$ update public.proposals set status = 'filed' where id = 'b1000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'filed without a revision_id violates the check');
select throws_ok($$ update public.proposals set status = 'filed', revision_id = 'e2000000-0000-4000-8000-000000000002'
                    where id = 'b1000000-0000-4000-8000-000000000001' $$,
  '23514', 'a proposal is filed only under a revision of its own item', 'a proposal cannot be filed under another item''s revision');
select lives_ok($$ update public.proposals set status = 'filed', revision_id = 'e1000000-0000-4000-8000-000000000001'
                   where id = 'b1000000-0000-4000-8000-000000000001' $$,
  'the admin marks the proposal filed with its revision');
select throws_ok($$ update public.proposals set status = 'edited' where id = 'b1000000-0000-4000-8000-000000000001' $$,
  'P0001', 'a filed proposal is final', 'a filed proposal cannot change');
select lives_ok($$ insert into public.fact_provenance (revision_id, fact_id, proposal_id, edited)
                   values ('e1000000-0000-4000-8000-000000000001', 'F2', 'b1000000-0000-4000-8000-000000000001', true) $$,
  'provenance still records after the proposal is filed (both orders work)');
select throws_ok($$ update public.fact_provenance set edited = true $$, '42501', null,
  'the admin holds no UPDATE on provenance');
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ update public.fact_provenance set edited = false $$, 'P0001',
  'fact_provenance is append-only: UPDATE is not allowed', 'fact_provenance UPDATE raises even for the owner');
select throws_ok($$ delete from public.fact_provenance $$, 'P0001',
  'fact_provenance is append-only: DELETE is not allowed', 'fact_provenance DELETE raises even for the owner');
select throws_ok($$ truncate public.fact_provenance $$, 'P0001',
  'fact_provenance is append-only: TRUNCATE is not allowed', 'fact_provenance TRUNCATE raises');
-- CASCADE also reaches proposals and fact_provenance, so assert the extractions-specific message.
select throws_ok($$ truncate public.extractions cascade $$, 'P0001',
  'extractions is append-only: TRUNCATE is not allowed', 'extractions TRUNCATE raises');

-- A signed-in non-admin sees and writes nothing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.extractions) + (select count(*) from public.proposals)
          + (select count(*) from public.fact_provenance) + (select count(*) from public.provider_usage), 0::bigint,
  'a non-admin sees no extraction, proposal, provenance or usage row');
select throws_ok($$ insert into public.fact_provenance (revision_id, fact_id, proposal_id, edited)
                    values ('e1000000-0000-4000-8000-000000000001', 'F9', 'b1000000-0000-4000-8000-000000000001', false) $$,
  '42501', null, 'a non-admin cannot record provenance');
select lives_ok($$ update public.proposals set status = 'accepted', accepted_value = '{}'
                   where id = 'b2000000-0000-4000-8000-000000000002' $$,
  'a non-admin update of a proposal runs (RLS hides the row)');
select throws_ok($$ select * from public.reserve_usage('m', 10, 6000, 150000, 22, 750) $$, '42501', null,
  'authenticated cannot call reserve_usage');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select status from public.proposals where id = 'b2000000-0000-4000-8000-000000000002'), 'rejected',
  'and changes nothing');

-- reserve_usage: minute, day and request caps, 429 blocks, released rows, argument checks.
set local role service_role;
select ok((select r.ok and r.reservation_id is not null and r.reason is null
             from public.reserve_usage('m-min', 4000, 6000, 150000, 22, 750) r),
  'the first reservation is ok');
select is((select format('%s,%s,%s', r.ok, r.reason, r.not_before between clock_timestamp() + interval '55 seconds'
                                                                      and clock_timestamp() + interval '61 seconds')
             from public.reserve_usage('m-min', 4000, 6000, 150000, 22, 750) r),
  'f,groq_minute,t', 'a second 4,000-token call in the same minute waits about 60 s (groq_minute)');
select is((select count(*) from public.provider_usage where bucket = 'm-min'), 1::bigint,
  'a refused reservation writes nothing');
select ok((select r.ok from public.reserve_usage('m-day', 4000, 6000, 5000, 22, 750) r), 'a day bucket takes a first call');
select is((select format('%s,%s,%s', r.ok, r.reason, r.not_before between clock_timestamp() + interval '23 hours 59 minutes'
                                                                      and clock_timestamp() + interval '24 hours')
             from public.reserve_usage('m-day', 4000, 6000, 5000, 22, 750) r),
  'f,groq_day,t', 'past the day cap the call waits about 24 h (groq_day)');
select ok((select r.ok from public.reserve_usage('m-rpm', 10, 6000, 150000, 1, 750) r), 'a one-request bucket takes a call');
select is((select format('%s,%s', r.ok, r.reason) from public.reserve_usage('m-rpm', 10, 6000, 150000, 1, 750) r),
  'f,groq_minute', 'the request-per-minute cap counts calls, not tokens');
select lives_ok($$ insert into public.provider_usage (bucket, kind, retry_after_s, blocked_until, block_reason)
                   values ('m-block', 'rate_limited', 30, clock_timestamp() + interval '30 seconds', 'groq_day') $$,
  'service_role records a 429 with blocked_until');
select is((select format('%s,%s,%s', r.ok, r.reason, r.not_before = (select max(blocked_until) from public.provider_usage where bucket = 'm-block'))
             from public.reserve_usage('m-block', 10, 6000, 150000, 22, 750) r),
  'f,groq_day,t', 'a future blocked_until blocks with its block_reason');
select ok((select r.ok from public.reserve_usage('m-rel', 4000, 6000, 150000, 22, 750) r), 'a reservation to release');
select lives_ok($$ update public.provider_usage set status = 'released', tokens_used = 0 where bucket = 'm-rel' $$,
  'service_role settles a reservation (status, tokens_used)');
select ok((select r.ok from public.reserve_usage('m-rel', 4000, 6000, 150000, 22, 750) r),
  'released reservations do not count');
select throws_ok($$ select * from public.reserve_usage('m', 6001, 6000, 150000, 22, 750) $$, '22023', null,
  'one call larger than the minute cap is refused');
select throws_ok($$ select * from public.reserve_usage('m', 10, 6000, null, 22, 750) $$, '22023', null,
  'a missing cap is refused');
select throws_ok($$ update public.provider_usage set bucket = 'other' $$, '42501', null,
  'service_role can change only tokens_used and status on the ledger');
reset role;

-- prune_provider_usage deletes rows older than 48 h and returns the count.
insert into public.provider_usage (bucket, kind, remaining_tokens, at) values
  ('old', 'observation', 100, now() - interval '49 hours'),
  ('old', 'observation', 100, now() - interval '72 hours'),
  ('old', 'observation', 100, now() - interval '47 hours');
set local role service_role;
select is(public.prune_provider_usage(), 2, 'prune deletes the two rows older than 48 h and returns the count');
reset role;
select is((select count(*) from public.provider_usage where bucket = 'old'), 1::bigint, 'and keeps the younger one');

-- Both functions: service_role only, SECURITY DEFINER with an empty search_path.
select ok(has_function_privilege('service_role', 'public.reserve_usage(text, integer, integer, integer, integer, integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.reserve_usage(text, integer, integer, integer, integer, integer)', 'execute')
      and not has_function_privilege('anon', 'public.reserve_usage(text, integer, integer, integer, integer, integer)', 'execute')
      and has_function_privilege('service_role', 'public.prune_provider_usage()', 'execute')
      and not has_function_privilege('authenticated', 'public.prune_provider_usage()', 'execute')
      and not has_function_privilege('anon', 'public.prune_provider_usage()', 'execute'),
  'reserve_usage and prune_provider_usage are executable by service_role only');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('reserve_usage', 'prune_provider_usage')
     and not (p.prosecdef and 'search_path=""' = any (coalesce(p.proconfig, '{}'::text[])))
$$, 'both are SECURITY DEFINER with search_path pinned empty');

select * from finish();
rollback;
