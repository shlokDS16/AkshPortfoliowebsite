-- 20261016000020_knowledge.sql + 20261016000021_knowledge_gate.sql: concepts on the revision, concept edges, the reading-note kind,
-- the public concept views, and the two gate checks (Phase 4 Task 1; spec s4, s5; plan D45, D47, D49, D52, D56).
-- Sections: 1 kinds, 2 carry, 3 themes check, 4 edges, 5 concept_links, 6 public reads (interleaved with publishing), 7 guards,
-- 8 the gate, 9 privileges. Fixtures are written by the owner; every role check uses a real role. Item and theme ids are
-- numbered: item n is 1d000000-0000-4000-8000-0000000000nn, theme n is c0000000-0000-4000-8000-0000000000nn (n < 100).
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(101);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Helpers (the owner only).
create function pg_temp.t(n int) returns uuid language sql as $$ select ('c0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.it(n int) returns uuid language sql as $$ select ('1d000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.mk(n int, p_kind text default 'learning', p_theme int default null, p_asof date default null)
returns void language sql as $$
  insert into public.items (id, kind, title, theme_id, learning_objective, data_as_of)
  values (pg_temp.it(n), p_kind, 'Item ' || n, case when p_theme is null then null else pg_temp.t(p_theme) end, 'Learn.', p_asof)
$$;
create function pg_temp.rev(n int, ids uuid[] default null) returns void language sql as $$
  insert into public.item_revisions (item_id, body_md, concept_ids) values (pg_temp.it(n), 'body', ids)
$$;
-- Security definer, so the role sections can name a revision their own RLS hides.
create function pg_temp.rv(n int, r int) returns uuid language sql security definer set search_path = '' as $$
  select id from public.item_revisions where item_id = ('1d000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid and rev_no = r
$$;
grant execute on function pg_temp.t(int), pg_temp.it(int), pg_temp.rv(int, int) to public;
create function pg_temp.cids(n int, r int) returns uuid[] language sql as $$
  select concept_ids from public.item_revisions where item_id = pg_temp.it(n) and rev_no = r
$$;
-- The real door, as the owner: the verdict for revision r of item n.
create function pg_temp.pub(n int, r int) returns text language sql as $$
  select (public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.it(n), pg_temp.rv(n, r),
    'sebi-unreg-2026-07-v1.1',
    jsonb_build_object('passed', true, 'revisionId', pg_temp.rv(n, r)::text, 'policyVersion', 'sebi-unreg-2026-07-v1.1'))).verdict
$$;
-- The rule codes recorded for the decision on revision r of item n, sorted, comma separated ('' when none).
create function pg_temp.rules(n int, r int) returns text language sql as $$
  select coalesce(string_agg(f ->> 'rule', ',' order by f ->> 'rule'), '')
    from public.gate_decisions g, jsonb_array_elements(g.reasons -> 'failures') f
   where g.revision_id = pg_temp.rv(n, r)
$$;
create function pg_temp.legacy_rev(n int) returns void language plpgsql as $$
begin
  alter table public.item_revisions disable trigger item_revisions_carry_concepts;
  insert into public.item_revisions (item_id, body_md) values (pg_temp.it(n), 'legacy body');
  alter table public.item_revisions enable trigger item_revisions_carry_concepts;
end $$;

-- Themes: 1 alpha, 2 beta, 7 epsilon, 8 zeta, 9 theta public and screened; 3 private; 4 a stub; 5 archived; 10-19 spare.
insert into public.themes (id, slug, name, visibility, needs_review, archived_at) values
  (pg_temp.t(1), 'alpha', 'Alpha', 'public', false, null),
  (pg_temp.t(2), 'beta', 'Beta', 'public', false, null),
  (pg_temp.t(3), 'gamma-private', 'Gamma Private', 'private', false, null),
  (pg_temp.t(4), 'stubby', 'Stubby', 'private', true, null),
  (pg_temp.t(5), 'archived-x', 'Archived X', 'private', false, now()),
  (pg_temp.t(7), 'epsilon', 'Epsilon', 'public', false, null),
  (pg_temp.t(8), 'zeta', 'Zeta', 'public', false, null),
  (pg_temp.t(9), 'theta', 'Theta', 'public', false, null);
insert into public.themes (id, slug, name)
  select pg_temp.t(i), 'bulk-' || i, 'Bulk ' || i from generate_series(10, 19) i;

-- 1. Kinds.
select lives_ok($$ select pg_temp.mk(1, 'reading_note') $$, 'a reading_note item is accepted');
select throws_ok($$ select pg_temp.mk(2, 'reading') $$, '23514', null, 'the kind "reading" is refused');

-- 2. Carry (item_revisions_carry_concepts).
select pg_temp.mk(20, 'note');
select pg_temp.rev(20, array[pg_temp.t(1)]);
select is(pg_temp.cids(20, 1), array[pg_temp.t(1)], 'an explicit array is stored');
select pg_temp.rev(20);
select is(pg_temp.cids(20, 2), array[pg_temp.t(1)], 'a revision without concept_ids copies the previous one');
select pg_temp.rev(20, '{}');
select is(pg_temp.cids(20, 3), '{}'::uuid[], 'an explicit empty array clears the concepts');
select pg_temp.rev(20);
select is(pg_temp.cids(20, 4), '{}'::uuid[], 'and the next omitted write carries the empty array (not the theme)');

select pg_temp.mk(21, 'learning', 2);
select pg_temp.rev(21);
select is(pg_temp.cids(21, 1), array[pg_temp.t(2)], 'a first revision copies the item theme_id');
select pg_temp.mk(22);
select pg_temp.rev(22);
select is(pg_temp.cids(22, 1), '{}'::uuid[], 'a first revision with no theme stores the empty array');

select pg_temp.mk(23);
select pg_temp.rev(23, array[pg_temp.t(2), pg_temp.t(1), pg_temp.t(2)]);
select is(pg_temp.cids(23, 1), array[pg_temp.t(2), pg_temp.t(1)], '[b, a, b] is stored as [b, a] (first occurrence kept, order kept)');
select pg_temp.mk(24);
select pg_temp.rev(24, array[pg_temp.t(5), pg_temp.t(1)]);
select is(pg_temp.cids(24, 1), array[pg_temp.t(1)], 'an archived theme is dropped');
select pg_temp.mk(25);
select throws_ok($$ select pg_temp.rev(25, array['ffffffff-0000-4000-8000-000000000000'::uuid]) $$,
  '23503', 'concept_ids: unknown concept', 'an unknown id raises 23503');
select pg_temp.mk(26);
select throws_ok($$ select pg_temp.rev(26, (select array_agg(pg_temp.t(i)) from generate_series(10, 18) i)) $$,
  '23514', null, 'nine ids raise 23514');
select pg_temp.mk(27);
select lives_ok($$ select pg_temp.rev(27, (select array_agg(pg_temp.t(i)) from generate_series(10, 17) i)) $$, 'eight ids are accepted');
select is(cardinality(pg_temp.cids(27, 1)), 8, 'and all eight are stored');
select pg_temp.mk(28);
select throws_ok($$ select pg_temp.rev(28, array[pg_temp.t(1), null]::uuid[]) $$, '23514', null, 'a null element raises 23514');
select throws_ok($$ update public.item_revisions set concept_ids = '{}' where id = pg_temp.rv(20, 1) $$,
  'P0001', null, 'an UPDATE of concept_ids is refused by the append-only guard');

select pg_temp.mk(30, 'learning', 2);
select pg_temp.legacy_rev(30);
select is(pg_temp.cids(30, 1), null::uuid[], 'a legacy revision stays null (the trigger was off)');
select pg_temp.rev(30);
select is(pg_temp.cids(30, 2), array[pg_temp.t(2)], 'when every earlier revision is null, an omitted write falls back to theme_id');
select pg_temp.mk(31);
select pg_temp.rev(31, array[pg_temp.t(10), pg_temp.t(1)]);
update public.themes set archived_at = now() where id = pg_temp.t(10);
select pg_temp.rev(31);
select is(pg_temp.cids(31, 2), array[pg_temp.t(1)], 'a carried array drops a theme archived since');

-- 3. themes_public_is_screened.
select throws_ok($$ update public.themes set visibility = 'public' where id = pg_temp.t(4) $$, '23514', null,
  'a stub cannot be made public');
select throws_ok($$ update public.themes set visibility = 'public' where id = pg_temp.t(5) $$, '23514', null,
  'an archived theme cannot be made public');
select lives_ok($$ update public.themes set visibility = 'public' where id = pg_temp.t(11) $$,
  'a screened live theme can be made public');
select throws_ok($$ update public.themes set archived_at = now() where id = pg_temp.t(11) $$, '23514', null,
  'a public theme cannot be archived');
update public.themes set visibility = 'private' where id = pg_temp.t(11);

-- 4. concept_edges.
select throws_ok($$ insert into public.concept_edges (concept_a, concept_b) values (pg_temp.t(2), pg_temp.t(1)) $$,
  '23514', null, 'an edge with concept_a > concept_b is refused');
select throws_ok($$ insert into public.concept_edges (concept_a, concept_b) values (pg_temp.t(1), pg_temp.t(1)) $$,
  '23514', null, 'a self edge is refused');
select lives_ok($$ insert into public.concept_edges (concept_a, concept_b) values (pg_temp.t(1), pg_temp.t(2)) $$,
  'an ordered edge is accepted');
select throws_ok($$ insert into public.concept_edges (concept_a, concept_b) values (pg_temp.t(1), pg_temp.t(2)) $$,
  '23505', null, 'a duplicate edge is refused');
select ok(has_table_privilege('authenticated', 'public.concept_edges', 'select,insert,delete')
      and not has_table_privilege('authenticated', 'public.concept_edges', 'update')
      and not has_any_column_privilege('authenticated', 'public.concept_edges', 'update')
      and not has_any_column_privilege('service_role', 'public.concept_edges', 'select,insert,update,references')
      and not has_table_privilege('service_role', 'public.concept_edges', 'select,insert,update,delete,truncate')
      and not has_any_column_privilege('anon', 'public.concept_edges', 'select,insert,update,references')
      and not has_table_privilege('anon', 'public.concept_edges', 'select,insert,update,delete,truncate'),
  'edges: authenticated select, insert, delete only; anon and service_role nothing; nobody can update');
select ok((select relrowsecurity from pg_class where oid = 'public.concept_edges'::regclass), 'edges: row level security is on');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.concept_edges), 0::bigint, 'a non-admin session reads no edge');
select throws_ok($$ insert into public.concept_edges (concept_a, concept_b) values (pg_temp.t(1), pg_temp.t(3)) $$,
  '42501', null, 'a non-admin session cannot insert an edge');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.concept_edges), 1::bigint, 'the admin reads the edge');
