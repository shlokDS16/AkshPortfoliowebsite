-- The four public_* views: security_invoker, exact columns, and the full public predicate
-- carried by the views themselves (a logged-in admin must not see private rows through them).
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'stranger@pgtap.test');

-- Test helper: the ids (or slugs) each view returns for the current role, sorted.
create function public.test_view_ids(p_view text) returns text language sql stable
as $$ select coalesce(case p_view
  when 'items'     then (select string_agg(id::text, ',' order by id) from public.public_items)
  when 'revisions' then (select string_agg(id::text, ',' order by id) from public.public_item_revisions)
  when 'companies' then (select string_agg(slug, ',' order by slug) from public.public_companies)
  when 'themes'    then (select string_agg(slug, ',' order by slug) from public.public_themes)
end, '') $$;
grant execute on function public.test_view_ids(text) to anon, authenticated;

-- Companies: A used by a visible item; B unused; C used by a public item, made private later;
-- D used only by an item inside the 30-day lag; E used only by an item that is unpublished.
insert into public.companies (id, slug, name, nse_symbol, bse_code, isin, sector, one_liner, visibility) values
  ('cccccccc-0000-4000-8000-00000000000a', 'co-a', 'Co A', 'COA', '500001', 'INE000A01010', 'Industrials', 'one-liner', 'public'),
  ('cccccccc-0000-4000-8000-00000000000b', 'co-b', 'Co B', null, null, null, null, null, 'public'),
  ('cccccccc-0000-4000-8000-00000000000c', 'co-c', 'Co C', null, null, null, null, null, 'public'),
  ('cccccccc-0000-4000-8000-00000000000d', 'co-d', 'Co D', null, null, null, null, null, 'public'),
  ('cccccccc-0000-4000-8000-00000000000e', 'co-e', 'Co E', null, null, null, null, null, 'public');
insert into public.themes (id, slug, name, description_md, visibility) values
  ('eeeeeeee-0000-4000-8000-00000000000a', 'th-a', 'Theme A', 'secret description', 'public'),
  ('eeeeeeee-0000-4000-8000-00000000000b', 'th-b', 'Theme B', null, 'public'),
  ('eeeeeeee-0000-4000-8000-00000000000c', 'th-c', 'Theme C', null, 'public');

-- p1 visible (3 revisions), p2 exactly 30 days old, p3 29 days old (inside the lag),
-- p4 private, p5 clients-only, p6 published then unpublished, p7 public with a company made private later.
insert into public.items (id, kind, title, company_id, theme_id, data_as_of, learning_objective, holds_position) values
  ('d1000000-0000-4000-8000-000000000001', 'learning', 'Visible item', 'cccccccc-0000-4000-8000-00000000000a',
   'eeeeeeee-0000-4000-8000-00000000000a', current_date - 40, 'Learn A.', 'no'),
  ('d2000000-0000-4000-8000-000000000002', 'learning', 'Boundary item', null, null, current_date - 30, 'Learn B.', null),
  ('d3000000-0000-4000-8000-000000000003', 'learning', 'Lagged item', 'cccccccc-0000-4000-8000-00000000000d',
   'eeeeeeee-0000-4000-8000-00000000000c', current_date - 29, 'Learn C.', 'no'),
  ('d4000000-0000-4000-8000-000000000004', 'learning', 'Private item', null, null, null, 'Learn D.', null),
  ('d6000000-0000-4000-8000-000000000006', 'learning', 'Unpublished item', 'cccccccc-0000-4000-8000-00000000000e',
   null, null, 'Learn F.', 'no'),
  ('d7000000-0000-4000-8000-000000000007', 'learning', 'Company turns private', 'cccccccc-0000-4000-8000-00000000000c',
   null, null, 'Learn G.', 'no');
insert into public.items (id, kind, title, visibility, learning_objective) values
  ('d5000000-0000-4000-8000-000000000005', 'learning', 'Clients item', 'clients', 'Learn E.');
