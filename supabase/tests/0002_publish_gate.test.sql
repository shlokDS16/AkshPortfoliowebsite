-- publish_revision(): what the gate passes, what it fails, and what it records.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(50);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'stranger@pgtap.test');

-- Test helpers (rolled back with the transaction): a well-formed lint result, and the verdict.
create function public.test_lint(p_rev uuid, p_policy text default 'pol-1', p_passed boolean default true)
returns jsonb language sql immutable
as $$ select jsonb_build_object('passed', p_passed, 'revisionId', p_rev::text, 'policyVersion', p_policy) $$;
create function public.test_verdict(p_item uuid, p_rev uuid, p_passed boolean default true)
returns text language sql
as $$ select verdict from public.publish_revision(p_item, p_rev, 'pol-1', public.test_lint(p_rev, 'pol-1', p_passed)) $$;
grant execute on function public.test_lint(uuid, text, boolean), public.test_verdict(uuid, uuid, boolean)
  to authenticated;

insert into public.companies (id, slug, name, visibility) values
  ('cccccccc-0000-4000-8000-000000000001', 'pub-co', 'Pub Co', 'public'),
  ('cccccccc-0000-4000-8000-000000000002', 'priv-co', 'Priv Co', 'private'),
  ('cccccccc-0000-4000-8000-000000000003', 'priv-co-3', 'Priv Co 3', 'private');
insert into public.themes (id, slug, name, visibility) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'pub-theme', 'Pub Theme', 'public'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'priv-theme', 'Priv Theme', 'private');

-- i1 clean learning item with two revisions; i2 plain note with failing lint attempts.
insert into public.items (id, kind, title, company_id, theme_id, learning_objective, holds_position) values
  ('d1000000-0000-4000-8000-000000000001', 'learning', 'How capex cycles turn',
   'cccccccc-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 'Spot late-cycle capex.', 'no');
insert into public.items (id, kind, title, learning_objective) values
  ('d2000000-0000-4000-8000-000000000002', 'note', 'Plain note', 'Because.');
-- i3 fresh case study; i4 undated case study; i5 case study exactly 30 days old.
insert into public.items (id, kind, title, learning_objective, data_as_of) values
  ('d3000000-0000-4000-8000-000000000003', 'case_study', 'Fresh case', 'Learn.', current_date - 29),
  ('d4000000-0000-4000-8000-000000000004', 'case_study', 'Undated case', 'Learn.', null),
  ('d5000000-0000-4000-8000-000000000005', 'case_study', 'Boundary case', 'Learn.', current_date - 30);
-- i6 names a company without holds_position; i7/i8 lack an objective.
insert into public.items (id, kind, title, company_id, learning_objective) values
  ('d6000000-0000-4000-8000-000000000006', 'learning', 'No position', 'cccccccc-0000-4000-8000-000000000001', 'Learn.');
insert into public.items (id, kind, title, learning_objective) values
  ('d7000000-0000-4000-8000-000000000007', 'learning', 'No objective', null),
  ('d8000000-0000-4000-8000-000000000008', 'learning', 'Blank objective', '   ');
-- i9 links a private company; i10 a private theme.
insert into public.items (id, kind, title, company_id, learning_objective, holds_position) values
  ('d9000000-0000-4000-8000-000000000009', 'learning', 'Private company', 'cccccccc-0000-4000-8000-000000000002', 'Learn.', 'no');
insert into public.items (id, kind, title, theme_id, learning_objective) values
  ('da000000-0000-4000-8000-00000000000a', 'learning', 'Private theme', 'eeeeeeee-0000-4000-8000-000000000002', 'Learn.');
-- i11 has a slug already; i12 a title with no letters; i13 breaks everything.
insert into public.items (id, kind, title, slug, learning_objective) values
  ('db000000-0000-4000-8000-00000000000b', 'learning', 'Keeps slug', 'keep-this-slug', 'Learn.');
insert into public.items (id, kind, title, learning_objective) values
  ('dc000000-0000-4000-8000-00000000000c', 'learning', '₹₹₹', 'Learn.');
insert into public.items (id, kind, title, company_id, data_as_of) values
  ('dd000000-0000-4000-8000-00000000000d', 'case_study', 'Everything wrong',
   'cccccccc-0000-4000-8000-000000000003', null);
-- Two items whose generated slugs collide (same title, same first six id characters).
insert into public.items (id, kind, title, learning_objective) values
  ('f1000000-0000-4000-8000-000000000001', 'learning', 'Twin title', 'Learn.'),
  ('f1000000-0000-4000-8000-000000000002', 'learning', 'Twin title', 'Learn.');

insert into public.item_revisions (id, item_id, body_md) values
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'v1'),
  ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'note'),
  ('e3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003', 'case'),
  ('e4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000004', 'case'),
  ('e5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000005', 'case'),
  ('e6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000006', 'body'),
  ('e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000007', 'body'),
  ('e8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000008', 'body'),
  ('e9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000009', 'body'),
  ('ea000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-00000000000a', 'body'),
  ('eb000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-00000000000b', 'body'),
  ('ec000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-00000000000c', 'body'),
  ('ed000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-00000000000d', 'body'),
  ('f1000000-0000-4000-8000-0000000000a1', 'f1000000-0000-4000-8000-000000000001', 'body'),
  ('f1000000-0000-4000-8000-0000000000a2', 'f1000000-0000-4000-8000-000000000002', 'body');

