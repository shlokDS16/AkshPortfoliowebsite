-- 20261014000017_valuation.sql: valuation versions, Aksh's cell designations, his scenarios, the xlsx upload path and the three
-- functions (Plan 2.7 Task 2; spec s6, s8, s12). Rule 9: anon holds nothing. The hard rule: machine columns and his words never share a table.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(117);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');
insert into public.companies (id, slug, name) values
  ('cccccccc-0000-4000-8000-000000000001', 'kav', 'Kaveri'),
  ('cccccccc-0000-4000-8000-000000000002', 'beta', 'Beta');
-- Documents (the owner inserts them, as the upload does through Aksh's session): three workbooks of Kaveri, one of Beta,
-- one workbook with no company, one PDF.
insert into public.documents (id, title, company_id, kind, sha256, bytes, storage_path) values
  ('d1000000-0000-4000-8000-000000000001', 'Kaveri model v1', 'cccccccc-0000-4000-8000-000000000001', 'xlsx', repeat('1', 64), 1000, 'd1000000-0000-4000-8000-000000000001.xlsx'),
  ('d1000000-0000-4000-8000-000000000002', 'Kaveri model v2', 'cccccccc-0000-4000-8000-000000000001', 'xlsx', repeat('2', 64), 1000, 'd1000000-0000-4000-8000-000000000002.xlsx'),
  ('d1000000-0000-4000-8000-000000000003', 'Beta model', 'cccccccc-0000-4000-8000-000000000002', 'xlsx', repeat('3', 64), 1000, 'd1000000-0000-4000-8000-000000000003.xlsx'),
  ('d1000000-0000-4000-8000-000000000004', 'No company', null, 'xlsx', repeat('4', 64), 1000, 'd1000000-0000-4000-8000-000000000004.xlsx'),
  ('d1000000-0000-4000-8000-000000000005', 'A pdf', 'cccccccc-0000-4000-8000-000000000001', 'pdf', repeat('5', 64), 1000, 'd1000000-0000-4000-8000-000000000005.pdf');

create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, service_role;

-- 1. Structure: four tables, RLS on each.
select has_table('public', 'valuation_versions', 'valuation_versions exists');
select has_table('public', 'valuation_cells', 'valuation_cells exists');
select has_table('public', 'valuation_scenarios', 'valuation_scenarios exists');
select has_table('public', 'valuation_scenario_values', 'valuation_scenario_values exists');
select ok((select bool_and(c.relrowsecurity) from pg_class c
            where c.oid in ('public.valuation_versions'::regclass, 'public.valuation_cells'::regclass,
                            'public.valuation_scenarios'::regclass, 'public.valuation_scenario_values'::regclass)),
  'RLS is enabled on all four tables');
select hasnt_column('public', 'valuation_versions', 'visibility', 'no visibility column on versions (rule 9)');
select hasnt_column('public', 'valuation_cells', 'visibility', 'no visibility column on cells (rule 9)');
select hasnt_column('public', 'valuation_scenarios', 'visibility', 'no visibility column on scenarios (rule 9)');

-- 2. The upload path accepts a workbook and its model object.
select lives_ok($$ insert into public.documents (title, kind, sha256, bytes, storage_path)
                   values ('Path', 'xlsx', repeat('b', 64), 10, 'd1000000-0000-4000-8000-0000000000bb.xlsx') $$,
  'the storage path check accepts <uuid>.xlsx');
select throws_ok($$ insert into public.documents (title, kind, sha256, bytes, storage_path)
                    values ('Macro', 'xlsx', repeat('a', 64), 10, 'd1000000-0000-4000-8000-0000000000aa.xlsm') $$,
  '23514', null, 'a storage path ending .xlsm is refused');
select is((select count(*) from public.documents where kind = 'xlsx'), 5::bigint, 'the document kind xlsx is accepted (the five workbooks above)');
select lives_ok($$ insert into public.jobs (kind, document_id) values ('ingest_xlsx', 'd1000000-0000-4000-8000-000000000001') $$,
  'the job kind ingest_xlsx is accepted');
select lives_ok($$ insert into public.job_steps (job_id, kind, page_no)
                   select j.id, 'xlsx_read', 1 from public.jobs j where j.kind = 'ingest_xlsx' $$,
  'the step kind xlsx_read is accepted');
select ok((select 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' = any (allowed_mime_types)
              and 'application/json' = any (allowed_mime_types) and 'application/pdf' = any (allowed_mime_types)
              and file_size_limit = 52428800
             from storage.buckets where id = 'documents'),
  'the documents bucket takes the workbook and the model object, and keeps its 50 MB limit');

-- 3. Rule 9: anon holds nothing at all, has no policy, and cannot call the functions.
select is_empty($$
  select c.relname from pg_class c
   where c.oid in ('public.valuation_versions'::regclass, 'public.valuation_cells'::regclass,
                   'public.valuation_scenarios'::regclass, 'public.valuation_scenario_values'::regclass)
     and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
          or has_any_column_privilege('anon', c.oid, 'select,insert,update,references'))
$$, 'anon holds no privilege on any valuation table');
select is_empty($$
  select policyname from pg_policies
   where schemaname = 'public' and tablename like 'valuation\_%' and (roles && array['anon', 'public']::name[])
$$, 'no valuation policy applies to anon or PUBLIC');
select ok(not has_function_privilege('anon', 'public.start_valuation_version(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.confirm_valuation_version(uuid, jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.save_valuation_scenario(uuid, text, text, jsonb)', 'execute')
      and not has_function_privilege('service_role', 'public.start_valuation_version(uuid)', 'execute')
      and not has_function_privilege('service_role', 'public.confirm_valuation_version(uuid, jsonb)', 'execute')
      and not has_function_privilege('service_role', 'public.save_valuation_scenario(uuid, text, text, jsonb)', 'execute')
      and has_function_privilege('authenticated', 'public.start_valuation_version(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.confirm_valuation_version(uuid, jsonb)', 'execute')
      and has_function_privilege('authenticated', 'public.save_valuation_scenario(uuid, text, text, jsonb)', 'execute'),
  'the three functions are executable by authenticated only');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('start_valuation_version', 'confirm_valuation_version', 'save_valuation_scenario')
     and (not p.prosecdef or not ('search_path=""' = any (coalesce(p.proconfig, '{}'::text[]))))
