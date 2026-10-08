-- =============================================================================
-- 20261007000008_ingestion_more.sql - Phase 2b: scans, photos, voice, links and pasted text; the pass column;
-- the unit ledger for OCR and Whisper; digests; reading proposals (ADR-004 s4.2-s4.5, s4.11).
-- Spec: docs/specs/2026-10-07-phase-2-ingestion-design.md. Rulings R1, R2, R4, R6, R8, R9, R17, R20 (Plan 2b Task 1).
-- Never edit after it reaches hosted.
-- =============================================================================

-- 1. Documents: image, audio, url and text join pdf. A link answer or pasted text is stored as <id>.txt (R1).
alter table public.documents drop constraint documents_kind_check;
alter table public.documents add constraint documents_kind_check
  check (kind in ('pdf', 'image', 'audio', 'url', 'text'));
alter table public.documents drop constraint documents_storage_path_check;
alter table public.documents add constraint documents_storage_path_check
  check (storage_path ~ '^[0-9a-f-]{36}\.(pdf|jpg|png|webp|mp3|m4a|webm|txt)$');
-- The original link of a url document: set at insert by Aksh's session, never changed (no UPDATE grant).
alter table public.documents add column fetched_from text check (fetched_from is null or fetched_from ~ '^https://');
-- A voice note's transcript waits for Aksh (pending), is saved as a capture by him (saved) or thrown away (discarded).
alter table public.documents add column transcript_status text check (transcript_status in ('pending', 'saved', 'discarded'));
grant update (transcript_status) on public.documents to authenticated;

-- 2. Pages: text that came from OCR is marked so the page view can say so. Job code sets it when it fills a scan
-- page (the guard_page_text trigger still allows that fill once).
alter table public.document_pages add column ocr boolean not null default false;
grant update (ocr) on public.document_pages to service_role;

-- 3. Jobs and steps.
alter table public.jobs drop constraint jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('ingest_pdf', 'ingest_image', 'ingest_audio', 'ingest_url', 'ingest_text'));

alter table public.job_steps drop constraint job_steps_kind_check;
alter table public.job_steps add constraint job_steps_kind_check
  check (kind in ('pdf_text', 'select_pages', 'extract_page', 'ocr_page', 'vision_page', 'transcribe', 'text_pages',
                  'classify_pages', 'digest_page'));
alter table public.job_steps drop constraint job_steps_wait_reason_check;
alter table public.job_steps add constraint job_steps_wait_reason_check
  check (wait_reason in ('groq_minute', 'groq_day', 'ai_off', 'ocr_day', 'ocr_off', 'voice_hour', 'voice_day'));

-- R2: a later pass of the same step (a re-run selection, a re-read page) is a new row, not a silent no-op.
alter table public.job_steps add column pass smallint not null default 1 check (pass between 1 and 9);
alter table public.job_steps drop constraint job_steps_once;
alter table public.job_steps add constraint job_steps_once unique nulls not distinct (job_id, kind, page_no, pass);
grant insert (pass) on public.job_steps to authenticated;

-- R6: the steps Aksh's session may start (an upload, a tick, a re-read). The machine's own steps (select_pages,
-- vision_page, classify_pages) are never inserted from the desk.
drop policy job_steps_admin_insert on public.job_steps;
create policy job_steps_admin_insert on public.job_steps for insert to authenticated
  with check ((select private.is_admin())
              and kind in ('pdf_text', 'extract_page', 'ocr_page', 'digest_page', 'transcribe', 'text_pages')
              and status = 'queued');

-- 4. The private bucket takes photos, voice notes and text. The size limit stays 50 MB (the Free plan ceiling).
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
                                  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'text/plain']
 where id = 'documents';

-- 5. The unit ledger (R9): OCR requests and Whisper audio seconds, with named waits.
alter table public.provider_usage drop constraint provider_usage_block_reason_check;
alter table public.provider_usage add constraint provider_usage_block_reason_check
  check (block_reason in ('groq_minute', 'groq_day', 'ocr_day', 'voice_hour', 'voice_day'));

-- Reserve units (requests, or seconds of audio) before a call. A null cap means no cap on that window. Same lock and
-- window rules as reserve_usage. The bucket must belong to a known family, so a misnamed bucket fails loudly instead
-- of showing the wrong paused copy: an OCR bucket (name starts with 'ocr') or a voice bucket (name contains
-- 'whisper', any case). The window that is full names the wait: the day is ocr_day or voice_day by family; the hour
-- is voice_hour; the minute is groq_minute (no OCR-minute reason exists; the OCR bucket has only a day cap in use).
-- p_rpm and p_rpd count requests; the other caps count units.
create function public.reserve_units(
  p_bucket text, p_units integer, p_minute_cap integer, p_hour_cap integer, p_day_cap integer, p_rpm integer, p_rpd integer)
