-- 20261019000027_sources_gate.sql: rule 14 (outside sources on a company file) in publish_revision under policy
-- sebi-unreg-2026-07-v1.3, and what public_studied and the source-thumbs read policy show (Phase 5d Task 2; spec s4, s5;
-- docs/compliance/publishing-rules-v1.3-addendum.md). Every earlier gate test file passes unchanged except the policy string.
-- Item n is 8e000000-0000-4000-8000-0000000000nn (a file on Src Co unless told otherwise); link n is 5e000000-...-nn.
-- Sections: 1 a good file, 2 rule 14.1, 3 rule 14.2, 4 rule 14.3, 5 the view, 6 archive and unlink while shown,
-- 7 pictures and anon, 8 policy, structure and privileges.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(76);

insert into private.settings (key, value) values ('admin_email', 'admin@pgtap.test')
  on conflict (key) do update set value = excluded.value;
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@pgtap.test');
insert into public.companies (id, slug, name, visibility) values
  ('c7000000-0000-4000-8000-000000000001', 'studied-co', 'Src Co', 'public'),
  ('c7000000-0000-4000-8000-000000000002', 'studied-other', 'Other Co', 'public');

create function pg_temp.it(n int) returns uuid language sql as $$ select ('8e000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.ln(n int) returns uuid language sql as $$ select ('5e000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.rv(n int, r int) returns uuid language sql security definer set search_path = '' as $$
  select id from public.item_revisions where item_id = ('8e000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid and rev_no = r
$$;
grant execute on function pg_temp.it(int), pg_temp.ln(int), pg_temp.rv(int, int) to public;
-- A link (YouTube with a picture, or a web page), read, attached to Src Co (or p_co).
create function pg_temp.mkl(n int, p_web boolean default false, p_read boolean default true,
                            p_co uuid default 'c7000000-0000-4000-8000-000000000001') returns void language plpgsql as $$
declare v_yt text := 'stu' || lpad(n::text, 8, '0');
begin
  insert into public.source_links (id, url, url_key, kind, youtube_id, note)
  values (pg_temp.ln(n), case when p_web then 'https://example.org/read-' || n else 'https://www.youtube.com/watch?v=' || v_yt end,
          case when p_web then 'example.org/read-' || n else 'yt:' || v_yt end, case when p_web then 'web' else 'youtube' end,
          case when p_web then null else v_yt end, 'Private thoughts ' || n);
  if p_read then
    perform public.record_source_fetch(pg_temp.ln(n), true, 'Title ' || n, case when p_web then 'example.org' else 'Channel ' || n end,
      case when p_web then null else 'https://www.youtube.com/@ch' || n end,
      case when p_web then null else 'yt/' || encode(sha256(convert_to('pic' || n, 'UTF8')), 'hex') || '.jpg' end,
      case when p_web then null else encode(sha256(convert_to('pic' || n, 'UTF8')), 'hex') end, null, false);
  end if;
  if p_co is not null then
    insert into public.source_link_companies (link_id, company_id) values (pg_temp.ln(n), p_co);
  end if;
end $$;
create function pg_temp.msha(n int) returns text language sql as $$ select meta_sha from public.source_links where id = pg_temp.ln(n) $$;
-- An entry: shown entries carry the link's current hash, hidden ones none.
create function pg_temp.e(n int, p_show boolean default true, p_note text default '') returns jsonb language sql as $$
  select jsonb_build_object('link', pg_temp.ln(n)::text, 'show', p_show,
                            'metaSha', case when p_show then pg_temp.msha(n) end, 'note', p_note)
$$;
create function pg_temp.mki(n int, p_kind text default 'thesis', p_asof date default null,
                            p_co uuid default 'c7000000-0000-4000-8000-000000000001') returns void language sql as $$
  insert into public.items (id, kind, title, learning_objective, company_id, holds_position, data_as_of)
  values (pg_temp.it(n), p_kind, 'File ' || n, 'Learn how a business is read.', p_co, case when p_co is not null then 'no' end,
          coalesce(p_asof, (now() at time zone 'Asia/Kolkata')::date - 40))
$$;
create function pg_temp.rev(n int, p_studied jsonb) returns void language sql as $$
  insert into public.item_revisions (item_id, body_md, structured)
  values (pg_temp.it(n), 'His file.', case when p_studied is null then '{}'::jsonb else jsonb_build_object('studied', p_studied) end)
$$;
-- The real door, as the owner. The lint result names the hashes of the shown entries unless p_lint says otherwise.
create function pg_temp.pub(n int, r int, p_lint jsonb default null, p_policy text default 'sebi-unreg-2026-07-v1.3')
returns text language sql as $$
  select (public.publish_revision('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.it(n), pg_temp.rv(n, r), p_policy,
    jsonb_build_object('passed', true, 'revisionId', pg_temp.rv(n, r)::text, 'policyVersion', p_policy,
      'studied', coalesce(p_lint, (select coalesce(jsonb_agg(x ->> 'metaSha') filter (where x ->> 'metaSha' is not null), '[]'::jsonb)
                                     from public.item_revisions r2,
                                          jsonb_array_elements(case when jsonb_typeof(r2.structured -> 'studied') = 'array'
                                                                    then r2.structured -> 'studied' else '[]' end) x
                                    where r2.id = pg_temp.rv(n, r)))))).verdict
$$;
create function pg_temp.f(n int, r int, p_key text) returns text language sql as $$
  select coalesce(string_agg(f ->> p_key, ',' order by f ->> 'code', f ->> 'rule', f ->> 'message'), '')
    from public.gate_decisions g, jsonb_array_elements(g.reasons -> 'failures') f
   where g.revision_id = pg_temp.rv(n, r)
$$;
create function pg_temp.rows(n int) returns bigint language sql as $$ select count(*) from public.public_studied where item_id = pg_temp.it(n) $$;
create function pg_temp.has14(p jsonb) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(p) f where f ->> 'code' = '14.1')
$$;

-- 1. A good file: one source shown with its title and picture, one shown as a plain link.
select pg_temp.mkl(1);
select pg_temp.mkl(2, true);
select pg_temp.mki(1);
select pg_temp.rev(1, jsonb_build_array(pg_temp.e(1, true, 'Worth a watch.'), pg_temp.e(2, false)));
select is(pg_temp.pub(1, 1), 'pass', 'a file with a shown source and a plain one passes');
select is(pg_temp.f(1, 1, 'rule'), '', 'with no failure recorded');
select is(pg_temp.rows(1), 2::bigint, 'both appear in public_studied at once (no hold)');
select is((select concat_ws('|', position, kind, url, title, site_name, channel_url, thumb_path, note, saved_on)
             from public.public_studied where item_id = pg_temp.it(1) and position = 1),
  concat_ws('|', 1, 'youtube', 'https://www.youtube.com/watch?v=stu00000001', 'Title 1', 'Channel 1', 'https://www.youtube.com/@ch1',
            'yt/' || encode(sha256(convert_to('pic1', 'UTF8')), 'hex') || '.jpg', 'Worth a watch.', (now() at time zone 'Asia/Kolkata')::date),
  'the shown entry carries the title, channel, picture, his entry note and the IST save date');
select is((select concat_ws('|', position, kind, url, coalesce(title, '-'), coalesce(site_name, '-'), coalesce(thumb_path, '-'), note)
             from public.public_studied where item_id = pg_temp.it(1) and position = 2),
  '2|web|https://example.org/read-2|-|-|-|', 'a hidden entry carries only its kind and link');
select pg_temp.mkl(3);
select pg_temp.mki(3, 'case_study');
select pg_temp.rev(3, jsonb_build_array(pg_temp.e(3)));
select is(pg_temp.pub(3, 1), 'pass', 'a case study that is not from the ledger may carry a source');
select is(pg_temp.rows(3), 1::bigint, 'and shows it');

-- 2. Rule 14.1: shape, at most 12, no duplicate, a company file only.
select pg_temp.mkl(g, true) from generate_series(101, 113) g;
select pg_temp.mki(10);
select pg_temp.rev(10, (select jsonb_agg(pg_temp.e(g, false) order by g) from generate_series(101, 113) g));
select is(pg_temp.pub(10, 1), 'fail', 'thirteen sources fail');
select is(pg_temp.f(10, 1, 'code') || ' ' || pg_temp.f(10, 1, 'message'), '14.1 A file can show at most 12 outside sources.', 'under 14.1 alone');
select is(pg_temp.f(10, 1, 'rule'), '14', 'with the rule 14');
select pg_temp.mki(11);
select pg_temp.rev(11, jsonb_build_array(pg_temp.e(101, false) || '{"title":"typed"}'));
select is(pg_temp.pub(11, 1) || ' ' || pg_temp.f(11, 1, 'code'), 'fail 14.1', 'an entry with an extra key fails 14.1');
select is(pg_temp.f(11, 1, 'message'), 'Outside source 1 is not in the expected form. Save the sources again.', 'saying which');
select pg_temp.mki(12);
select pg_temp.rev(12, jsonb_build_array(pg_temp.e(101, false) || jsonb_build_object('link', upper(pg_temp.ln(101)::text))));
select is(pg_temp.pub(12, 1) || ' ' || pg_temp.f(12, 1, 'code'), 'fail 14.1', 'a link that is not a lower-case uuid fails 14.1');
select pg_temp.mki(13);
select pg_temp.rev(13, jsonb_build_array(pg_temp.e(101, false, repeat('n', 501))));
select is(pg_temp.pub(13, 1) || ' ' || pg_temp.f(13, 1, 'code'), 'fail 14.1', 'an entry note over 500 characters fails 14.1');
select pg_temp.mki(14);
select pg_temp.rev(14, jsonb_build_array(pg_temp.e(101, false), pg_temp.e(101, false)));
select is(pg_temp.pub(14, 1) || ' ' || pg_temp.f(14, 1, 'code'), 'fail 14.1', 'the same link twice fails 14.1 alone');
select is(pg_temp.f(14, 1, 'message'), 'Outside source 2 is listed twice.', 'saying which');
select pg_temp.mki(15);
select pg_temp.rev(15, '{"link":"x"}'::jsonb);
select is(pg_temp.pub(15, 1) || ' ' || pg_temp.f(15, 1, 'code'), 'fail 14.1', 'studied that is not a list fails 14.1');
select pg_temp.mki(16);
select pg_temp.rev(16, jsonb_build_array(pg_temp.e(101, false) || '{"show":"yes"}'));
select is(pg_temp.pub(16, 1) || ' ' || pg_temp.f(16, 1, 'code'), 'fail 14.1', 'show that is not true or false fails 14.1');
select pg_temp.mki(17, 'note', null, null);
select pg_temp.rev(17, jsonb_build_array(pg_temp.e(101, false)));
select is(pg_temp.pub(17, 1), 'fail', 'a studied key on a note fails');
select is(pg_temp.f(17, 1, 'code') || ' ' || pg_temp.f(17, 1, 'message'), '14.1 Outside sources go on a company file.', 'under 14.1 alone');
select ok(pg_temp.has14(private.distribution_gate_failures(pg_temp.it(3), 'case_study', 'c7000000-0000-4000-8000-000000000001',
            current_date - 60, pg_temp.rv(3, 1), '{"ledger":{},"studied":[]}', '{}')), 'a studied key on a ledger case fails 14.1');
select ok(pg_temp.has14(private.distribution_gate_failures(pg_temp.it(3), 'video', null, null, pg_temp.rv(3, 1),
            '{"schema":"video/1","studied":[]}', '{}')), 'and on a video, beside rule 12');
select ok(pg_temp.has14(private.distribution_gate_failures(pg_temp.it(3), 'letter', null, null, pg_temp.rv(3, 1),
            '{"schema":"letter/1","studied":[]}', '{}')), 'and on a letter, beside rule 13');
select is(private.distribution_gate_failures(pg_temp.it(3), 'thesis', null, null, pg_temp.rv(3, 1), '{"sources":[]}', '{}'),
  '[]'::jsonb, 'a file without a studied key is untouched by rule 14');

-- 3. Rule 14.2: attached to the file's company, not archived, not gone.
select pg_temp.mkl(20, true);
update public.source_links set archived_at = now() where id = pg_temp.ln(20);
select pg_temp.mki(20);
select pg_temp.rev(20, jsonb_build_array(pg_temp.e(20, false)));
select is(pg_temp.pub(20, 1) || ' ' || pg_temp.f(20, 1, 'code'), 'fail 14.2', 'an archived source fails 14.2 alone');
select is(pg_temp.f(20, 1, 'message'), 'Outside source 1 was archived or removed. Save the sources again.', 'saying so');
select pg_temp.mkl(21);
select public.record_source_fetch(pg_temp.ln(21), false, null, null, null, null, null, 'not_found', true);
select pg_temp.mki(21);
select pg_temp.rev(21, jsonb_build_array(pg_temp.e(21, false)));
select is(pg_temp.pub(21, 1) || ' ' || pg_temp.f(21, 1, 'code'), 'fail 14.2', 'a video gone from YouTube fails 14.2 alone');
select is(pg_temp.f(21, 1, 'message'), 'Outside source 1 is no longer on YouTube. Save the sources again without it.', 'saying so');
select pg_temp.mkl(22, true, true, 'c7000000-0000-4000-8000-000000000002');
select pg_temp.mki(22);
select pg_temp.rev(22, jsonb_build_array(pg_temp.e(22, false)));
select is(pg_temp.pub(22, 1) || ' ' || pg_temp.f(22, 1, 'code'), 'fail 14.2', 'a source of another company fails 14.2 alone');
select is(pg_temp.f(22, 1, 'message'), 'Outside source 1 is not attached to this file''s company.', 'saying so');
select pg_temp.mki(23);
select pg_temp.rev(23, jsonb_build_array(pg_temp.e(23, false)));
select is(pg_temp.pub(23, 1) || ' ' || pg_temp.f(23, 1, 'code'), 'fail 14.2', 'a link that does not exist fails 14.2');

-- 4. Rule 14.3: what is shown is what the machine read now and what the lint read.
select pg_temp.mkl(30);
select pg_temp.mki(30);
select pg_temp.rev(30, jsonb_build_array(pg_temp.e(30) || jsonb_build_object('metaSha', repeat('a', 64))));
select is(pg_temp.pub(30, 1, jsonb_build_array(repeat('a', 64))) || ' ' || pg_temp.f(30, 1, 'code'), 'fail 14.3',
  'a shown entry with a stale hash fails 14.3 alone (even when the lint names it)');
select is(pg_temp.f(30, 1, 'message'), 'YouTube or the page changed since you chose it. Save the sources again.', 'with the spec sentence');
select pg_temp.mki(31);
select pg_temp.rev(31, jsonb_build_array(pg_temp.e(30)));
select is(pg_temp.pub(31, 1, '[]') || ' ' || pg_temp.f(31, 1, 'code'), 'fail 14.3', 'a shown title the lint did not read fails 14.3 alone');
select is(pg_temp.f(31, 1, 'message'), 'The wording check did not read outside source 1. Run the check again.', 'saying so');
select pg_temp.mki(32);
select pg_temp.rev(32, jsonb_build_array(pg_temp.e(30, false) || jsonb_build_object('metaSha', pg_temp.msha(30))));
select is(pg_temp.pub(32, 1) || ' ' || pg_temp.f(32, 1, 'code'), 'fail 14.3', 'a hidden entry that carries a hash fails 14.3 alone');
select pg_temp.mkl(33, false, false);
select pg_temp.mki(33);
select pg_temp.rev(33, jsonb_build_array(pg_temp.e(33)));
select is(pg_temp.pub(33, 1) || ' ' || pg_temp.f(33, 1, 'code'), 'fail 14.3', 'showing a source never read fails 14.3');
select pg_temp.mki(34);
select pg_temp.rev(34, jsonb_build_array(pg_temp.e(30, true, 'A good one.'), pg_temp.e(101, false)));
select is(pg_temp.pub(34, 1), 'pass', 'the same sources chosen correctly pass');
select is(pg_temp.rows(34), 2::bigint, 'and are listed');

-- 5. The view: the current public revision only; hash masking; gone hidden; nothing for a failed, lagged or unpublished file.
select pg_temp.rev(1, jsonb_build_array(pg_temp.e(1, true, 'Still worth it.')));
select is(pg_temp.pub(1, 2), 'pass', 'file 1 rev 2 keeps only source 1');
select is((select string_agg(note, '|') from public.public_studied where item_id = pg_temp.it(1)), 'Still worth it.',
  'only the current revision''s entries are public');
select pg_temp.rev(1, jsonb_build_array(pg_temp.e(1), pg_temp.e(2), pg_temp.e(3)));
select is(pg_temp.rows(1), 1::bigint, 'a pending revision changes nothing');
select public.record_source_fetch(pg_temp.ln(1), true, 'Retitled', 'Channel 1', 'https://www.youtube.com/@ch1', null, null, null, false);
select is((select concat_ws('|', url, coalesce(title, '-'), coalesce(site_name, '-'), coalesce(channel_url, '-'), coalesce(thumb_path, '-'))
             from public.public_studied where item_id = pg_temp.it(1)),
  'https://www.youtube.com/watch?v=stu00000001|-|-|-|-', 'after YouTube changed the title, the card shows only the link');
select pg_temp.mkl(40);
select pg_temp.mki(40);
select pg_temp.rev(40, jsonb_build_array(pg_temp.e(40)));
select is(pg_temp.pub(40, 1), 'pass', 'fixture: file 40 shows source 40');
select public.record_source_fetch(pg_temp.ln(40), false, null, null, null, null, null, 'not_found', true);
select is(pg_temp.rows(40), 0::bigint, 'a video found gone leaves the public file at once');
select pg_temp.mkl(41);
select pg_temp.mki(41, 'thesis', (now() at time zone 'Asia/Kolkata')::date - 5);
select pg_temp.rev(41, jsonb_build_array(pg_temp.e(41)));
select is(pg_temp.pub(41, 1), 'pass', 'a file with recent figures passes');
select is(pg_temp.rows(41), 0::bigint, 'but its sources wait with the file itself (rule 3 lag of the item, not of the source)');
select is((select count(*) from public.public_studied where item_id in (pg_temp.it(10), pg_temp.it(20), pg_temp.it(30), pg_temp.it(33))),
  0::bigint, 'no failed file lists a source');
select public.unpublish_item('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.it(34));
select is(pg_temp.rows(34), 0::bigint, 'an unpublished file lists none');

-- 6. Archive and unlink are refused while the current public revision shows the source.
insert into public.source_link_companies (link_id, company_id) values (pg_temp.ln(1), 'c7000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ update public.source_links set archived_at = now() where id = pg_temp.ln(1) $$, '23514',
  'It is on the public file. Save a revision without it first.', 'the admin cannot archive a source a public file shows');
select throws_ok($$ delete from public.source_link_companies where link_id = pg_temp.ln(1) and company_id = 'c7000000-0000-4000-8000-000000000001' $$,
  '23514', 'It is on the public file. Save a revision without it first.', 'nor remove the file''s company from it');
select lives_ok($$ delete from public.source_link_companies where link_id = pg_temp.ln(1) and company_id = 'c7000000-0000-4000-8000-000000000002' $$,
  'another company can be removed');
reset role;
select pg_temp.rev(1, '[]'::jsonb);
select is(pg_temp.pub(1, 4), 'pass', 'file 1 rev 4 shows no source');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ update public.source_links set archived_at = now() where id = pg_temp.ln(1) $$, 'then the source can be archived');
select lives_ok($$ delete from public.source_link_companies where link_id = pg_temp.ln(1) $$, 'and unlinked');
reset role;

-- 7. Pictures and anon.
select pg_temp.mkl(70);
select pg_temp.mkl(71);
select pg_temp.mki(70);
select pg_temp.rev(70, jsonb_build_array(pg_temp.e(70), pg_temp.e(71, false)));
select is(pg_temp.pub(70, 1), 'pass', 'fixture: file 70 shows 70 with its picture, 71 without');
insert into storage.objects (bucket_id, name) values
  ('source-thumbs', (select thumb_path from public.source_links where id = pg_temp.ln(70))),
  ('source-thumbs', (select thumb_path from public.source_links where id = pg_temp.ln(71))),
  ('source-thumbs', (select thumb_path from public.source_links where id = pg_temp.ln(30)));
select set_config('pgtap.m71', pg_temp.msha(71), true);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*) from storage.objects where bucket_id = 'source-thumbs'), 1::bigint, 'anon reads one picture: the shown one');
select is((select name from storage.objects where bucket_id = 'source-thumbs'),
  'yt/' || encode(sha256(convert_to('pic70', 'UTF8')), 'hex') || '.jpg', 'source 70''s');
