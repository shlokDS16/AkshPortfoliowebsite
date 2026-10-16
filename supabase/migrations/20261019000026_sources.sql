-- =============================================================================
-- 20261019000026_sources.sql - Phase 5d Task 2: other people's videos, pages and newsletter issues (spec s4; plan Task 2).
-- Nothing here makes anything public on its own: an outside source reaches a visitor only as an entry `structured.studied` of a
-- company file's revision published by publish_revision(), which learns rule 14 in 0027.
--   1. source_links: the link as saved, his private note (his words) and what the machine read (title, name, channel, picture),
--      written only by public.record_source_fetch (service_role only). meta_sha and meta_since are computed here, in SQL, on
--      every write, whatever any caller sends. No delete for any API role; archive is archived_at.
--   2. source_link_companies (at most 5 per link) and source_link_concepts (at most 8).
--   3. Archive, or removing the file's company, is refused while the current public revision of a file shows the link.
--   4. purge_stale_source_data(): YouTube data not checked in 30 days is cleared (YouTube API Developer Policies III.E.4; Q55).
--   5. RLS, the anon read path (public_studied, a security_invoker view; masked machine columns through a definer helper), the
--      private bucket source-thumbs and its read policies.
-- Never edit this file after it reaches the hosted project; add a later migration instead.
-- =============================================================================

-- 1. Links. The machine columns stay null until the first read.
create table public.source_links (
  id             uuid primary key default gen_random_uuid(),
  url            text not null check (url ~ '^https://\S+$' and length(url) <= 2000),
  url_key        text not null unique check (length(url_key) between 1 and 2000),
  kind           text not null check (kind in ('youtube', 'web')),
  youtube_id     text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  note           text not null default '' check (length(note) <= 4000),
  created_at     timestamptz not null default now(),
  archived_at    timestamptz,
  title          text check (length(title) between 1 and 300 and title !~ '[[:cntrl:]]'),
  site_name      text check (length(site_name) between 1 and 120 and site_name !~ '[[:cntrl:]]'),
  channel_url    text check (channel_url ~ '^https://www\.youtube\.com/\S*$' and length(channel_url) <= 300),
  thumb_path     text check (thumb_path ~ '^yt/[0-9a-f]{64}\.jpg$'),
  thumb_sha256   text check (thumb_sha256 ~ '^[0-9a-f]{64}$'),
  meta_sha       text check (meta_sha ~ '^[0-9a-f]{64}$'),
  meta_since     timestamptz,
  fetched_at     timestamptz,
  checked_at     timestamptz,
  gone           boolean not null default false,
  fetch_problem  text check (fetch_problem in ('not_found', 'not_embeddable', 'not_page', 'too_big_image', 'refused', 'timeout',
                                                'unavailable', 'purged')),
  fetch_attempts smallint not null default 0 check (fetch_attempts >= 0),
  constraint source_links_youtube_id check ((kind = 'youtube') = (youtube_id is not null)),
  constraint source_links_youtube_key check (kind <> 'youtube' or url_key = 'yt:' || youtube_id),
  constraint source_links_web_key check (kind <> 'web' or url_key !~ '^yt:'),
  constraint source_links_thumb check ((thumb_path is null and thumb_sha256 is null)
                                       or (kind = 'youtube' and thumb_path = 'yt/' || thumb_sha256 || '.jpg')),
  constraint source_links_channel check (channel_url is null or kind = 'youtube')
);

