-- =============================================================================
-- 20261017000022_videos.sql - Phase 5b Task 6: videos as items (spec s7.2; plan Part 5b; v1.2 addendum rule 12).
-- Nothing here makes anything public: a video reaches a visitor only through publish_revision(), which learns rule 12 in 0023.
--   1. items.kind gains 'video' (every earlier kind kept).
--   2. video_sources: one per video item; the YouTube id is frozen; the machine columns (what YouTube said) are written only by
--      public.record_video_fetch (service_role only), never by the admin session; no delete while the item is public.
--   3. video_transcripts: append-only machine text from his caption file; the hash and word count are computed here, in SQL,
--      whatever the client sends, and the segment shape and limits are checked (23514).
--   4. RLS (admin only for authenticated) and the anon read path: column grants on the two tables, row policies that repeat
--      the public predicate, and the two security_invoker views public_videos and public_video_transcripts.
-- Never edit this file after it reaches the hosted project; add a later migration instead.
-- =============================================================================

-- 1. The video kind.
alter table public.items drop constraint items_kind_check,
  add constraint items_kind_check
  check (kind in ('note', 'thesis', 'learning', 'case_study', 'process', 'reading_note', 'video'));

-- 2. Sources. The machine columns stay null until the first fetch.
create table public.video_sources (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null unique references public.items (id) on delete restrict,
  youtube_id       text not null unique check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel_id       text,
  own_channel      boolean,
  yt_title         text check (length(yt_title) <= 100),
  yt_description   text check (length(yt_description) <= 5000),
  duration_seconds integer check (duration_seconds > 0),
  privacy          text check (privacy in ('public', 'unlisted', 'private', 'gone')),
  yt_published_at  timestamptz,
  fetched_at       timestamptz,
  fetch_problem    text check (length(fetch_problem) <= 160),
  created_at       timestamptz not null default now()
);

-- The machine write boundary. A transaction-local setting that record_video_fetch sets for its own update; it counts only when the
-- current role is the owner of record_video_fetch (the role its SECURITY DEFINER body runs as), as the publish gate does for items.
-- SECURITY INVOKER on purpose: current_user must be the caller's role here.
create function private.guard_video_source()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_machine boolean;
begin
  if tg_op = 'INSERT' then
    v_machine := num_nonnulls(new.channel_id, new.own_channel, new.yt_title, new.yt_description, new.duration_seconds,
                              new.privacy, new.yt_published_at, new.fetched_at, new.fetch_problem) > 0;
  else
    if new.id is distinct from old.id or new.item_id is distinct from old.item_id
       or new.youtube_id is distinct from old.youtube_id or new.created_at is distinct from old.created_at then
      raise exception 'video_sources: the YouTube id and the item are fixed' using errcode = '42501';
    end if;
    v_machine := (new.channel_id, new.own_channel, new.yt_title, new.yt_description, new.duration_seconds, new.privacy,
                  new.yt_published_at, new.fetched_at, new.fetch_problem)
      is distinct from (old.channel_id, old.own_channel, old.yt_title, old.yt_description, old.duration_seconds, old.privacy,
                        old.yt_published_at, old.fetched_at, old.fetch_problem);
  end if;
  if v_machine and not (
       coalesce(current_setting('app.video_fetch', true), '') = 'on'
       and current_user = (select pg_get_userbyid(p.proowner) from pg_proc p
                            where p.oid = 'public.record_video_fetch(uuid, boolean, text, boolean, text, text, integer, text, timestamptz, text)'::regprocedure)) then
    raise exception 'video_sources: YouTube data is written only by record_video_fetch' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- No delete while the item is public (the source is what the public page plays). Definer: it must see the item whoever deletes.
create function private.guard_video_source_delete()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.items i where i.id = old.item_id and i.visibility = 'public') then
    raise exception 'video_sources: the video is public; unpublish it first' using errcode = '23514';
  end if;
  return old;
end;
$$;

