-- 20261007000005_casefile.sql section 14: New names tables (R17) and archived stubs. Admin-only, append-only,
-- and compatible with the 0004 catalog guard (archived_at is not a frozen column; the frozen ones stay frozen).
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(37);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');

insert into public.companies (id, slug, name, nse_symbol, visibility) values
  ('cccccccc-0000-4000-8000-000000000001', 'kaveri', 'Kaveri Pumps', 'KAVERI', 'public'),
  ('cccccccc-0000-4000-8000-000000000002', 'stub-co', 'Stub Co', 'STUBCO', 'private');
insert into public.themes (id, slug, name, visibility) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'water', 'Water', 'public'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'misc', 'Misc', 'private');
select set_config('app.publish_gate', 'on', true);
insert into public.items (id, kind, title, company_id, theme_id, visibility, status) values
  ('d1000000-0000-4000-8000-000000000001', 'learning', 'Public item', 'cccccccc-0000-4000-8000-000000000001',
   'eeeeeeee-0000-4000-8000-000000000001', 'public', 'published');
select set_config('app.publish_gate', 'off', true);

-- Structure and privileges.
select has_table('public', 'company_aliases', 'company_aliases exists');
select has_table('public', 'ignored_tokens', 'ignored_tokens exists');
select ok((select relrowsecurity from pg_class where oid = 'public.company_aliases'::regclass)
      and (select relrowsecurity from pg_class where oid = 'public.ignored_tokens'::regclass),
  'row level security is enabled on both tables');
select has_column('public', 'companies', 'archived_at', 'companies.archived_at exists');
select has_column('public', 'themes', 'archived_at', 'themes.archived_at exists');
select ok(not has_column_privilege('anon', 'public.companies', 'archived_at', 'select')
      and not has_column_privilege('anon', 'public.themes', 'archived_at', 'select'),
  'anon cannot read archived_at');
select columns_are('public', 'public_companies', array['id', 'slug', 'name', 'nse_symbol', 'bse_code', 'isin', 'sector'],
  'public_companies does not expose archived_at');
select ok(not has_table_privilege('anon', 'public.company_aliases', 'select,insert,update,delete')
      and not has_table_privilege('anon', 'public.ignored_tokens', 'select,insert,update,delete'),
  'anon has no privilege on either table');
select ok(has_table_privilege('authenticated', 'public.company_aliases', 'select,insert')
      and has_table_privilege('authenticated', 'public.ignored_tokens', 'select,insert'),
  'authenticated can select and insert');
select ok(not has_table_privilege('authenticated', 'public.company_aliases', 'update,delete,truncate')
      and not has_table_privilege('authenticated', 'public.ignored_tokens', 'update,delete,truncate'),
  'authenticated cannot update, delete or truncate: decisions are not undone in Phase 1');
select ok(not has_table_privilege('service_role', 'public.company_aliases', 'select,insert,update,delete')
      and not has_table_privilege('service_role', 'public.ignored_tokens', 'select,insert,update,delete'),
  'service_role has no privilege on either table');

-- The admin session.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into public.company_aliases (symbol, company_id)
                   values ('KAVPUMPS', 'cccccccc-0000-4000-8000-000000000001') $$, 'the admin records an alias');
select lives_ok($$ insert into public.ignored_tokens (kind, token) values ('symbol', 'AND'), ('theme', 'misc') $$,
  'the admin records an ignored symbol and an ignored theme');
select is((select company_id::text from public.company_aliases where symbol = 'KAVPUMPS'),
  'cccccccc-0000-4000-8000-000000000001', 'the alias reads back');
select is((select count(*) from public.ignored_tokens), 2::bigint, 'the ignored tokens read back');
select throws_ok($$ insert into public.company_aliases (symbol, company_id)
                    values ('kavpumps2', 'cccccccc-0000-4000-8000-000000000001') $$,
  '23514', null, 'a lower-case alias symbol is rejected');
select throws_ok($$ insert into public.company_aliases (symbol, company_id)
                    values ('500325', 'cccccccc-0000-4000-8000-000000000001') $$,
  '23514', null, 'an alias symbol needs a letter');
select throws_ok($$ insert into public.ignored_tokens (kind, token) values ('theme', 'Bad Slug') $$,
  '23514', null, 'an ignored theme must be a slug');
select throws_ok($$ insert into public.ignored_tokens (kind, token) values ('symbol', 'and') $$,
  '23514', null, 'an ignored symbol must be upper case');
select throws_ok($$ insert into public.ignored_tokens (kind, token) values ('other', 'x') $$,
  '23514', null, 'an unknown kind is rejected');
select throws_ok($$ insert into public.company_aliases (symbol, company_id)
                    values ('GHOST', 'cccccccc-0000-4000-8000-0000000000ff') $$,
  '23503', null, 'an alias to a missing company is rejected');
select throws_ok($$ insert into public.company_aliases (symbol, company_id)
                    values ('KAVPUMPS', 'cccccccc-0000-4000-8000-000000000002') $$,
  '23505', null, 'an alias symbol is recorded once');
select throws_ok($$ update public.company_aliases set symbol = 'OTHER' where symbol = 'KAVPUMPS' $$,
  '42501', null, 'an alias cannot be edited');
select throws_ok($$ delete from public.ignored_tokens where token = 'AND' $$,
  '42501', null, 'an ignored token cannot be deleted');

-- Archiving works with the 0004 catalog guard: archived_at is free, the frozen columns stay frozen.
select lives_ok($$ update public.companies set archived_at = now() where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'a company stub can be archived');
select lives_ok($$ update public.themes set archived_at = now() where id = 'eeeeeeee-0000-4000-8000-000000000002' $$,
  'a theme stub can be archived');
select lives_ok($$ update public.companies set archived_at = now() where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'archiving does not touch a frozen column, so a company linked by a public item is not blocked');
select throws_ok($$ update public.companies set name = 'Renamed' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514', 'companies.kaveri: public items use it; unpublish them first',
  'the guard still freezes the name of that company');
select throws_ok($$ update public.companies set nse_symbol = 'NEWSYM', archived_at = null
                    where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514', null, 'and still freezes the symbol when archived_at changes in the same statement');
select throws_ok($$ update public.themes set slug = 'water-2' where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  '23514', null, 'and the slug of a linked theme');
select ok((select archived_at is not null from public.companies where id = 'cccccccc-0000-4000-8000-000000000002'),
  'the archived stub keeps its row (archive, not delete)');

-- A signed-in non-admin sees nothing and writes nothing.
reset role;
select is((select role from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002'), 'client',
  'the second user is a client');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.company_aliases), 0::bigint, 'a client reads no aliases');
select is((select count(*) from public.ignored_tokens), 0::bigint, 'a client reads no ignored tokens');
select throws_ok($$ insert into public.company_aliases (symbol, company_id)
                    values ('CLIENTSYM', 'cccccccc-0000-4000-8000-000000000001') $$,
  '42501', null, 'a client cannot record an alias');
select throws_ok($$ insert into public.ignored_tokens (kind, token) values ('symbol', 'CLIENT') $$,
  '42501', null, 'a client cannot record an ignored token');

-- The alias keeps its company: deleting a referenced company is restricted (superuser path).
reset role;
select throws_ok($$ delete from public.companies where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23503', null, 'a company that an alias points at cannot be deleted');

select * from finish();
rollback;