returns table (ok boolean, reservation_id uuid, not_before timestamptz, reason text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz;
  v_block record;
  v_day_reason text;
  v_min_units bigint;
  v_hour_units bigint;
  v_day_units bigint;
  v_min_reqs bigint;
  v_day_reqs bigint;
  v_id uuid;
begin
  if p_bucket is null or p_units is null or p_units < 1 then
    raise exception 'a bucket and at least one unit are required' using errcode = '22023';
  end if;
  v_day_reason := case when lower(p_bucket) like 'ocr%' then 'ocr_day'
                       when lower(p_bucket) like '%whisper%' then 'voice_day' end;
  if v_day_reason is null then
    raise exception 'unknown bucket family: an OCR bucket starts with ocr, a voice bucket contains whisper'
      using errcode = '22023';
  end if;
  if p_minute_cap is null and p_hour_cap is null and p_day_cap is null and p_rpm is null and p_rpd is null then
    raise exception 'at least one cap is required' using errcode = '22023';
  end if;
  if p_minute_cap < 1 or p_hour_cap < 1 or p_day_cap < 1 or p_rpm < 1 or p_rpd < 1 then
    raise exception 'a cap must be positive' using errcode = '22023';
  end if;
  if p_units > least(p_minute_cap, p_hour_cap, p_day_cap) then
    raise exception 'one call must fit inside the unit caps' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('provider_usage:' || p_bucket));
  v_now := clock_timestamp();

  select u.blocked_until, u.block_reason into v_block
    from public.provider_usage u
   where u.bucket = p_bucket and u.blocked_until > v_now
   order by u.blocked_until desc limit 1;
  if found then
    return query select false, null::uuid, v_block.blocked_until, v_block.block_reason;
    return;
  end if;

  select coalesce(sum(coalesce(u.tokens_used, u.tokens_est)) filter (where u.at > v_now - interval '1 minute'), 0),
         coalesce(sum(coalesce(u.tokens_used, u.tokens_est)) filter (where u.at > v_now - interval '1 hour'), 0),
         coalesce(sum(coalesce(u.tokens_used, u.tokens_est)), 0),
         count(*) filter (where u.at > v_now - interval '1 minute'),
         count(*)
    into v_min_units, v_hour_units, v_day_units, v_min_reqs, v_day_reqs
    from public.provider_usage u
   where u.bucket = p_bucket and u.kind = 'reservation' and u.status <> 'released' and u.at > v_now - interval '24 hours';

  if (p_day_cap is not null and v_day_units + p_units > p_day_cap) or (p_rpd is not null and v_day_reqs + 1 > p_rpd) then
    return query
      select false, null::uuid, min(u.at) + interval '24 hours', v_day_reason
        from public.provider_usage u
       where u.bucket = p_bucket and u.kind = 'reservation' and u.status <> 'released' and u.at > v_now - interval '24 hours';
    return;
  end if;
  if p_hour_cap is not null and v_hour_units + p_units > p_hour_cap then
    return query
      select false, null::uuid, min(u.at) + interval '1 hour', 'voice_hour'::text
        from public.provider_usage u
       where u.bucket = p_bucket and u.kind = 'reservation' and u.status <> 'released' and u.at > v_now - interval '1 hour';
    return;
  end if;
  if (p_minute_cap is not null and v_min_units + p_units > p_minute_cap) or (p_rpm is not null and v_min_reqs + 1 > p_rpm) then
    return query
      select false, null::uuid, min(u.at) + interval '1 minute', 'groq_minute'::text
        from public.provider_usage u
       where u.bucket = p_bucket and u.kind = 'reservation' and u.status <> 'released' and u.at > v_now - interval '1 minute';
    return;
  end if;

  insert into public.provider_usage (bucket, kind, tokens_est, status, at)
  values (p_bucket, 'reservation', p_units, 'reserved', v_now)
  returning id into v_id;
  return query select true, v_id, null::timestamptz, null::text;
