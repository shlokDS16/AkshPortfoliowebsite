-- 20261008000009_public_provenance.sql: public.public_fact_checks(), the one anon read path for "checked against
-- page N" (Plan 2b Task 9, controller ruling R5). Item id, fact id and page number only; never a machine value,
-- the edited flag, a proposal, an extraction or a document. A row comes back only for a figure the desk really matched
-- and the current public revision still prints exactly so (fix wave: not edited, not flagged, value and page unchanged).
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- Stand-ins for the compliance server action (ADR-003), as in 0005: they reach the gate as the function owner.
create function public.test_publish(p_item uuid, p_rev uuid) returns text
language sql security definer set search_path = ''
as $$ select verdict from public.publish_revision((select auth.uid()), p_item, p_rev, 'sebi-unreg-2026-07',
  jsonb_build_object('passed', true, 'revisionId', p_rev::text, 'policyVersion', 'sebi-unreg-2026-07')) $$;
create function public.test_unpublish(p_item uuid) returns text
language sql security definer set search_path = ''
as $$ select public.unpublish_item((select auth.uid()), p_item) $$;
grant execute on function public.test_publish(uuid, uuid), public.test_unpublish(uuid) to authenticated;

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test');

insert into public.companies (id, slug, name, visibility) values
  ('cccccccc-0000-4000-8000-000000000001', 'kav', 'Kaveri', 'public'),
  ('cccccccc-0000-4000-8000-000000000002', 'sah', 'Sahyadri', 'public'),
  ('cccccccc-0000-4000-8000-000000000003', 'ret', 'Retracted Co', 'public'),
  ('cccccccc-0000-4000-8000-000000000004', 'pri', 'Private Co', 'private');
-- P: public and past the lag. U: published but inside the lag. T: published, then retracted. V: never published.
insert into public.items (id, kind, title, company_id, learning_objective, holds_position, data_as_of) values
  ('a1000000-0000-4000-8000-000000000001', 'thesis', 'Public file', 'cccccccc-0000-4000-8000-000000000001', 'Learn A.', 'no',
   (now() at time zone 'Asia/Kolkata')::date - 40),
  ('a2000000-0000-4000-8000-000000000002', 'thesis', 'Unlagged file', 'cccccccc-0000-4000-8000-000000000002', 'Learn B.', 'no',
   (now() at time zone 'Asia/Kolkata')::date - 3),
  ('a3000000-0000-4000-8000-000000000003', 'thesis', 'Retracted file', 'cccccccc-0000-4000-8000-000000000003', 'Learn C.', 'no',
   (now() at time zone 'Asia/Kolkata')::date - 40),
  ('a4000000-0000-4000-8000-000000000004', 'thesis', 'Private file', 'cccccccc-0000-4000-8000-000000000004', 'Learn D.', 'no',
   (now() at time zone 'Asia/Kolkata')::date - 40);
insert into public.item_revisions (id, item_id, body_md, structured) values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'R1', '{}'),
  ('b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'R1', '{}'),
  ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'R1', '{}'),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', 'R1', '{}');
insert into public.documents (id, title, company_id, sha256, bytes) values
  ('d1000000-0000-4000-8000-000000000001', 'Kaveri AR 2026 (private title)', 'cccccccc-0000-4000-8000-000000000001', repeat('a', 64), 1000);
insert into public.document_pages (document_id, page_no, text)
  select 'd1000000-0000-4000-8000-000000000001', n, 'Page text for page ' || n || ' ' || repeat('Revenue grew. ', 6)
    from unnest(array[2, 3, 4, 5, 7, 9, 99]) as n;
insert into public.extractions (document_id, page_no, model, prompt_version, input_hash, output)
  select 'd1000000-0000-4000-8000-000000000001', n, 'pgtap-model', 'p1', repeat('b', 64), '{}'
    from unnest(array[2, 3, 4, 5, 7, 9, 99]) as n;