$$, 'the three functions are SECURITY DEFINER with an empty search_path');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select count(*) from public.valuation_versions $$, '42501', null, 'anon cannot read versions');
select throws_ok($$ select public.start_valuation_version('d1000000-0000-4000-8000-000000000001') $$, '42501', null,
  'anon calling start_valuation_version is denied');
reset role;

-- 4. Privileges of the other roles.
select ok(has_table_privilege('authenticated', 'public.valuation_versions', 'select')
      and has_table_privilege('authenticated', 'public.valuation_cells', 'select')
      and has_table_privilege('authenticated', 'public.valuation_scenarios', 'select')
      and has_table_privilege('authenticated', 'public.valuation_scenario_values', 'select')
      and has_table_privilege('authenticated', 'public.valuation_scenarios', 'delete')
      and not has_any_column_privilege('authenticated', 'public.valuation_versions', 'insert,update')
      and not has_any_column_privilege('authenticated', 'public.valuation_cells', 'insert,update')
      and not has_any_column_privilege('authenticated', 'public.valuation_scenarios', 'insert,update')
      and not has_any_column_privilege('authenticated', 'public.valuation_scenario_values', 'insert,update')
      and not has_table_privilege('authenticated', 'public.valuation_versions', 'delete,truncate')
      and not has_table_privilege('authenticated', 'public.valuation_cells', 'delete,truncate')
      and not has_table_privilege('authenticated', 'public.valuation_scenario_values', 'delete,truncate'),
  'authenticated reads all four, deletes scenarios only, and cannot insert or update anything directly');
select ok(has_table_privilege('service_role', 'public.valuation_versions', 'select')
      and has_column_privilege('service_role', 'public.valuation_versions', 'status', 'update')
      and has_column_privilege('service_role', 'public.valuation_versions', 'refusal', 'update')
      and has_column_privilege('service_role', 'public.valuation_versions', 'model_path', 'update')
      and has_column_privilege('service_role', 'public.valuation_versions', 'sheet_count', 'update')
      and has_column_privilege('service_role', 'public.valuation_versions', 'cell_count', 'update')
      and has_column_privilege('service_role', 'public.valuation_versions', 'formula_count', 'update')
      and has_column_privilege('service_role', 'public.valuation_versions', 'report', 'update')
      and has_column_privilege('service_role', 'public.valuation_versions', 'engine', 'update')
      and has_column_privilege('service_role', 'public.valuation_versions', 'read_at', 'update')
      and not has_column_privilege('service_role', 'public.valuation_versions', 'confirmed_at', 'update')
      and not has_column_privilege('service_role', 'public.valuation_versions', 'company_id', 'update')
      and not has_column_privilege('service_role', 'public.valuation_versions', 'document_id', 'update')
      and not has_column_privilege('service_role', 'public.valuation_versions', 'version_no', 'update')
      and not has_table_privilege('service_role', 'public.valuation_versions', 'insert,delete,truncate'),
  'service_role reads versions and updates exactly the nine machine columns');
