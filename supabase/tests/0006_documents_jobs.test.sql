-- 20261007000006_documents_jobs.sql: documents, pages, the job queue, the private bucket, queue health and the
-- machine write boundary (Plan 2a Task 3, ADR-004 s4.2-s4.3; controller rulings R4, R11, R18).
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(70);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');
insert into public.companies (id, slug, name) values ('cccccccc-0000-4000-8000-000000000001', 'kav', 'Kaveri');
insert into public.items (id, kind, title, learning_objective)
  values ('a1000000-0000-4000-8000-000000000001', 'note', 'Probe', 'Learn.');

-- 1-5. Structure: four tables, RLS on each, the R18 first_line column.
select has_table('public', 'documents', 'documents exists');
select has_table('public', 'document_pages', 'document_pages exists');
select has_table('public', 'jobs', 'jobs exists');
select has_table('public', 'job_steps', 'job_steps exists');
select ok((select bool_and(c.relrowsecurity) from pg_class c
            where c.oid in ('public.documents'::regclass, 'public.document_pages'::regclass,
                            'public.jobs'::regclass, 'public.job_steps'::regclass)),
  'RLS is enabled on all four tables');
select has_column('public', 'document_pages', 'first_line', 'document_pages has a first_line column (R18)');

-- Anon holds nothing on the four; service_role holds nothing that writes items or revisions.
select is_empty($$
  select c.relname from pg_class c
   where c.oid in ('public.documents'::regclass, 'public.document_pages'::regclass,
                   'public.jobs'::regclass, 'public.job_steps'::regclass)
     and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
          or has_any_column_privilege('anon', c.oid, 'select,insert,update,references'))
$$, 'anon holds no privilege on documents, pages, jobs or steps');
select ok(not has_table_privilege('service_role', 'public.items', 'insert,update,delete')
      and not has_table_privilege('service_role', 'public.item_revisions', 'insert,update,delete')
      and not has_any_column_privilege('service_role', 'public.items', 'insert,update')
      and not has_any_column_privilege('service_role', 'public.item_revisions', 'insert,update'),
  'service_role cannot insert, update or delete items or revisions');

-- The machine write boundary holds even if a grant is ever added (ADR-004 s4.2, layer 1).
grant insert on public.item_revisions to service_role;
set local role service_role;
select throws_ok($$ insert into public.item_revisions (item_id, body_md)
                    values ('a1000000-0000-4000-8000-000000000001', 'machine words') $$,
  '42501', 'machines do not author revisions (ADR-004 s4.2)', 'a granted service_role still cannot author a revision');
reset role;
revoke insert on public.item_revisions from service_role;

-- The admin still authors revisions.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into public.item_revisions (item_id, body_md)
                   values ('a1000000-0000-4000-8000-000000000001', 'Aksh words') $$,
  'the admin still authors a revision');

-- Documents: the admin uploads in status uploading only; sha256 is fixed.
select lives_ok($$ insert into public.documents (id, title, company_id, sha256, bytes, storage_path) values
    ('d1000000-0000-4000-8000-000000000001', 'Kaveri AR 2026', 'cccccccc-0000-4000-8000-000000000001',
     repeat('a', 64), 1000, 'd1000000-0000-4000-8000-000000000001.pdf'),
    ('d2000000-0000-4000-8000-000000000002', 'Second', null, repeat('b', 64), 2000, null) $$,
  'the admin inserts documents in status uploading');
select throws_ok($$ insert into public.documents (title, sha256, bytes, status) values ('Forged', repeat('d', 64), 10, 'active') $$,
  '42501', null, 'a document cannot be inserted as active (with check)');