-- The only writer of the machine columns. A video YouTube no longer returns is marked gone; the last data seen is kept.
create function public.record_video_fetch(
  p_source_id    uuid,
  p_found        boolean,
  p_channel_id   text,
  p_own_channel  boolean,
  p_title        text,
  p_description  text,
  p_duration     integer,
  p_privacy      text,
  p_published_at timestamptz,
  p_problem      text
)
returns public.video_sources
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.video_sources;
begin
  if p_found is null then
    raise exception 'record_video_fetch: found must be true or false' using errcode = '22023';
  end if;
  perform set_config('app.video_fetch', 'on', true);
  if p_found then
    update public.video_sources
       set channel_id = p_channel_id, own_channel = p_own_channel, yt_title = p_title, yt_description = p_description,
           duration_seconds = p_duration, privacy = p_privacy, yt_published_at = p_published_at,
           fetched_at = now(), fetch_problem = p_problem
     where id = p_source_id
    returning * into v_row;
  else
    update public.video_sources
       set privacy = 'gone', fetched_at = now(), fetch_problem = p_problem
     where id = p_source_id
    returning * into v_row;
  end if;
  perform set_config('app.video_fetch', 'off', true);
  if v_row.id is null then
    raise exception 'record_video_fetch: source % not found', p_source_id using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

create trigger video_sources_guard before insert or update on public.video_sources
  for each row execute function private.guard_video_source();
create trigger video_sources_no_public_delete before delete on public.video_sources
  for each row execute function private.guard_video_source_delete();

-- 3. Transcripts: the machine's record of what was said. Never edited; a new caption file is a new row.
create table public.video_transcripts (
  id              uuid primary key default gen_random_uuid(),
  video_source_id uuid not null references public.video_sources (id),
  source          text not null default 'captions_file' check (source in ('captions_file')),
  file_sha256     text check (file_sha256 ~ '^[0-9a-f]{64}$'),
  segments        jsonb not null,
  text_sha256     text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  words           integer not null check (words >= 0),
  created_at      timestamptz not null default now()
);
create index video_transcripts_source_idx on public.video_transcripts (video_source_id);

-- Shape: an array of 1..5000 objects with exactly the keys s (whole seconds >= 0, never going back) and t (1..500 characters, not
-- blank). Then the hash (sha256 hex of the UTF-8 texts joined by a newline, no trailing newline) and the word count, both replacing
-- whatever the client sent.
create function private.seal_video_transcript()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_n int;
begin
  if jsonb_typeof(new.segments) is distinct from 'array' then
    raise exception 'video_transcripts: segments must be an array' using errcode = '23514';
  end if;
  v_n := jsonb_array_length(new.segments);
  if v_n < 1 or v_n > 5000 then
    raise exception 'video_transcripts: 1 to 5000 segments, not %', v_n using errcode = '23514';
  end if;
  if exists (
    select 1
      from (select e,
                   case when jsonb_typeof(e -> 's') = 'number' then (e ->> 's')::numeric end as s,
                   lag(case when jsonb_typeof(e -> 's') = 'number' then (e ->> 's')::numeric end) over (order by ord) as prev,
                   ord
              from jsonb_array_elements(new.segments) with ordinality x(e, ord)) q
     where jsonb_typeof(q.e) is distinct from 'object'
        or (select count(*) from jsonb_object_keys(case when jsonb_typeof(q.e) = 'object' then q.e else '{}' end)) <> 2
        or q.s is null or q.s < 0 or q.s <> trunc(q.s)
        or (q.ord > 1 and q.s < q.prev)
        or jsonb_typeof(q.e -> 't') is distinct from 'string'
        or length(q.e ->> 't') not between 1 and 500
        or btrim(q.e ->> 't') = ''
  ) then
    raise exception 'video_transcripts: each segment is {"s": whole seconds, rising, "t": 1 to 500 characters}'
      using errcode = '23514';
  end if;
  select encode(sha256(convert_to(string_agg(x.e ->> 't', E'\n' order by x.ord), 'UTF8')), 'hex'),
         sum(coalesce(array_length(regexp_split_to_array(btrim(x.e ->> 't'), '\s+'), 1), 0))::int
    into new.text_sha256, new.words
    from jsonb_array_elements(new.segments) with ordinality x(e, ord);
  return new;
end;
$$;
create trigger video_transcripts_seal before insert on public.video_transcripts
  for each row execute function private.seal_video_transcript();
create trigger video_transcripts_append_only before update or delete on public.video_transcripts
  for each row execute function private.reject_mutation();