select is_empty($$
  select c.relname from pg_class c
   where c.oid in ('public.valuation_cells'::regclass, 'public.valuation_scenarios'::regclass, 'public.valuation_scenario_values'::regclass)
     and (has_table_privilege('service_role', c.oid, 'select,insert,update,delete,truncate,references,trigger')
          or has_any_column_privilege('service_role', c.oid, 'select,insert,update,references'))
$$, 'service_role holds nothing on his three tables');

-- 5. A signed-in non-admin sees nothing and calls nothing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.valuation_versions) + (select count(*) from public.valuation_cells)
        + (select count(*) from public.valuation_scenarios) + (select count(*) from public.valuation_scenario_values), 0::bigint,
  'a non-admin reads no row (nothing exists yet, so the same check is repeated after the fixtures)');
select throws_ok($$ select public.start_valuation_version('d1000000-0000-4000-8000-000000000001') $$, '42501', null,
  'a non-admin cannot start a version');
select throws_ok($$ select public.confirm_valuation_version('f0000000-0000-4000-8000-000000000001', '[]'::jsonb) $$, '42501', null,
  'a non-admin cannot confirm a version');
select throws_ok($$ select public.save_valuation_scenario('f0000000-0000-4000-8000-000000000001', 'x', '', '{}'::jsonb) $$, '42501', null,
  'a non-admin cannot save a scenario');
reset role;

-- 6. start_valuation_version (the admin).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into ctx values ('v1', public.start_valuation_version('d1000000-0000-4000-8000-000000000001'));
select is((select version_no from public.valuation_versions where id = (select v from ctx where k = 'v1')), 1,
  'the first workbook of a company is version 1');
select is((select status from public.valuation_versions where id = (select v from ctx where k = 'v1')), 'reading', 'and starts in reading');
select is(public.start_valuation_version('d1000000-0000-4000-8000-000000000001'), (select v from ctx where k = 'v1'),
  'starting the same document again returns the same version');
insert into ctx values ('v2', public.start_valuation_version('d1000000-0000-4000-8000-000000000002'));
select is((select version_no from public.valuation_versions where id = (select v from ctx where k = 'v2')), 2,
  'the second workbook of the company is version 2');
insert into ctx values ('vb', public.start_valuation_version('d1000000-0000-4000-8000-000000000003'));
select is((select version_no from public.valuation_versions where id = (select v from ctx where k = 'vb')), 1,
  'numbers run per company: another company starts at 1');
select throws_ok($$ select public.start_valuation_version('d1000000-0000-4000-8000-000000000004') $$, '22023', null,
  'a workbook with no company is refused');
select throws_ok($$ select public.start_valuation_version('d1000000-0000-4000-8000-000000000005') $$, '22023', null,
  'a document that is not a workbook is refused');
select throws_ok($$ select public.start_valuation_version('d1000000-0000-4000-8000-0000000000ff') $$, 'P0002', null,
  'an unknown document is refused');
select is((select count(*) from public.valuation_versions), 3::bigint, 'the admin reads the three versions');

-- 7. The admin cannot write machine columns or his tables directly.
select throws_ok($$ insert into public.valuation_versions (company_id, document_id, version_no)
                    values ('cccccccc-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000004', 9) $$,
  '42501', null, 'the admin cannot insert a version');
select throws_ok($$ update public.valuation_versions set status = 'ready', model_path = 'models/' || id || '.json', read_at = now() $$,
  '42501', null, 'the admin cannot update machine columns');
select throws_ok($$ update public.valuation_versions set status = 'confirmed', confirmed_at = now() $$,
  '42501', null, 'nor confirm a version by hand');
select throws_ok($$ insert into public.valuation_cells (version_id, sheet, addr, role)
                    select v, 'DCF', 'B2', 'input' from ctx where k = 'v1' $$,
  '42501', null, 'the admin cannot insert a cell directly');