insert into public.item_revisions (id, item_id, body_md, change_reason) values
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'public v1', 'first cut'),
  ('e1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'public v2', 'second cut'),
  ('e1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'public v3', 'unreviewed draft note'),
  ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'boundary body', null),
  ('e3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003', 'lagged body', null),
  ('e4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000004', 'private body', 'private note'),
  ('e5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000005', 'clients body', null),
  ('e6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000006', 'unpublished body', 'unpublished note'),
  ('e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000007', 'company body', null);

-- Publish through the real path as the admin.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare
  v record;
begin
  for v in select * from (values
    ('d1000000-0000-4000-8000-000000000001'::uuid, 'e1000000-0000-4000-8000-000000000001'::uuid),
    ('d2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001'),
    ('d3000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000001'),
    ('d6000000-0000-4000-8000-000000000006', 'e6000000-0000-4000-8000-000000000001'),
    ('d7000000-0000-4000-8000-000000000007', 'e7000000-0000-4000-8000-000000000001')) as t (i, r)
  loop
    perform public.publish_revision(v.i, v.r, 'pol-1',
      jsonb_build_object('passed', true, 'revisionId', v.r::text, 'policyVersion', 'pol-1'));
  end loop;
  perform public.unpublish_item('d6000000-0000-4000-8000-000000000006');
end $$;
reset role;
-- The catalog guard makes "public item, private company" unreachable; switch it off here to
-- prove the view still hides the company on its own.
alter table public.companies disable trigger companies_guard_visibility;
update public.companies set visibility = 'private' where id = 'cccccccc-0000-4000-8000-00000000000c';
alter table public.companies enable trigger companies_guard_visibility;

-- Structure.
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'v'
              and c.relname in ('public_items', 'public_item_revisions', 'public_companies', 'public_themes')
              and 'security_invoker=true' = any (coalesce(c.reloptions, '{}'::text[]))),
  4::bigint, 'all four public views run with security_invoker');
select columns_are('public', 'public_items', array['id', 'kind', 'slug', 'title', 'company_id', 'theme_id',
  'published_at', 'data_as_of', 'learning_objective', 'holds_position', 'revision_id', 'rev_no', 'body_md',
  'structured', 'schema_version', 'revised_at'], 'public_items exposes exactly the contracted columns');
select columns_are('public', 'public_item_revisions', array['id', 'item_id', 'rev_no', 'body_md', 'structured',
  'change_reason', 'created_at'], 'public_item_revisions exposes exactly the contracted columns');
select columns_are('public', 'public_companies', array['id', 'slug', 'name', 'nse_symbol', 'bse_code', 'isin', 'sector'],
  'public_companies exposes exactly the contracted columns');
select columns_are('public', 'public_themes', array['id', 'slug', 'name'],
  'public_themes exposes exactly the contracted columns');
select ok(has_table_privilege('anon', 'public.public_items', 'select')
      and has_table_privilege('anon', 'public.public_item_revisions', 'select')
      and has_table_privilege('anon', 'public.public_companies', 'select')
      and has_table_privilege('anon', 'public.public_themes', 'select')
      and has_table_privilege('authenticated', 'public.public_items', 'select'),
  'anon and authenticated can select the views');
select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and (has_table_privilege('anon', c.oid, 'insert,update,delete,truncate')
       or has_table_privilege('authenticated', c.oid, 'insert,update,delete,truncate'))
$$, 'no API role can write through any public view');

-- Anonymous visitors.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.test_view_ids('items'),
  'd1000000-0000-4000-8000-000000000001,d2000000-0000-4000-8000-000000000002,d7000000-0000-4000-8000-000000000007',
  'anon: public_items lists published, lagged items only (30 days old in, 29 out, unpublished out)');
select is(public.test_view_ids('revisions'),
  'e1000000-0000-4000-8000-000000000001,e2000000-0000-4000-8000-000000000001,e7000000-0000-4000-8000-000000000001',
  'anon: public_item_revisions lists only gated revisions of public items');
select is(public.test_view_ids('companies'), 'co-a',
  'anon: public_companies lists only a public company used by a public item');
select is(public.test_view_ids('themes'), 'th-a',
  'anon: public_themes lists only a public theme used by a public item');
select results_eq($$
  select title, rev_no, body_md, learning_objective, holds_position, schema_version, structured::text,
         company_id::text, theme_id::text, slug is not null
    from public.public_items where id = 'd1000000-0000-4000-8000-000000000001'
$$, $$ values ('Visible item'::text, 1, 'public v1'::text, 'Learn A.'::text, 'no'::text, 1, '{}'::text,
              'cccccccc-0000-4000-8000-00000000000a'::text, 'eeeeeeee-0000-4000-8000-00000000000a'::text, true) $$,
  'anon: public_items carries the current revision and the item fields');
