-- 20261007000004_hardening.sql, I3: the public text of a company or theme (what public pages show and the
-- lint reads) is frozen while a public item links the row. Unpublish the items first, as for items themselves.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test');

-- co-1 / th-1: linked by a public item. co-2 / th-2: linked only by a private item (stubs).
insert into public.companies (id, slug, name, nse_symbol, sector, one_liner, bse_code, isin, visibility) values
  ('cccccccc-0000-4000-8000-000000000001', 'co-1', 'Co 1', 'COONE', 'Industrials', 'Makes things.', '500001',
   'INE000A01010', 'public'),
  ('cccccccc-0000-4000-8000-000000000002', 'co-2', 'Co 2', 'COTWO', null, null, null, null, 'private');
insert into public.themes (id, slug, name, visibility) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'th-1', 'Theme 1', 'public'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'th-2', 'Theme 2', 'private');
select set_config('app.publish_gate', 'on', true);
insert into public.items (id, kind, title, company_id, theme_id, visibility, status) values
  ('d1000000-0000-4000-8000-000000000001', 'learning', 'Public item', 'cccccccc-0000-4000-8000-000000000001',
   'eeeeeeee-0000-4000-8000-000000000001', 'public', 'published');
select set_config('app.publish_gate', 'off', true);
insert into public.items (id, kind, title, company_id, theme_id) values
  ('d2000000-0000-4000-8000-000000000002', 'learning', 'Private item', 'cccccccc-0000-4000-8000-000000000002',
   'eeeeeeee-0000-4000-8000-000000000002');

-- Through the admin's session, as the desk edits the catalog.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ update public.companies set name = 'Buy Co 1 now' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514', 'companies.co-1: public items use it; unpublish them first',
  'renaming a company that a public item links is rejected');
select throws_ok($$ update public.companies set slug = 'co-one' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514', null, 'its slug (a public URL) is frozen');
select throws_ok($$ update public.companies set nse_symbol = 'CO1' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514', null, 'its NSE symbol is frozen');
select throws_ok($$ update public.companies set one_liner = 'Will double.' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514', null, 'its one-liner is frozen');
select throws_ok($$ update public.companies set sector = null where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514', null, 'its sector is frozen (clearing counts as a change)');
select throws_ok($$ update public.companies set bse_code = '500002' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514', null, 'its BSE code (shown by public_companies) is frozen');
select throws_ok($$ update public.companies set isin = null where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514', null, 'its ISIN (shown by public_companies) is frozen');
select throws_ok($$ update public.themes set name = 'Multibagger theme' where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  '23514', 'themes.th-1: public items use it; unpublish them first',
  'renaming a theme that a public item links is rejected');
select throws_ok($$ update public.themes set slug = 'th-one' where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  '23514', null, 'its slug is frozen');
select results_eq($$ select name, slug, nse_symbol, one_liner, sector, bse_code, isin from public.companies
                      where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  $$ values ('Co 1'::text, 'co-1'::text, 'COONE'::text, 'Makes things.'::text, 'Industrials'::text,
             '500001'::text, 'INE000A01010'::text) $$,
  'none of the rejected updates changed the company');

-- Allowed: columns outside the public text, no-op updates, and rows only private items use.
select lives_ok($$ update public.companies set needs_review = false where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'a column no public view shows (needs_review) can change on a linked company');
select lives_ok($$ update public.companies set name = name, sector = sector where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'an update that changes no frozen value is allowed');
select lives_ok($$ update public.themes set description_md = 'internal note' where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  'a theme''s private description can change');
select lives_ok($$ update public.companies set name = 'Co Two Ltd', sector = 'Energy', one_liner = 'Runs plants.',
                    nse_symbol = 'COTWOLTD', slug = 'co-two', bse_code = '500003', isin = 'INE000B01010'
                    where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'a company used only by a private item can be edited freely (New names screen)');
select lives_ok($$ update public.themes set name = 'Theme Two', slug = 'theme-two' where id = 'eeeeeeee-0000-4000-8000-000000000002' $$,
  'a theme used only by a private item can be edited freely');

-- A clients-only item does not freeze the row; only a public one does.
reset role;
update public.items set visibility = 'clients' where id = 'd2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ update public.companies set name = 'Co Two' where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'a company used by a clients-only item can be renamed');

-- The owner is held to the same rule.
reset role;
select throws_ok($$ update public.companies set name = 'Owner rename' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514', null, 'the table owner cannot rename a linked company either');

-- After unpublishing, the way is open.
update public.items set visibility = 'private' where id = 'd1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ update public.companies set name = 'Co One', one_liner = 'Makes more things.'
                    where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'the company can be renamed once its item is unpublished');
select lives_ok($$ update public.companies set bse_code = '500009', isin = 'INE000C01010'
                    where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'and its identifiers can be corrected');
select lives_ok($$ update public.themes set name = 'Theme One' where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  'and so can the theme');
select results_eq($$ select name from public.companies where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  $$ values ('Co One'::text) $$, 'the rename landed');

-- The visibility guard from 20261005000002 still works alongside the column guard.
reset role;
select set_config('app.publish_gate', 'on', true);
update public.items set visibility = 'public' where id = 'd1000000-0000-4000-8000-000000000001';
select set_config('app.publish_gate', 'off', true);
select throws_ok($$ update public.companies set visibility = 'private' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514', null, 'a linked company still cannot go private');
select ok(exists (select 1 from pg_trigger where tgname = 'companies_guard_public_columns' and not tgisinternal)
      and exists (select 1 from pg_trigger where tgname = 'themes_guard_public_columns' and not tgisinternal),
  'both column guards are installed');

select * from finish();
rollback;