select throws_ok($$ insert into public.valuation_scenarios (version_id, name) select v, 'x' from ctx where k = 'v1' $$,
  '42501', null, 'nor a scenario');
reset role;

-- 8. service_role writes the machine columns, and only those; it cannot confirm.
set local role service_role;
select lives_ok($$ update public.valuation_versions set status = 'refused', refusal = 'macros', read_at = now()
                    where id = (select v from ctx where k = 'vb') $$,
  'service_role records a refusal');
select throws_ok($$ update public.valuation_versions set refusal = null where id = (select v from ctx where k = 'vb') $$,
  '23514', null, 'a refused version must carry its refusal code');
select throws_ok($$ update public.valuation_versions set status = 'ready' where id = (select v from ctx where k = 'v1') $$,
  '23514', null, 'a ready version must carry its model object');
select throws_ok($$ update public.valuation_versions set model_path = '../x.json' where id = (select v from ctx where k = 'v1') $$,
  '23514', null, 'the model path must be models/<uuid>.json');
select throws_ok($$ update public.valuation_versions set status = 'confirmed' where id = (select v from ctx where k = 'v1') $$,
  '23514', null, 'service_role cannot set a version confirmed (no grant on confirmed_at, and the state check)');
select throws_ok($$ update public.valuation_versions set confirmed_at = now() where id = (select v from ctx where k = 'v1') $$,
  '42501', null, 'nor write confirmed_at');
select throws_ok($$ update public.valuation_versions set version_no = 7 where id = (select v from ctx where k = 'v1') $$,
  '42501', null, 'nor renumber a version');
select throws_ok($$ insert into public.valuation_cells (version_id, sheet, addr, role) select v, 'DCF', 'B2', 'input' from ctx where k = 'v1' $$,
  '42501', null, 'service_role cannot write his cells');
select lives_ok($$ update public.valuation_versions
                      set status = 'ready', model_path = 'models/' || id || '.json', sheet_count = 3, cell_count = 100, formula_count = 40,
                          report = '{"counts":{}}'::jsonb, engine = '{"sheetjs":"0.20.3"}'::jsonb, read_at = now()
                    where id = (select v from ctx where k = 'v1') $$,
  'service_role records a read');
select lives_ok($$ update public.valuation_versions
                      set status = 'ready', model_path = 'models/' || id || '.json', sheet_count = 3, cell_count = 100, formula_count = 40,
                          report = '{"counts":{}}'::jsonb, engine = '{"sheetjs":"0.20.3"}'::jsonb, read_at = now()
                    where id = (select v from ctx where k = 'v1') $$,
  'and a re-run writes the same columns again (idempotent)');
select lives_ok($$ update public.valuation_versions
                      set status = 'ready', model_path = 'models/' || id || '.json', sheet_count = 1, cell_count = 10, formula_count = 4,
                          report = '{}'::jsonb, engine = '{}'::jsonb, read_at = now()
                    where id = (select v from ctx where k = 'v2') $$,
  'service_role records a read of version 2');
reset role;

-- 9. confirm_valuation_version.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'vb'),
    '[{"sheet":"DCF","addr":"B2","role":"input","label":null},{"sheet":"DCF","addr":"B9","role":"output","label":null}]'::jsonb) $$,
  '55000', null, 'a refused version cannot be confirmed');
