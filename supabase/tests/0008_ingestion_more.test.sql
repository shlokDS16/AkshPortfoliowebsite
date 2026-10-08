-- 20261007000008_ingestion_more.sql: more document kinds, step kinds and wait reasons, the pass column, the unit
-- ledger, digests and reading proposals (Plan 2b Task 1; controller rulings R1, R2, R4, R8, R9, R17, R20).
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(125);

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
insert into public.documents (id, title, sha256, bytes) values
  ('d1000000-0000-4000-8000-000000000001', 'Kaveri AR 2026', repeat('a', 64), 1000);
insert into public.document_pages (document_id, page_no, text) values
  ('d1000000-0000-4000-8000-000000000001', 1, 'Revenue from operations 1,234.5 crore ' || repeat('Revenue grew. ', 5)),
  ('d1000000-0000-4000-8000-000000000001', 2, 'scan');
insert into public.extractions (id, document_id, page_no, model, prompt_version, input_hash, output)
  values ('f1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 1, 'm', 'digest-v1', repeat('f', 64), '{}'),
         ('f2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 1, 'm', 'digest-v1', repeat('e', 64), '{}');

-- 1. Structure.
select has_table('public', 'document_digests', 'document_digests exists');
select has_table('public', 'reading_proposals', 'reading_proposals exists');
select ok((select bool_and(c.relrowsecurity) from pg_class c
            where c.oid in ('public.document_digests'::regclass, 'public.reading_proposals'::regclass)),
  'RLS is enabled on both new tables');
select has_column('public', 'documents', 'fetched_from', 'documents has fetched_from');
select has_column('public', 'documents', 'transcript_status', 'documents has transcript_status');
select has_column('public', 'document_pages', 'ocr', 'document_pages has ocr');
select has_column('public', 'job_steps', 'pass', 'job_steps has pass (R2)');

-- 2. Privileges: anon nothing; the machine reads and inserts only; Aksh reads digests and decides on readings.
select is_empty($$
  select c.relname from pg_class c
   where c.oid in ('public.document_digests'::regclass, 'public.reading_proposals'::regclass)
     and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
          or has_any_column_privilege('anon', c.oid, 'select,insert,update,references'))
$$, 'anon holds no privilege on digests or reading proposals');
select ok(has_table_privilege('service_role', 'public.document_digests', 'select,insert')
      and has_table_privilege('service_role', 'public.reading_proposals', 'select,insert')
      and not has_any_column_privilege('service_role', 'public.document_digests', 'update')
      and not has_any_column_privilege('service_role', 'public.reading_proposals', 'update')
      and not has_table_privilege('service_role', 'public.document_digests', 'delete')
      and not has_table_privilege('service_role', 'public.reading_proposals', 'delete'),
  'service_role selects and inserts digests and readings, never updates or deletes them');
select ok(has_table_privilege('authenticated', 'public.document_digests', 'select')
      and not has_any_column_privilege('authenticated', 'public.document_digests', 'insert,update')
      and has_table_privilege('authenticated', 'public.reading_proposals', 'select')
      and not has_any_column_privilege('authenticated', 'public.reading_proposals', 'insert')
      and not has_column_privilege('authenticated', 'public.reading_proposals', 'machine_value', 'update')
      and not has_column_privilege('authenticated', 'public.reading_proposals', 'test_id', 'update'),
  'authenticated reads digests and readings, inserts neither, never changes machine_value or test_id');
select ok(has_column_privilege('service_role', 'public.document_pages', 'ocr', 'update')
      and has_column_privilege('service_role', 'public.documents', 'page_count', 'update')
      and not has_column_privilege('service_role', 'public.documents', 'status', 'update')
      and not has_column_privilege('service_role', 'public.documents', 'kind', 'update')
      and not has_column_privilege('service_role', 'public.documents', 'transcript_status', 'update')
      and not has_column_privilege('service_role', 'public.documents', 'fetched_from', 'update')
      and not has_column_privilege('authenticated', 'public.document_pages', 'ocr', 'update')
      and has_column_privilege('authenticated', 'public.documents', 'transcript_status', 'update')
      and not has_column_privilege('authenticated', 'public.documents', 'fetched_from', 'update')
      and has_column_privilege('authenticated', 'public.job_steps', 'pass', 'insert'),
  'grants: service_role may set ocr, still only page_count on documents; Aksh may set transcript_status and pass');

-- 3. Documents: new kinds and storage paths (R17).
select lives_ok($$ insert into public.documents (id, title, kind, sha256, bytes, storage_path) values
    ('d3000000-0000-4000-8000-000000000003', 'Photo', 'image', repeat('3', 64), 10, 'd3000000-0000-4000-8000-000000000003.jpg'),
    ('d4000000-0000-4000-8000-000000000004', 'Voice', 'audio', repeat('4', 64), 10, 'd4000000-0000-4000-8000-000000000004.m4a'),
    ('d5000000-0000-4000-8000-000000000005', 'Link', 'url', repeat('5', 64), 10, 'd5000000-0000-4000-8000-000000000005.txt'),
    ('d6000000-0000-4000-8000-000000000006', 'Pasted', 'text', repeat('6', 64), 10, 'd6000000-0000-4000-8000-000000000006.txt'),
    ('d7000000-0000-4000-8000-000000000007', 'Png', 'image', repeat('7', 64), 10, 'd7000000-0000-4000-8000-000000000007.png'),
    ('d8000000-0000-4000-8000-000000000008', 'Webp', 'image', repeat('8', 64), 10, 'd8000000-0000-4000-8000-000000000008.webp'),
    ('d9000000-0000-4000-8000-000000000009', 'Mp3', 'audio', repeat('9', 64), 10, 'd9000000-0000-4000-8000-000000000009.mp3'),
    ('da000000-0000-4000-8000-00000000000a', 'Webm', 'audio', repeat('b', 64), 10, 'da000000-0000-4000-8000-00000000000a.webm') $$,
  'image, audio, url and text documents take jpg, m4a, png, webp, mp3, webm and txt paths');
select throws_ok($$ insert into public.documents (title, kind, sha256, bytes) values ('Video', 'video', repeat('c', 64), 10) $$,
  '23514', null, 'an unknown kind is still refused');
select throws_ok($$ insert into public.documents (title, sha256, bytes, storage_path)
                    values ('Gif', repeat('d', 64), 10, 'd3000000-0000-4000-8000-0000000000ff.gif') $$,
  '23514', null, 'a gif path is refused');
select throws_ok($$ insert into public.documents (title, sha256, bytes, storage_path)
                    values ('Exe', repeat('d', 64), 10, 'd3000000-0000-4000-8000-0000000000ff.exe') $$,
  '23514', null, 'an exe path is refused');
select lives_ok($$ update public.documents set fetched_from = 'https://www.bseindia.com/a.pdf'
                   where id = 'd5000000-0000-4000-8000-000000000005' $$, 'fetched_from takes an https link');
select throws_ok($$ update public.documents set fetched_from = 'http://example.com/a' where id = 'd5000000-0000-4000-8000-000000000005' $$,
  '23514', null, 'fetched_from refuses http');
select throws_ok($$ update public.documents set fetched_from = 'javascript:alert(1)' where id = 'd5000000-0000-4000-8000-000000000005' $$,
  '23514', null, 'fetched_from refuses any other scheme');
select lives_ok($$ update public.documents set transcript_status = 'pending' where id = 'd4000000-0000-4000-8000-000000000004';
                   update public.documents set transcript_status = 'saved' where id = 'd4000000-0000-4000-8000-000000000004';
                   update public.documents set transcript_status = 'discarded' where id = 'd4000000-0000-4000-8000-000000000004' $$,
  'transcript_status takes pending, saved and discarded');
select throws_ok($$ update public.documents set transcript_status = 'done' where id = 'd4000000-0000-4000-8000-000000000004' $$,
  '23514', null, 'transcript_status refuses anything else');

-- 4. Bucket: the new mime types.
select ok((select not b.public and b.file_size_limit = 52428800
                  and b.allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
                                                   'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'text/plain']
             from storage.buckets b where b.id = 'documents'),
  'bucket documents is private, 50 MB, and takes PDF, photos, voice and text/plain');

-- 5. Jobs and steps: new kinds, wait reasons and the pass column.
select lives_ok($$ insert into public.jobs (id, kind, document_id) values
    ('f1000000-0000-4000-8000-000000000001', 'ingest_pdf', 'd1000000-0000-4000-8000-000000000001'),
    ('f3000000-0000-4000-8000-000000000003', 'ingest_image', 'd3000000-0000-4000-8000-000000000003'),
    ('f4000000-0000-4000-8000-000000000004', 'ingest_audio', 'd4000000-0000-4000-8000-000000000004'),
    ('f5000000-0000-4000-8000-000000000005', 'ingest_url', 'd5000000-0000-4000-8000-000000000005'),
    ('f6000000-0000-4000-8000-000000000006', 'ingest_text', 'd6000000-0000-4000-8000-000000000006') $$,
  'jobs take ingest_image, ingest_audio, ingest_url and ingest_text');
select throws_ok($$ insert into public.jobs (kind, document_id) values ('ingest_video', 'd7000000-0000-4000-8000-000000000007') $$,
  '23514', null, 'an unknown job kind is refused');
select lives_ok($$ insert into public.job_steps (job_id, kind, page_no) values
    ('f1000000-0000-4000-8000-000000000001', 'ocr_page', 2),
    ('f1000000-0000-4000-8000-000000000001', 'vision_page', 1),
    ('f1000000-0000-4000-8000-000000000001', 'transcribe', 1),
    ('f1000000-0000-4000-8000-000000000001', 'text_pages', 1),
    ('f1000000-0000-4000-8000-000000000001', 'classify_pages', 3),
    ('f1000000-0000-4000-8000-000000000001', 'digest_page', 4) $$,
  'steps take ocr_page, vision_page, transcribe, text_pages, classify_pages and digest_page, each with a page');
select throws_ok($$ insert into public.job_steps (job_id, kind, page_no) values ('f1000000-0000-4000-8000-000000000001', 'fetch_url', 1) $$,
  '23514', null, 'fetch_url is not a step kind (R1)');
select throws_ok($$ insert into public.job_steps (job_id, kind) values ('f1000000-0000-4000-8000-000000000001', 'ocr_page') $$,
  '23514', null, 'a new page-scoped step without a page is refused');
select is((select pass from public.job_steps where job_id = 'f1000000-0000-4000-8000-000000000001' and kind = 'ocr_page'), 1::smallint,
  'pass defaults to 1');
select throws_ok($$ insert into public.job_steps (job_id, kind, page_no, pass) values ('f1000000-0000-4000-8000-000000000001', 'extract_page', 9, 0) $$,
  '23514', null, 'pass 0 is refused');
select throws_ok($$ insert into public.job_steps (job_id, kind, page_no, pass) values ('f1000000-0000-4000-8000-000000000001', 'extract_page', 9, 10) $$,
  '23514', null, 'pass 10 is refused');
select throws_ok($$ insert into public.job_steps (job_id, kind, page_no) values ('f1000000-0000-4000-8000-000000000001', 'ocr_page', 2) $$,
  '23505', null, 'the same (job, kind, page, pass) twice is refused');
select lives_ok($$ insert into public.job_steps (job_id, kind, page_no, pass) values
    ('f1000000-0000-4000-8000-000000000001', 'ocr_page', 2, 2),
    ('f1000000-0000-4000-8000-000000000001', 'select_pages', null, 1),
    ('f1000000-0000-4000-8000-000000000001', 'select_pages', null, 2) $$,
  'a later pass of the same page, and a second select_pages pass, are allowed (R2)');
select throws_ok($$ insert into public.job_steps (job_id, kind, pass) values ('f1000000-0000-4000-8000-000000000001', 'select_pages', 2) $$,
  '23505', null, 'select_pages stays once per job and pass (nulls not distinct)');
select lives_ok($$ insert into public.job_steps (job_id, kind, page_no, pass) values
    ('f1000000-0000-4000-8000-000000000001', 'ocr_page', 2, 2), ('f1000000-0000-4000-8000-000000000001', 'select_pages', null, 2)
    on conflict (job_id, kind, page_no, pass) do nothing $$,
  'on conflict (job_id, kind, page_no, pass) do nothing absorbs a duplicate enqueue');
select is((select count(*) from public.job_steps where job_id = 'f1000000-0000-4000-8000-000000000001' and kind in ('ocr_page', 'select_pages')),
  4::bigint, 'and adds no row');
select lives_ok($$ do $b$ begin
    update public.job_steps set wait_reason = 'ocr_day' where kind = 'ocr_page' and pass = 1;
    update public.job_steps set wait_reason = 'ocr_off' where kind = 'ocr_page' and pass = 1;
    update public.job_steps set wait_reason = 'voice_hour' where kind = 'ocr_page' and pass = 1;
    update public.job_steps set wait_reason = 'voice_day' where kind = 'ocr_page' and pass = 1;
    update public.job_steps set wait_reason = 'groq_minute' where kind = 'ocr_page' and pass = 1;
  end $b$ $$, 'wait_reason takes ocr_day, ocr_off, voice_hour and voice_day, and the old values');
select throws_ok($$ update public.job_steps set wait_reason = 'ocr_month' where kind = 'ocr_page' and pass = 1 $$,
  '23514', null, 'ocr_month is not a wait reason (R9)');

-- Aksh's step inserts (R6): the readers he may start, not the machine's own steps.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into public.job_steps (job_id, kind, page_no) values
    ('f3000000-0000-4000-8000-000000000003', 'ocr_page', 1),
    ('f4000000-0000-4000-8000-000000000004', 'transcribe', 1),
    ('f5000000-0000-4000-8000-000000000005', 'text_pages', 1),
    ('f1000000-0000-4000-8000-000000000001', 'digest_page', 7),
    ('f1000000-0000-4000-8000-000000000001', 'extract_page', 5),
    ('f1000000-0000-4000-8000-000000000001', 'pdf_text', 1) $$,
  'the admin queues ocr_page, transcribe, text_pages, digest_page, extract_page and pdf_text');