select lives_ok($$ insert into public.concept_edges (concept_a, concept_b) values (pg_temp.t(1), pg_temp.t(3)) $$, 'the admin can add an edge');
select lives_ok($$ delete from public.concept_edges where concept_b = pg_temp.t(3) $$, 'the admin can delete an edge');
reset role;

-- 5. concept_links (latest revision only, legacy rule, archived filtered, admin only).
select pg_temp.mk(40);
select pg_temp.rev(40, array[pg_temp.t(1)]);
select pg_temp.rev(40, array[pg_temp.t(2), pg_temp.t(1)]);
select pg_temp.mk(41, 'learning', 2);
select pg_temp.legacy_rev(41);
select pg_temp.mk(42);
select pg_temp.rev(42, array[pg_temp.t(12), pg_temp.t(1)]);
update public.themes set archived_at = now() where id = pg_temp.t(12);
select ok(not has_table_privilege('anon', 'public.concept_links', 'select')
      and not has_any_column_privilege('anon', 'public.concept_links', 'select')
      and not has_table_privilege('service_role', 'public.concept_links', 'select')
      and has_table_privilege('authenticated', 'public.concept_links', 'select')
      and not has_table_privilege('authenticated', 'public.concept_links', 'insert,update,delete'),
  'concept_links: authenticated select only; anon and service_role nothing');
