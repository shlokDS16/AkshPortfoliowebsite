-- 20261017000022_videos.sql: the video kind, video_sources (machine columns written only by record_video_fetch), the append-only
-- video_transcripts with the SQL-computed hash, and the shape of the two public views (Phase 5b Task 6; spec s7.2).
-- What the views SHOW, and the gate, are in 0023_distribution_gate.test.sql (they need publish_revision). Sections: 1 kinds,
-- 2 sources, 3 record_video_fetch, 4 transcripts, 5 roles, 6 views and privileges. Item n is 7d000000-0000-4000-8000-0000000000nn.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(70);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'client@pgtap.test');

create function pg_temp.it(n int) returns uuid language sql as $$ select ('7d000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.yt(n int) returns text language sql as $$ select 'vid' || lpad(n::text, 8, '0') $$;
create function pg_temp.mkv(n int) returns void language sql as $$
  insert into public.items (id, kind, title, learning_objective) values (pg_temp.it(n), 'video', 'Video ' || n, 'Learn.');
  insert into public.video_sources (item_id, youtube_id) values (pg_temp.it(n), pg_temp.yt(n));
$$;
create function pg_temp.src(n int) returns uuid language sql security definer set search_path = '' as $$
  select id from public.video_sources where youtube_id = 'vid' || lpad(n::text, 8, '0')
$$;
grant execute on function pg_temp.it(int), pg_temp.yt(int), pg_temp.src(int) to public;
-- n segments of the text t, one every 30 seconds.
create function pg_temp.segs(n int, t text default 'Words here') returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('s', (g - 1) * 30, 't', t) order by g) from generate_series(1, n) g
$$;
grant execute on function pg_temp.segs(int, text) to public;

-- 1. Kinds.
select pg_temp.mkv(1);
select is((select kind from public.items where id = pg_temp.it(1)), 'video', 'a video item is accepted');
select throws_ok($$ insert into public.items (kind, title) values ('podcast', 'x') $$, '23514', null, 'an unknown kind is refused');
select lives_ok($$ insert into public.items (kind, title) values ('reading_note', 'r'), ('case_study', 'c'), ('process', 'p') $$,
  'every earlier kind is still accepted');

-- 2. Sources.
select throws_ok($$ insert into public.video_sources (item_id, youtube_id) values (pg_temp.it(1), 'short') $$, '23514', null,
  'a YouTube id must be 11 characters of [A-Za-z0-9_-]');
select pg_temp.mkv(2);
insert into public.items (id, kind, title) values (pg_temp.it(3), 'video', 'V3'), (pg_temp.it(4), 'video', 'V4');
select throws_ok($$ insert into public.video_sources (item_id, youtube_id) values (pg_temp.it(3), pg_temp.yt(2)) $$, '23505', null,
  'one YouTube id is listed once');
select throws_ok($$ insert into public.video_sources (item_id, youtube_id) values (pg_temp.it(1), 'abcdefghijk') $$, '23505', null,
  'one source per item');
select ok((select fetched_at is null and own_channel is null and privacy is null and yt_title is null
             from public.video_sources where item_id = pg_temp.it(1)), 'machine columns start empty');
select throws_ok($$ insert into public.video_sources (item_id, youtube_id, own_channel)
                    values (pg_temp.it(3), 'zzzzzzzzzzz', true) $$, '42501', null,
  'even the owner cannot insert a machine column (the guard)');
select throws_ok($$ update public.video_sources set youtube_id = 'abcdefghijk' where item_id = pg_temp.it(1) $$, '42501', null,
  'the YouTube id is frozen, even for the owner');
select throws_ok($$ update public.video_sources set item_id = pg_temp.it(2) where item_id = pg_temp.it(1) $$, '42501', null,
  'and so is the item');
select throws_ok($$ update public.video_sources set own_channel = true where item_id = pg_temp.it(1) $$, '42501', null,
  'a machine column changes only through record_video_fetch, even for the owner');
select throws_ok($$ update public.video_sources set privacy = 'public', fetched_at = now() where item_id = pg_temp.it(1) $$, '42501',
  null, 'whichever machine column it is');

-- 3. record_video_fetch (the owner here; service_role in section 5).
select lives_ok($$ select public.record_video_fetch(pg_temp.src(1), true, 'UCaaaaaaaaaaaaaaaaaaaaaa', true, 'A title', 'A description',
                     600, 'unlisted', '2026-09-01 10:00+05:30', null) $$, 'record_video_fetch writes a found video');