select lives_ok($$ insert into public.job_steps (job_id, kind, page_no, pass) values ('f1000000-0000-4000-8000-000000000001', 'extract_page', 5, 2) $$,
  'the admin queues a later pass of a page (a re-read)');
select throws_ok($$ insert into public.job_steps (job_id, kind, page_no) values ('f1000000-0000-4000-8000-000000000001', 'vision_page', 8) $$,
  '42501', null, 'but not vision_page (with check)');
select throws_ok($$ insert into public.job_steps (job_id, kind, page_no) values ('f1000000-0000-4000-8000-000000000001', 'classify_pages', 8) $$,
  '42501', null, 'nor classify_pages');
select throws_ok($$ insert into public.job_steps (job_id, kind) values ('f1000000-0000-4000-8000-000000000001', 'select_pages') $$,
  '42501', null, 'nor select_pages');
-- transcript_status is the admin's; fetched_from is set at insert only.
select lives_ok($$ update public.documents set transcript_status = 'saved' where id = 'd4000000-0000-4000-8000-000000000004' $$,
  'the admin sets transcript_status');
select throws_ok($$ update public.documents set fetched_from = 'https://example.com/x' where id = 'd5000000-0000-4000-8000-000000000005' $$,
  '42501', null, 'but cannot change fetched_from afterwards');