-- Slug helper (owner context; API roles cannot call it).
select is(private.slugify('How Capex Cycles Turn!'), 'how-capex-cycles-turn', 'slugify lowercases and hyphenates');
select is(private.slugify('  --Q1 FY26 & results--  '), 'q1-fy26-results', 'slugify collapses runs and trims hyphens');
select is(private.slugify('₹₹₹'), '', 'slugify of a symbol-only title is empty');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- A failing lint is recorded, not raised, and changes nothing on the item.
select is(public.test_verdict('d2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', false),
  'fail', 'a failed lint yields a fail verdict (no exception)');
select is((select count(*) from public.gate_decisions
            where revision_id = 'e2000000-0000-4000-8000-000000000001' and verdict = 'fail'),
  1::bigint, 'the failure is recorded in gate_decisions');
select results_eq($$
  select visibility, status, slug, current_revision_id::text from public.items
   where id = 'd2000000-0000-4000-8000-000000000002'
$$, $$ values ('private'::text, 'draft'::text, null::text, null::text) $$,
  'a failed gate leaves the item untouched (no slug either)');
select results_eq($$
  select reasons -> 'failures' -> 0 ->> 'rule', reasons -> 'lint' ->> 'passed'
    from public.gate_decisions where revision_id = 'e2000000-0000-4000-8000-000000000001'
$$, $$ values ('lint'::text, 'false'::text) $$, 'reasons carries the failing rule and the lint result');

select is((select verdict from public.publish_revision('d2000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000001', 'pol-1', '{}'::jsonb)),
  'fail', 'an empty lint result fails');
select is((select verdict from public.publish_revision('d2000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000001', 'pol-1',
    '{"passed":"true","revisionId":"e2000000-0000-4000-8000-000000000001","policyVersion":"pol-1"}'::jsonb)),
  'fail', 'passed must be the JSON boolean true, not the string "true"');
select is((select verdict from public.publish_revision('d2000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000001', 'pol-1', public.test_lint('e1000000-0000-4000-8000-000000000001'))),
  'fail', 'a lint computed for another revision fails');
select is((select verdict from public.publish_revision('d2000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000001', 'pol-2', public.test_lint('e2000000-0000-4000-8000-000000000001', 'pol-1'))),
  'fail', 'a lint run under another policy version fails');
select is((select verdict from public.publish_revision('d2000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000001', '', public.test_lint('e2000000-0000-4000-8000-000000000001', ''))),
  'fail', 'an empty policy version fails');

-- Passing: state, slug, audit row.
select is(public.test_verdict('d1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001'),
  'pass', 'a clean learning item passes');
select results_eq($$
  select visibility, status, current_revision_id::text, published_at = now()
    from public.items where id = 'd1000000-0000-4000-8000-000000000001'
$$, $$ values ('public'::text, 'published'::text, 'e1000000-0000-4000-8000-000000000001'::text, true) $$,
  'a pass sets visibility, status, current revision and stamps published_at with now()');