select ok('security_invoker=true' = any (select unnest(reloptions) from pg_class where oid = 'public.concept_links'::regclass)
      and 'security_invoker=true' = any (select unnest(reloptions) from pg_class where oid = 'public.public_concept_links'::regclass),
  'both link views run with security_invoker');
set local role authenticated;
select is((select string_agg(t.slug || '@' || l.position, ',' order by l.position) from public.concept_links l
            join public.themes t on t.id = l.concept_id where l.item_id = pg_temp.it(40)),
  'beta@1,alpha@2', 'concept_links: only the latest revision of an item');
select is((select string_agg(t.slug || '@' || l.position, ',' order by l.position) from public.concept_links l
            join public.themes t on t.id = l.concept_id where l.item_id = pg_temp.it(41)),
  'beta@1', 'concept_links: a legacy null array reads as theme_id');
select is((select string_agg(t.slug || '@' || l.position, ',' order by l.position) from public.concept_links l
            join public.themes t on t.id = l.concept_id where l.item_id = pg_temp.it(42)),
  'alpha@2', 'concept_links: an archived theme is filtered');
select is((select count(*) from public.concept_links where item_id = pg_temp.it(40)
            and revision_id = pg_temp.rv(40, 2)), 2::bigint, 'concept_links names the revision it read');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.concept_links), 0::bigint, 'concept_links: a non-admin session reads nothing');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