create table public.source_link_companies (
  link_id    uuid not null references public.source_links (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  primary key (link_id, company_id)
);
create index source_link_companies_company_idx on public.source_link_companies (company_id);
create table public.source_link_concepts (
  link_id  uuid not null references public.source_links (id) on delete restrict,
  theme_id uuid not null references public.themes (id) on delete restrict,
  primary key (link_id, theme_id)
);
create index source_link_concepts_theme_idx on public.source_link_concepts (theme_id);

-- True while the current, passed revision of a public file (a thesis, or a case study that is not a ledger case) lists the link
-- (optionally: a file of this company). Broader than the anon read path on purpose: it ignores the 30-day item lag, so nothing a
-- file will show once its lag passes can be archived or unlinked meanwhile. Used by the two guard triggers only; no API role.
create function private.studied_is_public(p_link uuid, p_company uuid default null)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.items i
      join public.item_revisions r on r.id = i.current_revision_id
     where i.visibility = 'public' and i.status = 'published'
       and (i.kind = 'thesis' or (i.kind = 'case_study' and not (r.structured ? 'ledger')))
       and (p_company is null or i.company_id = p_company)
       and jsonb_typeof(r.structured) = 'object'
       and r.structured -> 'studied' @> jsonb_build_array(jsonb_build_object('link', p_link::text))
       and private.revision_passed(r.id))
$$;

-- The machine write boundary (the 0022 video_sources pattern): a transaction-local flag that record_source_fetch and
-- purge_stale_source_data set for their own update, honoured only when the current role owns record_source_fetch. Then the hash:
-- meta_sha is sha256 hex over kind, title, site name, channel URL and picture hash joined by newlines (null when nothing was read),
-- and meta_since moves only when meta_sha does. SECURITY INVOKER on purpose: current_user must be the caller's role here.
create function private.guard_source_link()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_machine boolean;
begin
  if tg_op = 'INSERT' then
    v_machine := num_nonnulls(new.title, new.site_name, new.channel_url, new.thumb_path, new.thumb_sha256, new.meta_sha,
                              new.meta_since, new.fetched_at, new.checked_at, new.fetch_problem) > 0
                 or new.gone is distinct from false or new.fetch_attempts is distinct from 0;
  else
    if (new.id, new.url, new.url_key, new.kind, new.youtube_id, new.created_at)
       is distinct from (old.id, old.url, old.url_key, old.kind, old.youtube_id, old.created_at) then
      raise exception 'source_links: the link is fixed; save the new link as a new source' using errcode = '42501';
    end if;
    v_machine := (new.title, new.site_name, new.channel_url, new.thumb_path, new.thumb_sha256, new.meta_sha, new.meta_since,
                  new.fetched_at, new.checked_at, new.gone, new.fetch_problem, new.fetch_attempts)
      is distinct from (old.title, old.site_name, old.channel_url, old.thumb_path, old.thumb_sha256, old.meta_sha, old.meta_since,
                        old.fetched_at, old.checked_at, old.gone, old.fetch_problem, old.fetch_attempts);
  end if;
  if v_machine and not (
       coalesce(current_setting('app.source_fetch', true), '') = 'on'
       and current_user = (select pg_get_userbyid(p.proowner) from pg_proc p
                            where p.oid = 'public.record_source_fetch(uuid, boolean, text, text, text, text, text, text, boolean)'::regprocedure)) then
    raise exception 'source_links: what the machine read is written only by record_source_fetch' using errcode = '42501';
  end if;
  new.meta_sha := case when num_nonnulls(new.title, new.site_name, new.channel_url, new.thumb_sha256) = 0 then null
                       else encode(sha256(convert_to(concat_ws(E'\n', new.kind, coalesce(new.title, ''), coalesce(new.site_name, ''),
                                                               coalesce(new.channel_url, ''), coalesce(new.thumb_sha256, '')), 'UTF8')), 'hex')
                  end;
  if tg_op = 'INSERT' then
    new.meta_since := case when new.meta_sha is not null then now() end;
  elsif new.meta_sha is distinct from old.meta_sha then
    new.meta_since := case when new.meta_sha is not null then now() end;
  else
    new.meta_since := old.meta_since;
  end if;
  return new;
end;
$$;

-- Archive is refused while a public file shows the link. Definer: it must see the files whoever archives.
create function private.guard_source_link_public()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.archived_at is not null and old.archived_at is null and private.studied_is_public(new.id) then
    raise exception 'It is on the public file. Save a revision without it first.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Removing a company from a link is refused while a public file of that company shows it (rule 14.2 would then fail). The link