select ok((select own_channel and privacy = 'unlisted' and yt_title = 'A title' and duration_seconds = 600
                  and fetched_at = now() and channel_id = 'UCaaaaaaaaaaaaaaaaaaaaaa' and fetch_problem is null
             from public.video_sources where item_id = pg_temp.it(1)), 'and sets every machine column, fetched_at = now()');
select lives_ok($$ select public.record_video_fetch(pg_temp.src(1), false, null, null, null, null, null, null, null, 'not returned') $$,
  'a missing video is recorded');
select ok((select privacy = 'gone' and yt_title is null and yt_description is null and channel_id is null and own_channel is null
                  and duration_seconds is null and yt_published_at is null and fetch_problem = 'not returned' and fetched_at = now()
             from public.video_sources where item_id = pg_temp.it(1)), 'as gone, with every other YouTube column cleared (Q51: nothing of a deleted video is kept)');

-- 3b. purge_stale_video_data (Q51): YouTube data is kept no longer than 30 days. Source 1 is backdated to 31 days, source 2 to 1 day.
select public.record_video_fetch(pg_temp.src(2), true, 'UCaaaaaaaaaaaaaaaaaaaaaa', true, 'Two', 'Two d', 90, 'public', '2026-09-02 10:00+05:30', null);
select set_config('app.video_fetch', 'on', true);
update public.video_sources set fetched_at = now() - interval '31 days' where id = pg_temp.src(1);
update public.video_sources set fetched_at = now() - interval '1 day' where id = pg_temp.src(2);
select set_config('app.video_fetch', 'off', true);
select is(public.purge_stale_video_data(), 1, 'the purge clears the one source not refreshed in 30 days');
select ok((select channel_id is null and own_channel is null and yt_title is null and yt_description is null and duration_seconds is null
                  and privacy is null and yt_published_at is null and fetched_at is null
                  and fetch_problem = 'YouTube data older than 30 days was deleted. It is read again when YouTube answers.'
             from public.video_sources where item_id = pg_temp.it(1)), 'every YouTube column of it is null, fetched_at too, with the fixed problem');
select ok((select yt_title = 'Two' and yt_description = 'Two d' and duration_seconds = 90 and privacy = 'public' and fetch_problem is null
             from public.video_sources where item_id = pg_temp.it(2)), 'the source fetched yesterday is unchanged');
select throws_ok($$ select public.record_video_fetch('00000000-0000-4000-8000-000000000000', true, null, true, 't', 'd', 1, 'public',
                     now(), null) $$, 'P0002', null, 'an unknown source is refused');
select throws_ok($$ select public.record_video_fetch(pg_temp.src(1), null, null, true, 't', 'd', 1, 'public', now(), null) $$,
  '22023', null, 'found must be true or false');
select throws_ok($$ select public.record_video_fetch(pg_temp.src(1), true, null, true, repeat('x', 101), 'd', 1, 'public', now(), null) $$,
  '23514', null, 'a title over 100 characters is refused by the table');
select throws_ok($$ select public.record_video_fetch(pg_temp.src(1), true, null, true, 't', 'd', 0, 'public', now(), null) $$,
  '23514', null, 'a duration of 0 is refused');

-- 4. Transcripts.
insert into public.video_transcripts (video_source_id, segments, text_sha256, words)
values (pg_temp.src(1), '[{"s":0,"t":"Hello world."},{"s":31,"t":"Second line here"}]', repeat('0', 64), 99);
select is((select text_sha256 from public.video_transcripts where video_source_id = pg_temp.src(1)),
  '54cf37a1f7e132aea6b4c179fc04167a7abc481d1e5bca788af5857126318db5',
  'the hash is SQL''s: sha256 of the texts joined by a newline, whatever the client sent');
select is((select words from public.video_transcripts where video_source_id = pg_temp.src(1)), 5, 'and the word count too');
select is((select source from public.video_transcripts where video_source_id = pg_temp.src(1)), 'captions_file',
  'the source defaults to the caption file');
insert into public.video_transcripts (video_source_id, segments) values (pg_temp.src(2), '[{"s":0,"t":"é"},{"s":1,"t":"b"}]');
select is((select text_sha256 from public.video_transcripts where video_source_id = pg_temp.src(2)),
  '7148cd8e7e8f217e0014f9cf850c20d98172ee92356d2d1a79263d086e527d12', 'the text is hashed as UTF-8');