-- Files one fact: a pending proposal, decided and filed under the revision, plus its provenance row (as the owner).
-- p_prop_item / p_prop_rev file the PROPOSAL under another item's revision; p_status 'accepted' leaves it unfiled.
create function pg_temp.file_fact(p_item uuid, p_rev uuid, p_fact text, p_page integer, p_edited boolean default false,
  p_flags text[] default '{}', p_prop_item uuid default null, p_prop_rev uuid default null, p_status text default 'filed')
returns void language plpgsql as $$
declare v_prop uuid;
begin
  insert into public.proposals (document_id, page_no, extraction_id, dedupe_key, machine_value, flags, reason)
    select e.document_id, e.page_no, e.id, p_rev::text || '|' || p_fact,
           jsonb_build_object('value', 1234, 'page', p_page, 'locator', 'p. ' || p_page), p_flags, 'core'
      from public.extractions e
     where e.document_id = 'd1000000-0000-4000-8000-000000000001' and e.page_no = p_page
    returning id into v_prop;
  if p_status = 'filed' then
    update public.proposals
       set status = 'filed', accepted_value = machine_value, item_id = coalesce(p_prop_item, p_item),
           revision_id = coalesce(p_prop_rev, p_rev), decided_at = now()
     where id = v_prop;
  else
    update public.proposals set status = p_status, accepted_value = machine_value, item_id = p_item, decided_at = now()
     where id = v_prop;
  end if;
  insert into public.fact_provenance (revision_id, fact_id, proposal_id, edited) values (p_rev, p_fact, v_prop, p_edited);
end;
$$;

-- P: R1 files F1 (p. 5), F2 (p. 7) and the cases below; it is published. R2 re-files F1 on p. 9 and F13 (edited) and is
-- published (latest wins). R2's structured facts are what the public page prints: every fact is value 1234 at the
-- machine's page, except F8 (retyped 4321) and F9 (moved to p. 8). R3 is a later draft, R4 a later revision with a
-- recorded fail verdict: neither may surface.
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'F1', 5);
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'F2', 7);
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'F4', 3, true);
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'F5', 4, false, array['value_not_on_page']);
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'F6', 5, false, array['quote_not_on_page']);
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'F7', 2, false, array['period_unknown']);
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'F8', 4);
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'F9', 4);
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'F10', 5, false, '{}',
  'a4000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000001');
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'F11', 3, false, '{}', null, null, 'accepted');
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'F13', 5);
select pg_temp.file_fact('a2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'F1', 3);
select pg_temp.file_fact('a3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000001', 'F1', 4);
select pg_temp.file_fact('a4000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000001', 'F1', 2);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.test_publish('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001'), 'pass', 'setup: R1 of P passes');
select is(public.test_publish('a2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001'), 'pass', 'setup: U passes (inside the lag)');
select is(public.test_publish('a3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000001'), 'pass', 'setup: T passes');
select lives_ok($$ select public.test_unpublish('a3000000-0000-4000-8000-000000000003') $$, 'setup: T is retracted');
reset role;