-- row is locked first, so a publish holding it for share (0027) finishes before this looks.
create function private.guard_source_link_company()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.source_links l where l.id = old.link_id for update;
  if private.studied_is_public(old.link_id, old.company_id) then
    raise exception 'It is on the public file. Save a revision without it first.' using errcode = '23514';
  end if;
  return old;
end;
$$;

-- At most 5 companies and 8 concepts per link (D102), counted under the link's row lock.
create function private.limit_source_link_rows()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.source_links l where l.id = new.link_id for update;
  if tg_table_name = 'source_link_companies' then
    if (select count(*) from public.source_link_companies c where c.link_id = new.link_id) >= 5 then
      raise exception 'A source can be attached to at most 5 companies.' using errcode = '23514';
    end if;
  elsif (select count(*) from public.source_link_concepts c where c.link_id = new.link_id) >= 8 then
    raise exception 'A source can be attached to at most 8 concepts.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- The only writer of the machine columns. p_found: what was read replaces what was there (a picture too; null clears it).
-- p_gone (YouTube says the video is missing): every machine text and the picture are cleared and the link is marked gone.
-- Neither (a failed read): the problem is recorded and the attempt counted; earlier data and checked_at stay, so a failure never
-- extends the 30-day purge clock. fetched_at is the first successful read, checked_at the latest. Returns the previous picture
-- path when no link uses it any more, for the caller to delete from source-thumbs; else null.
create function public.record_source_fetch(
  p_link_id      uuid,
  p_found        boolean,
  p_title        text,
  p_site_name    text,
  p_channel_url  text,
  p_thumb_path   text,
  p_thumb_sha256 text,
  p_problem      text,
  p_gone         boolean
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_old text;
begin
  if p_found is null or p_gone is null or (p_found and p_gone) then
    raise exception 'record_source_fetch: found and gone are true or false, never both true' using errcode = '22023';
  end if;
  select l.thumb_path into v_old from public.source_links l where l.id = p_link_id for update;
  if not found then
    raise exception 'record_source_fetch: link % not found', p_link_id using errcode = 'P0002';
  end if;
  perform set_config('app.source_fetch', 'on', true);
  if p_found then
    update public.source_links
       set title = p_title, site_name = p_site_name, channel_url = p_channel_url, thumb_path = p_thumb_path,
           thumb_sha256 = p_thumb_sha256, gone = false, fetch_problem = p_problem, fetch_attempts = 0,
           fetched_at = coalesce(fetched_at, now()), checked_at = now()
     where id = p_link_id;
  elsif p_gone then
    update public.source_links
       set title = null, site_name = null, channel_url = null, thumb_path = null, thumb_sha256 = null, gone = true,
           fetch_problem = p_problem, fetch_attempts = 0, fetched_at = coalesce(fetched_at, now()), checked_at = now()
     where id = p_link_id;
  else
    update public.source_links
       set fetch_problem = p_problem, fetch_attempts = least(fetch_attempts + 1, 1000)
     where id = p_link_id;
  end if;
  perform set_config('app.source_fetch', 'off', true);
  if v_old is not null and not exists (select 1 from public.source_links o where o.thumb_path = v_old) then
    return v_old;
  end if;
  return null;
end;
$$;

-- YouTube data is kept no longer than 30 days without a successful check (spec s3.3, D104). Clears the title, name, channel and
-- picture of every YouTube link not checked in 30 days (problem 'purged'; checked_at stays, so sources:recheck reads it again) and
-- returns the picture paths no link uses any more, for the caller to delete. Same owner as record_source_fetch. Service role only.
create function public.purge_stale_source_data()
returns setof text
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids   uuid[];
  v_paths text[];
begin
  with s as (
    select l.id, l.thumb_path from public.source_links l
     where l.kind = 'youtube' and not l.gone
       and num_nonnulls(l.title, l.site_name, l.channel_url, l.thumb_path) > 0
       and coalesce(l.checked_at, l.fetched_at, l.created_at) < now() - interval '30 days'
     for update
  )
  select coalesce(array_agg(s.id), '{}'), coalesce(array_agg(distinct s.thumb_path) filter (where s.thumb_path is not null), '{}')
    into v_ids, v_paths from s;
  perform set_config('app.source_fetch', 'on', true);
  update public.source_links
     set title = null, site_name = null, channel_url = null, thumb_path = null, thumb_sha256 = null, fetch_problem = 'purged'
   where id = any (v_ids);
  perform set_config('app.source_fetch', 'off', true);
  return query select p from unnest(v_paths) p
                where not exists (select 1 from public.source_links o where o.thumb_path = p);
end;
$$;

create trigger source_links_guard before insert or update on public.source_links
  for each row execute function private.guard_source_link();
create trigger source_links_public_guard before update of archived_at on public.source_links
  for each row execute function private.guard_source_link_public();
create trigger source_link_companies_public_guard before delete on public.source_link_companies
  for each row execute function private.guard_source_link_company();
create trigger source_link_companies_limit before insert on public.source_link_companies
  for each row execute function private.limit_source_link_rows();
create trigger source_link_concepts_limit before insert on public.source_link_concepts
  for each row execute function private.limit_source_link_rows();

-- 5. RLS. The admin (authenticated + is_admin): read all three; save a link (the link, its key and his note); change his note and
-- the archive switch; add and remove company and concept rows. Nobody deletes a link. anon: only the plain columns of a link that
-- the current, passed revision of a visible file lists (the row policy repeats the public predicate; the view repeats it again,
-- since the admin passes every base-table policy). The machine's title, name, channel and picture are never granted to anon: the
-- view reads them through private.studied_shown, which returns them only for an entry shown with the link's current hash.
alter table public.source_links enable row level security;
alter table public.source_link_companies enable row level security;
alter table public.source_link_concepts enable row level security;
create policy source_links_admin_select on public.source_links for select to authenticated using ((select private.is_admin()));
create policy source_links_admin_insert on public.source_links for insert to authenticated with check ((select private.is_admin()));
create policy source_links_admin_update on public.source_links for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy source_link_companies_admin_select on public.source_link_companies for select to authenticated
  using ((select private.is_admin()));
create policy source_link_companies_admin_insert on public.source_link_companies for insert to authenticated
  with check ((select private.is_admin()));
create policy source_link_companies_admin_delete on public.source_link_companies for delete to authenticated
  using ((select private.is_admin()));
create policy source_link_concepts_admin_select on public.source_link_concepts for select to authenticated
  using ((select private.is_admin()));
create policy source_link_concepts_admin_insert on public.source_link_concepts for insert to authenticated
  with check ((select private.is_admin()));
create policy source_link_concepts_admin_delete on public.source_link_concepts for delete to authenticated
  using ((select private.is_admin()));
create policy source_links_public_read on public.source_links for select to anon
  using (not gone and exists (
    select 1 from public.items i
      join public.item_revisions r on r.id = i.current_revision_id
     where (i.kind = 'thesis' or (i.kind = 'case_study' and not (r.structured ? 'ledger')))
       and private.is_public_item(i.visibility, i.status, i.data_as_of)
       and private.revision_passed(r.id)
       and r.structured -> 'studied' @> jsonb_build_array(jsonb_build_object('link', source_links.id::text))));

revoke all on public.source_links, public.source_link_companies, public.source_link_concepts
  from public, anon, authenticated, service_role;
grant select on public.source_links to authenticated;
grant insert (url, url_key, kind, youtube_id, note) on public.source_links to authenticated;
grant update (note, archived_at) on public.source_links to authenticated;
grant select, insert, delete on public.source_link_companies, public.source_link_concepts to authenticated;
-- Job code (sources:fetch, sources:recheck) lists the links and writes through record_source_fetch only.
grant select on public.source_links to service_role;
-- anon: the columns the view and the row policy read; never note, youtube_id, title, site_name, channel_url, the picture,
-- meta_sha, the dates of reading or the problem.
grant select (id, kind, url, created_at, gone) on public.source_links to anon;

-- The machine's data for one entry: returned only when a visible file's current, passed revision lists this link with show true
-- and exactly this hash, and the hash is the link's current one. Anything else returns no row, so calling it directly reveals
-- nothing the public page does not show.
create function private.studied_shown(p_link uuid, p_meta_sha text)
returns table (title text, site_name text, channel_url text, thumb_path text, thumb_sha256 text)
language sql stable security definer set search_path = ''
as $$
  select l.title, l.site_name, l.channel_url, l.thumb_path, l.thumb_sha256
    from public.source_links l
   where l.id = p_link and p_meta_sha is not null and l.meta_sha = p_meta_sha and not l.gone
     and exists (
       select 1 from public.items i
         join public.item_revisions r on r.id = i.current_revision_id
        where (i.kind = 'thesis' or (i.kind = 'case_study' and not (r.structured ? 'ledger')))
          and private.is_public_item(i.visibility, i.status, i.data_as_of)
          and private.revision_passed(r.id)
          and r.structured -> 'studied'
              @> jsonb_build_array(jsonb_build_object('link', l.id::text, 'show', true, 'metaSha', l.meta_sha)))
$$;

-- One row per entry of the CURRENT public revision of a visible file, in the order he chose (position from 1). No hold beyond the
-- file's own visibility (Shlok's ruling 2026-10-16). A link found gone drops out at once.
create view public.public_studied with (security_invoker = true) as
select i.id as item_id, e.ord::integer as position, l.kind, l.url,
       (l.created_at at time zone 'Asia/Kolkata')::date as saved_on,
       e.v ->> 'note' as note,
       d.title, d.site_name, d.channel_url, d.thumb_path, d.thumb_sha256