select throws_ok($$ update public.document_pages set ocr = true where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 2 $$,
  '42501', null, 'the admin cannot mark a page as OCR text');
reset role;
select set_config('request.jwt.claims', '', true);

-- 6. OCR flag: job code sets it when it fills a scan page.
set local role service_role;
select lives_ok($$ update public.document_pages set text = repeat('OCR text here. ', 5), ocr = true
                   where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 2 $$,
  'service_role fills a scan page and marks it ocr');
select is((select ocr from public.document_pages where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 2), true,
  'and the flag took');
select is((select ocr from public.document_pages where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 1), false,
  'a digital page is not ocr by default');
select throws_ok($$ update public.document_pages set text = 'again' where document_id = 'd1000000-0000-4000-8000-000000000001' and page_no = 2 $$,
  'P0001', 'document_pages.text is written once', 'the fill-once guard still holds');

-- 7. The ledger: block reasons widened, reserve_units (R9).
select lives_ok($$ insert into public.provider_usage (bucket, kind, retry_after_s, blocked_until, block_reason) values
    ('ocr-blocked', 'rate_limited', 30, clock_timestamp() + interval '30 seconds', 'ocr_day'),
    ('b-vh', 'rate_limited', 30, clock_timestamp() + interval '30 seconds', 'voice_hour'),
    ('b-vd', 'rate_limited', 30, clock_timestamp() + interval '30 seconds', 'voice_day') $$,
  'a block row may name ocr_day, voice_hour or voice_day');