create trigger video_transcripts_no_truncate before truncate on public.video_transcripts
  for each statement execute function private.reject_mutation();

-- 4. RLS. The admin (authenticated + is_admin): read both, insert a source's (item_id, youtube_id) and a transcript, delete a
-- source (refused while public). Anon: only the rows of a public video item, and of transcripts only the one its CURRENT revision
-- names. The row policies repeat the public predicate; the views repeat it again (the admin passes every base-table policy).
alter table public.video_sources enable row level security;
alter table public.video_transcripts enable row level security;
create policy video_sources_admin_select on public.video_sources for select to authenticated using ((select private.is_admin()));
create policy video_sources_admin_insert on public.video_sources for insert to authenticated with check ((select private.is_admin()));
create policy video_sources_admin_delete on public.video_sources for delete to authenticated using ((select private.is_admin()));
create policy video_transcripts_admin_select on public.video_transcripts for select to authenticated
  using ((select private.is_admin()));
create policy video_transcripts_admin_insert on public.video_transcripts for insert to authenticated
  with check ((select private.is_admin()));
create policy video_sources_public_read on public.video_sources for select to anon
  using (exists (select 1 from public.items i
                  where i.id = video_sources.item_id and i.kind = 'video'
                    and private.is_public_item(i.visibility, i.status, i.data_as_of)));
create policy video_transcripts_public_read on public.video_transcripts for select to anon
  using (exists (select 1 from public.video_sources v
                   join public.items i on i.id = v.item_id
                   join public.item_revisions r on r.id = i.current_revision_id
                  where v.id = video_transcripts.video_source_id and i.kind = 'video'
                    and private.is_public_item(i.visibility, i.status, i.data_as_of)
                    and lower(r.structured ->> 'transcriptId') = video_transcripts.id::text));

revoke all on public.video_sources, public.video_transcripts from public, anon, authenticated, service_role;
grant select, delete on public.video_sources to authenticated;
grant insert (item_id, youtube_id) on public.video_sources to authenticated;
grant select on public.video_transcripts to authenticated;
-- text_sha256 and words are grantable so a client value is accepted and then replaced by the trigger, never trusted.
grant insert (video_source_id, source, file_sha256, segments, text_sha256, words) on public.video_transcripts to authenticated;
-- Job code (videos:fetch, videos:check) lists the sources and writes through record_video_fetch only.
grant select on public.video_sources to service_role;
-- anon: the columns the views and the transcript policy read; never channel_id, own_channel, yt_title, yt_description, privacy,
-- fetched_at or fetch_problem.
grant select (id, item_id, youtube_id, duration_seconds, yt_published_at) on public.video_sources to anon;
grant select (id, video_source_id, segments) on public.video_transcripts to anon;

create view public.public_videos with (security_invoker = true) as
select v.item_id, v.youtube_id, v.duration_seconds, v.yt_published_at
from public.video_sources v
join public.items i on i.id = v.item_id
where i.kind = 'video'
  and private.is_public_item(i.visibility, i.status, i.data_as_of);

-- Only the transcript the CURRENT public revision names; an older one is never public.
create view public.public_video_transcripts with (security_invoker = true) as
select i.id as item_id, t.segments
from public.items i
join public.item_revisions r on r.id = i.current_revision_id
join public.video_sources v on v.item_id = i.id
join public.video_transcripts t on t.video_source_id = v.id and t.id::text = lower(r.structured ->> 'transcriptId')
where i.kind = 'video'
  and private.is_public_item(i.visibility, i.status, i.data_as_of)
  and private.revision_passed(r.id);

revoke all on public.public_videos, public.public_video_transcripts from public, anon, authenticated, service_role;
grant select on public.public_videos, public.public_video_transcripts to anon, authenticated;

-- Function privileges: record_video_fetch is service_role only; no API role executes the trigger functions.
revoke execute on function public.record_video_fetch(uuid, boolean, text, boolean, text, text, integer, text, timestamptz, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_video_fetch(uuid, boolean, text, boolean, text, text, integer, text, timestamptz, text)
  to service_role;
revoke execute on function private.guard_video_source() from public, anon, authenticated, service_role;
revoke execute on function private.guard_video_source_delete() from public, anon, authenticated, service_role;
revoke execute on function private.seal_video_transcript() from public, anon, authenticated, service_role;