select is((select slug from public.items where id = 'd1000000-0000-4000-8000-000000000001'),
  'how-capex-cycles-turn-d10000', 'a null slug becomes slugify(title) plus the first six id characters');
select results_eq($$
  select item_id::text, revision_id::text, policy_version, verdict, jsonb_array_length(reasons -> 'failures'),
         reasons -> 'lint' ->> 'policyVersion'
    from public.gate_decisions where revision_id = 'e1000000-0000-4000-8000-000000000001'
$$, $$ values ('d1000000-0000-4000-8000-000000000001'::text, 'e1000000-0000-4000-8000-000000000001'::text,
               'pol-1'::text, 'pass'::text, 0, 'pol-1'::text) $$,
  'the pass is recorded with an empty failure list and the lint result');
select is(public.test_verdict('db000000-0000-4000-8000-00000000000b', 'eb000000-0000-4000-8000-000000000001'),
  'pass', 'an item that already has a slug passes');
select is((select slug from public.items where id = 'db000000-0000-4000-8000-00000000000b'),
  'keep-this-slug', 'an existing slug is never replaced');
select is(public.test_verdict('dc000000-0000-4000-8000-00000000000c', 'ec000000-0000-4000-8000-000000000001'),
  'pass', 'a symbol-only title still publishes');
select is((select slug from public.items where id = 'dc000000-0000-4000-8000-00000000000c'),
  'item-dc0000', 'a symbol-only title falls back to "item" in the slug');

-- Later revisions of a public item are gated every time and never unpublish it.
-- Revision 2 is added only now: publish_revision() refuses a revision that has a newer sibling.
insert into public.item_revisions (id, item_id, body_md) values
  ('e1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'v2');
select is(public.test_verdict('d1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', false),
  'fail', 'a later revision whose lint failed is rejected');
select results_eq($$
  select visibility, current_revision_id::text from public.items where id = 'd1000000-0000-4000-8000-000000000001'
$$, $$ values ('public'::text, 'e1000000-0000-4000-8000-000000000001'::text) $$,
  'the rejected revision does not go live and the item stays public on the old one');
-- Backdate the first publish (owner, gate open) so "published_at is kept" is observable.
reset role;
select set_config('app.publish_gate', 'on', true);
update public.items set published_at = now() - interval '5 days' where id = 'd1000000-0000-4000-8000-000000000001';
select set_config('app.publish_gate', 'off', true);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.test_verdict('d1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002'),
  'pass', 'gating the new revision passes');
select results_eq($$
  select current_revision_id::text, published_at < now() - interval '4 days'
    from public.items where id = 'd1000000-0000-4000-8000-000000000001'
$$, $$ values ('e1000000-0000-4000-8000-000000000002'::text, true) $$,
  'the new revision goes live and published_at keeps its first-publish value');

-- Rule 3: case studies need data at least 30 days old.
select is(public.test_verdict('d3000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000001'),
  'fail', 'a case study with 29-day-old data fails');
select ok((select reasons -> 'failures' @> '[{"rule":"3"}]'::jsonb from public.gate_decisions
            where revision_id = 'e3000000-0000-4000-8000-000000000001'),
  'the failure is recorded under rule 3');
select is(public.test_verdict('d4000000-0000-4000-8000-000000000004', 'e4000000-0000-4000-8000-000000000001'),
  'fail', 'a case study with no data date fails');
select is(public.test_verdict('d5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000001'),
  'pass', 'a case study exactly 30 days old passes');

-- Rule 5, rule 6.
select is(public.test_verdict('d6000000-0000-4000-8000-000000000006', 'e6000000-0000-4000-8000-000000000001'),
  'fail', 'naming a company without holds_position fails');
select ok((select reasons -> 'failures' @> '[{"rule":"5"}]'::jsonb from public.gate_decisions
            where revision_id = 'e6000000-0000-4000-8000-000000000001'), 'the failure is recorded under rule 5');
select is(public.test_verdict('d7000000-0000-4000-8000-000000000007', 'e7000000-0000-4000-8000-000000000001'),
  'fail', 'a missing learning objective fails');
select is(public.test_verdict('d8000000-0000-4000-8000-000000000008', 'e8000000-0000-4000-8000-000000000001'),
  'fail', 'a blank learning objective fails');