select throws_ok($$ select public.confirm_valuation_version('f0000000-0000-4000-8000-000000000001', '[]'::jsonb) $$,
  'P0002', null, 'an unknown version is refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'), '[{"sheet":"DCF","addr":"B9","role":"output"}]'::jsonb) $$,
  '22023', null, 'zero inputs are refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'), '[{"sheet":"DCF","addr":"B2","role":"input"}]'::jsonb) $$,
  '22023', null, 'zero results are refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    (select jsonb_agg(jsonb_build_object('sheet', 'DCF', 'addr', 'B' || g, 'role', 'input')) || '[{"sheet":"DCF","addr":"Z1","role":"output"}]'::jsonb
       from generate_series(1, 41) g)) $$,
  '22023', null, '41 inputs are refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    (select jsonb_agg(jsonb_build_object('sheet', 'DCF', 'addr', 'C' || g, 'role', 'output')) || '[{"sheet":"DCF","addr":"Z1","role":"input"}]'::jsonb
       from generate_series(1, 21) g)) $$,
  '22023', null, '21 results are refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    (select jsonb_agg(jsonb_build_object('sheet', 'DCF', 'addr', 'D' || g, 'role', 'output')) from generate_series(1, 61) g)) $$,
  '22023', 'valuation: at most 60 cells', 'more than 60 cells are refused before any is looked at');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    '[{"sheet":"DCF","addr":"b2","role":"input"},{"sheet":"DCF","addr":"B9","role":"output"}]'::jsonb) $$,
  '22023', null, 'a lower-case address is refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    '[{"sheet":"DCF","addr":"B2;drop","role":"input"},{"sheet":"DCF","addr":"B9","role":"output"}]'::jsonb) $$,
  '22023', null, 'an address with extra characters is refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    '[{"sheet":"DCF","addr":"B2","role":"target"},{"sheet":"DCF","addr":"B9","role":"output"}]'::jsonb) $$,
  '22023', null, 'a role other than input or output is refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    '[{"sheet":"","addr":"B2","role":"input"},{"sheet":"DCF","addr":"B9","role":"output"}]'::jsonb) $$,
  '22023', null, 'an empty sheet name is refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    jsonb_build_array(jsonb_build_object('sheet', repeat('s', 32), 'addr', 'B2', 'role', 'input'), jsonb_build_object('sheet', 'DCF', 'addr', 'B9', 'role', 'output'))) $$,
  '22023', null, 'a sheet name over 31 characters is refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    jsonb_build_array(jsonb_build_object('sheet', 'DCF', 'addr', 'B2', 'role', 'input', 'label', repeat('l', 81)), jsonb_build_object('sheet', 'DCF', 'addr', 'B9', 'role', 'output'))) $$,
  '22023', null, 'a label over 80 characters is refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    '[{"sheet":"DCF","addr":"B2","role":"input","label":5},{"sheet":"DCF","addr":"B9","role":"output"}]'::jsonb) $$,
  '22023', null, 'a label that is not text is refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    '[{"sheet":"DCF","addr":"B2","role":"input","extra":1},{"sheet":"DCF","addr":"B9","role":"output"}]'::jsonb) $$,
  '22023', null, 'a cell with an unknown key is refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'), '{"a":1}'::jsonb) $$,
  '22023', null, 'cells that are not a list are refused');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    '[{"sheet":"DCF","addr":"B2","role":"input"},{"sheet":"DCF","addr":"B3","role":"input"},{"sheet":"DCF","addr":"B2","role":"output"}]'::jsonb) $$,
  '23505', null, 'the same cell twice is refused');
select is((select count(*) from public.valuation_cells), 0::bigint, 'every refusal above wrote no cell (all or none)');
select is((select status from public.valuation_versions where id = (select v from ctx where k = 'v1')), 'ready',
  'and the version is still ready');
select lives_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    '[{"sheet":"DCF","addr":"B2","role":"input","label":"  Cost of equity  "},
      {"sheet":"DCF","addr":"B3","role":"input","label":null},
      {"sheet":"DCF","addr":"B4","role":"input","label":"   "},
      {"sheet":"DCF","addr":"B9","role":"output"}]'::jsonb) $$,
  'a valid choice is confirmed');
select is((select count(*) from public.valuation_cells where version_id = (select v from ctx where k = 'v1')), 4::bigint, 'all four cells were written');
select is((select label from public.valuation_cells where addr = 'B2'), 'Cost of equity', 'his label is stored trimmed');
select ok((select label is null from public.valuation_cells where addr = 'B3') and (select label is null from public.valuation_cells where addr = 'B4'),
  'a missing or blank label stays null (the sheet label is shown, never stored)');
select is((select status from public.valuation_versions where id = (select v from ctx where k = 'v1')), 'confirmed', 'the version is confirmed');
select ok((select confirmed_at is not null from public.valuation_versions where id = (select v from ctx where k = 'v1')), 'with a confirmed time');
select throws_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v1'),
    '[{"sheet":"DCF","addr":"C2","role":"input"},{"sheet":"DCF","addr":"C9","role":"output"}]'::jsonb) $$,
  '55000', null, 'a second confirm is refused');
select throws_ok($$ delete from public.valuation_cells $$, '42501', null, 'the admin cannot delete a cell');
reset role;