reset role;

-- 6. Public reads, interleaved with real publishing. Item 50 is the public item; r1 [alpha], r2 [alpha, beta].
select pg_temp.mk(50);
select pg_temp.rev(50, array[pg_temp.t(1)]);
select is(pg_temp.pub(50, 1), 'pass', 'item 50 r1 (alpha) passes the gate');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select string_agg(slug, ',' order by slug) from public.themes), 'alpha', 'anon: a public theme linked by the current revision shows, others do not');
select is((select string_agg(slug, ',' order by slug) from public.public_themes), 'alpha', 'anon: public_themes agrees');
reset role;
select pg_temp.rev(50, array[pg_temp.t(1), pg_temp.t(2)]);
set local role anon;
select is((select string_agg(slug, ',' order by slug) from public.themes), 'alpha',
  'anon: a theme linked only by a pending revision stays hidden');
select is((select string_agg(slug, ',' order by slug) from public.public_themes), 'alpha', 'anon: public_themes hides it too');
select isnt(pg_temp.rv(50, 2), null::uuid, 'fixture: the pending revision exists');
select is((select count(*) from public.item_revisions where id = pg_temp.rv(50, 2)), 0::bigint,
  'anon: the pending revision (and its concept_ids) is not readable');
reset role;
select is(pg_temp.pub(50, 2), 'pass', 'item 50 r2 (alpha, beta) passes the gate');
set local role anon;
select is((select string_agg(slug, ',' order by slug) from public.themes), 'alpha,beta', 'anon: beta shows once the current revision links it');
select is((select string_agg(slug, ',' order by slug) from public.public_themes), 'alpha,beta', 'anon: public_themes agrees');
select is((select string_agg(r.concept_ids::text, ';' order by r.rev_no) from public.item_revisions r where r.item_id = pg_temp.it(50)),
  '{c0000000-0000-4000-8000-000000000001};{c0000000-0000-4000-8000-000000000001,c0000000-0000-4000-8000-000000000002}',
  'anon: concept_ids is readable on gated revisions');
