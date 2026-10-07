-- 20261007000004_hardening.sql: private.slugify caps a public URL slug at 60 characters, cut on a dash,
-- and collapses dash runs. A symbol-only title still slugs to '' and publish_revision falls back to 'item'.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test');

-- Unchanged behaviour for ordinary titles.
select is(private.slugify('How Capex Cycles Turn!'), 'how-capex-cycles-turn', 'lowercases and hyphenates');
select is(private.slugify('  --Q1 FY26 & results--  '), 'q1-fy26-results', 'collapses runs and trims dashes');
select is(private.slugify('Q1 -- FY26 --- results'), 'q1-fy26-results', 'repeated dashes collapse to one');
select is(private.slugify('₹₹₹'), '', 'a symbol-only title slugs to the empty string');
select is(private.slugify(null), '', 'null slugs to the empty string');

-- The cap.
select is(private.slugify('The quick brown fox jumps over the lazy dog and keeps running past the river bank'),
  'the-quick-brown-fox-jumps-over-the-lazy-dog-and-keeps', 'a long title is cut back to the last whole word within 60');
select is(private.slugify(repeat('a', 60) || ' b'), repeat('a', 60), 'a cut that lands on a dash keeps the whole first word');
select is(private.slugify(repeat('a', 60)), repeat('a', 60), 'exactly 60 characters is kept');
select is(private.slugify(repeat('x', 100)), repeat('x', 60), 'a single word longer than 60 is hard-cut at 60');
select ok((select bool_and(length(private.slugify(t)) <= 60 and private.slugify(t) !~ '(^-|-$|--)')
             from (values (repeat('word ', 40)), (repeat('ab-', 50)), (repeat('long-title ', 20) || '!!!'),
                          ('a' || repeat(' ', 70) || 'b'), (repeat('z', 59) || ' ' || repeat('y', 10))) v(t)),
  'every slug is at most 60 characters, with no leading, trailing or doubled dash');

-- Through the gate: a 200-character title gives a slug of at most 67 characters (60 + '-' + 6).
insert into public.items (id, kind, title, learning_objective) values
  ('d1000000-0000-4000-8000-000000000001', 'learning', rpad('Very long title about capex cycles ', 200, 'and more words '), 'Learn.'),
  ('d2000000-0000-4000-8000-000000000002', 'learning', '₹₹₹', 'Learn.');
insert into public.item_revisions (id, item_id, body_md) values
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'v1'),
  ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'v1');
set local role service_role;
select is((select verdict from public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07',
    '{"passed":true,"revisionId":"e1000000-0000-4000-8000-000000000001","policyVersion":"sebi-unreg-2026-07"}'::jsonb)),
  'pass', 'the long-titled item publishes');
select is((select verdict from public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'sebi-unreg-2026-07',
    '{"passed":true,"revisionId":"e2000000-0000-4000-8000-000000000001","policyVersion":"sebi-unreg-2026-07"}'::jsonb)),
  'pass', 'the symbol-only item publishes');
reset role;
select results_eq($$ select slug, length(slug) <= 67 from public.items order by id $$,
  $$ values ('very-long-title-about-capex-cycles-and-more-words-and-more-d10000'::text, true),
            ('item-d20000'::text, true) $$,
  'the generated slugs are capped (long title) and fall back to "item" (symbol-only title)');

select * from finish();
rollback;