-- A confirmed version is frozen, even for service_role.
set local role service_role;
select throws_ok($$ update public.valuation_versions set report = '{"changed":true}'::jsonb where id = (select v from ctx where k = 'v1') $$,
  '55000', null, 'a confirmed version cannot be rewritten by a re-run');
reset role;

-- 10. save_valuation_scenario.
create temp table cells (k text primary key, v uuid);
grant all on cells to authenticated;
insert into cells select 'b2', id from public.valuation_cells where addr = 'B2';
insert into cells select 'b3', id from public.valuation_cells where addr = 'B3';
insert into cells select 'b9', id from public.valuation_cells where addr = 'B9';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v2'), 'Base', '', jsonb_build_object((select v::text from cells where k = 'b2'), 0.11)) $$,
  '55000', null, 'a scenario cannot be saved on a version that is not confirmed');
select throws_ok($$ select public.save_valuation_scenario('f0000000-0000-4000-8000-000000000001', 'Base', '', '{}'::jsonb) $$,
  'P0002', null, 'an unknown version is refused');
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v1'), 'Base', '', jsonb_build_object((select v::text from cells where k = 'b9'), 5)) $$,
  '22023', null, 'a value for a result cell (not an input) is refused');
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v1'), 'Base', '', jsonb_build_object('f0000000-0000-4000-8000-000000000009', 5)) $$,
  '22023', null, 'a value for a cell that does not exist is refused');
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v1'), 'Base', '', jsonb_build_object((select v::text from cells where k = 'b2'), 1000000000000001)) $$,
  '22023', null, 'a value over 1e15 is refused');
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v1'), 'Base', '', jsonb_build_object((select v::text from cells where k = 'b2'), -1000000000000001)) $$,
  '22023', null, 'and under -1e15');
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v1'), 'Base', '', jsonb_build_object((select v::text from cells where k = 'b2'), 'NaN')) $$,
  '22023', null, 'a value that is text (NaN) is refused');
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v1'), 'Base', '', jsonb_build_object((select v::text from cells where k = 'b2'), null)) $$,
  '22023', null, 'a null value is refused');
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v1'), 'Base', '', '{"not-a-uuid": 1}'::jsonb) $$,
  '22023', null, 'a key that is not a cell id is refused');
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v1'), 'Base', '', '{}'::jsonb) $$,
  '22023', null, 'a scenario with no values is refused');
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v1'), '   ', '', jsonb_build_object((select v::text from cells where k = 'b2'), 1)) $$,
  '22023', null, 'an empty name is refused');
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v1'), repeat('n', 81), '', jsonb_build_object((select v::text from cells where k = 'b2'), 1)) $$,
  '22023', null, 'a name over 80 characters is refused');
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v1'), 'Base', repeat('n', 501), jsonb_build_object((select v::text from cells where k = 'b2'), 1)) $$,
  '22023', null, 'a note over 500 characters is refused');
select is((select count(*) from public.valuation_scenarios), 0::bigint, 'no refusal above left a scenario behind');
insert into ctx values ('s1', public.save_valuation_scenario((select v from ctx where k = 'v1'), '  Bear case ', ' Slow growth ',
  jsonb_build_object((select v::text from cells where k = 'b2'), 0.135, (select v::text from cells where k = 'b3'), -2.5)));
select is((select name from public.valuation_scenarios where id = (select v from ctx where k = 's1')), 'Bear case', 'the scenario name is stored trimmed');
select is((select note from public.valuation_scenarios where id = (select v from ctx where k = 's1')), 'Slow growth', 'and the note');
select is((select count(*) from public.valuation_scenario_values where scenario_id = (select v from ctx where k = 's1')), 2::bigint, 'with its two values');
select is((select value from public.valuation_scenario_values where cell_id = (select v from cells where k = 'b2')), 0.135, 'at full precision');
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v1'), 'Bear case', '', jsonb_build_object((select v::text from cells where k = 'b2'), 1)) $$,
  '23505', null, 'a second scenario of the same name is refused');
select is((select count(*) from public.valuation_scenario_values), 2::bigint, 'and wrote no value');
select throws_ok($$ insert into public.valuation_scenario_values (scenario_id, cell_id, value)
                    select (select v from ctx where k = 's1'), (select v from cells where k = 'b9'), 'NaN' $$,
  '42501', null, 'the admin cannot insert a value directly');