select throws_ok($$ insert into public.provider_usage (bucket, kind, retry_after_s, blocked_until, block_reason)
                    values ('b-x', 'rate_limited', 30, clock_timestamp() + interval '30 seconds', 'ocr_month') $$,
  '23514', null, 'ocr_month is refused');
select is((select format('%s,%s,%s', r.ok, r.reason, r.not_before = (select max(blocked_until) from public.provider_usage where bucket = 'ocr-blocked'))
             from public.reserve_units('ocr-blocked', 1, null, null, 375, null, null) r),
  'f,ocr_day,t', 'a future blocked_until blocks with its block_reason');
select ok((select r.ok and r.reservation_id is not null and r.reason is null from public.reserve_units('ocrspace', 1, null, null, 2, null, null) r),
  'the first scan read is ok');
select ok((select r.ok from public.reserve_units('ocrspace', 1, null, null, 2, null, null) r), 'and the second');
select is((select format('%s,%s,%s', r.ok, r.reason, r.not_before between clock_timestamp() + interval '23 hours 59 minutes'
                                                                      and clock_timestamp() + interval '24 hours')
             from public.reserve_units('ocrspace', 1, null, null, 2, null, null) r),
  'f,ocr_day,t', 'the third waits about 24 h and is named ocr_day');
select is((select count(*) from public.provider_usage where bucket = 'ocrspace'), 2::bigint, 'a refused reservation writes nothing');
select ok((select r.ok from public.reserve_units('whisper-h', 3000, null, 5400, 21600, 15, 1500) r), 'a voice note takes the hour budget');
select is((select format('%s,%s,%s', r.ok, r.reason, r.not_before between clock_timestamp() + interval '59 minutes'
                                                                      and clock_timestamp() + interval '1 hour')
             from public.reserve_units('whisper-h', 3000, null, 5400, 21600, 15, 1500) r),
  'f,voice_hour,t', 'past the hour budget the next one waits about an hour (voice_hour)');