select throws_ok($$ update public.video_transcripts set words = 1 $$, 'P0001', null, 'a transcript cannot be updated');
select throws_ok($$ delete from public.video_transcripts $$, 'P0001', null, 'nor deleted');
select throws_ok($$ truncate public.video_transcripts $$, 'P0001', null, 'nor truncated');
select lives_ok($$ insert into public.video_transcripts (video_source_id, segments) values (pg_temp.src(2), pg_temp.segs(5000)) $$,
  '5,000 segments are accepted');
select throws_ok($$ insert into public.video_transcripts (video_source_id, segments) values (pg_temp.src(2), pg_temp.segs(5001)) $$,
  '23514', null, '5,001 segments are refused');
select lives_ok($$ insert into public.video_transcripts (video_source_id, segments) values (pg_temp.src(2), pg_temp.segs(1, repeat('a', 500))) $$,
  'a 500-character segment is accepted');
select throws_ok($$ insert into public.video_transcripts (video_source_id, segments) values (pg_temp.src(2), pg_temp.segs(1, repeat('a', 501))) $$,
  '23514', null, 'a 501-character segment is refused');
select throws_ok($$ insert into public.video_transcripts (video_source_id, segments) values (pg_temp.src(2), '[]') $$, '23514', null,
  'an empty transcript is refused');
select throws_ok($$ insert into public.video_transcripts (video_source_id, segments) values (pg_temp.src(2), '{"s":0,"t":"x"}') $$,
  '23514', null, 'segments must be an array');
select throws_ok($$ insert into public.video_transcripts (video_source_id, segments) values (pg_temp.src(2), '[{"s":0}]') $$,
  '23514', null, 'each segment needs its text');
select throws_ok($$ insert into public.video_transcripts (video_source_id, segments) values (pg_temp.src(2), '[{"s":0,"t":"   "}]') $$,
  '23514', null, 'a blank text is refused');
select throws_ok($$ insert into public.video_transcripts (video_source_id, segments) values (pg_temp.src(2), '[{"s":-1,"t":"x"}]') $$,
  '23514', null, 'a negative start is refused');
select throws_ok($$ insert into public.video_transcripts (video_source_id, segments) values (pg_temp.src(2), '[{"s":1.5,"t":"x"}]') $$,
  '23514', null, 'a start must be whole seconds');
select throws_ok($$ insert into public.video_transcripts (video_source_id, segments)
                    values (pg_temp.src(2), '[{"s":30,"t":"x"},{"s":0,"t":"y"}]') $$, '23514', null, 'starts never go back');
select throws_ok($$ insert into public.video_transcripts (video_source_id, segments)
                    values (pg_temp.src(2), '[{"s":0,"t":"x","html":"<b>"}]') $$, '23514', null, 'a segment has s and t only');
select throws_ok($$ insert into public.video_transcripts (video_source_id, source, segments)
                    values (pg_temp.src(2), 'whisper', '[{"s":0,"t":"x"}]') $$, '23514', null, 'only a caption file is a source in 5b');

-- 5. Roles. The admin session: reads, inserts (item_id, youtube_id) only, never a machine column, never record_video_fetch.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.video_sources where item_id in (pg_temp.it(1), pg_temp.it(2))), 2::bigint,
  'the admin reads the sources');
select lives_ok($$ insert into public.video_sources (item_id, youtube_id) values (pg_temp.it(4), pg_temp.yt(4)) $$,
  'the admin files the source of a video');
select throws_ok($$ update public.video_sources set yt_title = 'Mine' where item_id = pg_temp.it(4) $$, '42501', null,
  'the admin cannot write a machine column');
select throws_ok($$ insert into public.video_sources (item_id, youtube_id, privacy) values (pg_temp.it(3), 'yyyyyyyyyyy', 'public') $$,
  '42501', null, 'nor insert one');
select throws_ok($$ select public.record_video_fetch(pg_temp.src(4), true, null, true, 't', 'd', 1, 'public', now(), null) $$,
  '42501', null, 'nor call record_video_fetch');
select throws_ok($$ select public.purge_stale_video_data() $$, '42501', null, 'nor purge_stale_video_data');
select lives_ok($$ insert into public.video_transcripts (video_source_id, segments, text_sha256)
                   values (pg_temp.src(4), '[{"s":0,"t":"Hi"}]', 'f00d') $$, 'the admin adds a transcript (any sent hash is replaced)');