select results_eq($$
  select bse_code, isin, sector, nse_symbol from public.public_companies where slug = 'co-a'
$$, $$ values ('500001'::text, 'INE000A01010'::text, 'Industrials'::text, 'COA'::text) $$,
  'anon: public_companies exposes identifiers and sector');
select results_eq($$ select change_reason from public.public_item_revisions
                      where id = 'e1000000-0000-4000-8000-000000000001' $$,
  array['first cut'], 'anon: change_reason is shown for a gated revision');
select is_empty($$ select 1 from public.public_item_revisions
                    where change_reason in ('unreviewed draft note', 'private note', 'unpublished note') $$,
  'anon: change_reason of ungated, private or unpublished revisions is never exposed');

-- The logged-in admin passes every base-table policy, so the views must filter on their own.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.items), 7::bigint, 'precondition: the admin sees all 7 items in the base table');
select is(public.test_view_ids('items'),
  'd1000000-0000-4000-8000-000000000001,d2000000-0000-4000-8000-000000000002,d7000000-0000-4000-8000-000000000007',
  'admin: public_items hides private, clients-only, unpublished and lagged items');
select is(public.test_view_ids('revisions'),
  'e1000000-0000-4000-8000-000000000001,e2000000-0000-4000-8000-000000000001,e7000000-0000-4000-8000-000000000001',
  'admin: public_item_revisions hides ungated revisions and revisions of non-public items');
select is(public.test_view_ids('companies'), 'co-a',
  'admin: public_companies hides unused, lag-only, unpublished-only and private companies');
select is(public.test_view_ids('themes'), 'th-a',
  'admin: public_themes hides unused themes and themes used only by lagged items');
select is_empty($$ select 1 from public.public_item_revisions
                    where change_reason in ('unreviewed draft note', 'private note', 'unpublished note') $$,
  'admin: change_reason of ungated, private or unpublished revisions is never exposed');

-- A signed-in non-admin sees nothing at all.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.test_view_ids('items'), '', 'non-admin: public_items is empty');
select is(public.test_view_ids('revisions'), '', 'non-admin: public_item_revisions is empty');
select is(public.test_view_ids('companies'), '', 'non-admin: public_companies is empty');
select is(public.test_view_ids('themes'), '', 'non-admin: public_themes is empty');

-- Gating a later revision moves the view to it; the ungated one stays hidden.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select verdict from public.publish_revision('d1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000002', 'pol-1',
    '{"passed":true,"revisionId":"e1000000-0000-4000-8000-000000000002","policyVersion":"pol-1"}'::jsonb)),
  'pass', 'precondition: revision 2 passes the gate');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$
  select rev_no, body_md from public.public_items where id = 'd1000000-0000-4000-8000-000000000001'
$$, $$ values (2, 'public v2'::text) $$, 'anon: public_items now shows the gated revision 2');
select results_eq($$
  select rev_no from public.public_item_revisions
   where item_id = 'd1000000-0000-4000-8000-000000000001' order by rev_no
$$, array[1, 2], 'anon: revision history lists 1 and 2 but not the ungated 3');

-- A 30-day-old public item is also hidden at the base table by the anon policy.
select is_empty($$ select id from public.items where id = 'd3000000-0000-4000-8000-000000000003' $$,
  'anon: the base table hides the lagged item as well');
select throws_ok($$ select learning_objective, search from public.items $$, '42501', null,
  'anon: the view cannot be bypassed to read ungranted item columns');

-- Unpublishing removes the item from every view, including its revisions and company.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.unpublish_item('d1000000-0000-4000-8000-000000000001'),
  (select slug from public.items where id = 'd1000000-0000-4000-8000-000000000001'),
  'unpublish_item returns the slug');
select is(public.test_view_ids('items'),
  'd2000000-0000-4000-8000-000000000002,d7000000-0000-4000-8000-000000000007',
  'admin: the unpublished item leaves public_items');
select is(public.test_view_ids('companies'), '', 'admin: its company leaves public_companies');
select is(public.test_view_ids('revisions'),
  'e2000000-0000-4000-8000-000000000001,e7000000-0000-4000-8000-000000000001',
  'admin: its revisions leave public_item_revisions');

select * from finish();
rollback;