select ok((select r.ok from public.reserve_units('whisper-d', 3000, null, null, 5000, null, null) r), 'a day bucket takes a first call');
select is((select format('%s,%s', r.ok, r.reason) from public.reserve_units('whisper-d', 3000, null, null, 5000, null, null) r),
  'f,voice_day', 'past the day budget the call waits (voice_day)');
select ok((select r.ok from public.reserve_units('whisper-rpm', 10, null, null, null, 1, null) r), 'a one-request-a-minute bucket takes a call');
select is((select format('%s,%s', r.ok, r.reason) from public.reserve_units('whisper-rpm', 10, null, null, null, 1, null) r),
  'f,groq_minute', 'the request-per-minute cap counts calls and waits as groq_minute');
select ok((select r.ok from public.reserve_units('whisper-rpd', 10, null, null, null, null, 1) r), 'a one-request-a-day bucket takes a call');
select is((select format('%s,%s', r.ok, r.reason) from public.reserve_units('whisper-rpd', 10, null, null, null, null, 1) r),
  'f,voice_day', 'the request-per-day cap counts calls and waits as voice_day');
select ok((select r.ok from public.reserve_units('whisper-m', 60, 100, null, null, null, null) r), 'a minute-unit bucket takes a call');
select is((select format('%s,%s', r.ok, r.reason) from public.reserve_units('whisper-m', 60, 100, null, null, null, null) r),
  'f,groq_minute', 'a second 60-unit call inside the minute cap of 100 waits (groq_minute)');
select ok((select r.ok from public.reserve_units('whisper-free', 500, null, null, null, 20, null) r),
  'null caps mean no cap on that window');
select ok((select r.ok from public.reserve_units('whisper-rel', 3000, null, 5400, null, null, null) r), 'a reservation to release');
select lives_ok($$ update public.provider_usage set status = 'released', tokens_used = 0 where bucket = 'whisper-rel' $$,
  'service_role releases it');