select throws_ok($$ update public.documents set sha256 = repeat('e', 64) where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'the admin cannot change a document sha256 (column privilege)');
select throws_ok($$ update public.documents set bytes = 5 where id = 'd1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'nor its byte count');
select lives_ok($$ update public.documents set title = 'Kaveri annual report 2026', status = 'active'
                    where id = 'd1000000-0000-4000-8000-000000000001' $$,
  'the admin can retitle a document and make it active');
select is((select status from public.documents where id = 'd1000000-0000-4000-8000-000000000001'), 'active',
  'and the update took');
select throws_ok($$ insert into public.documents (title, sha256, bytes) values ('Dup', repeat('a', 64), 10) $$,
  '23505', null, 'the same file (sha256) cannot be uploaded twice');
select throws_ok($$ insert into public.documents (title, sha256, bytes, storage_path)
                    values ('Path', repeat('f', 64), 10, '../etc/passwd') $$,
  '23514', null, 'a storage path must be <uuid>.pdf');

-- A signed-in non-admin sees no document.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.documents), 0::bigint, 'a non-admin sees no documents');
select is((select count(*) from public.job_steps), 0::bigint, 'nor job steps');
reset role;

-- Page text is written once by job code; a scan page may be filled once; selection stays editable.
set local role service_role;
select lives_ok($$ insert into public.document_pages (document_id, page_no, text) values
    ('d1000000-0000-4000-8000-000000000001', 1, '  Standalone statement of profit and loss ' || repeat('Revenue grew. ', 10)),
    ('d1000000-0000-4000-8000-000000000001', 2, 'scan page.') $$,
  'service_role inserts page text');
select throws_ok($$ update public.document_pages set text = 'changed'
                    where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 1 $$,
  'P0001', 'document_pages.text is written once', 'filled page text cannot be rewritten');
select lives_ok($$ update public.document_pages set text = repeat('OCR text here. ', 5)
                   where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 2 $$,
  'a scan page can take OCR text once');
select is((select char_count from public.document_pages
            where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 2), 75,
  'and the OCR text took');
select throws_ok($$ update public.document_pages set text = 'again'
                    where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 2 $$,
  'P0001', 'document_pages.text is written once', 'and then not again');
select lives_ok($$ update public.document_pages set selected = true, selected_by = 'rule', kind = 'pl', score = 0.9
                   where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 1 $$,
  'service_role can classify and select a page');
select throws_ok($$ update public.document_pages set page_no = 9
                    where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 1 $$,
  '42501', null, 'service_role cannot renumber a page');
reset role;
insert into public.document_pages (document_id, page_no, text)
  values ('d1000000-0000-4000-8000-000000000001', 3, 'short scan');
select ok((select is_scan from public.document_pages where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 3)
      and not (select is_scan from public.document_pages where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 1),
  'is_scan is true for 10 characters and false for 60+');
select ok((select first_line like 'Standalone statement of profit and loss Revenue%' and length(first_line) = 120
             from public.document_pages where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 1),
  'first_line is the trimmed first 120 characters (R18)');

-- The admin may change the selection but never the text.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ update public.document_pages set selected = false, selected_by = 'aksh'
                   where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 1 $$,
  'the admin can deselect a page');
select throws_ok($$ update public.document_pages set text = 'Aksh rewrote it'
                    where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 1 $$,
  '42501', null, 'the admin cannot write page text');

-- Jobs: the admin enqueues one live job per document.
select lives_ok($$ insert into public.jobs (id, kind, document_id) values
    ('f1000000-0000-4000-8000-000000000001', 'ingest_pdf', 'd1000000-0000-4000-8000-000000000001'),
    ('f2000000-0000-4000-8000-000000000002', 'ingest_pdf', 'd2000000-0000-4000-8000-000000000002') $$,
  'the admin enqueues a job per document');
select throws_ok($$ insert into public.jobs (kind, document_id) values ('ingest_pdf', 'd1000000-0000-4000-8000-000000000001') $$,
  '23505', null, 'a second live job for the same document is refused');
select lives_ok($$ insert into public.job_steps (job_id, kind, page_no)
                   values ('f2000000-0000-4000-8000-000000000002', 'extract_page', 4) $$,
  'the admin can queue an extract_page step');
select throws_ok($$ insert into public.job_steps (job_id, kind) values ('f2000000-0000-4000-8000-000000000002', 'select_pages') $$,
  '42501', null, 'but not a select_pages step (with check)');
reset role;

