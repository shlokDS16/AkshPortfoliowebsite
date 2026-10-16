-- 20261017000023_distribution_gate.sql: publishing rule 12 (videos) in publish_revision under policy sebi-unreg-2026-07-v1.2, and
-- what the two public video views show (Phase 5b Task 6; spec s7.2, s7.3; docs/compliance/publishing-rules-v1.2-addendum.md).
-- Every earlier gate test file passes unchanged except the policy string. Item n is 7e000000-0000-4000-8000-0000000000nn; its
-- YouTube id is 'gat' and n in 8 digits. Sections: 1 a good video, 2 rule 12.1, 3 rule 12.2, 4 rule 12.3, 5 rule 12.4,
-- 6 other kinds and the policy, 7 the views, 8 roles, 9 structure and privileges.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(76);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test');
insert into public.companies (id, slug, name, visibility) values ('c5000000-0000-4000-8000-000000000001', 'vid-co', 'Vid Co', 'public');

create function pg_temp.it(n int) returns uuid language sql as $$ select ('7e000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.yt(n int) returns text language sql as $$ select 'gat' || lpad(n::text, 8, '0') $$;
create function pg_temp.src(n int) returns uuid language sql security definer set search_path = '' as $$
  select id from public.video_sources where youtube_id = 'gat' || lpad(n::text, 8, '0')
$$;
create function pg_temp.rv(n int, r int) returns uuid language sql security definer set search_path = '' as $$
  select id from public.item_revisions where item_id = ('7e000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid and rev_no = r
$$;
grant execute on function pg_temp.it(int), pg_temp.yt(int), pg_temp.src(int), pg_temp.rv(int, int) to public;
-- A video item with its source; fetched (own channel, unlisted) unless told otherwise.
create function pg_temp.mkv(n int, p_company boolean default false, p_asof date default null, p_fetch boolean default true,
                            p_own boolean default true, p_privacy text default 'unlisted') returns void language plpgsql as $$
begin
  insert into public.items (id, kind, title, learning_objective, company_id, holds_position, data_as_of)
  values (pg_temp.it(n), 'video', 'Video ' || n, 'Learn how a plant is read.',
          case when p_company then 'c5000000-0000-4000-8000-000000000001'::uuid end, case when p_company then 'no' end, p_asof);
  insert into public.video_sources (item_id, youtube_id) values (pg_temp.it(n), pg_temp.yt(n));
  if p_fetch then
    perform public.record_video_fetch(pg_temp.src(n), true, 'UCaaaaaaaaaaaaaaaaaaaaaa', p_own, 'YT title', 'YT description', 600,
                                      p_privacy, '2026-09-01 10:00+05:30', null);
  end if;
end $$;
create function pg_temp.tr(n int, p_text text default 'We read the plant.') returns uuid language sql as $$
  insert into public.video_transcripts (video_source_id, segments)
  values (pg_temp.src(n), jsonb_build_array(jsonb_build_object('s', 0, 't', p_text), jsonb_build_object('s', 30, 't', 'Then the books.')))
  returning id
$$;
create function pg_temp.sha(p_tid uuid) returns text language sql as $$ select text_sha256 from public.video_transcripts where id = p_tid $$;
create function pg_temp.st(n int, p_tid uuid, p_chapters jsonb default '[]') returns jsonb language sql as $$
  select jsonb_build_object('schema', 'video/1', 'youtubeId', pg_temp.yt(n), 'transcriptId', p_tid, 'transcriptSha', pg_temp.sha(p_tid),
                            'chapters', p_chapters)
$$;
create function pg_temp.rev(n int, p_struct jsonb) returns void language sql as $$
  insert into public.item_revisions (item_id, body_md, structured) values (pg_temp.it(n), 'His description of the video.', p_struct)
$$;
-- A video that should pass: item, source, transcript, revision 1.
create function pg_temp.good(n int, p_company boolean default false, p_asof date default null, p_own boolean default true,
                             p_privacy text default 'unlisted', p_chapters jsonb default '[]') returns void language plpgsql as $$
begin
  perform pg_temp.mkv(n, p_company, p_asof, true, p_own, p_privacy);
  perform pg_temp.rev(n, pg_temp.st(n, pg_temp.tr(n), p_chapters));
end $$;
-- The real door, as the owner. p_lint_sha 'auto' sends the revision's own transcriptSha in the lint result; null sends none.
create function pg_temp.pub(n int, r int, p_lint_sha text default 'auto', p_policy text default 'sebi-unreg-2026-07-v1.2')
returns text language sql as $$
  select (public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.it(n), pg_temp.rv(n, r), p_policy,
    jsonb_build_object('passed', true, 'revisionId', pg_temp.rv(n, r)::text, 'policyVersion', p_policy)
    || case when p_lint_sha is null then '{}'::jsonb
            else jsonb_build_object('transcriptSha', case when p_lint_sha = 'auto'
              then (select structured ->> 'transcriptSha' from public.item_revisions where id = pg_temp.rv(n, r)) else p_lint_sha end)
       end)).verdict
$$;
create function pg_temp.f(n int, r int, p_key text) returns text language sql as $$
  select coalesce(string_agg(f ->> p_key, ',' order by f ->> 'code', f ->> 'rule', f ->> 'message'), '')
    from public.gate_decisions g, jsonb_array_elements(g.reasons -> 'failures') f
   where g.revision_id = pg_temp.rv(n, r)
$$;
create function pg_temp.vid(n int) returns bigint language sql as $$ select count(*) from public.public_videos where item_id = pg_temp.it(n) $$;

-- 1. A good video passes and is listed.
select pg_temp.good(1);
select is(pg_temp.pub(1, 1), 'pass', 'an own, unlisted, freshly fetched video with its transcript passes');
select is(pg_temp.f(1, 1, 'rule'), '', 'with no failure recorded');
select is((select count(*) from public.public_items where id = pg_temp.it(1) and kind = 'video'), 1::bigint, 'it appears in public_items');
select is((select youtube_id || ' ' || duration_seconds from public.public_videos where item_id = pg_temp.it(1)), 'gat00000001 600',
  'and in public_videos');
select is((select segments -> 0 ->> 't' from public.public_video_transcripts where item_id = pg_temp.it(1)), 'We read the plant.',
  'and its transcript in public_video_transcripts');
select is((select file_no from public.items where id = pg_temp.it(1)), null, 'a video takes no file number');
select pg_temp.good(2, p_privacy => 'public');
select is(pg_temp.pub(2, 1), 'pass', 'a video already public on YouTube passes too');

-- 2. Rule 12.1: own channel, unlisted or public, fetched within 7 days; the revision matches the source.
select pg_temp.good(10);
alter table public.video_sources disable trigger video_sources_guard;
update public.video_sources set fetched_at = now() - interval '7 days 1 minute' where item_id = pg_temp.it(10);
alter table public.video_sources enable trigger video_sources_guard;
select is(pg_temp.pub(10, 1), 'fail', 'YouTube data fetched more than 7 days ago fails');
select is(pg_temp.f(10, 1, 'code'), '12.1', 'under 12.1 alone');
select is(pg_temp.f(10, 1, 'message'), 'YouTube data is more than 7 days old. Fetch it again.', 'saying so');
select is(pg_temp.f(10, 1, 'rule'), '12', 'with the rule 12');
select pg_temp.good(11, p_own => false);
select is(pg_temp.pub(11, 1), 'fail', 'a video from another channel fails');
select is(pg_temp.f(11, 1, 'code') || ' ' || pg_temp.f(11, 1, 'message'), '12.1 This video is not from your channel.', 'under 12.1');
select pg_temp.good(12, p_privacy => 'private');
select is(pg_temp.pub(12, 1), 'fail', 'a video private on YouTube fails');
select is(pg_temp.f(12, 1, 'code') || ' ' || pg_temp.f(12, 1, 'message'), '12.1 This video is private or gone on YouTube.', 'under 12.1');
select pg_temp.good(13);
select public.record_video_fetch(pg_temp.src(13), false, null, null, null, null, null, null, null, null);
select is(pg_temp.pub(13, 1), 'fail', 'a video gone from YouTube fails');
select is(pg_temp.f(13, 1, 'code') || ' ' || pg_temp.f(13, 1, 'message'), '12.1 This video is private or gone on YouTube.', 'under 12.1');
select pg_temp.mkv(14, p_fetch => false);
select pg_temp.rev(14, pg_temp.st(14, pg_temp.tr(14)));
select is(pg_temp.pub(14, 1), 'fail', 'a video never fetched fails');
select is(pg_temp.f(14, 1, 'code') || ' ' || pg_temp.f(14, 1, 'message'), '12.1 YouTube data has not been fetched yet.', 'under 12.1');
select pg_temp.mkv(15);
select pg_temp.rev(15, pg_temp.st(15, pg_temp.tr(15)) || '{"youtubeId":"xxxxxxxxxxx"}');
select is(pg_temp.pub(15, 1), 'fail', 'a revision naming another YouTube id fails');
select is(pg_temp.f(15, 1, 'code') || ' ' || pg_temp.f(15, 1, 'message'),
  '12.1 This revision does not match the video''s YouTube link.', 'under 12.1');
select pg_temp.mkv(16);
select pg_temp.rev(16, pg_temp.st(16, pg_temp.tr(16)) || '{"schema":"video/2"}');
select is(pg_temp.pub(16, 1), 'fail', 'a revision without the video/1 schema fails');
select is(pg_temp.f(16, 1, 'code'), '12.1', 'under 12.1');

-- 3. Rule 12.2: the transcript is stored, matches, and the lint covered exactly it.
select pg_temp.mkv(20);
select pg_temp.rev(20, jsonb_build_object('schema', 'video/1', 'youtubeId', pg_temp.yt(20), 'chapters', '[]'::jsonb));
select is(pg_temp.pub(20, 1, null), 'fail', 'a video without a transcript fails');
select is(pg_temp.f(20, 1, 'code') || ' ' || pg_temp.f(20, 1, 'message'),
  '12.2 A video needs its transcript before it is listed.', 'under 12.2');
select pg_temp.mkv(21);
select pg_temp.rev(21, pg_temp.st(21, pg_temp.tr(21)) || jsonb_build_object('transcriptSha', repeat('a', 64)));
select is(pg_temp.pub(21, 1), 'fail', 'a transcriptSha that is not the stored hash fails (even when the lint says the same)');
select is(pg_temp.f(21, 1, 'code') || ' ' || pg_temp.f(21, 1, 'message'),
  '12.2 The transcript in this revision does not match the stored transcript.', 'under 12.2');
select pg_temp.mkv(22);
select pg_temp.rev(22, pg_temp.st(22, (select id from public.video_transcripts where video_source_id = pg_temp.src(1))) ||
                       jsonb_build_object('youtubeId', pg_temp.yt(22)));
select is(pg_temp.pub(22, 1), 'fail', 'another video''s transcript fails');
select is(pg_temp.f(22, 1, 'code'), '12.2', 'under 12.2');
select pg_temp.good(23);
select is(pg_temp.pub(23, 1, null), 'fail', 'a lint result without transcriptSha fails');
select is(pg_temp.f(23, 1, 'code') || ' ' || pg_temp.f(23, 1, 'message'), '12.2 The lint did not check this transcript.', 'under 12.2');
select pg_temp.good(24);
select is(pg_temp.pub(24, 1, repeat('b', 64)), 'fail', 'a lint result for other text fails');
select is(pg_temp.f(24, 1, 'code'), '12.2', 'under 12.2');

-- 4. Rule 12.3: a video naming a company needs figures to a date at least 30 IST days old.
select pg_temp.good(30, true, (now() at time zone 'Asia/Kolkata')::date - 10);
select is(pg_temp.pub(30, 1), 'fail', 'figures to 10 days ago fail');
select is(pg_temp.f(30, 1, 'code') || ' ' || pg_temp.f(30, 1, 'message'),
  '12.3 A video that names a company needs a figures-to date at least 30 days old.', 'under 12.3 alone');
select pg_temp.good(31, true, null);
select is(pg_temp.pub(31, 1), 'fail', 'no figures-to date fails');
select is(pg_temp.f(31, 1, 'code'), '12.3', 'under 12.3');
select pg_temp.good(32, true, (now() at time zone 'Asia/Kolkata')::date - 30);
select is(pg_temp.pub(32, 1), 'pass', 'figures to exactly 30 IST days ago pass (the ledger half passes for a company with no idea)');
select is(pg_temp.vid(32), 1::bigint, 'and the video is listed');
select pg_temp.good(33, false, (now() at time zone 'Asia/Kolkata')::date - 5);
select is(pg_temp.pub(33, 1), 'pass', 'a video naming no company needs no old figures-to date');
select is(pg_temp.vid(33), 0::bigint, 'but it is not listed until its data_as_of is past the lag (SQL view)');

-- 5. Rule 12.4: chapters are none, or 3 to 100, first at 0, rising, titled 1 to 100 characters.
select pg_temp.good(40, p_chapters => '[{"s":5,"title":"A"},{"s":60,"title":"B"},{"s":90,"title":"C"}]');
select is(pg_temp.pub(40, 1), 'fail', 'chapters starting at 5 s fail');
select is(pg_temp.f(40, 1, 'code') || ' ' || pg_temp.f(40, 1, 'message'),
  '12.4 Chapters must start at 0:00, number 3 to 100, rise in time and each have a title of 1 to 100 characters.', 'under 12.4');
select pg_temp.good(41, p_chapters => '[{"s":0,"title":"A"},{"s":60,"title":"B"}]');
select is(pg_temp.pub(41, 1) || ' ' || pg_temp.f(41, 1, 'code'), 'fail 12.4', 'two chapters fail');
select pg_temp.good(42, p_chapters => '[{"s":0,"title":"A"},{"s":60,"title":"B"},{"s":60,"title":"C"}]');
select is(pg_temp.pub(42, 1) || ' ' || pg_temp.f(42, 1, 'code'), 'fail 12.4', 'a start that does not rise fails');
select pg_temp.good(43, p_chapters => jsonb_build_array(jsonb_build_object('s', 0, 'title', repeat('t', 101)),
                                                         '{"s":60,"title":"B"}'::jsonb, '{"s":90,"title":"C"}'::jsonb));
select is(pg_temp.pub(43, 1) || ' ' || pg_temp.f(43, 1, 'code'), 'fail 12.4', 'a 101-character title fails');
select pg_temp.good(44, p_chapters => (select jsonb_agg(jsonb_build_object('s', g * 10, 'title', 'T' || g) order by g)
                                         from generate_series(0, 100) g));
select is(pg_temp.pub(44, 1) || ' ' || pg_temp.f(44, 1, 'code'), 'fail 12.4', '101 chapters fail');
select pg_temp.good(45, p_chapters => '[{"s":0,"title":"A"},{"s":"x","title":"B"},{"s":90,"title":"C"}]');
select is(pg_temp.pub(45, 1) || ' ' || pg_temp.f(45, 1, 'code'), 'fail 12.4', 'a start that is not a number fails (and does not raise)');
select pg_temp.mkv(46);
select pg_temp.rev(46, pg_temp.st(46, pg_temp.tr(46)) - 'chapters');
select is(pg_temp.pub(46, 1) || ' ' || pg_temp.f(46, 1, 'code'), 'fail 12.4', 'a revision without a chapters array fails');
select pg_temp.good(47, p_chapters => '[{"s":0,"title":"Intro"},{"s":61,"title":"Plant"},{"s":300,"title":"Books"}]');
select is(pg_temp.pub(47, 1), 'pass', 'three good chapters pass');
select pg_temp.good(48, p_chapters => (select jsonb_agg(jsonb_build_object('s', g * 10, 'title', 'T' || g) order by g)
                                         from generate_series(0, 99) g));
select is(pg_temp.pub(48, 1), 'pass', '100 chapters pass');
-- Everything wrong at once is recorded together.
select pg_temp.mkv(49, true, (now() at time zone 'Asia/Kolkata')::date, false);
select pg_temp.rev(49, '{"schema":"video/1","chapters":[{"s":3,"title":""}]}');
select is(pg_temp.pub(49, 1, null), 'fail', 'a video wrong in every way fails');
select is(pg_temp.f(49, 1, 'code'), '12.1,12.2,12.3,12.4', 'with every rule 12 failure recorded');

-- 6. Other kinds, and the policy.
select is(private.distribution_gate_failures(pg_temp.it(1), 'thesis', null, null, pg_temp.rv(1, 1), '{"schema":"video/1"}', '{}'),
  '[]'::jsonb, 'the helper returns nothing for another kind');
insert into public.items (id, kind, title, learning_objective) values (pg_temp.it(50), 'learning', 'Plain', 'Learn.');
select pg_temp.rev(50, '{"schema":"video/1"}');
select is(pg_temp.pub(50, 1, null), 'pass', 'a learning note is untouched by rule 12');
select pg_temp.good(51);
select is(pg_temp.pub(51, 1, 'auto', 'sebi-unreg-2026-07-v1.1'), 'fail', 'the v1.1 policy is refused');
select is(pg_temp.f(51, 1, 'message'), 'This database accepts only policy version sebi-unreg-2026-07-v1.2.', 'saying which it accepts');

-- 7. The views: the current public revision's transcript only; never a failed, pending, lagged or private item.
select pg_temp.good(60);
select is(pg_temp.pub(60, 1), 'pass', 'fixture: video 60 rev 1 listed with transcript A');
select pg_temp.rev(60, pg_temp.st(60, pg_temp.tr(60, 'Transcript B.')));
select is(pg_temp.pub(60, 2), 'pass', 'rev 2 with transcript B listed');
select pg_temp.rev(60, pg_temp.st(60, pg_temp.tr(60, 'Transcript C, pending.')));
select is((select string_agg(segments -> 0 ->> 't', '|') from public.public_video_transcripts where item_id = pg_temp.it(60)),
  'Transcript B.', 'only the current revision''s transcript is public (never A, never the pending C)');
select is((select count(*) from public.public_videos
            where item_id in (select pg_temp.it(g) from generate_series(10, 49) g)
              and item_id not in (pg_temp.it(32), pg_temp.it(47), pg_temp.it(48))), 0::bigint,
  'no failed video is listed');
select is((select count(*) from public.public_video_transcripts where item_id = pg_temp.it(33)), 0::bigint,
  'a lagged video''s transcript is not public');
select public.unpublish_item('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.it(2));
select is(pg_temp.vid(2) + (select count(*) from public.public_video_transcripts where item_id = pg_temp.it(2)), 0::bigint,
  'an unpublished video leaves both views');

-- 8. Roles.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ delete from public.video_sources where item_id = pg_temp.it(1) $$, '23514', null,
  'the admin cannot delete the source of a public video');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select youtube_id from public.public_videos where item_id = pg_temp.it(1)), 'gat00000001', 'anon reads a listed video');
