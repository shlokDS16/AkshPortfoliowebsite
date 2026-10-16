-- 20261019000026_sources.sql: source_links and its two join tables, the machine write boundary (record_source_fetch), the
-- SQL-computed meta_sha and meta_since, the 30-day purge, the private picture bucket and the privileges (Phase 5d Task 2; spec s4).
-- What the public sees (public_studied, the storage read policy, archive while shown) is in 0027_sources_gate.test.sql, because
-- it needs the rule 14 gate. Link n is 5d000000-0000-4000-8000-0000000000nn; its YouTube id is 'src' and n in 8 digits.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(62);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
                                          ('bbbbbbbb-0000-4000-8000-000000000002', 'other@pgtap.test');
insert into public.companies (id, slug, name, visibility) values
  ('c6000000-0000-4000-8000-000000000001', 'src-co-1', 'Src Co 1', 'public'),
  ('c6000000-0000-4000-8000-000000000002', 'src-co-2', 'Src Co 2', 'public'),
  ('c6000000-0000-4000-8000-000000000003', 'src-co-3', 'Src Co 3', 'public'),
  ('c6000000-0000-4000-8000-000000000004', 'src-co-4', 'Src Co 4', 'public'),
  ('c6000000-0000-4000-8000-000000000005', 'src-co-5', 'Src Co 5', 'public'),
  ('c6000000-0000-4000-8000-000000000006', 'src-co-6', 'Src Co 6', 'public');