-- Step shape: select_pages has no page, the others have one; one step per (job, kind, page).
select throws_ok($$ insert into public.job_steps (job_id, kind, page_no) values ('f2000000-0000-4000-8000-000000000002', 'select_pages', 1) $$,
  '23514', null, 'a select_pages step with a page_no is refused');
select throws_ok($$ insert into public.job_steps (job_id, kind) values ('f2000000-0000-4000-8000-000000000002', 'extract_page') $$,
  '23514', null, 'an extract_page step without a page_no is refused');
insert into public.job_steps (job_id, kind, page_no) values
  ('f2000000-0000-4000-8000-000000000002', 'extract_page', 3),
  ('f2000000-0000-4000-8000-000000000002', 'select_pages', null);
select throws_ok($$ insert into public.job_steps (job_id, kind, page_no) values ('f2000000-0000-4000-8000-000000000002', 'extract_page', 3) $$,
  '23505', null, 'a second extract_page for the same job and page is refused');
select throws_ok($$ insert into public.job_steps (job_id, kind) values ('f2000000-0000-4000-8000-000000000002', 'select_pages') $$,
  '23505', null, 'a second select_pages for the same job is refused');
select lives_ok($$ insert into public.job_steps (job_id, kind, page_no) values
    ('f2000000-0000-4000-8000-000000000002', 'extract_page', 3), ('f2000000-0000-4000-8000-000000000002', 'select_pages', null)
    on conflict (job_id, kind, page_no) do nothing $$,
  'on conflict (job_id, kind, page_no) do nothing absorbs a duplicate enqueue');
select is((select count(*) from public.job_steps where job_id = 'f2000000-0000-4000-8000-000000000002'), 3::bigint,
  'and adds no row');

-- Cancelling a job (R4): the admin sets cancelled_at, never clears it, never touches another column.
insert into public.job_steps (job_id, kind, page_no, not_before)
  values ('f2000000-0000-4000-8000-000000000002', 'pdf_text', 1, now() - interval '1 day');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ update public.jobs set cancelled_at = now() where id = 'f2000000-0000-4000-8000-000000000002' $$,
  'the admin can cancel a job (R4)');
select ok((select cancelled_at is not null from public.jobs where id = 'f2000000-0000-4000-8000-000000000002'),
  'and the cancel took');