select is((select count(*) from public.public_studied where item_id = pg_temp.it(70) and title is null), 1::bigint,
  'anon sees the hidden entry without its title');
select is((select count(*) from private.studied_shown(pg_temp.ln(71), current_setting('pgtap.m71'))),
  0::bigint, 'and cannot ask the helper for a hidden title, even with its current hash');
select is((select count(*) from public.source_links where id in (pg_temp.ln(2), pg_temp.ln(22), pg_temp.ln(33))), 0::bigint,
  'anon reads no link that no public file shows');
select is((select count(*) from public.source_links where id = pg_temp.ln(71)), 1::bigint, 'but the plain columns of a shown one');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from storage.objects where bucket_id = 'source-thumbs'), 3::bigint, 'the admin reads every picture');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('source-thumbs', 'yt/x.jpg') $$, '42501', null,
  'but writes none (the service role does)');
reset role;
select public.unpublish_item('aaaaaaaa-0000-4000-8000-000000000001', pg_temp.it(70));
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*) from storage.objects where bucket_id = 'source-thumbs'), 0::bigint, 'after an unpublish anon reads none');
reset role;
select set_config('request.jwt.claims', '', true);

-- 8. Policy, structure and privileges.
select pg_temp.mki(80);
select pg_temp.rev(80, null);
select is(pg_temp.pub(80, 1, null, 'sebi-unreg-2026-07-v1.2'), 'fail', 'the v1.2 policy is refused');
select is(pg_temp.f(80, 1, 'message'), 'This database accepts only policy version sebi-unreg-2026-07-v1.3.', 'saying which it accepts');
select is(private.gate_policy(), 'sebi-unreg-2026-07-v1.3', 'the letters send check reads the same policy');
select ok(pg_get_functiondef('public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure) ~ 'sebi-unreg-2026-07-v1\.3'
      and pg_get_functiondef('public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure) ~ 'private\.distribution_gate_failures'
      and pg_get_functiondef('public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure) ~ 'private\.knowledge_gate_failures'
      and pg_get_functiondef('public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure) ~ 'private\.case_gate_failures'
      and pg_get_functiondef('public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure) ~ 'private\.ledger_gate_item_failures'
      and pg_get_functiondef('public.publish_revision(uuid, uuid, uuid, text, jsonb)'::regprocedure) ~ 'from public\.themes t\s+where t\.id = any[^;]*for share',
  'publish_revision pins v1.3 and keeps every earlier check and the for share lock');
select ok(pg_get_functiondef('private.distribution_gate_failures(uuid, text, uuid, date, uuid, jsonb, jsonb)'::regprocedure)
            ~ 'from public\.video_sources[^;]*for share'
      and pg_get_functiondef('private.distribution_gate_failures(uuid, text, uuid, date, uuid, jsonb, jsonb)'::regprocedure)
            ~ 'private\.letter_gate_failures\(p_item_id, p_revision_id, p_struct\)'
      and pg_get_functiondef('private.studied_gate_failures(uuid, text, uuid, jsonb, jsonb)'::regprocedure)
            ~ 'from public\.source_links[^;]*for share',
  'the video and letter branches stay, and the studied branch holds each link until the decision commits');
select ok((select c.reloptions @> array['security_invoker=true'] from pg_class c where c.oid = 'public.public_studied'::regclass),
  'public_studied is security_invoker');
select is((select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns
            where table_schema = 'public' and table_name = 'public_studied'),
  'item_id,position,kind,url,saved_on,note,title,site_name,channel_url,thumb_path,thumb_sha256',
  'public_studied has exactly these columns (never the link id, YouTube id, his private note or a problem)');
select is((select string_agg(a.attname, ',' order by a.attname) from pg_attribute a
            where a.attrelid = 'public.source_links'::regclass and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('anon', a.attrelid, a.attnum, 'select')),
  'created_at,gone,id,kind,url', 'anon holds exactly these source_links columns');
select ok(not has_any_column_privilege('anon', 'public.source_link_companies', 'select')
      and not has_any_column_privilege('anon', 'public.source_link_concepts', 'select'),
  'anon reads no company or concept row');
select ok((select bool_and(not has_function_privilege('anon', f, 'execute') and not has_function_privilege('authenticated', f, 'execute')
                           and not has_function_privilege('service_role', f, 'execute'))
             from unnest(array['private.studied_gate_failures(uuid, text, uuid, jsonb, jsonb)', 'private.studied_is_public(uuid, uuid)',
                               'private.guard_source_link()', 'private.guard_source_link_public()',
                               'private.guard_source_link_company()', 'private.limit_source_link_rows()']::regprocedure[]) f),
  'the gate helper, studied_is_public and the four trigger functions: no API role');
select ok(has_function_privilege('anon', 'private.studied_shown(uuid, text)', 'execute')
      and has_function_privilege('authenticated', 'private.studied_shown(uuid, text)', 'execute')
      and not has_function_privilege('service_role', 'private.studied_shown(uuid, text)', 'execute'),
  'studied_shown (the masking helper the view calls) is executable by anon and authenticated only');

select * from finish();
rollback;