select ok((select r.ok from public.reserve_units('whisper-rel', 3000, null, 5400, null, null, null) r), 'released reservations do not count');
select lives_ok($$ update public.provider_usage set tokens_used = 1000 where bucket = 'whisper-h' and status = 'reserved' $$,
  'a reservation reconciles to the measured units');
select ok((select r.ok from public.reserve_units('whisper-h', 4000, null, 5400, 21600, 15, 1500) r),
  'and the measured 1,000 (not the 3,000 estimate) is what counts afterwards: 1,000 + 4,000 fits 5,400');
select throws_ok($$ select * from public.reserve_units('nonsense', 1, null, null, 10, null, null) $$, '22023', null,
  'an unknown bucket family is refused (no silent voice_day)');
select throws_ok($$ select * from public.reserve_units('whisper-x', 0, null, null, 10, null, null) $$, '22023', null, 'zero units are refused');
select throws_ok($$ select * from public.reserve_units('whisper-x', 10, null, null, null, null, null) $$, '22023', null, 'a call with no cap at all is refused');
select throws_ok($$ select * from public.reserve_units('whisper-x', 6000, null, 5400, 21600, null, null) $$, '22023', null,
  'one call larger than the hour cap is refused');
select throws_ok($$ select * from public.reserve_units('whisper-x', 10, 0, null, 10, null, null) $$, '22023', null, 'a zero cap is refused');
reset role;

-- 8. Both functions: service_role only, SECURITY DEFINER with an empty search_path.
select ok(has_function_privilege('service_role', 'public.reserve_units(text, integer, integer, integer, integer, integer, integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.reserve_units(text, integer, integer, integer, integer, integer, integer)', 'execute')
      and not has_function_privilege('anon', 'public.reserve_units(text, integer, integer, integer, integer, integer, integer)', 'execute'),
  'reserve_units is executable by service_role only');
select is_definer('public', 'reserve_units', array['text', 'integer', 'integer', 'integer', 'integer', 'integer', 'integer'],
  'reserve_units is SECURITY DEFINER');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reserve_units'
     and not (p.prosecdef and 'search_path=""' = any (coalesce(p.proconfig, '{}'::text[])))
$$, 'reserve_units pins an empty search_path');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select * from public.reserve_units('m', 1, null, null, 10, null, null) $$, '42501', null,
  'even the admin session cannot call reserve_units');
reset role;
select set_config('request.jwt.claims', '', true);

-- 9. Digests: the machine writes once, idempotently (R20).
set local role service_role;
select lives_ok($$ insert into public.document_digests (document_id, page_no, extraction_id, ord, section, claim, line, on_page)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', 0,
            'Outlook', 'Management expects growth.', 'Revenue grew.', true) $$,
  'service_role inserts a digest line');
select lives_ok($$ insert into public.document_digests (document_id, page_no, extraction_id, ord, section, claim, line, on_page)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', 0,
            'Outlook', 'Management expects growth.', 'Revenue grew.', true)
    on conflict (document_id, page_no, extraction_id, ord) do nothing $$,
  'the same claim again (a lost lease) is absorbed by on conflict do nothing');
select is((select count(*) from public.document_digests), 1::bigint, 'and adds no row');
select throws_ok($$ insert into public.document_digests (document_id, page_no, extraction_id, ord, section, claim, line, on_page)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', 0, 'Outlook', 'x', 'y', true) $$,
  '23505', null, 'without on conflict a duplicate is refused');
select lives_ok($$ insert into public.document_digests (document_id, page_no, extraction_id, ord, section, claim, line, on_page)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f2000000-0000-4000-8000-000000000002', 0, 'Outlook', 'x', 'y', false) $$,
  'a re-read under a new extraction adds its own lines');
select throws_ok($$ insert into public.document_digests (document_id, page_no, extraction_id, ord, section, claim, line, on_page)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', 1, 'S', repeat('c', 401), 'y', true) $$,
  '23514', null, 'a claim over 400 characters is refused');
select throws_ok($$ insert into public.document_digests (document_id, page_no, extraction_id, ord, section, claim, line, on_page)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', 1, 'S', 'c', repeat('l', 601), true) $$,
  '23514', null, 'a line over 600 characters is refused');