select ok((select reasons -> 'failures' @> '[{"rule":"6"}]'::jsonb from public.gate_decisions
            where revision_id = 'e7000000-0000-4000-8000-000000000001'), 'the failure is recorded under rule 6');

-- A linked company or theme must itself be public.
select is(public.test_verdict('d9000000-0000-4000-8000-000000000009', 'e9000000-0000-4000-8000-000000000001'),
  'fail', 'an item linked to a private company fails');
select ok((select reasons -> 'failures' @> '[{"rule":"company"}]'::jsonb from public.gate_decisions
            where revision_id = 'e9000000-0000-4000-8000-000000000001'), 'the failure names the company');
select is(public.test_verdict('da000000-0000-4000-8000-00000000000a', 'ea000000-0000-4000-8000-000000000001'),
  'fail', 'an item linked to a private theme fails');
select ok((select reasons -> 'failures' @> '[{"rule":"theme"}]'::jsonb from public.gate_decisions
            where revision_id = 'ea000000-0000-4000-8000-000000000001'), 'the failure names the theme');
update public.companies set visibility = 'public' where id = 'cccccccc-0000-4000-8000-000000000002';
update public.themes set visibility = 'public' where id = 'eeeeeeee-0000-4000-8000-000000000002';
select is(public.test_verdict('d9000000-0000-4000-8000-000000000009', 'e9000000-0000-4000-8000-000000000001'),
  'pass', 'the same item passes once its company is public');
select is(public.test_verdict('da000000-0000-4000-8000-00000000000a', 'ea000000-0000-4000-8000-000000000001'),
  'pass', 'and the theme item passes once its theme is public');

-- Every failing rule is reported together.
select is(public.test_verdict('dd000000-0000-4000-8000-00000000000d', 'ed000000-0000-4000-8000-000000000001', false),
  'fail', 'an item that breaks every rule fails');
select results_eq($$
  select array_agg(f ->> 'rule' order by f ->> 'rule')
    from public.gate_decisions g, jsonb_array_elements(g.reasons -> 'failures') f
   where g.revision_id = 'ed000000-0000-4000-8000-000000000001'
$$, $$ values (array['3','5','6','company','lint']::text[]) $$,
  'all five failures are listed (rule 4 is deferred to Phase 3)');

-- A generated slug that another item already holds is a recorded failure, not an exception.
select is(public.test_verdict('f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-0000000000a1'),
  'pass', 'the first of two same-titled items publishes');
select is(public.test_verdict('f1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-0000000000a2'),
  'fail', 'the second one fails instead of raising a unique violation');
select results_eq($$
  select f ->> 'rule', f ->> 'message' like '%twin-title-f10000%'
    from public.gate_decisions g, jsonb_array_elements(g.reasons -> 'failures') f
   where g.revision_id = 'f1000000-0000-4000-8000-0000000000a2'
$$, $$ values ('slug'::text, true) $$, 'the fail row names the slug conflict');
select results_eq($$
  select visibility, status, slug, current_revision_id::text from public.items
   where id = 'f1000000-0000-4000-8000-000000000002'
$$, $$ values ('private'::text, 'draft'::text, null::text, null::text) $$,
  'the colliding item is left untouched');

-- Callers and bad input raise; nothing is recorded for them.
select throws_ok($$ select public.publish_revision('d1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001', 'pol-1', public.test_lint('e2000000-0000-4000-8000-000000000001')) $$,
  'P0002', null, 'a revision that belongs to another item raises');
select throws_ok($$ select public.publish_revision('ffffffff-0000-4000-8000-00000000000f',
    'e2000000-0000-4000-8000-000000000001', 'pol-1', '{}'::jsonb) $$,
  'P0002', null, 'an unknown item raises');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.test_verdict('d2000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'a signed-in non-admin cannot publish');
reset role;
select is((select count(*) from public.gate_decisions where item_id = 'd2000000-0000-4000-8000-000000000002'
            and verdict = 'pass'), 0::bigint, 'the non-admin attempt published nothing');
select throws_ok($$ update public.gate_decisions set verdict = 'pass' where true $$,
  'P0001', null, 'gate_decisions is append-only');

select * from finish();
rollback;