end;
$$;
revoke execute on function public.reserve_units(text, integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_units(text, integer, integer, integer, integer, integer, integer) to service_role;

-- 6. Digests (R20): what an MD&A-style page says, claim by claim, each with the line that should be on the page.
-- Append-only; (document, page, extraction, ord) makes a lost lease harmless (insert ... on conflict do nothing).
-- Admin read only: the public showcase never touches this table.
create table public.document_digests (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null,
  page_no       integer not null,
  extraction_id uuid not null references public.extractions (id) on delete restrict,
  ord           smallint not null check (ord >= 0),
  section       text not null check (char_length(section) between 1 and 300),
  claim         text not null check (char_length(claim) between 1 and 400),
  line          text not null check (char_length(line) between 1 and 600),
  on_page       boolean not null,
  created_at    timestamptz not null default now(),
  foreign key (document_id, page_no) references public.document_pages (document_id, page_no) on delete restrict,
  unique (document_id, page_no, extraction_id, ord)
);
create index document_digests_extraction_id_idx on public.document_digests (extraction_id);
create trigger document_digests_append_only before update or delete on public.document_digests
  for each row execute function private.reject_mutation();
create trigger document_digests_no_truncate before truncate on public.document_digests
  for each statement execute function private.reject_mutation();

-- 7. Reading proposals (R4): the machine's reading of a test's current value, kept apart from fact proposals so the
-- fact filing path, provenance and counts never see them. Readings never touch fact_provenance.
create table public.reading_proposals (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete restrict,
  page_no       integer not null check (page_no >= 1),
  extraction_id uuid not null references public.extractions (id) on delete restrict,
  item_id_hint  uuid references public.items (id) on delete restrict,
  test_id       text not null check (test_id ~ '^T\d{1,3}$'),
  machine_value jsonb not null check (jsonb_typeof(machine_value) = 'object'),
  -- The extract_page pass that produced it (R2/R3): a re-read is a later pass and may propose the test again.
  pass          smallint not null default 1 check (pass between 1 and 9),
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'filed')),
  item_id       uuid references public.items (id) on delete restrict,
  revision_id   uuid references public.item_revisions (id) on delete restrict,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Idempotent on a rerun: extract_page writes a new extractions row on every run (cache hit included), so the key
  -- cannot use extraction_id. A lost-lease rerun of the same pass inserts the same (document, page, test, pass) once
  -- (on conflict do nothing); a re-read is a later pass and adds its own row.
  unique (document_id, page_no, test_id, pass),
  check ((status = 'filed') = (revision_id is not null))
);
create index reading_proposals_document_status_idx on public.reading_proposals (document_id, status);
create index reading_proposals_item_hint_idx on public.reading_proposals (item_id_hint) where item_id_hint is not null;
create index reading_proposals_item_idx on public.reading_proposals (item_id) where item_id is not null;
create index reading_proposals_revision_id_idx on public.reading_proposals (revision_id) where revision_id is not null;
create trigger reading_proposals_set_updated_at before update on public.reading_proposals
  for each row execute function private.set_updated_at();

create function private.guard_reading_insert()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status <> 'pending' or new.item_id is not null or new.revision_id is not null or new.decided_at is not null then
    raise exception 'the machine only proposes: a new reading is pending and undecided' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger reading_proposals_insert_pending before insert on public.reading_proposals
  for each row execute function private.guard_reading_insert();

-- Same three guards as proposals: what the machine read is immutable; the machine never decides (also under a
-- SECURITY DEFINER function called with the secret key); a filed reading is final.
create function private.guard_reading_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.machine_value is distinct from old.machine_value or new.extraction_id <> old.extraction_id
     or new.test_id <> old.test_id or new.pass <> old.pass or new.item_id_hint is distinct from old.item_id_hint
     or new.document_id <> old.document_id or new.page_no <> old.page_no then
    raise exception 'what the machine read is never changed' using errcode = 'P0001';
  end if;
  if current_user = 'service_role'
     or nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role' then
    raise exception 'only Aksh decides on a reading (ADR-004 s4.2)' using errcode = '42501';
  end if;
  if old.status = 'filed' then
    raise exception 'a filed reading is final' using errcode = 'P0001';
  end if;
  if new.revision_id is not null and new.item_id is distinct from
     (select r.item_id from public.item_revisions r where r.id = new.revision_id) then
    raise exception 'a reading is filed only under a revision of its own item' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger reading_proposals_guard_update before update on public.reading_proposals
  for each row execute function private.guard_reading_update();

-- 8. RLS and grants: admin only; job code is service_role (bypasses RLS, still needs table privileges).
alter table public.document_digests  enable row level security;
alter table public.reading_proposals enable row level security;

create policy document_digests_admin_read on public.document_digests for select to authenticated using ((select private.is_admin()));
create policy reading_proposals_admin_read on public.reading_proposals for select to authenticated using ((select private.is_admin()));
-- A decision is never undone to pending (Unstage only clears item_id and keeps accepted).
create policy reading_proposals_admin_update on public.reading_proposals for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()) and status <> 'pending');

revoke all on public.document_digests, public.reading_proposals from public, anon, authenticated, service_role;
grant select on public.document_digests, public.reading_proposals to authenticated;
grant update (status, item_id, revision_id, decided_at) on public.reading_proposals to authenticated;
grant select, insert on public.document_digests, public.reading_proposals to service_role;

-- 9. A re-read replaces what Aksh had not checked (Plan 2b Task 8): his click on "Re-read" rejects the page's pending rows and marks
-- them superseded, so they stay apart from the figures he dropped himself. Only a rejected row can be superseded.
alter table public.proposals add column superseded boolean not null default false check (not superseded or status = 'rejected');
alter table public.reading_proposals add column superseded boolean not null default false check (not superseded or status = 'rejected');
grant update (superseded) on public.proposals, public.reading_proposals to authenticated;