select throws_ok($$ insert into public.document_digests (document_id, page_no, extraction_id, ord, section, claim, line, on_page)
    values ('d1000000-0000-4000-8000-000000000001', 9, 'f1000000-0000-4000-8000-000000000001', 1, 'S', 'c', 'l', true) $$,
  '23503', null, 'a digest needs a stored page');
select throws_ok($$ update public.document_digests set on_page = false $$, '42501', null, 'service_role holds no UPDATE on digests');
reset role;
select throws_ok($$ update public.document_digests set on_page = false $$, 'P0001',
  'document_digests is append-only: UPDATE is not allowed', 'digests are append-only: UPDATE raises even for the owner');
select throws_ok($$ delete from public.document_digests $$, 'P0001',
  'document_digests is append-only: DELETE is not allowed', 'DELETE raises');
select throws_ok($$ truncate public.document_digests $$, 'P0001',
  'document_digests is append-only: TRUNCATE is not allowed', 'TRUNCATE raises');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.document_digests), 2::bigint, 'the admin reads the digest lines');
select throws_ok($$ insert into public.document_digests (document_id, page_no, extraction_id, ord, section, claim, line, on_page)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', 5, 'S', 'c', 'l', true) $$,
  '42501', null, 'the admin cannot write a digest line');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.document_digests) + (select count(*) from public.reading_proposals), 0::bigint,
  'a non-admin reads no digest or reading');
reset role;
select set_config('request.jwt.claims', '', true);

-- 10. Reading proposals: the machine only proposes (R4).
set local role service_role;
select lives_ok($$ insert into public.reading_proposals (id, document_id, page_no, extraction_id, item_id_hint, test_id, machine_value) values
    ('b1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001',
     'a1000000-0000-4000-8000-000000000001', 'T1', '{"current":"12.5","readingAsOf":"FY26","prior":"11.0","unit":"%"}'),
    ('b2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001',
     null, 'T12', '{"current":"3","readingAsOf":"FY26","prior":null,"unit":"x"}') $$,
  'service_role inserts pending readings');
select lives_ok($$ insert into public.reading_proposals (document_id, page_no, extraction_id, test_id, machine_value)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f2000000-0000-4000-8000-000000000002', 'T1', '{}')
    on conflict (document_id, page_no, test_id, pass) do nothing $$,
  'a rerun of the same pass under a new extraction is absorbed by on conflict do nothing');
select is((select count(*) from public.reading_proposals), 2::bigint, 'and adds no row');
select throws_ok($$ insert into public.reading_proposals (document_id, page_no, extraction_id, test_id, machine_value)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f2000000-0000-4000-8000-000000000002', 'T1', '{}') $$,
  '23505', null, 'without on conflict the same page, test and pass is refused');
select lives_ok($$ insert into public.reading_proposals (document_id, page_no, extraction_id, test_id, machine_value, pass)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f2000000-0000-4000-8000-000000000002', 'T1', '{}', 2)
    on conflict (document_id, page_no, test_id, pass) do nothing $$,
  'a re-read (pass 2) may propose the same test again');
select is((select count(*) from public.reading_proposals), 3::bigint, 'and adds its own row');
select throws_ok($$ insert into public.reading_proposals (document_id, page_no, extraction_id, test_id, machine_value, pass)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f2000000-0000-4000-8000-000000000002', 'T4', '{}', 10) $$,
  '23514', null, 'pass 10 is refused');
select throws_ok($$ insert into public.reading_proposals (document_id, page_no, extraction_id, test_id, machine_value)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f2000000-0000-4000-8000-000000000002', 'T5', '[1]') $$,
  '23514', null, 'machine_value must be a JSON object');
select throws_ok($$ insert into public.reading_proposals (document_id, page_no, extraction_id, test_id, machine_value)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', 'F1', '{}') $$,
  '23514', null, 'a reading needs a test id of the form T<n>');
select throws_ok($$ insert into public.reading_proposals (document_id, page_no, extraction_id, test_id, machine_value)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', 'T1234', '{}') $$,
  '23514', null, 'a four-digit test id is refused');