select is((select string_agg(segments -> 0 ->> 't', '|') from public.public_video_transcripts where item_id = pg_temp.it(60)),
  'Transcript B.', 'and only its current transcript');
select is((select count(*) from public.video_transcripts where video_source_id = pg_temp.src(60)), 1::bigint,
  'the base table shows anon the current transcript only');
select is((select count(*) from public.video_sources where item_id in (pg_temp.it(10), pg_temp.it(33), pg_temp.it(2))), 0::bigint,
  'anon reads no source of a failed, lagged or unpublished video');
select throws_ok($$ select channel_id from public.video_sources $$, '42501', null, 'anon never reads the channel');
select throws_ok($$ select privacy, fetch_problem from public.video_sources $$, '42501', null, 'nor privacy or the fetch problem');
reset role;
select set_config('request.jwt.claims', '', true);

-- 9. Structure and privileges.
select ok(pg_get_functiondef('public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure) ~ 'sebi-unreg-2026-07-v1\.2'
      and pg_get_functiondef('public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure) ~ 'private\.distribution_gate_failures'
      and pg_get_functiondef('public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure) ~ 'private\.knowledge_gate_failures'
      and pg_get_functiondef('public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure) ~ 'private\.case_gate_failures'
      and pg_get_functiondef('public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure) ~ 'private\.ledger_gate_item_failures'
      and pg_get_functiondef('public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure) ~ 'from public\.themes t\s+where t\.id = any[^;]*for share',
  'publish_revision pins v1.2, calls rule 12 and keeps the ledger, case and knowledge checks and the for share lock');
select ok(pg_get_functiondef('private.distribution_gate_failures(uuid, text, uuid, date, uuid, jsonb, jsonb)'::regprocedure)
            ~ 'from public\.video_sources[^;]*for share',
  'the helper holds the source row until the decision commits (a concurrent fetch waits)');
select ok(not has_function_privilege('anon', 'private.distribution_gate_failures(uuid, text, uuid, date, uuid, jsonb, jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'private.distribution_gate_failures(uuid, text, uuid, date, uuid, jsonb, jsonb)', 'execute')
      and not has_function_privilege('service_role', 'private.distribution_gate_failures(uuid, text, uuid, date, uuid, jsonb, jsonb)', 'execute')
      and not has_function_privilege('public', 'private.distribution_gate_failures(uuid, text, uuid, date, uuid, jsonb, jsonb)', 'execute'),
  'distribution_gate_failures is executable by no API role');
select ok((select p.prosecdef and 'search_path=""' = any (p.proconfig) from pg_proc p
            where p.oid = 'private.distribution_gate_failures(uuid, text, uuid, date, uuid, jsonb, jsonb)'::regprocedure),
  'it is security definer with an empty search_path');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname in ('guard_video_source', 'guard_video_source_delete', 'seal_video_transcript')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute'))
$$, 'the three trigger functions are executable by no API role');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and p.proname in ('guard_video_source', 'guard_video_source_delete', 'seal_video_transcript')), 3,
  'and all three exist');

select * from finish();
rollback;
