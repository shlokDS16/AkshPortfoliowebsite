-- 20261008000009_public_provenance.sql: public.public_fact_checks(), the one anon read path for "checked against
-- page N" (Plan 2b Task 9, controller ruling R5). Item id, fact id and page number only; never a machine value,
-- the edited flag, a proposal, an extraction or a document.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(15);

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
create function pg_temp.file_fact(p_item uuid, p_rev uuid, p_fact text, p_page integer, p_edited boolean default false)
returns void language plpgsql as $$
declare v_prop uuid;
begin
  insert into public.proposals (document_id, page_no, extraction_id, dedupe_key, machine_value, reason)
    select e.document_id, e.page_no, e.id, p_rev::text || '|' || p_fact, '{"value":"MACHINE-1,234"}', 'core'
      from public.extractions e
     where e.document_id = 'd1000000-0000-4000-8000-000000000001' and e.page_no = p_page
    returning id into v_prop;
  update public.proposals
     set status = 'filed', accepted_value = machine_value, item_id = p_item, revision_id = p_rev, decided_at = now()
   where id = v_prop;
  insert into public.fact_provenance (revision_id, fact_id, proposal_id, edited) values (p_rev, p_fact, v_prop, p_edited);
end;
$$;

-- P: R1 checked F1 on p. 5 and F2 on p. 7; it is published. R2 re-checks F1 on p. 9 and is published (latest wins).
-- R3 is a later, unpublished draft that "checks" F1 on p. 99 and F3 on p. 99: neither may surface.
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'F1', 5);
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'F2', 7, true);
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
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'R2', '{}');
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'F1', 9);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.test_publish('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002'), 'pass', 'setup: R2 of P passes');
reset role;
insert into public.item_revisions (id, item_id, body_md, structured) values
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'R3 draft', '{}');
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000003', 'F1', 99);
select pg_temp.file_fact('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000003', 'F3', 99);

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
  $$ values ('a1000000-0000-4000-8000-000000000001'::uuid, 'F1', 9), ('a1000000-0000-4000-8000-000000000001'::uuid, 'F2', 7) $$,
  'a public, lagged item: the latest passed revision''s page per fact; the draft R3 (F1 p. 99, F3) is ignored');
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