select throws_ok($$ insert into public.reading_proposals (document_id, page_no, extraction_id, machine_value)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', '{}') $$,
  '23502', null, 'a reading without a test id is refused');
select throws_ok($$ insert into public.reading_proposals (document_id, page_no, extraction_id, test_id, machine_value, status)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', 'T2', '{}', 'accepted') $$,
  'P0001', 'the machine only proposes: a new reading is pending and undecided', 'the machine cannot insert an accepted reading');
select throws_ok($$ insert into public.reading_proposals (document_id, page_no, extraction_id, test_id, machine_value, item_id)
    values ('d1000000-0000-4000-8000-000000000001', 1, 'f1000000-0000-4000-8000-000000000001', 'T3', '{}', 'a1000000-0000-4000-8000-000000000001') $$,
  'P0001', 'the machine only proposes: a new reading is pending and undecided', 'nor file one under an item');
select throws_ok($$ update public.reading_proposals set status = 'accepted' $$, '42501', null, 'service_role holds no UPDATE on readings');
reset role;

-- Layer 3: the guard refuses the machine even if a grant is ever added, and under service_role claims.
grant update on public.reading_proposals to service_role;
set local role service_role;
select throws_ok($$ update public.reading_proposals set status = 'accepted' $$, '42501',
  'only Aksh decides on a reading (ADR-004 s4.2)', 'a granted service_role still cannot decide');
reset role;
revoke update on public.reading_proposals from service_role;
select throws_ok($$ update public.reading_proposals set machine_value = '{"current":"1"}' $$, 'P0001',
  'what the machine read is never changed', 'machine_value never changes, not even for the owner');
select throws_ok($$ update public.reading_proposals set test_id = 'T9' $$, 'P0001',
  'what the machine read is never changed', 'nor the test id');
select throws_ok($$ update public.reading_proposals set pass = 3 $$, 'P0001',
  'what the machine read is never changed', 'nor the pass');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$ update public.reading_proposals set status = 'rejected' $$, '42501',
  'only Aksh decides on a reading (ADR-004 s4.2)', 'an owner-rights update under service_role claims is refused');
select set_config('request.jwt.claims', '', true);

-- Aksh decides and files.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.reading_proposals), 3::bigint, 'the admin sees the readings');
select lives_ok($$ update public.reading_proposals set status = 'accepted', item_id = 'a1000000-0000-4000-8000-000000000001', decided_at = now()
                   where id = 'b1000000-0000-4000-8000-000000000001' $$,
  'the admin accepts a reading and files it under an item');
select throws_ok($$ update public.reading_proposals set machine_value = '{}' where id = 'b1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'the admin cannot change machine_value (no column privilege)');
select throws_ok($$ update public.reading_proposals set status = 'pending' where id = 'b1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'a decision is never undone to pending (with check)');
select throws_ok($$ update public.reading_proposals set status = 'filed' where id = 'b1000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'filed without a revision_id violates the check');
select throws_ok($$ update public.reading_proposals set status = 'filed', revision_id = 'e2000000-0000-4000-8000-000000000002'
                    where id = 'b1000000-0000-4000-8000-000000000001' $$,
  '23514', 'a reading is filed only under a revision of its own item', 'a reading cannot be filed under another item''s revision');
select lives_ok($$ update public.reading_proposals set status = 'filed', revision_id = 'e1000000-0000-4000-8000-000000000001'
                   where id = 'b1000000-0000-4000-8000-000000000001' $$,
  'the admin marks the reading filed with its revision');
select throws_ok($$ update public.reading_proposals set status = 'rejected' where id = 'b1000000-0000-4000-8000-000000000001' $$,
  'P0001', 'a filed reading is final', 'a filed reading cannot change');
select lives_ok($$ update public.reading_proposals set status = 'rejected', decided_at = now()
                   where id = 'b2000000-0000-4000-8000-000000000002' $$,
  'the admin rejects a reading');
reset role;
select set_config('request.jwt.claims', '', true);

-- A signed-in non-admin sees and writes nothing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.reading_proposals), 0::bigint, 'a non-admin sees no reading');
select is_empty($$ update public.reading_proposals set status = 'rejected' where id = 'b2000000-0000-4000-8000-000000000002' returning id $$,
  'and a non-admin update affects no row');
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