reset role;
-- r3 links a private concept (fails the gate, stays recorded); r4 is a newer pending revision.
select pg_temp.rev(50, array[pg_temp.t(3)]);
select is(pg_temp.pub(50, 3), 'fail', 'item 50 r3 (a private concept) fails the gate');
select pg_temp.rev(50, array[pg_temp.t(1)]);
-- Item 51 is private (never published); item 52 passes the gate but is inside the 30-day lag.
select pg_temp.mk(51);
select pg_temp.rev(51, array[pg_temp.t(1), pg_temp.t(2)]);
select pg_temp.mk(52, 'learning', null, (now() at time zone 'Asia/Kolkata')::date);
select pg_temp.rev(52, array[pg_temp.t(8)]);
select is(pg_temp.pub(52, 1), 'pass', 'item 52 (data as of today, concept zeta) passes the gate');
set local role anon;
select is((select string_agg(t.slug || '@' || r.rev_no || ':' || l.position, ',' order by r.rev_no, l.position)
             from public.public_concept_links l
             join public.themes t on t.id = l.concept_id
             join public.item_revisions r on r.id = l.revision_id
            where l.item_id = pg_temp.it(50)),
  'alpha@1:1,alpha@2:1,beta@2:2', 'public_concept_links: current and older passed revisions, never a failed (r3) or pending (r4) one');
select is((select count(*) from public.public_concept_links where item_id = pg_temp.it(51)), 0::bigint,
  'public_concept_links: a private item never');
select is((select count(*) from public.public_concept_links where item_id = pg_temp.it(52)), 0::bigint,
  'public_concept_links: a public item inside the 30-day lag never');
select is((select count(*) from public.themes where slug in ('zeta', 'gamma-private', 'stubby')), 0::bigint,
  'anon: a theme used only by a lagged item, a private theme and a stub are never visible');
select is((select count(*) from public.public_themes where slug in ('zeta', 'gamma-private', 'stubby')), 0::bigint,
  'anon: public_themes hides them too');
reset role;
-- Item 53 links epsilon through theme_id alone (a legacy revision with a null array).
select pg_temp.mk(53, 'learning', 7);
select pg_temp.legacy_rev(53);
select is(pg_temp.pub(53, 1), 'pass', 'item 53 (legacy, theme epsilon) passes the gate');
-- Item 54: r1 [theta] passes, r2 [alpha] passes; theta then goes private (no current revision links it).
select pg_temp.mk(54);
select pg_temp.rev(54, array[pg_temp.t(9)]);
select is(pg_temp.pub(54, 1), 'pass', 'item 54 r1 (theta) passes the gate');
select pg_temp.rev(54, array[pg_temp.t(1)]);
select is(pg_temp.pub(54, 2), 'pass', 'item 54 r2 (alpha) passes the gate');
select lives_ok($$ update public.themes set visibility = 'private' where id = pg_temp.t(9) $$,
  'a theme only an older revision links can go private');
set local role anon;
select is((select string_agg(slug, ',' order by slug) from public.public_themes), 'alpha,beta,epsilon', 'anon: public_themes after all publishing');
select is((select string_agg(t.slug || ':' || l.position, ',' order by l.position) from public.public_concept_links l
            join public.themes t on t.id = l.concept_id where l.item_id = pg_temp.it(53)),
  'epsilon:1', 'public_concept_links: the legacy rule reads theme_id');
select is((select string_agg(t.slug, ',' order by t.slug) from public.public_concept_links l
            join public.themes t on t.id = l.concept_id where l.item_id = pg_temp.it(54)),
  'alpha', 'public_concept_links: a concept that is no longer public is filtered');
select is((select count(*) from public.public_concept_links where concept_id = pg_temp.t(9)), 0::bigint,
  'public_concept_links: nothing for the private theta');