select is((select count(*) from public.video_transcripts where video_source_id = pg_temp.src(4)), 1::bigint, 'and reads it');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.video_sources), 0::bigint, 'a non-admin session reads no source');
select is((select count(*) from public.video_transcripts), 0::bigint, 'and no transcript');
select throws_ok($$ insert into public.video_sources (item_id, youtube_id) values (pg_temp.it(3), 'xxxxxxxxxxx') $$, '42501', null,
  'and inserts nothing');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*) from public.video_sources), 0::bigint, 'anon reads no source of a private item');
select throws_ok($$ select public.purge_stale_video_data() $$, '42501', null, 'anon cannot call purge_stale_video_data');
select throws_ok($$ select yt_description from public.video_sources $$, '42501', null, 'and never the description column');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$ select public.record_video_fetch(pg_temp.src(4), true, 'UCbbbbbbbbbbbbbbbbbbbbbb', false, 'T', 'D', 61, 'private',
                     now(), null) $$, 'service_role calls record_video_fetch');
select throws_ok($$ update public.video_sources set fetched_at = now() $$, '42501', null, 'but cannot update the table itself');
reset role;
select set_config('request.jwt.claims', '', true);

-- 6. Views and privileges.
select columns_are('public', 'public_videos', array['item_id', 'youtube_id', 'duration_seconds', 'yt_published_at'],
  'public_videos exposes exactly the contracted columns');
select columns_are('public', 'public_video_transcripts', array['item_id', 'segments'],
  'public_video_transcripts exposes exactly the contracted columns');
select ok((select bool_and(c.reloptions @> array['security_invoker=true']) from pg_class c
            where c.oid in ('public.public_videos'::regclass, 'public.public_video_transcripts'::regclass)),
  'both views are security_invoker');
select ok(has_table_privilege('anon', 'public.public_videos', 'select')
      and has_table_privilege('anon', 'public.public_video_transcripts', 'select')
      and has_table_privilege('authenticated', 'public.public_videos', 'select')
      and has_table_privilege('authenticated', 'public.public_video_transcripts', 'select')
      and not has_table_privilege('service_role', 'public.public_videos', 'select')
      and not has_table_privilege('anon', 'public.public_videos', 'insert,update,delete,truncate'),
  'the two views: select for anon and authenticated, nothing for service_role, no writes');
select is((select string_agg(a.attname, ',' order by a.attname) from pg_attribute a
            where a.attrelid = 'public.video_sources'::regclass and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('anon', a.attrelid, a.attnum, 'select')),
  'duration_seconds,id,item_id,youtube_id,yt_published_at',
  'anon can select exactly these source columns (the view and the transcript policy need them; never channel, description, privacy or problem)');
select is((select string_agg(a.attname, ',' order by a.attname) from pg_attribute a
            where a.attrelid = 'public.video_transcripts'::regclass and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('anon', a.attrelid, a.attnum, 'select')),
  'id,segments,video_source_id', 'anon can select exactly these transcript columns');
select is((select string_agg(a.attname, ',' order by a.attname) from pg_attribute a
            where a.attrelid = 'public.video_sources'::regclass and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('authenticated', a.attrelid, a.attnum, 'insert')),
  'item_id,youtube_id', 'authenticated inserts only item_id and youtube_id');
select ok(not has_any_column_privilege('authenticated', 'public.video_sources', 'update')
      and has_table_privilege('authenticated', 'public.video_sources', 'delete')
      and not has_any_column_privilege('authenticated', 'public.video_transcripts', 'update')
      and not has_table_privilege('authenticated', 'public.video_transcripts', 'delete'),
  'authenticated updates neither table; deletes a source only (refused while public), never a transcript');
select ok(has_table_privilege('service_role', 'public.video_sources', 'select')
      and not has_any_column_privilege('service_role', 'public.video_sources', 'insert,update')
      and not has_table_privilege('service_role', 'public.video_sources', 'delete')
      and not has_any_column_privilege('service_role', 'public.video_transcripts', 'select,insert,update'),
  'service_role reads sources only (it writes through record_video_fetch) and never touches transcripts');
select ok(has_function_privilege('service_role', 'public.record_video_fetch(uuid, boolean, text, boolean, text, text, integer, text, timestamptz, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.record_video_fetch(uuid, boolean, text, boolean, text, text, integer, text, timestamptz, text)', 'execute')
      and not has_function_privilege('anon', 'public.record_video_fetch(uuid, boolean, text, boolean, text, text, integer, text, timestamptz, text)', 'execute'),
  'record_video_fetch is service_role only');
select ok((select bool_and(c.relrowsecurity) from pg_class c
            where c.oid in ('public.video_sources'::regclass, 'public.video_transcripts'::regclass)), 'RLS is on for both tables');

select * from finish();
rollback;