select throws_ok($$ update public.jobs set cancelled_at = null where id = 'f2000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'a cancelled job cannot be revived (with check)');
select throws_ok($$ update public.jobs set document_id = 'd1000000-0000-4000-8000-000000000001'
                    where id = 'f2000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'the admin can change no other job column');
reset role;

-- The claim: service_role only, a lease, oldest first, expired leases counted, cancelled jobs skipped.
insert into public.job_steps (id, job_id, kind, page_no, not_before) values
  ('e5000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'pdf_text', 1, now() - interval '2 minutes'),
  ('e5000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'extract_page', 1, now() - interval '1 minute'),
  ('e5000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'extract_page', 2, now() + interval '1 hour');
select ok(has_function_privilege('service_role', 'public.claim_job_step(uuid, integer)', 'execute')
      and not has_function_privilege('anon', 'public.claim_job_step(uuid, integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.claim_job_step(uuid, integer)', 'execute'),
  'claim_job_step is executable by service_role only');
select is_definer('public', 'claim_job_step', array['uuid', 'integer'], 'claim_job_step is SECURITY DEFINER');

set local role service_role;
select is((select id from public.claim_job_step('0e000000-0000-4000-8000-000000000001')),
  'e5000000-0000-4000-8000-000000000001'::uuid, 'the first claim returns the oldest runnable step');
select ok((select status = 'running' and lease_owner = '0e000000-0000-4000-8000-000000000001' and lease_expiries = 0
                  and locked_until between now() + interval '269 seconds' and now() + interval '271 seconds'
             from public.job_steps where id = 'e5000000-0000-4000-8000-000000000001'),
  'the claimed step is running, owned, and leased for about 270 s');
select is((select id from public.claim_job_step('0e000000-0000-4000-8000-000000000002')),
  'e5000000-0000-4000-8000-000000000002'::uuid, 'a second claim returns the other queued step, not the running one');
select is_empty($$ select id from public.claim_job_step('0e000000-0000-4000-8000-000000000003') $$,
  'nothing else is runnable');
select is((select status from public.job_steps where id = 'e5000000-0000-4000-8000-000000000003'), 'queued',
  'a step whose not_before is in the future is not claimed');
select is((select count(*) from public.job_steps where job_id = 'f2000000-0000-4000-8000-000000000002' and status <> 'queued'),
  0::bigint, 'no step of a cancelled job is ever claimed (even one queued a day ago)');
reset role;
update public.job_steps set locked_until = now() - interval '1 second' where id = 'e5000000-0000-4000-8000-000000000001';
set local role service_role;
select results_eq($$ select id, lease_expiries, lease_owner, status from public.claim_job_step('0e000000-0000-4000-8000-000000000004', 60) $$,
  $$ values ('e5000000-0000-4000-8000-000000000001'::uuid, 1, '0e000000-0000-4000-8000-000000000004'::uuid, 'running'::text) $$,
  'an expired lease is reclaimed and counted');
select throws_ok($$ select * from public.claim_job_step('0e000000-0000-4000-8000-000000000005', 29) $$,
  '22023', 'lease must be 30-290 seconds', 'a lease under 30 s is refused');
select throws_ok($$ select * from public.claim_job_step('0e000000-0000-4000-8000-000000000005', 291) $$,
  '22023', 'lease must be 30-290 seconds', 'a lease over 290 s is refused');
reset role;

-- Queue health: a number, to anon and authenticated (R11).
select ok(has_function_privilege('anon', 'public.queue_age()', 'execute')
      and has_function_privilege('authenticated', 'public.queue_age()', 'execute')
      and not has_function_privilege('service_role', 'public.queue_age()', 'execute'),
  'queue_age is executable by anon and authenticated only');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.queue_age(), null::integer, 'queue_age is null when nothing is runnable');
reset role;
insert into public.job_steps (job_id, kind, page_no, not_before)
  values ('f1000000-0000-4000-8000-000000000001', 'extract_page', 7, now() - interval '7 hours');
set local role anon;
select is(public.queue_age(), 25200, 'queue_age is the wait of the oldest runnable step (7 h)');
reset role;

-- The admin may park or skip a step, never run it; storage_usage is admin-only numbers.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.queue_age(), 25200, 'an admin session reads queue_age too');
select throws_ok($$ update public.job_steps set status = 'running' where id = 'e5000000-0000-4000-8000-000000000003' $$,
  '42501', null, 'the admin cannot set a step running (with check)');
select lives_ok($$ update public.job_steps set status = 'skipped' where id = 'e5000000-0000-4000-8000-000000000003' $$,
  'the admin can skip a step');
select is((select status from public.job_steps where id = 'e5000000-0000-4000-8000-000000000003'), 'skipped',
  'and the skip took');
select ok((select storage_bytes is not null and database_bytes > 0 from public.storage_usage()),
  'storage_usage returns sizes to the admin');

-- The private bucket.
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('documents', 'd1000000-0000-4000-8000-000000000001.pdf') $$,
  'the admin can upload into the documents bucket');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('documents', 'd2000000-0000-4000-8000-000000000002.pdf') $$,
  '42501', null, 'a non-admin cannot upload into the documents bucket');
select is((select count(*) from storage.objects where bucket_id = 'documents'), 0::bigint,
  'a non-admin cannot list the documents bucket');
select ok((select storage_bytes is null and database_bytes is null from public.storage_usage()),
  'storage_usage returns nulls to a non-admin');
reset role;
select ok((select not b.public and b.file_size_limit = 52428800 and b.allowed_mime_types = array['application/pdf']
             from storage.buckets b where b.id = 'documents'),
  'bucket documents is private, 50 MB, PDF only');
select ok(has_function_privilege('authenticated', 'public.storage_usage()', 'execute')
      and not has_function_privilege('anon', 'public.storage_usage()', 'execute')
      and not has_function_privilege('service_role', 'public.storage_usage()', 'execute'),
  'storage_usage is executable by authenticated only');

select * from finish();
rollback;