reset role;

-- 7. Guards (beta is linked only through concept_ids of item 50's current revision; epsilon only through theme_id).
select throws_ok($$ update public.themes set visibility = 'private' where id = pg_temp.t(2) $$, '23514', null,
  'a public theme linked through the current concept_ids cannot go private');
select throws_ok($$ update public.themes set name = 'Beta two' where id = pg_temp.t(2) $$, '23514', null,
  'nor have its name changed');
select throws_ok($$ update public.themes set slug = 'beta-two' where id = pg_temp.t(2) $$, '23514', null,
  'nor its slug');
select throws_ok($$ update public.themes set visibility = 'private' where id = pg_temp.t(7) $$, '23514', null,
  'the theme_id path still guards visibility');
select throws_ok($$ update public.themes set name = 'Epsilon two' where id = pg_temp.t(7) $$, '23514', null,
  'and the name');
select lives_ok($$ update public.themes set name = 'Bulk thirteen' where id = pg_temp.t(13) $$,
  'an unlinked theme can still be renamed');

-- 8. The gate (every earlier gate test file passes unchanged; these are the new checks).
select pg_temp.mk(60, 'reading_note');
select pg_temp.rev(60);
select is(pg_temp.pub(60, 1), 'fail', 'a reading note is refused');
select is(pg_temp.rules(60, 1), 'reading_note', 'under the rule reading_note, and nothing else');
select is((select visibility from public.items where id = pg_temp.it(60)), 'private', 'and the item stays private');
select pg_temp.mk(61);
select pg_temp.rev(61, array[pg_temp.t(3)]);
select is(pg_temp.pub(61, 1), 'fail', 'a linked private concept is refused');
select is(pg_temp.rules(61, 1), 'concept', 'under the rule concept');
select is((select f ->> 'message' from public.gate_decisions g, jsonb_array_elements(g.reasons -> 'failures') f
            where g.revision_id = pg_temp.rv(61, 1) and f ->> 'rule' = 'concept'),
  'The linked concept "Gamma Private" is not public.', 'the message names the concept');
select pg_temp.mk(62);
select pg_temp.rev(62, array[pg_temp.t(4)]);
select is(pg_temp.pub(62, 1), 'fail', 'a stub concept is refused');
select is(pg_temp.rules(62, 1), 'concept', 'under the rule concept');
select pg_temp.mk(63, 'learning', 3);
select pg_temp.rev(63);
select is(pg_temp.cids(63, 1), array[pg_temp.t(3)], 'fixture: item 63 links its theme_id concept');
select is(pg_temp.pub(63, 1), 'fail', 'a private theme_id is refused');
select is(pg_temp.rules(63, 1), 'theme', 'a concept equal to theme_id is reported once, by theme only');
select is((select f ->> 'message' from public.gate_decisions g, jsonb_array_elements(g.reasons -> 'failures') f
            where g.revision_id = pg_temp.rv(63, 1) and f ->> 'rule' = 'theme'),
  'The linked concept is not public.', 'the theme message now says concept');
select pg_temp.mk(64);
select pg_temp.rev(64, array[pg_temp.t(13), pg_temp.t(1)]);
update public.themes set archived_at = now() where id = pg_temp.t(13);
select is(pg_temp.pub(64, 1), 'pass', 'an archived concept id is ignored (all other concepts public)');
select pg_temp.mk(65);
select pg_temp.rev(65, array[pg_temp.t(1), pg_temp.t(2)]);
select is(pg_temp.pub(65, 1), 'pass', 'all concepts public passes');
select is((select count(*) from public.public_items where id = pg_temp.it(65)), 1::bigint, 'and the item appears in public_items');
select pg_temp.mk(66, 'reading_note');
select pg_temp.rev(66, array[pg_temp.t(3), pg_temp.t(4)]);
select is(pg_temp.pub(66, 1), 'fail', 'a reading note with private concepts fails');
select is(pg_temp.rules(66, 1), 'concept,concept,reading_note', 'every failure is recorded together');
select is((select count(*) from public.gate_decisions where revision_id = pg_temp.rv(66, 1) and verdict = 'pass'), 0::bigint,
  'no pass decision exists for it');
select pg_temp.mk(67);
select pg_temp.rev(67, array[pg_temp.t(1)]);
select pg_temp.rev(67, array[pg_temp.t(3)]);
select is(pg_temp.pub(67, 1), 'fail', 'only the latest revision can be published (a newer sibling exists)');
select is(pg_temp.rules(67, 1), 'revision', 'under the rule revision, and nothing else');

-- 9. Privileges and structure.
select ok(has_function_privilege('service_role', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute')
      and not has_function_privilege('public', 'public.publish_revision(uuid, uuid, uuid, text, jsonb)', 'execute'),
  'publish_revision is executable by service_role only');
select ok(not has_function_privilege('anon', 'private.knowledge_gate_failures(text, uuid, uuid[])', 'execute')
      and not has_function_privilege('authenticated', 'private.knowledge_gate_failures(text, uuid, uuid[])', 'execute')
      and not has_function_privilege('service_role', 'private.knowledge_gate_failures(text, uuid, uuid[])', 'execute')
      and not has_function_privilege('public', 'private.knowledge_gate_failures(text, uuid, uuid[])', 'execute')
      and not has_function_privilege('anon', 'private.carry_concept_ids()', 'execute')
      and not has_function_privilege('authenticated', 'private.carry_concept_ids()', 'execute')
      and not has_function_privilege('service_role', 'private.carry_concept_ids()', 'execute')
      and not has_function_privilege('public', 'private.carry_concept_ids()', 'execute'),
  'the two new private functions are executable by no API role');
select ok((select p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""')
             from pg_proc p where p.oid = 'private.carry_concept_ids()'::regprocedure)
      and (select p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""')
             from pg_proc p where p.oid = 'private.knowledge_gate_failures(text, uuid, uuid[])'::regprocedure),
  'both are security definer with an empty search_path');
select ok(position('sebi-unreg-2026-07-v1.1' in (select pg_get_functiondef(p.oid) from pg_proc p
            where p.oid = 'public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure)) > 0
      and position('knowledge_gate_failures' in (select pg_get_functiondef(p.oid) from pg_proc p
            where p.oid = 'public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure)) > 0
      and position('case_gate_failures' in (select pg_get_functiondef(p.oid) from pg_proc p
            where p.oid = 'public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure)) > 0
      and position('ledger_gate_item_failures' in (select pg_get_functiondef(p.oid) from pg_proc p
            where p.oid = 'public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure)) > 0,
  'publish_revision still pins policy v1.1, and carries the ledger, case and knowledge checks');
select ok(has_column_privilege('anon', 'public.item_revisions', 'concept_ids', 'select')
      and not has_column_privilege('authenticated', 'public.item_revisions', 'concept_ids', 'update')
      and not has_column_privilege('service_role', 'public.item_revisions', 'concept_ids', 'select'),
  'concept_ids: anon can read it, nobody can update it, service_role cannot read it');
select ok(has_table_privilege('anon', 'public.public_concept_links', 'select')
      and has_table_privilege('authenticated', 'public.public_concept_links', 'select')
      and not has_table_privilege('service_role', 'public.public_concept_links', 'select')
      and not has_table_privilege('anon', 'public.public_concept_links', 'insert,update,delete,truncate'),
  'public_concept_links: select for anon and authenticated, no writes');
select columns_are('public', 'public_concept_links', array['item_id', 'revision_id', 'concept_id', 'position'],
  'public_concept_links exposes exactly the contracted columns');
select columns_are('public', 'public_themes', array['id', 'slug', 'name'], 'public_themes keeps its three columns');

select * from finish();
rollback;