from public.items i
join public.item_revisions r on r.id = i.current_revision_id
cross join lateral jsonb_array_elements(case when jsonb_typeof(r.structured -> 'studied') = 'array'
                                             then r.structured -> 'studied' else '[]'::jsonb end) with ordinality e(v, ord)
join public.source_links l
  on l.id = case when (e.v ->> 'link') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 then (e.v ->> 'link')::uuid end
left join lateral private.studied_shown(l.id, case when (e.v -> 'show') = 'true'::jsonb then e.v ->> 'metaSha' end) d on true
where (i.kind = 'thesis' or (i.kind = 'case_study' and not (r.structured ? 'ledger')))
  and private.is_public_item(i.visibility, i.status, i.data_as_of)
  and private.revision_passed(r.id)
  and not l.gone;

revoke all on public.public_studied from public, anon, authenticated, service_role;
grant select on public.public_studied to anon, authenticated;

-- The private picture bucket (spec s3.2, D103): written and deleted by the service role only (it bypasses RLS); the admin reads
-- every picture; anon reads one only while public_studied shows it. 200 KB, JPEG only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('source-thumbs', 'source-thumbs', false, 204800, array['image/jpeg'])
on conflict (id) do nothing;
create policy source_thumbs_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'source-thumbs' and (select private.is_admin()));
create policy source_thumbs_public_read on storage.objects for select to anon
  using (bucket_id = 'source-thumbs'
         and exists (select 1 from public.public_studied s where s.thumb_path = storage.objects.name));

-- Function privileges: record_source_fetch and purge_stale_source_data are service_role only; studied_shown is for the roles that
-- read the view; no API role executes studied_is_public or the trigger functions.
revoke execute on function public.record_source_fetch(uuid, boolean, text, text, text, text, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.record_source_fetch(uuid, boolean, text, text, text, text, text, text, boolean) to service_role;
revoke execute on function public.purge_stale_source_data() from public, anon, authenticated, service_role;
grant execute on function public.purge_stale_source_data() to service_role;
revoke execute on function private.studied_shown(uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.studied_shown(uuid, text) to anon, authenticated;
revoke execute on function private.studied_is_public(uuid, uuid), private.guard_source_link(), private.guard_source_link_public(),
  private.guard_source_link_company(), private.limit_source_link_rows()
  from public, anon, authenticated, service_role;