insert into public.item_revisions (id, item_id, body_md, structured) values
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'R2', jsonb_build_object('facts', jsonb_build_array(
    jsonb_build_object('id', 'F1', 'value', 1234, 'locator', 'p. 9'),
    jsonb_build_object('id', 'F2', 'value', 1234.0, 'locator', 'p. 7'),
    jsonb_build_object('id', 'F4', 'value', 1234, 'locator', 'p. 3'),
    jsonb_build_object('id', 'F5', 'value', 1234, 'locator', 'p. 4'),
    jsonb_build_object('id', 'F6', 'value', 1234, 'locator', 'p. 5'),
    jsonb_build_object('id', 'F7', 'value', 1234, 'locator', 'p. 2'),
    jsonb_build_object('id', 'F8', 'value', 4321, 'locator', 'p. 4'),
    jsonb_build_object('id', 'F9', 'value', 1234, 'locator', 'p. 8'),
    jsonb_build_object('id', 'F10', 'value', 1234, 'locator', 'p. 5'),
    jsonb_build_object('id', 'F11', 'value', 1234, 'locator', 'p. 3'),
    jsonb_build_object('id', 'F12', 'value', 1234, 'locator', 'p. 99'),
    jsonb_build_object('id', 'F13', 'value', 1234, 'locator', 'p. 5'))));
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'F1', 9);
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'F13', 5, true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.test_publish('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002'), 'pass', 'setup: R2 of P passes');
reset role;
insert into public.item_revisions (id, item_id, body_md, structured) values
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'R3 draft', '{}'),
  ('b1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'R4 failed', '{}');
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000003', 'F1', 99);
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000003', 'F3', 99);
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000004', 'F12', 99);
insert into public.gate_decisions (item_id, revision_id, policy_version, verdict)
  values ('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000004', 'sebi-unreg-2026-07', 'fail');

-- Structure and privileges: anon only (the capture_days precedent), definer, empty search_path, three columns.
select ok(has_function_privilege('anon', 'public.public_fact_checks()', 'execute')
      and not has_function_privilege('authenticated', 'public.public_fact_checks()', 'execute')
      and not has_function_privilege('service_role', 'public.public_fact_checks()', 'execute')
      and not has_function_privilege('public', 'public.public_fact_checks()', 'execute'),
  'public_fact_checks is granted to anon only');
select is_definer('public', 'public_fact_checks', array[]::name[], 'public_fact_checks is SECURITY DEFINER');
select ok((select 'search_path=""' = any (p.proconfig) from pg_proc p where p.oid = 'public.public_fact_checks()'::regprocedure),
  'and pins search_path to the empty path');
select is((select pg_get_function_result(p.oid) from pg_proc p where p.oid = 'public.public_fact_checks()'::regprocedure),
  'TABLE(item_id uuid, fact_id text, page_no integer)', 'it returns exactly item_id, fact_id and page_no');

-- Behaviour, through the anon role.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$ select item_id, fact_id, page_no from public.public_fact_checks() order by fact_id $$,
  $$ values ('a1000000-0000-4000-8000-000000000001'::uuid, 'F1', 9), ('a1000000-0000-4000-8000-000000000001'::uuid, 'F2', 7),
            ('a1000000-0000-4000-8000-000000000001'::uuid, 'F7', 2) $$,
  'a public, lagged item: only unedited, unflagged figures the current public revision prints as the machine read them');
select is((select count(*) from public.public_fact_checks() where fact_id = 'F4'), 0::bigint, 'an edited filing returns no row');
select is((select count(*) from public.public_fact_checks() where fact_id in ('F5', 'F6')), 0::bigint,
  'a filing flagged value_not_on_page or quote_not_on_page returns no row');
select is((select count(*) from public.public_fact_checks() where fact_id = 'F8'), 0::bigint,
  'a value retyped on the same page in a later public revision returns no row');
select is((select count(*) from public.public_fact_checks() where fact_id = 'F9'), 0::bigint,
  'a fact whose public locator moved to another page returns no row');
select is((select count(*) from public.public_fact_checks() where fact_id = 'F10'), 0::bigint,
  'a provenance row whose proposal belongs to another item returns no row');
select is((select count(*) from public.public_fact_checks() where fact_id = 'F11'), 0::bigint,
  'a proposal that is not filed returns no row');
select is((select count(*) from public.public_fact_checks() where fact_id = 'F12'), 0::bigint,
  'a revision with only a fail verdict returns no row');
select is((select count(*) from public.public_fact_checks() where fact_id = 'F13'), 0::bigint,
  'a clean filing followed by an edited filing of the same fact in a later public revision returns no row');
select is((select count(*) from public.public_fact_checks() where item_id = 'a2000000-0000-4000-8000-000000000002'), 0::bigint,
  'nothing for a published item still inside the 30-day lag');
select is((select count(*) from public.public_fact_checks() where item_id = 'a3000000-0000-4000-8000-000000000003'), 0::bigint,
  'nothing for a retracted item');
select is((select count(*) from public.public_fact_checks() where item_id = 'a4000000-0000-4000-8000-000000000004'), 0::bigint,
  'nothing for a private item that was never published');
select throws_ok($$ select * from public.fact_provenance $$, '42501', null, 'anon still cannot read fact_provenance directly');
select throws_ok($$ select * from public.proposals $$, '42501', null, 'nor proposals');
reset role;

select * from finish();
rollback;