insert into public.themes (id, slug, name)
select ('7d000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'src-theme-' || g, 'Src theme ' || g from generate_series(1, 9) g;

create function pg_temp.ln(n int) returns uuid language sql as $$ select ('5d000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.yt(n int) returns text language sql as $$ select 'src' || lpad(n::text, 8, '0') $$;
grant execute on function pg_temp.ln(int), pg_temp.yt(int) to public;
-- A YouTube link (as the owner, no machine data), or a web link when p_web.
create function pg_temp.mk(n int, p_web boolean default false) returns void language sql as $$
  insert into public.source_links (id, url, url_key, kind, youtube_id, note)
  values (pg_temp.ln(n),
          case when p_web then 'https://example.com/post-' || n else 'https://www.youtube.com/watch?v=' || pg_temp.yt(n) end,
          case when p_web then 'example.com/post-' || n else 'yt:' || pg_temp.yt(n) end,
          case when p_web then 'web' else 'youtube' end,
          case when p_web then null else pg_temp.yt(n) end, 'My private note ' || n)
$$;
create function pg_temp.sha(p text) returns text language sql as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
create function pg_temp.got(n int, p_title text default 'A title', p_thumb text default null) returns text language sql as $$
  select public.record_source_fetch(pg_temp.ln(n), true, p_title, 'A channel', 'https://www.youtube.com/@achannel',
                                    case when p_thumb is not null then 'yt/' || p_thumb || '.jpg' end, p_thumb, null, false)
$$;
-- Backdates a timestamp with the guard off (the guard owns meta_since, so not even record_source_fetch can set it).
create function pg_temp.age(n int, p_col text, p_ts timestamptz) returns void language plpgsql as $$
begin
  alter table public.source_links disable trigger source_links_guard;
  execute format('update public.source_links set %I = $1 where id = $2', p_col) using p_ts, pg_temp.ln(n);
  alter table public.source_links enable trigger source_links_guard;
end $$;

-- 1. Structure.
select has_table('public', 'source_links', 'source_links exists');
select ok((select bool_and(c.relrowsecurity) from pg_class c
            where c.oid in ('public.source_links'::regclass, 'public.source_link_companies'::regclass, 'public.source_link_concepts'::regclass)),
  'RLS is on for the three tables');
select ok((select public = false and file_size_limit = 204800 and allowed_mime_types = array['image/jpeg']
             from storage.buckets where id = 'source-thumbs'), 'source-thumbs is private, 200 KB, JPEG only');

-- 2. Constraints.
select lives_ok($$ select pg_temp.mk(1) $$, 'a YouTube link is saved');
select lives_ok($$ select pg_temp.mk(2, true) $$, 'a web link is saved');
select throws_ok($$ insert into public.source_links (url, url_key, kind) values ('http://example.com/a', 'example.com/a', 'web') $$,
  '23514', null, 'a link must be https');
select throws_ok($$ insert into public.source_links (url, url_key, kind) values ('https://example.com/' || repeat('a', 1990), 'example.com/x', 'web') $$,
  '23514', null, 'a link is at most 2,000 characters');
select throws_ok($$ insert into public.source_links (url, url_key, kind) values ('https://youtu.be/abc', 'yt:abc', 'youtube') $$,
  '23514', null, 'a YouTube link needs its id');
select throws_ok($$ insert into public.source_links (url, url_key, kind, youtube_id) values ('https://example.com/b', 'example.com/b', 'web', 'abcdefghijk') $$,
  '23514', null, 'a web link has no YouTube id');
select throws_ok($$ insert into public.source_links (url, url_key, kind, youtube_id) values ('https://youtu.be/abc', 'yt:abc', 'youtube', 'abc') $$,
  '23514', null, 'a YouTube id is 11 characters');
select throws_ok($$ insert into public.source_links (url, url_key, kind, youtube_id) values ('https://youtu.be/abcdefghijk', 'yt:zzzzzzzzzzz', 'youtube', 'abcdefghijk') $$,
  '23514', null, 'a YouTube key is yt: and its id');
select throws_ok($$ insert into public.source_links (url, url_key, kind) values ('https://example.com/c', 'example.com/c', 'pdf') $$,
  '23514', null, 'kind is youtube or web');
select throws_ok($$ insert into public.source_links (url, url_key, kind, note) values ('https://example.com/d', 'example.com/d', 'web', repeat('n', 4001)) $$,
  '23514', null, 'his note is at most 4,000 characters');
select throws_ok($$ insert into public.source_links (url, url_key, kind) values ('https://example.com/post-2?a=1', 'example.com/post-2', 'web') $$,
  '23505', null, 'url_key is unique (a second save of the same link is the dedupe path, not a new row)');
select lives_ok($$ insert into public.source_link_companies (link_id, company_id)
                   select pg_temp.ln(1), ('c6000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 5) g $$,
  'five companies on one link');
select throws_ok($$ insert into public.source_link_companies (link_id, company_id) values (pg_temp.ln(1), 'c6000000-0000-4000-8000-000000000006') $$,
  '23514', 'A source can be attached to at most 5 companies.', 'not six');
select lives_ok($$ insert into public.source_link_concepts (link_id, theme_id)
                   select pg_temp.ln(1), ('7d000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 8) g $$,
  'eight concepts on one link');
select throws_ok($$ insert into public.source_link_concepts (link_id, theme_id) values (pg_temp.ln(1), '7d000000-0000-4000-8000-000000000009') $$,
  '23514', 'A source can be attached to at most 8 concepts.', 'not nine');

-- 3. The machine columns: written only through record_source_fetch, which computes meta_sha and meta_since in SQL.
select throws_ok($$ update public.source_links set title = 'Typed' where id = pg_temp.ln(1) $$, '42501', null,
  'even the owner cannot write a machine column outside record_source_fetch');
select throws_ok($$ insert into public.source_links (url, url_key, kind, title) values ('https://example.com/e', 'example.com/e', 'web', 'T') $$,
  '42501', null, 'nor insert a link with one');
select throws_ok($$ update public.source_links set url = 'https://example.com/other' where id = pg_temp.ln(2) $$, '42501', null,
  'the link itself is fixed');
select is(pg_temp.got(1, 'Plant visit', repeat('a', 64)), null, 'the first read returns no earlier picture');
select is((select title || '|' || site_name || '|' || channel_url || '|' || thumb_path from public.source_links where id = pg_temp.ln(1)),
  'Plant visit|A channel|https://www.youtube.com/@achannel|yt/' || repeat('a', 64) || '.jpg', 'and stores what was read');
select is((select meta_sha from public.source_links where id = pg_temp.ln(1)),
  pg_temp.sha(concat_ws(E'\n', 'youtube', 'Plant visit', 'A channel', 'https://www.youtube.com/@achannel', repeat('a', 64))),
  'meta_sha is computed in SQL over kind, title, name, channel and picture hash');
select ok((select meta_since is not null and fetched_at is not null and checked_at is not null and fetch_attempts = 0 and not gone
             from public.source_links where id = pg_temp.ln(1)), 'with meta_since, fetched_at and checked_at set');
select pg_temp.age(1, 'meta_since', '2026-01-01 00:00+00');
select pg_temp.age(1, 'fetched_at', '2026-01-01 00:00+00');
select pg_temp.age(1, 'checked_at', '2026-01-01 00:00+00');
select is(pg_temp.got(1, 'Plant visit', repeat('a', 64)), null, 'the same picture again returns nothing to delete');
select is((select meta_since from public.source_links where id = pg_temp.ln(1)), '2026-01-01 00:00+00'::timestamptz,
  'meta_since does not move when nothing changed');
select is((select fetched_at from public.source_links where id = pg_temp.ln(1)), '2026-01-01 00:00+00'::timestamptz,
  'fetched_at keeps the first read');
select is((select checked_at from public.source_links where id = pg_temp.ln(1)), now(), 'checked_at is this read');
select is(pg_temp.got(1, 'Plant visit, part 2', repeat('b', 64)), 'yt/' || repeat('a', 64) || '.jpg',
  'a new picture returns the replaced one to delete');
select is((select meta_since from public.source_links where id = pg_temp.ln(1)), now(), 'meta_since moves when the data changes');
select set_config('app.source_fetch', 'on', true);
update public.source_links set meta_sha = repeat('0', 64), meta_since = '2020-01-01' where id = pg_temp.ln(1);
select set_config('app.source_fetch', 'off', true);
select is((select meta_sha from public.source_links where id = pg_temp.ln(1)),
  pg_temp.sha(concat_ws(E'\n', 'youtube', 'Plant visit, part 2', 'A channel', 'https://www.youtube.com/@achannel', repeat('b', 64))),
  'a meta_sha sent by anyone is ignored and recomputed');
select is((select meta_since from public.source_links where id = pg_temp.ln(1)), now(), 'and meta_since with it');
-- A picture two links share (identical bytes) is never returned while the other still uses it.
select pg_temp.mk(3);
select pg_temp.got(3, 'Other', repeat('b', 64));
select is(pg_temp.got(1, 'Plant visit, part 2', repeat('c', 64)), null, 'a replaced picture still used by another link is kept');
select is(public.record_source_fetch(pg_temp.ln(2), true, 'A page', 'example.com', null, null, null, null, false), null,
  'a web page is read with its title and site');
select is((select meta_sha from public.source_links where id = pg_temp.ln(2)), pg_temp.sha(concat_ws(E'\n', 'web', 'A page', 'example.com', '', '')),
  'with its own hash');
select throws_ok($$ select public.record_source_fetch(pg_temp.ln(2), true, 'P', 'example.com', 'https://www.youtube.com/@x', null, null, null, false) $$,
  '23514', null, 'a web page has no channel');
select throws_ok($$ select public.record_source_fetch(pg_temp.ln(3), true, 'T', 'C', 'https://evil.example/@x', null, null, null, false) $$,
  '23514', null, 'a channel link is on www.youtube.com');
select throws_ok($$ select public.record_source_fetch(pg_temp.ln(3), true, 'T', 'C', null, 'yt/' || repeat('d', 64) || '.jpg', repeat('e', 64), null, false) $$,
  '23514', null, 'the picture path is its hash');
select throws_ok($$ select public.record_source_fetch(pg_temp.ln(3), true, repeat('t', 301), 'C', null, null, null, null, false) $$,
  '23514', null, 'a title is at most 300 characters');
select throws_ok($$ select public.record_source_fetch(pg_temp.ln(3), false, null, null, null, null, null, 'broken', false) $$,
  '23514', null, 'a problem is one of the known codes');
select throws_ok($$ select public.record_source_fetch(pg_temp.ln(3), null, null, null, null, null, null, null, false) $$,
  '22023', null, 'found must be true or false');
select throws_ok($$ select public.record_source_fetch(pg_temp.ln(3), true, 'T', null, null, null, null, null, true) $$,
  '22023', null, 'found and gone cannot both be true');
select throws_ok($$ select public.record_source_fetch(pg_temp.ln(99), false, null, null, null, null, null, 'timeout', false) $$,
  'P0002', null, 'an unknown link is reported');
-- A failed read keeps what was read before and counts the attempt.
select public.record_source_fetch(pg_temp.ln(3), false, null, null, null, null, null, 'timeout', false);
select is((select title || '|' || fetch_problem || '|' || fetch_attempts from public.source_links where id = pg_temp.ln(3)), 'Other|timeout|1',
  'a timeout keeps the earlier data, records the problem and counts the attempt');
-- Gone: every machine column is cleared and the picture returned (no other link uses it now? link 1 moved to c).
select is(public.record_source_fetch(pg_temp.ln(3), false, null, null, null, null, null, 'not_found', true), 'yt/' || repeat('b', 64) || '.jpg',
  'a video gone from YouTube returns its picture to delete');
select ok((select gone and num_nonnulls(title, site_name, channel_url, thumb_path, thumb_sha256, meta_sha, meta_since) = 0
                  and fetch_problem = 'not_found'
             from public.source_links where id = pg_temp.ln(3)), 'and keeps none of its data');

-- 4. The purge: YouTube data not checked in 30 days is cleared and its pictures returned; pages and fresh data are kept.
select pg_temp.mk(4);
select pg_temp.got(4, 'Stale', repeat('f', 64));
select pg_temp.age(4, 'checked_at', now() - interval '31 days');
select pg_temp.mk(5);
select pg_temp.got(5, 'Fresh', repeat('e', 64));
select pg_temp.age(5, 'checked_at', now() - interval '29 days');
select pg_temp.age(2, 'checked_at', now() - interval '90 days');
select is((select array_agg(p order by p) from public.purge_stale_source_data() p), array['yt/' || repeat('f', 64) || '.jpg'],
  'purge returns the picture paths it cleared');
select ok((select num_nonnulls(title, site_name, channel_url, thumb_path, thumb_sha256, meta_sha) = 0 and fetch_problem = 'purged'
             from public.source_links where id = pg_temp.ln(4)), 'and clears that link''s YouTube data');
select is((select title from public.source_links where id = pg_temp.ln(5)), 'Fresh', 'a link checked 29 days ago is kept');
select is((select title from public.source_links where id = pg_temp.ln(2)), 'A page', 'a web page is never purged');

-- 5. The admin session: his words and the archive switch only; no delete.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into public.source_links (url, url_key, kind, youtube_id, note)
                   values ('https://youtu.be/admin000001', 'yt:admin000001', 'youtube', 'admin000001', 'Saved by me') $$,
  'the admin saves a link');
select throws_ok($$ insert into public.source_links (url, url_key, kind, meta_sha) values ('https://example.com/m', 'example.com/m', 'web', repeat('0', 64)) $$,
  '42501', null, 'the admin cannot send a meta_sha');
select lives_ok($$ update public.source_links set note = 'Changed my mind', archived_at = now() where id = pg_temp.ln(5) $$,
  'the admin edits his note and archives');
select throws_ok($$ update public.source_links set title = 'Mine now' where id = pg_temp.ln(5) $$, '42501', null,
  'the admin cannot write a title');
select throws_ok($$ delete from public.source_links where id = pg_temp.ln(5) $$, '42501', null, 'no one deletes a link');
select lives_ok($$ delete from public.source_link_concepts where link_id = pg_temp.ln(1) and theme_id = '7d000000-0000-4000-8000-000000000001' $$,
  'the admin removes a concept chip');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.source_links), 0::bigint, 'another signed-in user sees no link');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select note from public.source_links $$, '42501', null, 'anon never reads his private note');
select throws_ok($$ select title, youtube_id, fetch_problem from public.source_links $$, '42501', null,
  'nor the title, the YouTube id or the problem from the table');
reset role;
select set_config('request.jwt.claims', '', true);

-- 6. Privileges.
select ok((select bool_and(has_function_privilege('service_role', f, 'execute') and not has_function_privilege('anon', f, 'execute')
                           and not has_function_privilege('authenticated', f, 'execute'))
             from unnest(array['public.record_source_fetch(uuid, boolean, text, text, text, text, text, text, boolean)',
                               'public.purge_stale_source_data()']::regprocedure[]) f),
  'record_source_fetch and purge_stale_source_data: service_role only');
select ok(not has_table_privilege('service_role', 'public.source_links', 'insert,update,delete')
      and has_table_privilege('service_role', 'public.source_links', 'select'),
  'the service role reads links and writes them only through record_source_fetch');

select * from finish();
rollback;