select throws_ok($$ update public.valuation_scenarios set name = 'Renamed' $$, '42501', null, 'the admin cannot edit a scenario (save under a new name)');
select lives_ok($$ delete from public.valuation_scenarios where id = (select v from ctx where k = 's1') $$, 'the admin deletes a scenario');
select is((select count(*) from public.valuation_scenario_values), 0::bigint, 'and its values go with it');
reset role;

-- The range check also holds below the function (the owner inserts a bad value directly).
insert into public.valuation_scenarios (id, version_id, name) values ('55000000-0000-4000-8000-000000000001', (select v from ctx where k = 'v1'), 'Direct');
select throws_ok($$ insert into public.valuation_scenario_values (scenario_id, cell_id, value)
                    values ('55000000-0000-4000-8000-000000000001', (select v from cells where k = 'b2'), 1000000000000001) $$,
  '23514', null, 'a value over 1e15 is refused by the table too');
select throws_ok($$ insert into public.valuation_scenario_values (scenario_id, cell_id, value)
                    values ('55000000-0000-4000-8000-000000000001', (select v from cells where k = 'b2'), 'NaN') $$,
  '23514', null, 'and NaN');
select throws_ok($$ insert into public.valuation_scenario_values (scenario_id, cell_id, value)
                    values ('55000000-0000-4000-8000-000000000001', (select v from cells where k = 'b2'), 'Infinity') $$,
  '23514', null, 'and infinity');

-- 11. A non-admin still sees nothing now that rows exist, and cannot delete.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.valuation_versions) + (select count(*) from public.valuation_cells)
        + (select count(*) from public.valuation_scenarios) + (select count(*) from public.valuation_scenario_values), 0::bigint,
  'a non-admin reads no valuation row once rows exist');
select is_empty($$ delete from public.valuation_scenarios returning 1 $$, 'and deletes none');
reset role;

-- 12. Added by the Task 2 review.
-- The model object is machine data: Aksh's session reads it (the signed link) but cannot store or remove anything under models/.
insert into public.jobs (kind, document_id) values ('ingest_xlsx', 'd1000000-0000-4000-8000-000000000002');
insert into ctx select 'job', j.id from public.jobs j where j.document_id = 'd1000000-0000-4000-8000-000000000002';
insert into storage.objects (bucket_id, name) values ('documents', 'models/' || (select v from ctx where k = 'v1') || '.json');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('documents', 'models/f0000000-0000-4000-8000-000000000002.json') $$,
  '42501', null, 'the admin cannot store a model object');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('documents', 'd1000000-0000-4000-8000-000000000002.xlsx') $$,
  'the admin still uploads a workbook');
select ok(exists (select 1 from storage.objects where bucket_id = 'documents' and name = 'models/' || (select v from ctx where k = 'v1') || '.json'),
  'the admin reads a model object (the 10-minute link is signed on his session)');
select set_config('storage.allow_delete_query', 'true', true);
select is_empty($$ delete from storage.objects where bucket_id = 'documents' and name like 'models/%' returning 1 $$,
  'the admin cannot remove a model object');
select set_config('storage.allow_delete_query', 'false', true);
-- A scenario value must be for an input of the same version, not an input of another one.
select lives_ok($$ select public.confirm_valuation_version((select v from ctx where k = 'v2'),
    '[{"sheet":"DCF","addr":"B2","role":"input"},{"sheet":"DCF","addr":"B9","role":"output"}]'::jsonb) $$,
  'version 2 is confirmed with its own input');
select throws_ok($$ select public.save_valuation_scenario((select v from ctx where k = 'v1'), 'Cross', '',
    jsonb_build_object((select c.id::text from public.valuation_cells c
                         where c.version_id = (select v from ctx where k = 'v2') and c.addr = 'B2'), 1)) $$,
  '22023', null, 'an input cell of another version is refused');
-- "Try again" on a stopped read: the admin inserts a fresh xlsx_read step through the policy; a non-admin cannot.
select lives_ok($$ insert into public.job_steps (job_id, kind, page_no, pass) values ((select v from ctx where k = 'job'), 'xlsx_read', 1, 2) $$,
  'the admin can queue an xlsx_read step (job_steps_admin_insert)');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ insert into public.job_steps (job_id, kind, page_no, pass) values ((select v from ctx where k = 'job'), 'xlsx_read', 1, 3) $$,
  '42501', null, 'a non-admin cannot');
reset role;

select * from finish();
rollback;
